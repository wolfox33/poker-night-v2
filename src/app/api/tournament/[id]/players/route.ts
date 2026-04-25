import { NextRequest, NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { getTournament, setTournament } from '@/lib/kv';
import { getPlayerRebuyCounts } from '@/lib/tournament-money';
import { Tournament, Player, PlayerAction } from '@/types/tournament';

const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz', 10);

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

    const body: PlayerAction = await request.json();
    const { action, playerId, name, buyin, rebuyType } = body;

    switch (action) {
      case 'add':
        if (!name?.trim()) {
          return NextResponse.json(
            { error: 'Player name is required' },
            { status: 400 }
          );
        }
        if (name.trim().length > 20) {
          return NextResponse.json(
            { error: 'Player name must be 20 characters or less' },
            { status: 400 }
          );
        }
        if (buyin !== undefined && (!Number.isInteger(buyin) || buyin < 0)) {
          return NextResponse.json(
            { error: 'Buy-ins must be a non-negative integer' },
            { status: 400 }
          );
        }

        // Check if name is taken
        const nameTaken = tournament.players.some(
          (p) => p.name.toLowerCase() === name.trim().toLowerCase()
        );
        if (nameTaken) {
          return NextResponse.json(
            { error: 'This name is already taken' },
            { status: 400 }
          );
        }

        const newPlayer: Player = {
          id: generateId(),
          name: name.trim(),
          buyins: buyin ?? 1,
          rebuySingleCount: 0,
          rebuyDoubleCount: 0,
          rebuys: 0,
          addon: false,
          isHost: false,
        };
        tournament.players.push(newPlayer);
        break;

      case 'remove':
        if (!playerId) {
          return NextResponse.json(
            { error: 'Player ID is required' },
            { status: 400 }
          );
        }

        tournament.players = tournament.players.filter(p => p.id !== playerId);
        break;

      case 'rebuy': {
        if (!playerId) {
          return NextResponse.json(
            { error: 'Player ID is required' },
            { status: 400 }
          );
        }
        const rebuyPlayer = tournament.players.find(p => p.id === playerId);
        if (!rebuyPlayer) {
          return NextResponse.json({ error: 'Player not found' }, { status: 404 });
        }
        if (rebuyType !== 'single' && rebuyType !== 'double') {
          return NextResponse.json({ error: 'Invalid rebuy type' }, { status: 400 });
        }
        const currentRebuys = getPlayerRebuyCounts(rebuyPlayer);
        rebuyPlayer.rebuySingleCount = currentRebuys.single;
        rebuyPlayer.rebuyDoubleCount = currentRebuys.double;
        if (rebuyType === 'double') {
          rebuyPlayer.rebuyDoubleCount += 1;
        } else {
          rebuyPlayer.rebuySingleCount += 1;
        }
        rebuyPlayer.rebuys = rebuyPlayer.rebuySingleCount + rebuyPlayer.rebuyDoubleCount;
        break;
      }

      case 'removeRebuy': {
        if (!playerId) {
          return NextResponse.json(
            { error: 'Player ID is required' },
            { status: 400 }
          );
        }
        const rebuyPlayer = tournament.players.find(p => p.id === playerId);
        if (!rebuyPlayer) {
          return NextResponse.json({ error: 'Player not found' }, { status: 404 });
        }
        if (rebuyType !== 'single' && rebuyType !== 'double') {
          return NextResponse.json({ error: 'Invalid rebuy type' }, { status: 400 });
        }
        const currentRebuys = getPlayerRebuyCounts(rebuyPlayer);
        rebuyPlayer.rebuySingleCount = currentRebuys.single;
        rebuyPlayer.rebuyDoubleCount = currentRebuys.double;
        if (rebuyType === 'double') {
          rebuyPlayer.rebuyDoubleCount = Math.max(0, rebuyPlayer.rebuyDoubleCount - 1);
        } else {
          rebuyPlayer.rebuySingleCount = Math.max(0, rebuyPlayer.rebuySingleCount - 1);
        }
        rebuyPlayer.rebuys = rebuyPlayer.rebuySingleCount + rebuyPlayer.rebuyDoubleCount;
        break;
      }

      case 'addon': {
        if (!playerId) {
          return NextResponse.json(
            { error: 'Player ID is required' },
            { status: 400 }
          );
        }
        const addonPlayer = tournament.players.find(p => p.id === playerId);
        if (!addonPlayer) {
          return NextResponse.json({ error: 'Player not found' }, { status: 404 });
        }
        addonPlayer.addon = !addonPlayer.addon;
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid player action' }, { status: 400 });
    }

    await setTournament(id, JSON.stringify(tournament));

    return NextResponse.json({ players: tournament.players });
  } catch (error) {
    console.error('Player action error:', error);
    return NextResponse.json(
      { error: 'Failed to perform player action' },
      { status: 500 }
    );
  }
}
