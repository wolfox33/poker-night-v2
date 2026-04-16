import { NextRequest, NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { getTournament, setTournament } from '@/lib/kv';
import { Tournament, ExtrasAction } from '@/types/tournament';

const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz', 8);

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
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament: Tournament = JSON.parse(data);

    if (token !== tournament.hostToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body: ExtrasAction = await request.json();
    const { action } = body;

    switch (action) {
      case 'add': {
        const { description, amount, paidBy, splitAmong } = body;
        if (!description || !amount || !splitAmong || splitAmong.length === 0) {
          return NextResponse.json(
            { error: 'description, amount and splitAmong are required' },
            { status: 400 }
          );
        }
        tournament.extras.push({
          id: generateId(),
          description,
          amount,
          paidBy: paidBy || [],
          splitAmong,
        });
        break;
      }

      case 'remove': {
        const { extraId } = body;
        if (!extraId) {
          return NextResponse.json({ error: 'extraId is required' }, { status: 400 });
        }
        tournament.extras = tournament.extras.filter(e => e.id !== extraId);
        break;
      }
    }

    await setTournament(id, JSON.stringify(tournament));

    return NextResponse.json({ extras: tournament.extras });
  } catch (error) {
    console.error('Extras action error:', error);
    return NextResponse.json({ error: 'Failed to perform extras action' }, { status: 500 });
  }
}
