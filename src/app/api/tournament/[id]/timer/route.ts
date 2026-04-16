import { NextRequest, NextResponse } from 'next/server';
import { getTournament, setTournament } from '@/lib/kv';
import { Tournament, TimerAction } from '@/types/tournament';

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

    // Verify host token
    if (token !== tournament.hostToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body: TimerAction = await request.json();
    const { action } = body;

    const levelDuration = tournament.config.levelDuration * 60;

    switch (action) {
      case 'start':
        if (!tournament.timer.isRunning) {
          tournament.timer.isRunning = true;
          tournament.timer.startedAt = Date.now();
          tournament.state = tournament.state === 'setup' ? 'running' : tournament.state;
        }
        break;

      case 'pause':
        if (tournament.timer.isRunning && tournament.timer.startedAt) {
          const elapsed = Math.floor((Date.now() - tournament.timer.startedAt) / 1000);
          tournament.timer.timeRemaining = Math.max(0, tournament.timer.timeRemaining - elapsed);
          tournament.timer.totalElapsed += elapsed;
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
        if (tournament.timer.currentLevel < 27) {
          tournament.timer.currentLevel += 1;
          tournament.timer.timeRemaining = levelDuration;
          if (tournament.timer.isRunning) {
            tournament.timer.startedAt = Date.now();
          }
        }
        break;

      case 'advance':
        // Client-triggered level advance when timer reaches zero
        if (tournament.timer.currentLevel < 27) {
          tournament.timer.currentLevel += 1;
          tournament.timer.timeRemaining = levelDuration;
          tournament.timer.startedAt = tournament.timer.isRunning ? Date.now() : null;
        }
        break;
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