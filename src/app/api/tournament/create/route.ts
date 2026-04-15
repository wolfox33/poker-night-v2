import { NextRequest, NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { getTournament, setTournament, setTournamentCode } from '@/lib/kv';
import {
  Tournament,
  TournamentConfig,
  DEFAULT_CONFIG,
  DEFAULT_TIMER_STATE,
  DEFAULT_RANKING,
} from '@/types/tournament';

const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz', 8);
const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export async function POST(request: NextRequest) {
  try {
    let config: Partial<TournamentConfig> = {};
    
    try {
      const body = await request.json();
      config = body.config || {};
    } catch {
      // Empty body is fine, use defaults
    }

    const id = `poker-${generateId()}`;
    const code = generateCode();
    const hostToken = generateId();

    const tournament: Tournament = {
      id,
      code,
      hostToken,
      createdAt: Date.now(),
      config: { ...DEFAULT_CONFIG, ...config },
      state: 'setup',
      players: [],
      timer: DEFAULT_TIMER_STATE,
      ranking: DEFAULT_RANKING,
      extras: [],
    };

    await setTournament(id, JSON.stringify(tournament));
    await setTournamentCode(code, id);

    return NextResponse.json({
      id,
      code,
      hostToken,
      tournament,
    });
  } catch (error) {
    console.error('Create tournament error:', error);
    return NextResponse.json(
      { error: 'Failed to create tournament' },
      { status: 500 }
    );
  }
}