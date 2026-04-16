'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';

// Wake Lock API types (not in default DOM types yet)
interface WakeLockSentinel extends EventTarget {
  released: boolean;
  type: 'screen';
  release(): Promise<void>;
  onrelease: ((this: WakeLockSentinel, ev: Event) => unknown) | null;
}
interface Navigator {
  wakeLock: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}
import { useTournament } from '@/hooks/useTournament';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { BLINDS_LEVELS } from '@/types/tournament';

type Tab = 'tournament' | 'timer' | 'ranking' | 'config' | 'extras' | 'acerto';

const SNG_PCT: Record<number, number[]> = {
  3: [50, 30, 20],
  4: [40, 30, 20, 10],
  5: [35, 25, 20, 13, 7],
};

const POSITIONS = ['🥇', '🥈', '🥉', '4º', '5º'];

export default function TournamentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get('code') || '';

  const {
    tournament,
    isLoading,
    error,
    isConnected,
    canEdit,
    role,
    timerAction,
    addPlayer,
    removePlayer,
    rebuyPlayer,
    toggleAddon,
    updateConfig,
    updateRanking,
    addExtra,
    removeExtra,
    logout,
  } = useTournament();

  const [activeTab, setActiveTab] = useState<Tab>('tournament');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  // Extras form state
  const [extraDesc, setExtraDesc] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraPaidBy, setExtraPaidBy] = useState<string[]>([]);
  const [extraSplitAmong, setExtraSplitAmong] = useState<string[]>([]);

  // Ranking state
  const [rankingPositions, setRankingPositions] = useState<string[]>([]);
  const [rankingMode, setRankingMode] = useState<'none' | 'icm' | 'manual'>('none');
  const [rankingChips, setRankingChips] = useState<number[]>([]);
  const [rankingManual, setRankingManual] = useState<number[]>([]);

  // Rebuy modal
  const [rebuyPlayerId, setRebuyPlayerId] = useState<string | null>(null);

  // Client-side timer interpolation — smooth display without relying solely on SSE
  const [localTime, setLocalTime] = useState(0);

  // Sync rankingPositions length with prizeCount
  useEffect(() => {
    if (!tournament) return;
    const count = tournament.config.prizeCount;
    setRankingPositions((prev) => {
      if (prev.length === count) return prev;
      return Array(count).fill('');
    });
    setRankingChips(Array(count).fill(0));
    setRankingManual(Array(count).fill(0));
  }, [tournament?.config.prizeCount]);

  useEffect(() => {
    if (!isLoading && !tournament && !error) {
      router.push('/');
    }
  }, [isLoading, tournament, error, router]);

  // Request notification permission when timer starts
  useEffect(() => {
    if (tournament?.timer?.isRunning && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [tournament?.timer?.isRunning]);

  // Play beep sound (9 beeps: 3 sequences of 3)
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext }).AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const beep = () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.1);
      };
      for (let seq = 0; seq < 3; seq++) {
        for (let i = 0; i < 3; i++) {
          setTimeout(beep, seq * 1000 + i * 250);
        }
      }
    } catch {}
  }, []);

  // Show notification
  const showNotification = useCallback((title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/icon-192.svg', badge: '/icon-192.svg' });
      } catch {}
    }
  }, []);

  // Track previous level for change detection
  const prevLevelRef = useRef(tournament?.timer?.currentLevel ?? 1);

  // Interpolate timer display client-side every 200ms
  useEffect(() => {
    const timer = tournament?.timer;
    if (!timer) {
      setLocalTime(0);
      return;
    }
    if (!timer.isRunning || !timer.startedAt) {
      setLocalTime(timer.timeRemaining);
      prevLevelRef.current = timer.currentLevel;
      return;
    }
    const { startedAt, timeRemaining, currentLevel } = timer;

    // Detect level change and play sound + notification
    if (currentLevel !== prevLevelRef.current) {
      playBeep();
      const blinds = BLINDS_LEVELS[currentLevel - 1];
      if (blinds) {
        showNotification(
          `Poker Night - Nível ${currentLevel}`,
          `Blind: ${blinds.smallBlind}/${blinds.bigBlind}`
        );
      }
      prevLevelRef.current = currentLevel;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setLocalTime(Math.max(0, timeRemaining - elapsed));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [tournament?.timer?.isRunning, tournament?.timer?.startedAt, tournament?.timer?.timeRemaining, tournament?.timer?.currentLevel, playBeep, showNotification]);

  // Wake Lock: keep screen awake when timer tab is active and timer is running
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const isTimerTab = activeTab === 'timer';
    const isRunning = tournament?.timer?.isRunning;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && !wakeLockRef.current) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {}
    };

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };

    if (isTimerTab && isRunning) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-acquire wake lock when visibility changes (user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTimerTab && isRunning) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [activeTab, tournament?.timer?.isRunning]);

  // ── Derived values & memos (MUST be before any conditional return) ──

  const calcPlayerCost = (p: { buyins: number; rebuys: number; addon: boolean }) => {
    if (!tournament) return 0;
    const buyins = p.buyins * tournament.config.buyIn;
    const rebuys = p.rebuys > 1
      ? (p.rebuys - 1) * tournament.config.rebuyDouble
      : p.rebuys * tournament.config.rebuySingle;
    const addon = p.addon ? tournament.config.addon : 0;
    return buyins + rebuys + addon;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const totalPot = useMemo(
    () => tournament?.players.reduce((sum, p) => sum + calcPlayerCost(p), 0) ?? 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tournament]
  );

  // Helper para arredondar segundo roundingStep do torneio
  const roundValue = (val: number) => {
    const step = tournament?.config.roundingStep ?? 1;
    if (step <= 0) return Math.round(val);
    return Math.round(val / step) * step;
  };

  const prizePreview = useMemo(() => {
    if (!tournament) return [];
    const pct = SNG_PCT[tournament.config.prizeCount] ?? SNG_PCT[3];
    return pct.map((p) => roundValue(totalPot * p / 100));
  }, [totalPot, tournament?.config.prizeCount, tournament?.config.roundingStep]);

  function calcICM(chips: number[], prizes: number[]): number[] {
    const n = chips.length;
    const totalChips = chips.reduce((a, b) => a + b, 0);
    if (totalChips === 0 || n === 0) return prizes.map(() => 0);
    const equities = Array(n).fill(0);
    function recurse(remaining: number[], ranking: number[], prob: number) {
      if (remaining.length === 0) {
        ranking.forEach((idx, pos) => { equities[idx] += prob * (prizes[pos] ?? 0); });
        return;
      }
      const tot = remaining.reduce((a, i) => a + chips[i], 0);
      for (let i = 0; i < remaining.length; i++) {
        const idx = remaining[i];
        recurse(remaining.filter((_, j) => j !== i), [...ranking, idx], prob * chips[idx] / tot);
      }
    }
    recurse(Array.from({ length: n }, (_, i) => i), [], 1);
    return equities;
  }

  const calculatedPrizes = useMemo(() => {
    if (!tournament) return [];
    const pct = SNG_PCT[tournament.config.prizeCount] ?? SNG_PCT[3];
    const prizes = pct.map((p) => totalPot * p / 100);
    if (rankingMode === 'icm' && rankingChips.some(c => c > 0)) {
      const icm = calcICM(rankingChips, prizes);
      return icm.map(v => roundValue(v));
    }
    if (rankingMode === 'manual') return rankingManual.map(v => roundValue(v));
    return prizes.map(v => roundValue(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingMode, rankingChips, rankingManual, totalPot, tournament?.config.prizeCount, tournament?.config.roundingStep]);

  const settlementData = useMemo(() => {
    if (!tournament) return null;
    const resumo: Record<string, { gastoTorneio: number; extrasAPagar: number; extrasPagos: number; recebeu: number }> = {};
    tournament.players.forEach(p => {
      resumo[p.id] = { gastoTorneio: calcPlayerCost(p), extrasAPagar: 0, extrasPagos: 0, recebeu: 0 };
    });
    tournament.extras.forEach(extra => {
      const share = extra.amount / extra.splitAmong.length;
      const paid = extra.paidBy.length > 0 ? extra.amount / extra.paidBy.length : 0;
      extra.splitAmong.forEach(id => { if (resumo[id]) resumo[id].extrasAPagar += share; });
      extra.paidBy.forEach(id => { if (resumo[id]) resumo[id].extrasPagos += paid; });
    });
    tournament.ranking.places.forEach(place => {
      if (resumo[place.playerId]) resumo[place.playerId].recebeu = place.prize;
    });
    const saldos: Record<string, number> = {};
    Object.keys(resumo).forEach(id => {
      const r = resumo[id];
      saldos[id] = r.recebeu + r.extrasPagos - r.extrasAPagar - r.gastoTorneio;
    });
    const devedores = Object.entries(saldos).filter(([, v]) => v < -0.01).map(([id, v]) => ({ id, valor: -v })).sort((a, b) => b.valor - a.valor);
    const credores = Object.entries(saldos).filter(([, v]) => v > 0.01).map(([id, v]) => ({ id, valor: v })).sort((a, b) => b.valor - a.valor);
    const transacoes: { de: string; para: string; valor: number }[] = [];
    const d = devedores.map(x => ({ ...x }));
    const c = credores.map(x => ({ ...x }));
    while (d.length > 0 && c.length > 0) {
      const val = Math.min(d[0].valor, c[0].valor);
      const minTx = (tournament.config.roundingStep ?? 1) / 2;
      if (val > minTx) transacoes.push({ de: d[0].id, para: c[0].id, valor: roundValue(val) });
      d[0].valor -= val; c[0].valor -= val;
      if (d[0].valor < 0.01) d.shift();
      if (c[0].valor < 0.01) c.shift();
    }
    return { resumo, saldos, transacoes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament]);

  // ── Conditional returns (after ALL hooks) ──

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-[var(--accent)] text-xl mb-4">Carregando...</div>
          <div className={`text-sm ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Conectado' : 'Conectando...'}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass p-8 text-center">
          <p className="text-[var(--danger)] mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="btn btn-secondary">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (!tournament || !tournament.timer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-[var(--accent)] text-xl mb-4">Carregando...</div>
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeLong = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentBlinds = BLINDS_LEVELS[tournament.timer.currentLevel - 1];
  const nextBlinds = BLINDS_LEVELS[tournament.timer.currentLevel] ?? null;
  const levelDurationSecs = tournament.config.levelDuration * 60;
  const progressPct = Math.max(0, Math.min(100, ((levelDurationSecs - localTime) / levelDurationSecs) * 100));

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;
    setIsAddingPlayer(true);
    await addPlayer(newPlayerName.trim());
    setNewPlayerName('');
    setIsAddingPlayer(false);
  };

  const handleAddExtra = async () => {
    const amount = parseFloat(extraAmount);
    if (!extraDesc.trim() || !amount || extraSplitAmong.length === 0) return;
    await addExtra(extraDesc.trim(), amount, extraPaidBy, extraSplitAmong);
    setExtraDesc('');
    setExtraAmount('');
    setExtraPaidBy([]);
    setExtraSplitAmong([]);
  };

  const handleFinishRanking = async () => {
    if (!tournament) return;
    const positions = rankingPositions.map((playerId, i) => ({ playerId, position: i + 1 }))
      .filter(p => p.playerId);
    if (positions.length !== tournament.config.prizeCount) return;
    await updateRanking(positions, calculatedPrizes, rankingMode);
  };

  const playerName = (id: string) => tournament?.players.find(p => p.id === id)?.name ?? id;

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl">POKER NIGHT</h1>
          {code && (
            <div className="text-sm text-[var(--text-muted)] mt-1">
              Código: <span className="font-mono text-[var(--accent)]">{code}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm ${isConnected ? 'connected' : 'disconnected'}`}>
            ● {isConnected ? 'Online' : 'Offline'}
          </span>
          {canEdit && (
            <span className="text-xs bg-[var(--accent)] text-black px-2 py-1 rounded">
              HOST
            </span>
          )}
          <button
            onClick={() => {
              logout();
              router.push('/');
            }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Tabs - Two rows: Config/Extras on top, rest on bottom */}
      <div className="mb-6 space-y-2">
        {/* Top row: Config, Extras */}
        <div className="flex gap-2 justify-center">
          {([
            ['config', 'Config'],
            ['extras', 'Extras'],
          ] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
                activeTab === tab ? 'bg-[var(--accent)] text-black font-bold' : 'glass text-[var(--text-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Bottom row: Torneio, Timer, Ranking, Acerto */}
        <div className="flex gap-2 justify-center">
          {([
            ['tournament', 'Torneio'],
            ['timer', 'Timer'],
            ['ranking', 'Ranking'],
            ['acerto', 'Acerto'],
          ] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
                activeTab === tab ? 'bg-[var(--accent)] text-black font-bold' : 'glass text-[var(--text-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="glass p-4">

        {/* ── TORNEIO TAB ── */}
        {activeTab === 'tournament' && (
          <div>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="glass-card text-center">
                <div className="text-xs text-[var(--text-muted)] mb-1">Total Arrecadado</div>
                <div className="text-2xl font-bold text-[var(--accent)]">R$ {totalPot}</div>
              </div>
              <div className="glass-card text-center">
                <div className="text-xs text-[var(--text-muted)] mb-1">Jogadores</div>
                <div className="text-2xl font-bold text-[var(--accent)]">{tournament.players.length}</div>
              </div>
            </div>

            {/* Prize preview */}
            {tournament.players.length > 0 && (
              <div className="flex gap-2 mb-4">
                {prizePreview.map((v, i) => (
                  <div key={i} className="flex-1 glass-card text-center py-2">
                    <div className="text-lg">{POSITIONS[i]}</div>
                    <div className="text-sm font-bold text-[var(--accent)]">R$ {v}</div>
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Nome do jogador"
                  className="input flex-1"
                  maxLength={20}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                />
                <button onClick={handleAddPlayer} disabled={isAddingPlayer || !newPlayerName.trim()} className="btn btn-primary">+</button>
              </div>
            )}

            <div className="space-y-2">
              {tournament.players.map((player) => (
                <div key={player.id} className="glass-card">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-[var(--accent)]">{player.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">R$ {calcPlayerCost(player)}</span>
                      {canEdit && (
                        <button onClick={() => removePlayer(player.id)} className="text-[var(--danger)] text-xl hover:opacity-70">×</button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-[var(--accent)] text-black font-bold">Entrada</span>
                    {player.rebuys > 0 && (
                      <span className="px-2 py-0.5 rounded text-xs bg-orange-500 text-white font-bold">{player.rebuys}x Rebuy</span>
                    )}
                    {player.addon && (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-500 text-white font-bold">Addon</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button onClick={() => setRebuyPlayerId(player.id)} className="btn btn-secondary text-xs py-1">Rebuy</button>
                      <button
                        onClick={() => toggleAddon(player.id)}
                        className={`btn text-xs py-1 ${player.addon ? 'btn-danger' : 'btn-secondary'}`}
                      >
                        {player.addon ? 'Remover Addon' : '+ Addon'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {tournament.players.length === 0 && (
                <p className="text-center text-[var(--text-muted)] py-8">Nenhum jogador ainda</p>
              )}
            </div>
          </div>
        )}

        {/* ── TIMER TAB ── */}
        {activeTab === 'timer' && (
          <div>
            <div className="text-center mb-4 glass-card">
              <div className="text-sm text-[var(--text-muted)] mb-1 tracking-widest">
                NÍVEL {tournament.timer.currentLevel} / 27
              </div>
              {currentBlinds && (
                <div className="flex justify-center gap-8 mb-2">
                  <span className="text-[var(--text-muted)] text-xl font-bold">SB: {currentBlinds.smallBlind}</span>
                  <span className="text-[var(--accent)] text-xl font-bold neon-text">BB: {currentBlinds.bigBlind}</span>
                </div>
              )}
              <div className="text-7xl font-bold text-white neon-text my-3 tracking-widest">
                {formatTime(localTime)}
              </div>
              {/* Progress bar */}
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--accent-dark), var(--accent))' }}
                />
              </div>
              {nextBlinds && (
                <div className="text-xs text-[var(--text-muted)]">
                  Próximo: <span className="text-[var(--accent)]">{nextBlinds.smallBlind}/{nextBlinds.bigBlind}</span>
                  {' em '}<span className="text-[var(--accent)]">{formatTime(localTime)}</span>
                </div>
              )}
              <div className="text-xs text-[var(--text-muted)] mt-1">
                Total: {formatTimeLong(tournament.timer.totalElapsed)}
              </div>
            </div>

            {canEdit && (
              <div className="flex gap-2 justify-center mb-6">
                {!tournament.timer.isRunning ? (
                  <button onClick={() => timerAction('start')} className="btn btn-primary flex-1">▶ Iniciar</button>
                ) : (
                  <button onClick={() => timerAction('pause')} className="btn btn-secondary flex-1">⏸ Pausar</button>
                )}
                <button onClick={() => {
                  const nextLevel = tournament.timer.currentLevel + 1;
                  timerAction('skip');
                  playBeep();
                  const blinds = BLINDS_LEVELS[nextLevel - 1];
                  if (blinds) {
                    showNotification(`Poker Night - Nível ${nextLevel}`, `Blind: ${blinds.smallBlind}/${blinds.bigBlind}`);
                  }
                }} disabled={tournament.timer.currentLevel >= 27} className="btn btn-secondary flex-1">→ Próx. Nível</button>
                <button onClick={() => { if (confirm('Tem certeza que deseja reiniciar o timer? Isso voltará para o Nível 1.')) timerAction('reset'); }} className="btn btn-danger">↺</button>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="glass-card text-center">
                <div className="text-xs text-[var(--text-muted)] mb-1">Tempo Total</div>
                <div className="font-bold text-[var(--accent)]">{formatTimeLong(tournament.timer.totalElapsed)}</div>
              </div>
              <div className="glass-card text-center">
                <div className="text-xs text-[var(--text-muted)] mb-1">Nível Atual</div>
                <div className="font-bold text-[var(--accent)]">{tournament.timer.currentLevel} / 27</div>
              </div>
            </div>

            {/* Blinds table */}
            <h3 className="text-sm text-[var(--text-muted)] mb-2">Tabela de Blinds</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="text-left py-2">N</th>
                    <th className="text-right py-2">SB</th>
                    <th className="text-right py-2">BB</th>
                  </tr>
                </thead>
                <tbody>
                  {BLINDS_LEVELS.map((level) => (
                    <tr key={level.level} className={level.level === tournament.timer.currentLevel ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}>
                      <td className="py-1">{level.level}</td>
                      <td className="text-right">{level.smallBlind}</td>
                      <td className="text-right">{level.bigBlind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RANKING TAB ── */}
        {activeTab === 'ranking' && (
          <div>
            <h2 className="mb-4">Ranking Final</h2>

            {tournament.state === 'finished' ? (
              <div className="space-y-2">
                {tournament.ranking.places.map((place) => {
                  const player = tournament.players.find(p => p.id === place.playerId);
                  return (
                    <div key={place.position} className="glass-card flex justify-between items-center">
                      <div>
                        <span className="text-[var(--accent)] font-bold">{POSITIONS[place.position - 1]}</span>
                        <span className="ml-2">{player?.name}</span>
                      </div>
                      <span className="text-[var(--accent)] font-bold">R$ {place.prize}</span>
                    </div>
                  );
                })}
              </div>
            ) : canEdit ? (
              <div className="space-y-4">
                <div className="text-sm text-[var(--text-muted)] mb-2">
                  Total do prêmio: <span className="text-[var(--accent)] font-bold">R$ {totalPot}</span>
                </div>

                {/* Position selects */}
                {rankingPositions.map((val, i) => (
                  <div key={i}>
                    <label className="block text-sm text-[var(--text-muted)] mb-1">{POSITIONS[i]} Lugar</label>
                    <select
                      value={val}
                      onChange={(e) => {
                        const next = [...rankingPositions];
                        next[i] = e.target.value;
                        setRankingPositions(next);
                      }}
                      className="input"
                    >
                      <option value="">-- Selecione --</option>
                      {tournament.players.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ))}

                {/* Agreement mode */}
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-1">Acordo</label>
                  <select value={rankingMode} onChange={(e) => setRankingMode(e.target.value as typeof rankingMode)} className="input">
                    <option value="none">Sem acordo (SNG %)</option>
                    <option value="icm">Acordo ICM</option>
                    <option value="manual">Acordo Manual</option>
                  </select>
                </div>

                {rankingMode === 'icm' && (
                  <div className="space-y-2">
                    <div className="text-xs text-[var(--text-muted)]">Fichas de cada jogador do acordo:</div>
                    {rankingPositions.map((pid, i) => (
                      <div key={i}>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">{playerName(pid) || `${i + 1}º`}</label>
                        <input type="number" placeholder="Fichas" className="input" value={rankingChips[i] || ''} onChange={(e) => { const n = [...rankingChips]; n[i] = Number(e.target.value); setRankingChips(n); }} />
                      </div>
                    ))}
                  </div>
                )}

                {rankingMode === 'manual' && (
                  <div className="space-y-2">
                    <div className="text-xs text-[var(--text-muted)]">Valor para cada jogador:</div>
                    {rankingPositions.map((pid, i) => (
                      <div key={i}>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">{playerName(pid) || `${i + 1}º`} (R$)</label>
                        <input type="number" placeholder="0" className="input" value={rankingManual[i] || ''} onChange={(e) => { const n = [...rankingManual]; n[i] = Number(e.target.value); setRankingManual(n); }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Calculated prizes preview */}
                <div className="glass-card">
                  <div className="text-xs text-[var(--text-muted)] mb-2">Premiação calculada:</div>
                  {calculatedPrizes.map((v, i) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b border-white/10 last:border-0">
                      <span>{POSITIONS[i]} {playerName(rankingPositions[i])}</span>
                      <span className="text-[var(--accent)] font-bold">R$ {v}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleFinishRanking}
                  disabled={rankingPositions.some(p => !p)}
                  className="btn btn-primary w-full"
                >
                  Finalizar Torneio
                </button>
              </div>
            ) : (
              <p className="text-center text-[var(--text-muted)] py-8">
                O ranking será disponível após o término do torneio
              </p>
            )}
          </div>
        )}

        {/* ── CONFIG TAB ── */}
        {activeTab === 'config' && (
          <div>
            <h2 className="mb-4">Configurações</h2>
            {canEdit ? (
              <div className="space-y-4">
                {[
                  ['Buy-in (R$)', 'buyIn', tournament.config.buyIn],
                  ['Rebuy Simples (R$)', 'rebuySingle', tournament.config.rebuySingle],
                  ['Rebuy Duplo (R$)', 'rebuyDouble', tournament.config.rebuyDouble],
                  ['Addon (R$)', 'addon', tournament.config.addon],
                  ['Minutos por Nível', 'levelDuration', tournament.config.levelDuration],
                  ['Arredondamento (R$)', 'roundingStep', tournament.config.roundingStep],
                ].map(([label, key, val]) => (
                  <div key={key as string}>
                    <label className="block text-sm text-[var(--text-muted)] mb-2">{label as string}</label>
                    <input type="number" min={1} defaultValue={val as number} onBlur={(e) => updateConfig({ [key as string]: Number(e.target.value) })} className="input" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Premiados (3–5)</label>
                  <select value={tournament.config.prizeCount} onChange={(e) => updateConfig({ prizeCount: Number(e.target.value) })} className="input">
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  ['Buy-in', `R$ ${tournament.config.buyIn}`],
                  ['Rebuy Simples', `R$ ${tournament.config.rebuySingle}`],
                  ['Rebuy Duplo', `R$ ${tournament.config.rebuyDouble}`],
                  ['Addon', `R$ ${tournament.config.addon}`],
                  ['Premiados', String(tournament.config.prizeCount)],
                  ['Minutos/Nível', String(tournament.config.levelDuration)],
                  ['Arredondamento', `R$ ${tournament.config.roundingStep}`],
                ].map(([l, v]) => (
                  <div key={l} className="glass-card flex justify-between">
                    <span className="text-[var(--text-muted)]">{l}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EXTRAS TAB ── */}
        {activeTab === 'extras' && (
          <div>
            <h2 className="mb-4">Janta & Bebidas</h2>

            <div className="glass-card text-center mb-4">
              <div className="text-xs text-[var(--text-muted)]">Total Extras</div>
              <div className="text-2xl font-bold text-[var(--accent)]">
                R$ {tournament.extras.reduce((s, e) => s + e.amount, 0).toFixed(2)}
              </div>
            </div>

            {canEdit && (
              <div className="space-y-3 mb-6">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-1">Descrição</label>
                  <input type="text" value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} placeholder="Ex: Pizzas, Cervejas..." className="input" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-1">Valor (R$)</label>
                  <input type="number" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="0.00" step="0.01" className="input" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-1">Quem pagou:</label>
                  <div className="flex flex-wrap gap-2">
                    {tournament.players.map(p => (
                      <label key={p.id} className={`px-3 py-1 rounded cursor-pointer text-sm ${extraPaidBy.includes(p.id) ? 'bg-[var(--accent)] text-black font-bold' : 'glass'}`}>
                        <input type="checkbox" className="hidden" checked={extraPaidBy.includes(p.id)} onChange={(e) => setExtraPaidBy(e.target.checked ? [...extraPaidBy, p.id] : extraPaidBy.filter(x => x !== p.id))} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-1">Dividir entre:</label>
                  <div className="flex flex-wrap gap-2">
                    {tournament.players.map(p => (
                      <label key={p.id} className={`px-3 py-1 rounded cursor-pointer text-sm ${extraSplitAmong.includes(p.id) ? 'bg-[var(--accent)] text-black font-bold' : 'glass'}`}>
                        <input type="checkbox" className="hidden" checked={extraSplitAmong.includes(p.id)} onChange={(e) => setExtraSplitAmong(e.target.checked ? [...extraSplitAmong, p.id] : extraSplitAmong.filter(x => x !== p.id))} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
                <button onClick={handleAddExtra} disabled={!extraDesc.trim() || !extraAmount || extraSplitAmong.length === 0} className="btn btn-primary w-full">
                  Adicionar Item
                </button>
              </div>
            )}

            <h3 className="text-sm text-[var(--text-muted)] mb-2">Itens</h3>
            <div className="space-y-2">
              {tournament.extras.length === 0 && (
                <p className="text-center text-[var(--text-muted)] py-8">Nenhum item adicionado</p>
              )}
              {tournament.extras.map((extra) => (
                <div key={extra.id} className="glass-card">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium">{extra.description}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--accent)] font-bold">R$ {extra.amount.toFixed(2)}</span>
                      {canEdit && (
                        <button onClick={() => removeExtra(extra.id)} className="text-[var(--danger)] text-lg hover:opacity-70">×</button>
                      )}
                    </div>
                  </div>
                  {extra.paidBy.length > 0 && (
                    <div className="text-xs text-green-400">Pagou: {extra.paidBy.map(id => playerName(id)).join(', ')}</div>
                  )}
                  <div className="text-xs text-[var(--text-muted)]">
                    Divide: {extra.splitAmong.map(id => playerName(id)).join(', ')} (R$ {(extra.amount / extra.splitAmong.length).toFixed(2)} cada)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACERTO TAB ── */}
        {activeTab === 'acerto' && (
          <div>
            <h2 className="mb-4">Acerto de Contas</h2>

            {!settlementData || tournament.ranking.places.length === 0 ? (
              <p className="text-center text-[var(--text-muted)] py-8">
                Finalize o torneio na aba Ranking para calcular o acerto
              </p>
            ) : (
              <>
                <h3 className="text-sm text-[var(--text-muted)] mb-2">Resumo por Jogador</h3>
                <div className="space-y-2 mb-6">
                  {tournament.players.map(p => {
                    const r = settlementData.resumo[p.id];
                    const saldo = settlementData.saldos[p.id];
                    if (!r) return null;
                    return (
                      <div key={p.id} className={`glass-card border-l-4 ${saldo >= 0 ? 'border-green-500' : 'border-red-500'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold">{p.name}</span>
                          <span className={`text-lg font-bold ${saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {saldo >= 0 ? '+' : ''}R$ {saldo.toFixed(2)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs text-[var(--text-muted)]">
                          <span>Torneio: R$ {r.gastoTorneio.toFixed(2)}</span>
                          <span className="text-[var(--accent)]">Prêmio: R$ {r.recebeu.toFixed(2)}</span>
                          <span className="text-red-400">Extras a pagar: R$ {r.extrasAPagar.toFixed(2)}</span>
                          <span className="text-green-400">Extras pagos: R$ {r.extrasPagos.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <h3 className="text-sm text-[var(--text-muted)] mb-2">Transações</h3>
                {settlementData.transacoes.length === 0 ? (
                  <p className="text-center text-green-400 py-4">Todos acertados!</p>
                ) : (
                  <div className="space-y-2">
                    {settlementData.transacoes.map((t, i) => (
                      <div key={i} className="glass-card border-l-4 border-yellow-500 flex justify-between items-center">
                        <span className="text-sm">{playerName(t.de)} → {playerName(t.para)}</span>
                        <span className="text-[var(--accent)] font-bold">R$ {t.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rebuy Modal */}
      {rebuyPlayerId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass p-6 rounded-xl w-full max-w-sm">
            <h2 className="mb-4">Rebuy — {playerName(rebuyPlayerId)}</h2>
            <div className="space-y-3">
              <button
                onClick={() => { rebuyPlayer(rebuyPlayerId, 'single'); setRebuyPlayerId(null); }}
                className="btn btn-secondary w-full text-left"
              >
                <span className="font-bold text-[var(--accent)]">Simples</span>
                <span className="text-[var(--text-muted)] ml-2">(R$ {tournament.config.rebuySingle})</span>
              </button>
              <button
                onClick={() => { rebuyPlayer(rebuyPlayerId, 'double'); setRebuyPlayerId(null); }}
                className="btn btn-secondary w-full text-left"
              >
                <span className="font-bold text-[var(--accent)]">Duplo</span>
                <span className="text-[var(--text-muted)] ml-2">(R$ {tournament.config.rebuyDouble})</span>
              </button>
              <button onClick={() => setRebuyPlayerId(null)} className="btn btn-danger w-full">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}