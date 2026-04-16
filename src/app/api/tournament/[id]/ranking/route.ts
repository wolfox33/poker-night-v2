import { NextRequest, NextResponse } from 'next/server';
import { getTournament, setTournament } from '@/lib/kv';
import { Tournament, RankingAction } from '@/types/tournament';

const SNG_PCT: Record<number, number[]> = {
  3: [0.50, 0.30, 0.20],
  4: [0.40, 0.30, 0.20, 0.10],
  5: [0.35, 0.25, 0.20, 0.13, 0.07],
};

function defaultPrizes(totalPot: number, prizeCount: number): number[] {
  const pct = SNG_PCT[prizeCount] ?? SNG_PCT[3];
  return pct.map(p => Math.round(totalPot * p / 5) * 5);
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
    const { positions, prizes: clientPrizes } = body;

    // Calculate total pot
    const totalPot = tournament.players.reduce((sum, p) => {
      const buyins = p.buyins * tournament.config.buyIn;
      const rebuys = p.rebuys > 1
        ? (p.rebuys - 1) * tournament.config.rebuyDouble
        : p.rebuys * tournament.config.rebuySingle;
      const addon = p.addon ? tournament.config.addon : 0;
      return sum + buyins + rebuys + addon;
    }, 0);

    const prizes = clientPrizes ?? defaultPrizes(totalPot, tournament.config.prizeCount);

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