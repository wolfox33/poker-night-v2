import { NextRequest } from 'next/server';
import { getTournament } from '@/lib/kv';
import { Tournament } from '@/types/tournament';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Token required', { status: 401 });
  }

  const data = await getTournament(id);
  if (!data) {
    return new Response('Tournament not found', { status: 404 });
  }

  const tournament: Tournament = JSON.parse(data);

  const isHost = token === tournament.hostToken;
  const isPlayer = tournament.players?.some((p) => p.id === token);
  
  if (!isHost && !isPlayer) {
    return new Response('Unauthorized', { status: 403 });
  }

  const clientId = Math.random().toString(36).substring(7);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'state', data: tournament })}\n\n`)
      );
      controller.enqueue(
        new TextEncoder().encode(`: connected ${clientId}\n\n`)
      );
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
