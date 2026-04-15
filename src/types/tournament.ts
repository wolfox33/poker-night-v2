export interface TournamentConfig {
  buyIn: number;
  rebuySingle: number;
  rebuyDouble: number;
  addon: number;
  prizeCount: number;
  levelDuration: number;
}

export type TournamentState = 'setup' | 'running' | 'finished';

export interface Player {
  id: string;
  name: string;
  buyins: number;
  rebuys: number;
  addon: boolean;
  isHost: boolean;
}

export interface TimerState {
  isRunning: boolean;
  currentLevel: number;
  timeRemaining: number;
  totalElapsed: number;
  startedAt: number | null;
}

export interface RankingPlace {
  position: number;
  playerId: string;
  prize: number;
}

export type RankingAgreement = 'none' | 'icm' | 'manual';

export interface RankingState {
  places: RankingPlace[];
  agreement: RankingAgreement;
}

export interface ExtraExpense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  splitAmong: string[];
}

export interface Tournament {
  id: string;
  code: string;
  hostToken: string;
  createdAt: number;
  config: TournamentConfig;
  state: TournamentState;
  players: Player[];
  timer: TimerState;
  ranking: RankingState;
  extras: ExtraExpense[];
}

export interface JoinResponse {
  tournament: Tournament;
  playerToken: string;
  role: 'host' | 'player';
}

export interface CreateResponse {
  id: string;
  code: string;
  hostToken: string;
  tournament: Tournament;
}

export interface TournamentResponse {
  tournament: Tournament;
  role: 'host' | 'player' | 'none';
  canEdit: boolean;
}

export interface TimerAction {
  action: 'start' | 'pause' | 'reset' | 'skip';
}

export interface PlayerAction {
  action: 'add' | 'remove';
  playerId?: string;
  name?: string;
  buyin?: number;
}

export interface RankingAction {
  positions: { playerId: string; position: number }[];
}

export const DEFAULT_CONFIG: TournamentConfig = {
  buyIn: 100,
  rebuySingle: 100,
  rebuyDouble: 200,
  addon: 100,
  prizeCount: 3,
  levelDuration: 12,
};

export const DEFAULT_TIMER_STATE: TimerState = {
  isRunning: false,
  currentLevel: 1,
  timeRemaining: 12 * 60,
  totalElapsed: 0,
  startedAt: null,
};

export const DEFAULT_RANKING: RankingState = {
  places: [],
  agreement: 'none',
};

export const BLINDS_LEVELS = [
  { level: 1, smallBlind: 100, bigBlind: 200, ante: 0 },
  { level: 2, smallBlind: 150, bigBlind: 300, ante: 0 },
  { level: 3, smallBlind: 200, bigBlind: 400, ante: 0 },
  { level: 4, smallBlind: 300, bigBlind: 600, ante: 0 },
  { level: 5, smallBlind: 400, bigBlind: 800, ante: 0 },
  { level: 6, smallBlind: 500, bigBlind: 1000, ante: 0 },
  { level: 7, smallBlind: 600, bigBlind: 1200, ante: 0 },
  { level: 8, smallBlind: 800, bigBlind: 1600, ante: 0 },
  { level: 9, smallBlind: 1000, bigBlind: 2000, ante: 0 },
  { level: 10, smallBlind: 1200, bigBlind: 2400, ante: 0 },
  { level: 11, smallBlind: 1500, bigBlind: 3000, ante: 0 },
  { level: 12, smallBlind: 2000, bigBlind: 4000, ante: 0 },
  { level: 13, smallBlind: 2500, bigBlind: 5000, ante: 0 },
  { level: 14, smallBlind: 3000, bigBlind: 6000, ante: 0 },
  { level: 15, smallBlind: 4000, bigBlind: 8000, ante: 0 },
  { level: 16, smallBlind: 5000, bigBlind: 10000, ante: 0 },
  { level: 17, smallBlind: 6000, bigBlind: 12000, ante: 0 },
  { level: 18, smallBlind: 8000, bigBlind: 16000, ante: 0 },
  { level: 19, smallBlind: 10000, bigBlind: 20000, ante: 0 },
  { level: 20, smallBlind: 12000, bigBlind: 24000, ante: 0 },
  { level: 21, smallBlind: 15000, bigBlind: 30000, ante: 0 },
  { level: 22, smallBlind: 20000, bigBlind: 40000, ante: 0 },
  { level: 23, smallBlind: 25000, bigBlind: 50000, ante: 0 },
  { level: 24, smallBlind: 30000, bigBlind: 60000, ante: 0 },
  { level: 25, smallBlind: 40000, bigBlind: 80000, ante: 0 },
  { level: 26, smallBlind: 50000, bigBlind: 100000, ante: 0 },
  { level: 27, smallBlind: 60000, bigBlind: 120000, ante: 0 },
];