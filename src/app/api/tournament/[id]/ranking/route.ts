import { NextRequest, NextResponse } from 'next/server';
import { getTournament, setTournament } from '@/lib/kv';
import { Tournament, RankingAction } from '@/types/tournament';

function calculateICMPrizes(totalPot: number, prizeCount: number): number[] {
  // Simplified ICM calculation - percentages for top positions
  const percentages: Record<number, number> = {
    1: 0.50,
    2: 0.30,
    3: 0.15,
    4: 0.04,
    5: 0.01,
  };

  const prizes: number[] = [];
  for (let i = 1; i <= prizeCount; i++) {
    prizes.push(Math.floor(totalPot * (percentages[i] || 0)));
  }
  return prizes;
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
    const { positions } = body;

    // Calculate total pot
    const totalPot = tournament.players.reduce((sum, p) => {
      const buyins = p.buyins * tournament.config.buyIn;
      const rebuys = p.rebuys * (p.rebuys > 1 ? tournament.config.rebuyDouble : tournament.config.rebuySingle);
      const addon = p.addon ? tournament.config.addon : 0;
      return sum + buyins + rebuys + addon;
    }, 0);

    // Calculate prizes with ICM
    const prizes = calculateICMPrizes(totalPot, tournament.config.prizeCount);

    // Create ranking places
    const places = positions.map((pos, index) => ({
      position: pos.position,
      playerId: pos.playerId,
      prize: prizes[index] || 0,
    }));

    tournament.ranking.places = places;
    tournament.ranking.agreement = 'manual';
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