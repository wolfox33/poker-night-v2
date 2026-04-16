'use client';

import { useEffect, useState } from 'react';
import { useTournament } from '@/hooks/useTournament';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Tournament, BLINDS_LEVELS } from '@/types/tournament';

type Tab = 'tournament' | 'timer' | 'ranking' | 'config';

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
    updateConfig,
    updateRanking,
    logout,
  } = useTournament();

  const [activeTab, setActiveTab] = useState<Tab>('tournament');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  useEffect(() => {
    // If no tournament loaded and not loading, redirect to home
    if (!isLoading && !tournament && !error) {
      router.push('/');
    }
  }, [isLoading, tournament, error, router]);

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

  const currentBlinds = BLINDS_LEVELS[tournament.timer.currentLevel - 1];

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;
    setIsAddingPlayer(true);
    await addPlayer(newPlayerName.trim());
    setNewPlayerName('');
    setIsAddingPlayer(false);
  };

  const calculateTotalPot = () => {
    return tournament.players.reduce((sum, p) => {
      const buyins = p.buyins * tournament.config.buyIn;
      const rebuys = p.rebuys > 1 
        ? (p.rebuys - 1) * tournament.config.rebuyDouble 
        : p.rebuys * tournament.config.rebuySingle;
      const addon = p.addon ? tournament.config.addon : 0;
      return sum + buyins + rebuys + addon;
    }, 0);
  };

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

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(['tournament', 'timer', 'ranking', 'config'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
              activeTab === tab
                ? 'bg-[var(--accent)] text-black'
                : 'glass text-[var(--text-muted)]'
            }`}
          >
            {tab === 'tournament' ? 'Jogadores' : 
             tab === 'timer' ? 'Timer' : 
             tab === 'ranking' ? 'Ranking' : 'Config'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="glass p-4">
        {activeTab === 'tournament' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2>Jogadores ({tournament.players.length})</h2>
              <div className="text-lg font-bold text-[var(--accent)]">
                Total: R$ {calculateTotalPot()}
              </div>
            </div>

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
                <button
                  onClick={handleAddPlayer}
                  disabled={isAddingPlayer || !newPlayerName.trim()}
                  className="btn btn-primary"
                >
                  +
                </button>
              </div>
            )}

            <div className="space-y-2">
              {tournament.players.map((player) => {
                const buyinsText = player.buyins === 1 ? '1 buy' : `${player.buyins} buys`;
                const rebuysText = player.rebuys > 0 ? (player.rebuys === 1 ? ', 1 rebuy' : `, ${player.rebuys} rebuys`) : '';
                const addonText = player.addon ? ', addon' : '';
                
                return (
                <div key={player.id} className="glass-card flex justify-between items-center">
                  <div>
                    <span className="font-medium">{player.name}</span>
                    <span className="text-[var(--text-muted)] text-sm ml-2">
                      ({buyinsText}{rebuysText}{addonText})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--accent)] font-bold">
                      R$ {player.buyins * tournament.config.buyIn + 
                         (player.rebuys > 1 ? (player.rebuys - 1) * tournament.config.rebuyDouble : player.rebuys * tournament.config.rebuySingle) +
                         (player.addon ? tournament.config.addon : 0)}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => removePlayer(player.id)}
                        className="text-[var(--danger)] text-xl hover:opacity-70"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                );
              })}

              {tournament.players.length === 0 && (
                <p className="text-center text-[var(--text-muted)] py-8">
                  Nenhum jogador ainda
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'timer' && (
          <div>
            <div className="text-center mb-6">
              <div className="text-[var(--text-muted)] text-sm mb-2">
                Nível {tournament.timer.currentLevel} / 27
              </div>
              <div className="text-6xl font-bold text-[var(--accent)] neon-text mb-2">
                {formatTime(tournament.timer.timeRemaining)}
              </div>
              {currentBlinds && (
                <div className="text-xl">
                  <span className="text-[var(--accent)]">{currentBlinds.smallBlind}</span>
                  {' / '}
                  <span className="text-[var(--accent)]">{currentBlinds.bigBlind}</span>
                </div>
              )}
              <div className="text-sm text-[var(--text-muted)] mt-2">
                Total: {formatTime(tournament.timer.totalElapsed)}
              </div>
            </div>

            {canEdit && (
              <div className="flex gap-2 justify-center">
                {!tournament.timer.isRunning ? (
                  <button
                    onClick={() => timerAction('start')}
                    className="btn btn-primary"
                  >
                    ▶ Iniciar
                  </button>
                ) : (
                  <button
                    onClick={() => timerAction('pause')}
                    className="btn btn-secondary"
                  >
                    ⏸ Pausar
                  </button>
                )}
                <button
                  onClick={() => timerAction('skip')}
                  disabled={tournament.timer.currentLevel >= 27}
                  className="btn btn-secondary"
                >
                  → Pular
                </button>
                <button
                  onClick={() => timerAction('reset')}
                  className="btn btn-danger"
                >
                  ↺
                </button>
              </div>
            )}

            {/* Blinds Levels */}
            <div className="mt-8">
              <h3 className="text-sm text-[var(--text-muted)] mb-2">Blinds</h3>
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
                      <tr
                        key={level.level}
                        className={level.level === tournament.timer.currentLevel ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}
                      >
                        <td className="py-1">{level.level}</td>
                        <td className="text-right">{level.smallBlind}</td>
                        <td className="text-right">{level.bigBlind}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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
                        <span className="text-[var(--accent)] font-bold">#{place.position}</span>
                        <span className="ml-2">{player?.name}</span>
                      </div>
                      <span className="text-[var(--accent)] font-bold">R$ {place.prize}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-[var(--text-muted)] py-8">
                O ranking será disponível após o término do torneio
              </p>
            )}

            {canEdit && tournament.state === 'running' && (
              <button
                onClick={() => {
                  const positions = tournament.players.map((p, i) => ({
                    playerId: p.id,
                    position: i + 1,
                  }));
                  updateRanking(positions);
                }}
                className="btn btn-primary w-full mt-4"
              >
                Finalizar Torneio
              </button>
            )}
          </div>
        )}

        {activeTab === 'config' && (
          <div>
            <h2 className="mb-4">Configurações</h2>

            {canEdit ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Buy-in (R$)</label>
                  <input
                    type="number"
                    value={tournament.config.buyIn}
                    onChange={(e) => updateConfig({ buyIn: Number(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Rebuy Simples (R$)</label>
                  <input
                    type="number"
                    value={tournament.config.rebuySingle}
                    onChange={(e) => updateConfig({ rebuySingle: Number(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Rebuy Duplo (R$)</label>
                  <input
                    type="number"
                    value={tournament.config.rebuyDouble}
                    onChange={(e) => updateConfig({ rebuyDouble: Number(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Addon (R$)</label>
                  <input
                    type="number"
                    value={tournament.config.addon}
                    onChange={(e) => updateConfig({ addon: Number(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Premiados</label>
                  <input
                    type="number"
                    min={3}
                    max={5}
                    value={tournament.config.prizeCount}
                    onChange={(e) => updateConfig({ prizeCount: Number(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Minutos por Nível</label>
                  <input
                    type="number"
                    value={tournament.config.levelDuration}
                    onChange={(e) => updateConfig({ levelDuration: Number(e.target.value) })}
                    className="input"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="glass-card flex justify-between">
                  <span className="text-[var(--text-muted)]">Buy-in</span>
                  <span>R$ {tournament.config.buyIn}</span>
                </div>
                <div className="glass-card flex justify-between">
                  <span className="text-[var(--text-muted)]">Rebuy Simples</span>
                  <span>R$ {tournament.config.rebuySingle}</span>
                </div>
                <div className="glass-card flex justify-between">
                  <span className="text-[var(--text-muted)]">Rebuy Duplo</span>
                  <span>R$ {tournament.config.rebuyDouble}</span>
                </div>
                <div className="glass-card flex justify-between">
                  <span className="text-[var(--text-muted)]">Addon</span>
                  <span>R$ {tournament.config.addon}</span>
                </div>
                <div className="glass-card flex justify-between">
                  <span className="text-[var(--text-muted)]">Premiados</span>
                  <span>{tournament.config.prizeCount}</span>
                </div>
                <div className="glass-card flex justify-between">
                  <span className="text-[var(--text-muted)]">Minutos/Nível</span>
                  <span>{tournament.config.levelDuration}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}