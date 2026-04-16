import { NextRequest, NextResponse } from 'next/server';
import { getTournament } from '@/lib/kv';
import { Tournament, TournamentResponse } from '@/types/tournament';

export async function GET(
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

    let role: 'host' | 'player' | 'none' = 'none';
    let canEdit = false;

    if (token === tournament.hostToken) {
      role = 'host';
      canEdit = true;
    } else if (tournament.players?.some((p) => p.id === token)) {
      role = 'player';
      canEdit = false;
    }

    const response: TournamentResponse = {
      tournament,
      role,
      canEdit,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get tournament state error:', error);
    return NextResponse.json(
      { error: 'Failed to get tournament state', details: String(error) },
      { status: 500 }
    );
  }
}