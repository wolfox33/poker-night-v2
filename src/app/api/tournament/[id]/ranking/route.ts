import { NextRequest, NextResponse } from 'next/server';
import { getTournament, setTournament } from '@/lib/kv';
import { calculatePlayerCost } from '@/lib/tournament-money';
import { Tournament, RankingAction } from '@/types/tournament';

const SNG_PCT: Record<number, number[]> = {
  3: [0.50, 0.30, 0.20],
  4: [0.40, 0.30, 0.20, 0.10],
  5: [0.35, 0.25, 0.20, 0.13, 0.07],
};

function defaultPrizes(totalPot: number, prizeCount: number, roundingStep: number): number[] {
  const pct = SNG_PCT[prizeCount] ?? SNG_PCT[3];
  return pct.map(p => Math.round(totalPot * p / roundingStep) * roundingStep);
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

    if (token !== tournament.hostToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body: RankingAction = await request.json();
    if (body.action === 'reopen') {
      tournament.state = tournament.timer.isRunning ? 'running' : 'setup';
      await setTournament(id, JSON.stringify(tournament));
      return NextResponse.json({ ranking: tournament.ranking, state: tournament.state });
    }

    if (body.action === 'finishWithoutRanking') {
      tournament.ranking.places = [];
      tournament.ranking.agreement = 'none';
      tournament.state = 'finished';
      await setTournament(id, JSON.stringify(tournament));
      return NextResponse.json({ ranking: tournament.ranking, state: tournament.state });
    }

    const { positions, prizes: clientPrizes } = body;

    if (!Array.isArray(positions) || positions.length !== tournament.config.prizeCount) {
      return NextResponse.json(
        { error: 'Ranking positions must match prize count' },
        { status: 400 }
      );
    }

    const playerIds = new Set(tournament.players.map((player) => player.id));
    const positionPlayers = new Set<string>();
    for (const position of positions) {
      if (!playerIds.has(position.playerId)) {
        return NextResponse.json({ error: 'Invalid ranking player' }, { status: 400 });
      }
      if (positionPlayers.has(position.playerId)) {
        return NextResponse.json({ error: 'Ranking players must be unique' }, { status: 400 });
      }
      if (!Number.isInteger(position.position) || position.position < 1 || position.position > tournament.config.prizeCount) {
        return NextResponse.json({ error: 'Invalid ranking position' }, { status: 400 });
      }
      positionPlayers.add(position.playerId);
    }

    // Calculate total pot
    const totalPot = tournament.players.reduce((sum, p) => {
      return sum + calculatePlayerCost(p, tournament.config);
    }, 0);

    const prizes = clientPrizes ?? defaultPrizes(totalPot, tournament.config.prizeCount, tournament.config.roundingStep);
    if (
      !Array.isArray(prizes) ||
      prizes.length !== tournament.config.prizeCount ||
      prizes.some((prize) => !Number.isFinite(prize) || prize < 0)
    ) {
      return NextResponse.json({ error: 'Invalid prizes' }, { status: 400 });
    }

    const places = positions.map((pos, index) => ({
      position: pos.position,
      playerId: pos.playerId,
      prize: prizes[index] ?? 0,
    }));

    tournament.ranking.places = places;
    tournament.ranking.agreement = body.agreement ?? 'manual';
    tournament.state = 'finished';

    await setTournament(id, JSON.stringify(tournament));

    return NextResponse.json({ ranking: tournament.ranking, totalPot });
  } catch (error) {
    console.error('Ranking update error:', error);
    return NextResponse.json(
      { error: 'Failed to update ranking' },
      { status: 500 }
    );
  }
}
