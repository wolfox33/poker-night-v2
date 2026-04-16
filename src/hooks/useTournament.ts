'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tournament,
  TournamentResponse,
  TimerState,
  TournamentState,
  TournamentConfig,
  Player,
  RankingState,
} from '@/types/tournament';

interface UseTournamentReturn {
  tournament: Tournament | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  canEdit: boolean;
  role: 'host' | 'player' | 'none';
  createTournament: (config?: Partial<TournamentConfig>) => Promise<{ id: string; code: string; hostToken: string }>;
  joinTournament: (code: string, playerName: string) => Promise<string>;
  timerAction: (action: 'start' | 'pause' | 'reset' | 'skip') => Promise<void>;
  addPlayer: (name: string, buyin?: number) => Promise<void>;
  removePlayer: (playerId: string) => Promise<void>;
  updateConfig: (config: Partial<TournamentConfig>) => Promise<void>;
  updateRanking: (positions: { playerId: string; position: number }[]) => Promise<void>;
  logout: () => void;
}

export function useTournament(): UseTournamentReturn {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [role, setRole] = useState<'host' | 'player' | 'none'>('none');

  const eventSourceRef = useRef<EventSource | null>(null);
  const tournamentIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const connectToStream = useCallback((id: string, token: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const host = window.location.host;
    const url = `${protocol}://${host}/api/tournament/${id}/stream?token=${token}`;

    const eventSource = new EventSource(url, {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'state') {
          setTournament(message.data);
        } else if (message.type === 'timer') {
          setTournament((prev) => {
            if (!prev) return null;
            return { ...prev, timer: message.data as TimerState };
          });
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();

      // Reconnect after 3 seconds
      setTimeout(() => {
        if (tournamentIdRef.current && tokenRef.current) {
          connectToStream(tournamentIdRef.current, tokenRef.current);
        }
      }, 3000);
    };

    eventSourceRef.current = eventSource;
  }, []);

  const fetchState = useCallback(async (id: string, token: string) => {
    try {
      const res = await fetch(`/api/tournament/${id}/state`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch tournament state');
      }

      const data: TournamentResponse = await res.json();
      setTournament(data.tournament);
      setRole(data.role);
      setCanEdit(data.canEdit);
      setIsLoading(false);

      // Connect to SSE stream
      connectToStream(id, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament');
      setIsLoading(false);
    }
  }, [connectToStream]);

  const createTournament = useCallback(async (config?: Partial<TournamentConfig>) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tournament/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create tournament');
      }

      const data = await res.json();

      // Store tokens
      localStorage.setItem('poker_host_token', data.hostToken);
      localStorage.setItem('poker_tournament_id', data.id);
      tokenRef.current = data.hostToken;
      tournamentIdRef.current = data.id;

      // Set tournament state immediately
      setTournament(data.tournament);
      setRole('host');
      setCanEdit(true);

      // Connect to stream
      connectToStream(data.id, data.hostToken);

      return { id: data.id, code: data.code, hostToken: data.hostToken };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [connectToStream]);

  const joinTournament = useCallback(async (code: string, playerName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tournament/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, playerName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join tournament');
      }

      const data = await res.json();

      // Store tokens
      localStorage.setItem('poker_player_token', data.playerToken);
      localStorage.setItem('poker_tournament_id', data.tournament.id);
      tokenRef.current = data.playerToken;
      tournamentIdRef.current = data.tournament.id;

      setRole('player');
      setCanEdit(false);

      // Connect to stream
      connectToStream(data.tournament.id, data.playerToken);

      return data.tournament.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join tournament');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [connectToStream]);

  const timerAction = useCallback(async (action: 'start' | 'pause' | 'reset' | 'skip') => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;

    if (!id || !token) return;

    try {
      const res = await fetch(`/api/tournament/${id}/timer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to perform timer action');
      }

      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, timer: data.timer } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to perform timer action');
    }
  }, []);

  const addPlayer = useCallback(async (name: string, buyin?: number) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;

    if (!id || !token) return;

    try {
      const res = await fetch(`/api/tournament/${id}/players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'add', name, buyin }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add player');
      }

      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, players: data.players } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player');
    }
  }, []);

  const removePlayer = useCallback(async (playerId: string) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;

    if (!id || !token) return;

    try {
      const res = await fetch(`/api/tournament/${id}/players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'remove', playerId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove player');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player');
    }
  }, []);

  const updateConfig = useCallback(async (config: Partial<TournamentConfig>) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;

    if (!id || !token) return;

    try {
      const res = await fetch(`/api/tournament/${id}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update config');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config');
    }
  }, []);

  const updateRanking = useCallback(async (positions: { playerId: string; position: number }[]) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;

    if (!id || !token) return;

    try {
      const res = await fetch(`/api/tournament/${id}/ranking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ positions }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update ranking');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ranking');
    }
  }, []);

  const logout = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    localStorage.removeItem('poker_host_token');
    localStorage.removeItem('poker_player_token');
    localStorage.removeItem('poker_tournament_id');
    setTournament(null);
    setRole('none');
    setCanEdit(false);
    tournamentIdRef.current = null;
    tokenRef.current = null;
  }, []);

  // Initialize on mount - check for stored session
  useEffect(() => {
    const storedId = localStorage.getItem('poker_tournament_id');
    const hostToken = localStorage.getItem('poker_host_token');
    const playerToken = localStorage.getItem('poker_player_token');
    const token = hostToken || playerToken;

    if (storedId && token) {
      tournamentIdRef.current = storedId;
      tokenRef.current = token;
      fetchState(storedId, token);
    } else {
      setIsLoading(false);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    tournament,
    isLoading,
    error,
    isConnected,
    canEdit,
    role,
    createTournament,
    joinTournament,
    timerAction,
    addPlayer,
    removePlayer,
    updateConfig,
    updateRanking,
    logout,
  };
}