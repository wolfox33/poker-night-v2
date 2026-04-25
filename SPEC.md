# Poker Night v2 — Especificação do Produto

## Visão Geral

App web PWA para gerenciamento de torneios de poker presenciais. Um jogador cria o torneio (host) e compartilha um código de 6 caracteres. Os outros jogadores entram via código e acompanham o timer em tempo real. O servidor persiste o estado base do timer e os clientes calculam a contagem localmente a partir de `startedAt`, com sincronização de estado via SSE.

---

## Fluxos Principais

### 1. Criar Torneio (Host)

1. Host abre a landing page e clica em "Criar Torneio".
2. Sistema gera `id` (ex: `poker-abcdefgh`), `code` (ex: `AB23XZ`) e `hostToken`.
3. Host é redirecionado para `/tournament/[id]?code=AB23XZ` com papel `host`.
4. Host compartilha o código com os jogadores.

### 2. Entrar no Torneio (Player)

1. Jogador abre a landing page, digita o código e seu nome.
2. Sistema valida código, verifica se nome já está em uso, cria `Player` com `playerToken`.
3. Jogador é redirecionado para `/tournament/[id]` com papel `player`.

### 3. Sessão Persistente (localStorage)

- Tokens e `tournamentId` são salvos em `localStorage`.
- Ao reabrir o app, o hook `useTournament` recupera a sessão automaticamente via `GET /state`.
- Logout limpa o `localStorage` e encerra a conexão SSE.

### 4. Controle do Timer (Host)

- Host pode: **start**, **pause**, **reset**, **skip** (próximo nível).
- Timer é client-authoritative: o servidor persiste `startedAt`, `timeRemaining`, `totalElapsed`, `currentLevel` e `isRunning`.
- Clientes interpolam a contagem localmente; não há `setInterval` server-side por torneio.
- SSE envia estado inicial e broadcasts de estado; polling fallback consulta `/state` somente quando SSE não está conectado.
- Ao pular nível, `currentLevel` incrementa e `timeRemaining` reinicia.
- Ao chegar a zero, um cliente conectado dispara a ação interna `advance` para avançar o nível no servidor.
- Ao atingir o nível 27 (último), o botão "Pular" é desabilitado.

### 5. Jogadores (Host)

- Host adiciona jogadores pelo nome (via dashboard ou pelo próprio jogador via join).
- Host pode remover jogadores.
- Nomes são únicos (case-insensitive) dentro do torneio.

### 6. Configurações (Host)

- Host pode alterar config durante o torneio.
- Campos editáveis: `buyIn`, `rebuySingle`, `rebuyDouble`, `addon`, `prizeCount` (3–5), `levelDuration` (minutos por nível).

### 7. Encerrar Torneio / Ranking (Host)

- Host clica em "Finalizar Torneio" na aba Ranking.
- Sistema calcula o pot total e distribui prêmios por ICM simplificado.
- Estado passa para `finished`.
- Jogadores visualizam o ranking final com prêmios.

---

## Modelo de Dados

### `Tournament`

```typescript
{
  id: string;                  // "poker-{8 chars aleatórios}"
  code: string;                // 6 chars uppercase (sem 0, O, I, 1)
  hostToken: string;           // 8 chars aleatórios — autenticação do host
  createdAt: number;           // Unix timestamp (ms)
  state: 'setup' | 'running' | 'finished';
  config: TournamentConfig;
  players: Player[];
  timer: TimerState;
  ranking: RankingState;
  extras: ExtraExpense[];      // Reservado para uso futuro
}
```

### `TournamentConfig` (defaults)

| Campo | Tipo | Default | Restrições |
|---|---|---|---|
| `buyIn` | number | 100 | — |
| `rebuySingle` | number | 100 | — |
| `rebuyDouble` | number | 200 | — |
| `addon` | number | 100 | — |
| `prizeCount` | number | 3 | 3–5 |
| `levelDuration` | number | 12 | minutos por nível |

### `Player`

```typescript
{
  id: string;       // playerToken (16 chars) — também é o token de auth
  name: string;     // max 20 chars, único no torneio
  buyins: number;   // padrão 1 ao adicionar via /players; 0 ao entrar via /join
  rebuys: number;
  addon: boolean;
  isHost: boolean;
}
```

