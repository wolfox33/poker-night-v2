import { NextRequest, NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { setTournament, setTournamentCode } from '@/lib/kv';
import { validateConfigPatch } from '@/lib/tournament-validation';
import {
  Tournament,
  TournamentConfig,
  DEFAULT_CONFIG,
  DEFAULT_TIMER_STATE,
  DEFAULT_RANKING,
} from '@/types/tournament';

const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz', 8);
const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 3);

export async function POST(request: NextRequest) {
  try {
    console.log('Creating tournament...');
    
    let config: Partial<TournamentConfig> = {};
    
    try {
      const body = await request.json();
      config = body.config && typeof body.config === 'object' ? body.config : {};
    } catch {
      // Empty body is fine, use defaults
    }

    const validationError = validateConfigPatch(config);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const id = `poker-${generateId()}`;
    const code = generateCode();
    const hostToken = generateId();

    console.log('Generated:', { id, code, hostToken });

    const tournament: Tournament = {
      id,
      code,
      hostToken,
      createdAt: Date.now(),
      config: { ...DEFAULT_CONFIG, ...config },
      state: 'setup',
      players: [],
      timer: { ...DEFAULT_TIMER_STATE },
      ranking: { ...DEFAULT_RANKING, places: [...DEFAULT_RANKING.places] },
      extras: [],
    };

    console.log('Saving tournament...');
    await setTournament(id, JSON.stringify(tournament));
    console.log('Saving code mapping...');
    await setTournamentCode(code, id);
    console.log('Done!');

    return NextResponse.json({
      id,
      code,
      hostToken,
      tournament,
    });
  } catch (error) {
    console.error('Create tournament error:', error);
    return NextResponse.json(
      { error: 'Failed to create tournament', details: String(error) },
      { status: 500 }
    );
  }
}
