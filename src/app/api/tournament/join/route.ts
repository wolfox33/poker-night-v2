import { NextRequest, NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { getTournament, getTournamentByCode, setTournament } from '@/lib/kv';
import { Tournament, Player } from '@/types/tournament';

const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz', 10);
const generateToken = customAlphabet('abcdefghijklmnopqrstuvwxyz', 16);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, playerName } = body;

    if (!code || !playerName) {
      return NextResponse.json(
        { error: 'Code and player name are required' },
        { status: 400 }
      );
    }

    if (playerName.length > 20) {
      return NextResponse.json(
        { error: 'Player name must be 20 characters or less' },
        { status: 400 }
      );
    }

    const id = await getTournamentByCode(code.toUpperCase());
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

    // Check if name is already taken
    const nameTaken = tournament.players.some(
      (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );
    if (nameTaken) {
      return NextResponse.json(
        { error: 'This name is already taken' },
        { status: 400 }
      );
    }

    const playerToken = generateToken();
    const player: Player = {
      id: playerToken,
      name: playerName,
      buyins: 0,
      rebuys: 0,
      addon: false,
      isHost: false,
    };

    tournament.players.push(player);
    await setTournament(id, JSON.stringify(tournament));

    return NextResponse.json({
      tournament,
      playerToken,
      role: 'player' as const,
    });
  } catch (error) {
    console.error('Join tournament error:', error);
    return NextResponse.json(
      { error: 'Failed to join tournament' },
      { status: 500 }
    );
  }
}