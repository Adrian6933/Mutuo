import type { Card, CategoryId } from '../data/cards';

export type Mode = 'ffa' | 'teams';

export type BetSide = 'left' | 'right' | 'exact' | 'miss';

export type EndRule =
  | { kind: 'laps'; laps: number }
  | { kind: 'points'; goal: number };

export type Options = {
  rivalBet: boolean;
  timerSecs: number;
  /** segundos para pasar solo de la clasificación a la siguiente ronda; 0 = hay que pulsar el botón */
  standingsSecs: number;
  tiebreak: boolean;
  stats: boolean;
  sound: boolean;
};

export type Player = {
  id: number;
  name: string;
  score: number;
};

export type TeamPlayer = {
  id: number;
  name: string;
};

export type Team = {
  id: number;
  name: string;
  players: TeamPlayer[];
  score: number;
  psychicIdx: number;
};

export type Phase =
  | 'menu'
  | 'setup'
  | 'handoff'
  | 'card-pick'
  | 'custom-card'
  | 'psychic'
  | 'clue'
  | 'guess'
  | 'rival-bet'
  | 'reveal'
  | 'standings'
  | 'end';

export type Gain = {
  key: string;
  label: string;
  pts: number;
};

export type RoundLog = {
  psychic: string;
  guesser: string;
  pts: number;
  betWon: boolean;
};

export type GameState = {
  phase: Phase;
  mode: Mode;
  endRule: EndRule;
  categories: CategoryId[];
  options: Options;
  players: Player[];
  teams: Team[];
  nextId: number;
  round: number;
  deck: Card[];
  deckIndex: number;
  card: Card | null;
  /** pista escrita por el psíquico, o null si la ha dado solo en voz alta */
  clue: string | null;
  target: number;
  needle: number;
  bet: BetSide | null;
  bets: Record<string, BetSide> | null;
  betWon: boolean;
  lastPts: number;
  lastGains: Gain[];
  history: RoundLog[];
  /** claves (p{id}/t{id}) de los empatados en muerte súbita, o null */
  tiebreakKeys: string[] | null;
  tiebreakStart: number;
};

export type ModePrefs = {
  players?: { name: string }[];
  teams?: { name: string; players: { name: string }[] }[];
  endRule?: EndRule;
  categories?: CategoryId[];
  options?: Options;
};