> **Nota**: jogadores que entram via `/join` começam com `buyins: 0`. Jogadores adicionados pelo host via `/players` começam com `buyins: 1`.

### `TimerState`

```typescript
{
  isRunning: boolean;
  currentLevel: number;      // 1–27
  timeRemaining: number;     // segundos restantes no nível atual
  totalElapsed: number;      // segundos totais decorridos
  startedAt: number | null;  // timestamp de quando foi iniciado/retomado
}
```

### `RankingState`

```typescript
{
  places: { position: number; playerId: string; prize: number }[];
  agreement: 'none' | 'icm' | 'manual';
}
```

### Redis Keys

| Key | Valor | TTL |
|---|---|---|
| `tournament:{id}` | JSON serializado do `Tournament` | 24h |
| `code:{code}` | `{id}` (string) | 24h |

---

## API Contracts

### `POST /api/tournament/create`

**Auth**: nenhuma.

**Request body** (opcional):
```json
{ "config": { "buyIn": 50, "levelDuration": 15 } }
```

**Response 200**:
```json
{
  "id": "poker-abcdefgh",
  "code": "AB23XZ",
  "hostToken": "xyzxyzxy",
  "tournament": { ...Tournament }
}
```

**Errors**: `500` em falha de persistência.

---

### `POST /api/tournament/join`

**Auth**: nenhuma.

**Request body**:
```json
{ "code": "AB23XZ", "playerName": "João" }
```

**Response 200**:
```json
{
  "tournament": { ...Tournament },
  "playerToken": "abcdefghijklmnop",
  "role": "player"
}
```

**Errors**:
- `400` — code ou playerName ausentes
- `400` — nome > 20 chars
- `400` — nome já em uso
- `404` — código inválido ou torneio não encontrado

---

### `GET /api/tournament/[id]/state`

**Auth**: `Authorization: Bearer {token}` (opcional — sem token, role = `none`).

**Response 200**:
```json
{
  "tournament": { ...Tournament },
  "role": "host" | "player" | "none",
  "canEdit": true | false
}
```

**Errors**: `404` torneio não encontrado, `500` erro interno.

---

### `POST /api/tournament/[id]/timer`

**Auth**: `Authorization: Bearer {hostToken}` — host only.

**Request body**:
```json
{ "action": "start" | "pause" | "reset" | "skip" | "advance" }
```

**Comportamento**:
- `start` — inicia ou retoma; altera `state` de `setup` para `running` na primeira vez.
- `pause` — para o timer; acumula `totalElapsed`.
- `reset` — zera timer para nível 1; altera `state` para `setup`.
- `skip` — avança para o próximo nível (máximo nível 27).
- `advance` — avança automaticamente para o próximo nível quando um cliente detecta contagem zerada.

**Response 200**:
```json
{ "timer": { ...TimerState }, "time": 1713261600000 }
```

**Errors**: `403` não autorizado, `404` não encontrado.

---

### `GET /api/tournament/[id]/stream`

**Auth**: `?token={hostToken|playerToken}` — query param.

**Protocolo**: Server-Sent Events (`text/event-stream`).

**Eventos**:
```
data: {"type":"state","data":{...Tournament}}   ← enviado ao conectar

data: {"type":"timer","data":{...TimerState}}   ← reservado para broadcasts de timer quando necessário
```

**Errors**: `401` sem token, `403` token inválido, `404` torneio não encontrado.

> **Decisão atual**: o loop server-side de timer foi removido. O modelo client-authoritative evita depender de `setTimeout`/`setInterval` em memória de processo, que é frágil em ambientes serverless como Netlify Functions.

---

### `POST /api/tournament/[id]/players`

**Auth**: `Authorization: Bearer {hostToken}` — host only.

**Request body (add)**:
```json
{ "action": "add", "name": "Maria", "buyin": 1 }
```

**Request body (remove)**:
```json
{ "action": "remove", "playerId": "abc123" }
```

**Response 200**:
```json
{ "players": [ ...Player[] ] }
```

