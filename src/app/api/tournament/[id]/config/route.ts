import { NextRequest, NextResponse } from 'next/server';
import { getTournament, setTournament } from '@/lib/kv';
import { validateConfigPatch } from '@/lib/tournament-validation';
import { Tournament, TournamentConfig } from '@/types/tournament';

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

    const body: Partial<TournamentConfig> = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Config payload must be an object' },
        { status: 400 }
      );
    }

    const validationError = validateConfigPatch(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    tournament.config = { ...tournament.config, ...body };
    await setTournament(id, JSON.stringify(tournament));

    return NextResponse.json({ config: tournament.config });
  } catch (error) {
    console.error('Config update error:', error);
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    );
  }
}
