'use client';

import { useState } from 'react';
import { useTournament } from '@/hooks/useTournament';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [code, setCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const { createTournament, joinTournament, isLoading, error } = useTournament();
  const router = useRouter();

  const handleCreate = async () => {
    try {
      const { id, code } = await createTournament();
      router.push(`/tournament/${id}?code=${code}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoin = async () => {
    if (!code || !playerName) {
      setJoinError('Preencha o código e seu nome');
      return;
    }

    setIsJoining(true);
    setJoinError('');

    try {
      const id = await joinTournament(code.toUpperCase(), playerName);
      router.push(`/tournament/${id}?code=${code.toUpperCase()}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Erro ao entrar no torneio');
    } finally {
      setIsJoining(false);
    }
  };

  if (mode === 'create' || mode === 'join') {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center">
        <div className="glass p-8 w-full max-w-md">
          <button
            onClick={() => setMode('choose')}
            className="text-[var(--text-muted)] hover:text-[var(--text)] mb-6 text-sm"
          >
            ← Voltar
          </button>

          {mode === 'create' ? (
            <div className="text-center">
              <h1 className="mb-6">Criar Torneio</h1>
              <p className="text-[var(--text-muted)] mb-8">
                Crie um novo torneo e compartilhe o código com os jogadores
              </p>
              <button
                onClick={handleCreate}
                disabled={isLoading}
                className="btn btn-primary w-full"
              >
                {isLoading ? 'Criando...' : 'Criar Torneio'}
              </button>
              {error && <p className="text-[var(--danger)] mt-4 text-sm">{error}</p>}
            </div>
          ) : (
            <div>
              <h1 className="mb-6 text-center">Entrar no Torneio</h1>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">
                    Código do Torneio
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="input text-center text-2xl tracking-widest font-bold"
                    maxLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">
                    Seu Nome
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Seu nome"
                    className="input"
                    maxLength={20}
                  />
                </div>

                {joinError && (
                  <p className="text-[var(--danger)] text-sm">{joinError}</p>
                )}

                <button
                  onClick={handleJoin}
                  disabled={isJoining || !code || !playerName}
                  className="btn btn-primary w-full"
                >
                  {isJoining ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 flex flex-col items-center justify-center">
      <div className="text-center mb-12">
        <h1 className="neon-text mb-2">POKER NIGHT</h1>
        <p className="text-[var(--text-muted)]">Gerenciador de Torneio</p>
      </div>

      <div className="glass p-8 w-full max-w-sm">
        <div className="space-y-4">
          <button
            onClick={() => setMode('create')}
            className="btn btn-primary w-full"
          >
            Criar Torneio
          </button>

          <button
            onClick={() => setMode('join')}
            className="btn btn-secondary w-full"
          >
            Entrar em Torneio
          </button>
        </div>
      </div>
    </div>
  );
}