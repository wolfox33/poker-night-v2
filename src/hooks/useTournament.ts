'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tournament,
  TournamentResponse,
  TimerState,
  TournamentConfig,
} from '@/types/tournament';

interface UseTournamentReturn {
  tournament: Tournament | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  canEdit: boolean;
  role: 'host' | 'player' | 'none';
  createTournament: (config?: Partial<TournamentConfig>) => Promise<{ id: string; code: string; hostToken: string }>;
  joinTournament: (code: string) => Promise<string>;
  timerAction: (action: 'start' | 'pause' | 'reset' | 'skip' | 'advance') => Promise<void>;
  addPlayer: (name: string, buyin?: number) => Promise<void>;
  removePlayer: (playerId: string) => Promise<void>;
  rebuyPlayer: (playerId: string, rebuyType: 'single' | 'double') => Promise<void>;
  removeRebuy: (playerId: string, rebuyType: 'single' | 'double') => Promise<void>;
  toggleAddon: (playerId: string) => Promise<void>;
  updateConfig: (config: Partial<TournamentConfig>) => Promise<void>;
  updateRanking: (positions: { playerId: string; position: number }[], prizes?: number[], agreement?: 'none' | 'icm' | 'manual') => Promise<void>;
  finishWithoutRanking: () => Promise<void>;
  reopenTournament: () => Promise<void>;
  addExtra: (description: string, amount: number, paidBy: string[], splitAmong: string[]) => Promise<void>;
  removeExtra: (extraId: string) => Promise<void>;
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
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RETRIES = 5;
  const BASE_DELAY = 3000;

  const connectToStream = useCallback((id: string, token: string) => {
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
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
      retryCountRef.current = 0; // Reset retry counter on successful connection
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

    eventSource.onerror = (err) => {
      setIsConnected(false);
      eventSource.close();

      // EventSource doesn't expose status code directly, but we track retries
      console.error('SSE connection error:', err);
      if (retryCountRef.current >= MAX_RETRIES) {
        console.error('SSE: Max retries reached, giving up');
        return;
      }

      // Exponential backoff: 3s, 6s, 12s, 24s, 48s
      const delay = BASE_DELAY * Math.pow(2, retryCountRef.current);
      retryCountRef.current++;

      retryTimeoutRef.current = setTimeout(() => {
        if (tournamentIdRef.current && tokenRef.current) {
          connectToStream(tournamentIdRef.current, tokenRef.current);
        }
      }, delay);
    };

    eventSourceRef.current = eventSource;
  }, []);

  const fetchState = useCallback(async (id: string, token?: string) => {
    try {
      const res = await fetch(`/api/tournament/${id}/state`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!res.ok) {
        throw new Error('Failed to fetch tournament state');
      }

      const data: TournamentResponse = await res.json();
      setTournament(data.tournament);
      setRole(data.role);
      setCanEdit(data.canEdit);
      setIsLoading(false);

      if (token) {
        connectToStream(id, token);
      }
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

  const joinTournament = useCallback(async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tournament/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join tournament');
      }

      const data = await res.json();

      localStorage.removeItem('poker_host_token');
      localStorage.removeItem('poker_player_token');
      localStorage.setItem('poker_tournament_id', data.tournament.id);
      tokenRef.current = null;
      tournamentIdRef.current = data.tournament.id;

      setRole('none');
      setCanEdit(false);
      setTournament(data.tournament);

      return data.tournament.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join tournament');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const timerAction = useCallback(async (action: 'start' | 'pause' | 'reset' | 'skip' | 'advance') => {
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

  const rebuyPlayer = useCallback(async (playerId: string, rebuyType: 'single' | 'double') => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;
    if (!id || !token) return;
    try {
      const res = await fetch(`/api/tournament/${id}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'rebuy', playerId, rebuyType }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to rebuy player');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, players: data.players } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuy player');
    }
  }, []);

  const removeRebuy = useCallback(async (playerId: string, rebuyType: 'single' | 'double') => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;
    if (!id || !token) return;
    try {
      const res = await fetch(`/api/tournament/${id}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'removeRebuy', playerId, rebuyType }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove rebuy');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, players: data.players } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove rebuy');
    }
  }, []);

  const toggleAddon = useCallback(async (playerId: string) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;
    if (!id || !token) return;
    try {
      const res = await fetch(`/api/tournament/${id}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'addon', playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to toggle addon');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, players: data.players } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle addon');
    }
  }, []);

  const removePlayerInternal = useCallback(async (playerId: string) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;
    if (!id || !token) return;
    try {
      const res = await fetch(`/api/tournament/${id}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'remove', playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove player');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, players: data.players } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player');
    }
  }, []);

  const addExtra = useCallback(async (description: string, amount: number, paidBy: string[], splitAmong: string[]) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;
    if (!id || !token) return;
    try {
      const res = await fetch(`/api/tournament/${id}/extras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'add', description, amount, paidBy, splitAmong }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add extra');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, extras: data.extras } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add extra');
    }
  }, []);

  const removeExtra = useCallback(async (extraId: string) => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;
    if (!id || !token) return;
    try {
      const res = await fetch(`/api/tournament/${id}/extras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'remove', extraId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove extra');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, extras: data.extras } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove extra');
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
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, config: data.config } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config');
    }
  }, []);

  const updateRanking = useCallback(async (positions: { playerId: string; position: number }[], prizes?: number[], agreement?: 'none' | 'icm' | 'manual') => {
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
        body: JSON.stringify({ positions, prizes, agreement }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update ranking');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, ranking: data.ranking, state: 'finished' } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ranking');
    }
  }, []);

  const finishWithoutRanking = useCallback(async () => {
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
        body: JSON.stringify({ action: 'finishWithoutRanking' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to finish tournament');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, ranking: data.ranking, state: data.state } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finish tournament');
    }
  }, []);

  const reopenTournament = useCallback(async () => {
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
        body: JSON.stringify({ action: 'reopen' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reopen tournament');
      }
      const data = await res.json();
      setTournament((prev) => prev ? { ...prev, ranking: data.ranking, state: data.state } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen tournament');
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

  // Serverless-safe sync: SSE may only deliver the initial state depending on the host.
  useEffect(() => {
    const id = tournamentIdRef.current;
    const token = tokenRef.current;
    if (!id) return;

    const refresh = () => {
      fetch(`/api/tournament/${id}/state`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
        .then(r => r.ok ? r.json() : null)
        .then((data: TournamentResponse | null) => {
          if (!data?.tournament) return;
          setTournament(data.tournament);
          setRole(data.role);
          setCanEdit(data.canEdit);
        })
        .catch((err) => {
          console.error('Polling state refresh failed:', err);
        });
    };

    const intervalId = setInterval(refresh, tournament?.timer?.isRunning ? 5000 : 10000);
    return () => clearInterval(intervalId);
  }, [tournament?.id, tournament?.timer?.isRunning]);

  // Initialize on mount - check for stored session
  useEffect(() => {
    const storedId = localStorage.getItem('poker_tournament_id');
    const hostToken = localStorage.getItem('poker_host_token');
    const playerToken = localStorage.getItem('poker_player_token');
    const token = hostToken || playerToken;

    if (storedId) {
      tournamentIdRef.current = storedId;
      tokenRef.current = token || null;
      fetchState(storedId, token || undefined);
    } else {
      setIsLoading(false);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
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
    removePlayer: removePlayerInternal,
    rebuyPlayer,
    removeRebuy,
    toggleAddon,
    updateConfig,
    updateRanking,
    finishWithoutRanking,
    reopenTournament,
    addExtra,
    removeExtra,
    logout,
  };
}
