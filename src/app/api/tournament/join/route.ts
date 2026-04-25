import { NextRequest, NextResponse } from 'next/server';
import { getTournament, getTournamentByCode } from '@/lib/kv';
import { Tournament } from '@/types/tournament';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';

    if (!code) {
      return NextResponse.json(
        { error: 'Code is required' },
        { status: 400 }
      );
    }

    const id = await getTournamentByCode(code);
    if (!id) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    const data = await getTournament(id);
    if (!data) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    const tournament: Tournament = JSON.parse(data);

    return NextResponse.json({
      tournament,
      role: 'none' as const,
    });
  } catch (error) {
    console.error('Join tournament error:', error);
    return NextResponse.json(
      { error: 'Failed to join tournament' },
      { status: 500 }
    );
  }
}
