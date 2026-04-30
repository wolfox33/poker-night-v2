# Poker Night v2 — Especificação do Produto

## Visão Geral

App web PWA para gerenciamento de torneios de poker presenciais. Um jogador cria o torneio (host) e compartilha um código de 3 caracteres. Os outros jogadores entram via código e acompanham o timer em tempo real. O servidor persiste o estado base do timer e os clientes calculam a contagem localmente a partir de `startedAt`, com sincronização de estado via SSE.

---

## Fluxos Principais

### 1. Criar Torneio (Host)

1. Host abre a landing page e clica em "Criar Torneio".
2. Sistema gera `id` (ex: `poker-abcdefgh`), `code` (ex: `AB2`) e `hostToken`.
3. Host é redirecionado para `/tournament/[id]?code=AB2` com papel `host`.
4. Host compartilha o código com os jogadores.

### 2. Visualizar Torneio

1. Espectador abre a landing page e digita o código.
2. Sistema valida o código sem criar jogador.
3. Espectador é redirecionado para `/tournament/[id]` com papel `none`.
4. Apenas o host adiciona jogadores ao torneio.

### 3. Sessão Persistente (localStorage)

- Tokens, quando existem, e `tournamentId` são salvos em `localStorage`.
- Ao reabrir o app, o hook `useTournament` recupera a sessão automaticamente via `GET /state`.
- Logout limpa o `localStorage` e encerra a conexão SSE.

### 4. Controle do Timer (Host)

- Host pode: **start**, **pause**, **reset**, **skip** (próximo nível).
- Timer é client-authoritative: o servidor persiste `startedAt`, `timeRemaining`, `totalElapsed`, `currentLevel` e `isRunning`.
- Clientes interpolam a contagem localmente; não há `setInterval` server-side por torneio.
- SSE envia snapshot inicial quando disponível; polling controlado consulta `/state` e é a fonte confiável de sincronização em Netlify/serverless.
- Ao pular nível, `currentLevel` incrementa e `timeRemaining` reinicia.
- Ao chegar a zero, um cliente autenticado dispara a ação interna `advance`; a API valida que o timer venceu e usa lock curto por nível para reduzir avanço duplicado.
- Ao atingir o nível 27 (último), o botão "Pular" é desabilitado.

### 5. Jogadores (Host)

- Host adiciona jogadores pelo nome (via dashboard ou pelo próprio jogador via join).
- Host pode remover jogadores.
- Nomes são únicos (case-insensitive) dentro do torneio.

### 6. Configurações (Host)