**Errors**: `400` nome em uso ou playerId ausente, `403` não autorizado, `404` não encontrado.

---

### `POST /api/tournament/[id]/config`

**Auth**: `Authorization: Bearer {hostToken}` — host only.

**Request body**: qualquer subconjunto de `TournamentConfig`.

**Validação**: `prizeCount` deve ser entre 3 e 5.

**Response 200**:
```json
{ "config": { ...TournamentConfig } }
```

---

### `POST /api/tournament/[id]/ranking`

**Auth**: `Authorization: Bearer {hostToken}` — host only.

**Request body**:
```json
{ "positions": [{ "playerId": "abc", "position": 1 }, ...] }
```

**Comportamento**:
1. Calcula pot total somando buyins + rebuys + addons de todos os players.
2. Distribui prêmios por ICM simplificado (percentuais fixos: 50%, 30%, 15%, 4%, 1%).
3. Altera `tournament.state` para `finished`.

**Response 200**:
```json
{ "ranking": { ...RankingState }, "totalPot": 1500 }
```

---

## Níveis de Blinds (27 Níveis)

| Nível | SB | BB |
|---|---|---|
| 1 | 100 | 200 |
| 2 | 150 | 300 |
| 3 | 200 | 400 |
| 4 | 300 | 600 |
| 5 | 400 | 800 |
| 6 | 500 | 1.000 |
| 7 | 600 | 1.200 |
| 8 | 800 | 1.600 |
| 9 | 1.000 | 2.000 |
| 10 | 1.200 | 2.400 |
| 11 | 1.500 | 3.000 |
| 12 | 2.000 | 4.000 |
| 13 | 2.500 | 5.000 |
| 14 | 3.000 | 6.000 |
| 15 | 4.000 | 8.000 |
| 16 | 5.000 | 10.000 |
| 17 | 6.000 | 12.000 |
| 18 | 8.000 | 16.000 |
| 19 | 10.000 | 20.000 |
| 20 | 12.000 | 24.000 |
| 21 | 15.000 | 30.000 |
| 22 | 20.000 | 40.000 |
| 23 | 25.000 | 50.000 |
| 24 | 30.000 | 60.000 |
| 25 | 40.000 | 80.000 |
| 26 | 50.000 | 100.000 |
| 27 | 60.000 | 120.000 |

---

## Autenticação e Autorização

| Ação | Host | Player | Anônimo |
|---|---|---|---|
| Criar torneio | ✅ | ✅ | ✅ |
| Entrar no torneio | ✅ | ✅ | ✅ |
| Ver estado | ✅ | ✅ | ✅ (role=none) |
| Conectar ao stream | ✅ | ✅ | ❌ |
| Controlar timer | ✅ | ❌ | ❌ |
| Adicionar/remover player | ✅ | ❌ | ❌ |
| Atualizar config | ✅ | ❌ | ❌ |
| Finalizar torneio | ✅ | ❌ | ❌ |

**Mecanismo**: `hostToken` é gerado no create e armazenado no objeto `Tournament`. `playerToken` é gerado no join e equivale ao `player.id`. Ambos são passados via `Authorization: Bearer` (ou `?token=` no stream SSE).

---

## Limitações e Problemas Conhecidos

| # | Descrição | Impacto |
|---|---|---|
| 1 | Timer depende de cliente conectado para disparar `advance` ao zerar | Se nenhum cliente estiver ativo no exato momento, avanço pode atrasar até nova interação/sync |
| 2 | Sem rate limiting nas APIs | Host/player pode fazer spam de requisições |
| 3 | Sem validação de `buyins`/`rebuys`/`addon` via API | Dados de players só atualizados via UI |
| 4 | `removePlayer` não faz atualização local otimista | UI demora até próximo evento SSE/polling |
| 5 | `joinTournament` no hook não faz `setTournament` imediato | Flash de null state ao entrar |
| 6 | `tournament.timer` undefined causa loading infinito sem escape | Torneio corrompido prende o usuário |

---

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `UPSTASH_REDIS_REST_URL` | URL REST do Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token de acesso ao Upstash Redis |

Sem essas variáveis, o sistema usa um cliente em memória (perde dados ao reiniciar o servidor).
