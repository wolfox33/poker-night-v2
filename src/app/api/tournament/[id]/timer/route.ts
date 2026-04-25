import { NextRequest, NextResponse } from 'next/server';
import { acquireAdvanceLock, getTournament, setTournament } from '@/lib/kv';
import { BLINDS_LEVELS, Tournament, TimerAction } from '@/types/tournament';

function applyElapsed(tournament: Tournament): number {
  if (!tournament.timer.isRunning || !tournament.timer.startedAt) return 0;

  const elapsed = Math.max(0, Math.floor((Date.now() - tournament.timer.startedAt) / 1000));
  tournament.timer.timeRemaining = Math.max(0, tournament.timer.timeRemaining - elapsed);
  tournament.timer.totalElapsed += elapsed;
  return elapsed;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    const data = await getTournament(id);
    if (!data) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    const tournament: Tournament = JSON.parse(data);

    const body: TimerAction = await request.json();
    const { action } = body;
    const isHost = token === tournament.hostToken;
    const isPlayer = tournament.players?.some((p) => p.id === token);

    if (!isHost && !(action === 'advance' && isPlayer)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const levelDuration = tournament.config.levelDuration * 60;
    const maxLevel = BLINDS_LEVELS.length;

    switch (action) {
      case 'start':
        if (!tournament.timer.isRunning) {
          tournament.timer.isRunning = true;
          tournament.timer.startedAt = Date.now();
          tournament.state = tournament.state === 'setup' ? 'running' : tournament.state;
        }
        break;

      case 'pause':
        if (tournament.timer.isRunning) {
          applyElapsed(tournament);
          tournament.timer.isRunning = false;
          tournament.timer.startedAt = null;
        }
        break;

      case 'reset':
        tournament.timer = {
          isRunning: false,
          currentLevel: 1,
          timeRemaining: levelDuration,
          totalElapsed: 0,
          startedAt: null,
        };
        tournament.state = 'setup';
        break;

      case 'skip':
        if (tournament.timer.currentLevel < maxLevel) {
          applyElapsed(tournament);
          tournament.timer.currentLevel += 1;
          tournament.timer.timeRemaining = levelDuration;
          if (tournament.timer.isRunning) {
            tournament.timer.startedAt = Date.now();
          }
        }
        break;

      case 'advance':
        if (tournament.timer.currentLevel < maxLevel && tournament.timer.isRunning && tournament.timer.startedAt) {
          const lockStartedAt = tournament.timer.startedAt;
          applyElapsed(tournament);
          if (tournament.timer.timeRemaining > 0) break;

          const lockAcquired = await acquireAdvanceLock(id, tournament.timer.currentLevel, lockStartedAt);
          if (!lockAcquired) {
            return NextResponse.json({
              timer: tournament.timer,
              time: Date.now(),
            });
          }

          tournament.timer.currentLevel += 1;
          tournament.timer.timeRemaining = levelDuration;
          tournament.timer.startedAt = tournament.timer.isRunning ? Date.now() : null;
        }
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid timer action' },
          { status: 400 }
        );
    }

    await setTournament(id, JSON.stringify(tournament));

    return NextResponse.json({
      timer: tournament.timer,
      time: Date.now(),
    });
  } catch (error) {
    console.error('Timer action error:', error);
    return NextResponse.json(
      { error: 'Failed to perform timer action' },
      { status: 500 }
    );
  }
}
