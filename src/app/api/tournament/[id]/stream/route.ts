import { NextRequest } from 'next/server';
import { getTournament } from '@/lib/kv';
import { Tournament } from '@/types/tournament';

const clients = new Map<string, Map<string, ReadableStreamDefaultController>>();

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
  
  if (!clients.has(id)) {
    clients.set(id, new Map());
  }
  const clientMap = clients.get(id)!;

  const stream = new ReadableStream({
    start(controller) {
      clientMap.set(clientId, controller);

      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'state', data: tournament })}\n\n`)
      );
      // Server-side timer removed - clients calculate time locally and notify on level change
    },
    cancel() {
      clientMap.delete(clientId);
      if (clientMap.size === 0) {
        clients.delete(id);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export function broadcastToTournament(tournamentId: string, message: object) {
  const clientMap = clients.get(tournamentId);
  if (clientMap) {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    const encoded = new TextEncoder().encode(data);
    for (const controller of clientMap.values()) {
      try {
        controller.enqueue(encoded);
      } catch {
        // Client disconnected
      }
    }
  }
}