- Host pode alterar config durante o torneio.
- Campos editáveis: `buyIn`, `rebuySingle`, `rebuyDouble`, `addon`, `prizeCount` (3–5), `levelDuration` (minutos por nível), `roundingStep`.

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
  code: string;                // 3 chars uppercase (sem 0, O, I, 1)
  hostToken: string;           // 8 chars aleatórios — autenticação do host
  createdAt: number;           // Unix timestamp (ms)
  state: 'setup' | 'running' | 'finished';
  config: TournamentConfig;
  players: Player[];
  timer: TimerState;
  ranking: RankingState;
  extras: ExtraExpense[];
}
```

### `TournamentConfig` (defaults)

| Campo | Tipo | Default | Restrições |
|---|---|---|---|
| `buyIn` | number | 20 | >= 0 |
| `rebuySingle` | number | 10 | > 0 |
| `rebuyDouble` | number | 20 | > 0 |
| `addon` | number | 20 | > 0 |
| `prizeCount` | number | 3 | 3–5 |
| `levelDuration` | number | 12 | minutos por nível, > 0 |
| `roundingStep` | number | 1 | > 0 |

### `Player`

```typescript
{
  id: string;       // playerToken (16 chars) — também é o token de auth
  name: string;     // max 20 chars, único no torneio
  buyins: number;   // padrão 1 ao adicionar via /players; 0 ao entrar via /join
  rebuySingleCount?: number;
  rebuyDoubleCount?: number;
  rebuys: number;   // total derivado/compatibilidade com dados antigos
  addon: boolean;
  isHost: boolean;
}
```

> **Nota**: jogadores que entram via `/join` começam com `buyins: 0`. Jogadores adicionados pelo host via `/players` começam com `buyins: 1`.

### `TimerState`

```typescript
{
  isRunning: boolean;
  currentLevel: number;      // 1–25
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
  "code": "AB2",
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
{ "code": "AB2" }
```

**Response 200**:
```json
{
  "tournament": { ...Tournament },
  "role": "none"
}
```

**Errors**:
- `400` — code ausente
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

: connected {clientId}                          ← comentário/keep-alive opcional
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

**Request body (rebuy / removeRebuy)**:
```json
{ "action": "rebuy", "playerId": "abc123", "rebuyType": "single" }
{ "action": "removeRebuy", "playerId": "abc123", "rebuyType": "double" }
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

**Validação**: `buyIn` pode ser zero; demais valores monetários, `levelDuration` e `roundingStep` devem ser positivos; `prizeCount` deve ser inteiro entre 3 e 5.

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

**Request body (reopen)**:
```json
{ "action": "reopen" }
```

**Request body (finish without ranking)**:
```json
{ "action": "finishWithoutRanking" }
```

**Comportamento**:
1. Calcula pot total somando buyins + rebuys + addons de todos os players.
2. Distribui prêmios por percentuais SNG ou pelos valores enviados pelo cliente (ICM/manual), respeitando `roundingStep`.
3. Altera `tournament.state` para `finished`.
4. `action: "reopen"` muda o estado de volta para `running` ou `setup`, permitindo editar e finalizar novamente.
5. `action: "finishWithoutRanking"` finaliza sem posições, para usar o app como calculadora de extras/acerto.

**Response 200**:
```json
{ "ranking": { ...RankingState }, "totalPot": 1500 }
```

---

## Níveis de Blinds (25 Níveis)

| Nível | SB | BB |
|---|---|---|
| 1 | 100 | 200 |
| 2 | 200 | 400 |
| 3 | 300 | 600 |
| 4 | 400 | 800 |
| 5 | 500 | 1.000 |
| 6 | 600 | 1.200 |
| 7 | 700 | 1.400 |
| 8 | 800 | 1.600 |
| 9 | 900 | 1.800 |
| 10 | 1.000 | 2.000 |
| 11 | 1.200 | 2.400 |
| 12 | 1.400 | 2.800 |
| 13 | 1.500 | 3.000 |
| 14 | 2.000 | 4.000 |
| 15 | 2.500 | 5.000 |
| 16 | 3.000 | 6.000 |
| 17 | 4.000 | 8.000 |
| 18 | 5.000 | 10.000 |
| 19 | 6.000 | 12.000 |
| 20 | 8.000 | 16.000 |
| 21 | 10.000 | 20.000 |
| 22 | 15.000 | 30.000 |
| 23 | 20.000 | 40.000 |
| 24 | 25.000 | 50.000 |
| 25 | 30.000 | 60.000 |

---

## Autenticação e Autorização

| Ação | Host | Player | Anônimo |
|---|---|---|---|
| Criar torneio | ✅ | ✅ | ✅ |
| Visualizar torneio | ✅ | ✅ | ✅ |
| Ver estado | ✅ | ✅ | ✅ (role=none) |
| Conectar ao stream | ✅ | ✅ | ❌ |
| Controlar timer | ✅ | ❌ | ❌ |
| Avançar timer vencido (`advance`) | ✅ | ✅ | ❌ |
| Adicionar/remover player | ✅ | ❌ | ❌ |
| Atualizar config | ✅ | ❌ | ❌ |
| Finalizar torneio | ✅ | ❌ | ❌ |

**Mecanismo**: `hostToken` é gerado no create e armazenado no objeto `Tournament`. Visualização por código é anônima (`role=none`) e não cria jogador. Tokens são passados via `Authorization: Bearer` (ou `?token=` no stream SSE) quando existem.

---

## Limitações e Problemas Conhecidos

| # | Descrição | Impacto |
|---|---|---|
| 1 | Timer depende de cliente conectado para disparar `advance` ao zerar | Se nenhum cliente estiver ativo no exato momento, avanço pode atrasar até nova interação/sync |
| 2 | Sem rate limiting nas APIs | Host/player pode fazer spam de requisições |
| 3 | Sem transações Redis completas para mutações concorrentes gerais | Ações simultâneas do host podem sobrescrever estado se ocorrerem no mesmo instante |
| 6 | `tournament.timer` undefined causa loading infinito sem escape | Torneio corrompido prende o usuário |

---

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `UPSTASH_REDIS_REST_URL` | URL REST do Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token de acesso ao Upstash Redis |

Sem essas variáveis, o sistema usa um cliente em memória (perde dados ao reiniciar o servidor).
