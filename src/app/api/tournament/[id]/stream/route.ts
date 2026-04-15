import { NextRequest } from 'next/server';
import { getTournament, setTournament } from '@/lib/kv';
import { Tournament, BLINDS_LEVELS } from '@/types/tournament';

const clients = new Map<string, Map<string, ReadableStreamDefaultController>>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  const data = await getTournament(id);
  if (!data) {
    return new Response('Tournament not found', { status: 404 });
  }

  const tournament: Tournament = JSON.parse(data);

  const isHost = token === tournament.hostToken;
  const isPlayer = tournament.players.some((p) => p.id === token);
  
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

      if (tournament.timer.isRunning && tournament.timer.startedAt) {
        startServerTimer(id, tournament.config.levelDuration * 60);
      }
    },
    cancel() {
      clientMap.delete(clientId);
      if (clientMap.size === 0) {
        clients.delete(id);
        stopServerTimer(id);
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

const timers = new Map<string, NodeJS.Timeout>();

export async function startServerTimer(tournamentId: string, levelDuration: number) {
  if (timers.has(tournamentId)) {
    return;
  }

  const sendUpdate = async () => {
    const data = await getTournament(tournamentId);
    if (!data) {
      stopServerTimer(tournamentId);
      return;
    }

    const tournament: Tournament = JSON.parse(data);
    
    if (!tournament.timer.isRunning || !tournament.timer.startedAt) {
      stopServerTimer(tournamentId);
      return;
    }

    const elapsed = Math.floor((Date.now() - tournament.timer.startedAt) / 1000);
    const totalSeconds = tournament.timer.currentLevel * levelDuration;
    const remaining = Math.max(0, totalSeconds - elapsed);

    tournament.timer.timeRemaining = remaining;
    tournament.timer.totalElapsed = elapsed;

    if (remaining === 0 && tournament.timer.currentLevel < BLINDS_LEVELS.length) {
      tournament.timer.currentLevel += 1;
      tournament.timer.startedAt = Date.now();
    }

    await setTournament(tournamentId, JSON.stringify(tournament));

    const clientMap = clients.get(tournamentId);
    if (clientMap) {
      const message = `data: ${JSON.stringify({ type: 'timer', data: tournament.timer })}\n\n`;
      const encoded = new TextEncoder().encode(message);
      for (const controller of clientMap.values()) {
        try {
          controller.enqueue(encoded);
        } catch {
          // Client disconnected
        }
      }
    }

    if (tournament.timer.isRunning) {
      timers.set(
        tournamentId,
        setTimeout(sendUpdate, 1000)
      );
    }
  };

  sendUpdate();
}

export function stopServerTimer(tournamentId: string) {
  const timer = timers.get(tournamentId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(tournamentId);
  }
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