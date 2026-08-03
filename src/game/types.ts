import type { Card, CategoryId } from '../data/cards';

export type Mode = 'ffa' | 'teams';

export type BetSide = 'left' | 'right' | 'exact' | 'miss';

export type EndRule =
  | { kind: 'laps'; laps: number }
  | { kind: 'points'; goal: number };

/** Cómo se resuelve un empate al final de la partida.
 *  - sudden: los empatados siguen jugando entre ellos (muerte súbita de toda la vida)
 *  - clues: cada empatado da una pista por turno y adivinan los eliminados; se lleva sus puntos
 *  - duel: un eliminado al azar da la pista y solo adivinan los empatados */
export type TiebreakMode = 'sudden' | 'clues' | 'duel';

export type Options = {
  /** en "ffa": todos adivinan (a la vez online, por turnos en local) en vez de solo el siguiente */
  allGuess: boolean;
  /** modo presentador: el psíquico no rota, siempre da pistas el mismo y no puntúa */
  fixedPsychic: boolean;
  /** modo cooperativo: no hay ganador individual, todo suma a un marcador común */
  coop: boolean;
  /** en "equipos": todos los equipos adivinan a la vez y el del psíquico puntúa x3 */
  teamsAllGuess: boolean;
  rivalBet: boolean;
  timerSecs: number;
  /** segundos para dar la pista; a cero se pasa solo a adivinar. 0 = sin límite */
  clueSecs: number;
  /** segundos para pasar de los resultados a la clasificación; 0 = deshabilitado */
  revealSecs: number;
  /** segundos para pasar solo de la clasificación a la siguiente ronda; 0 = hay que pulsar el botón */
  standingsSecs: number;
  /** quién o cómo se puede avanzar de fase: "admin" solo anfitrión, "vote" por porcentaje de votos */
  advanceMode: 'admin' | 'vote';
  /** porcentaje necesario de votos de jugadores online para avanzar (por defecto 50) */
  skipVotePct: number;
  tiebreak: boolean;
  /** forma de desempatar elegida en los ajustes (solo una) */
  tiebreakMode: TiebreakMode;
  randomRotation: boolean;
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
  | 'guess-handoff'
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
  /** en "todos adivinan": puntos de cada adivinador de la ronda */
  all?: { name: string; pts: number }[];
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
  /** en "todos adivinan": ángulo confirmado por cada jugador (id → ángulo) */
  guesses: Record<string, number> | null;
  /** índice del adivinador al que le toca dentro de la ronda */
  guesserIdx: number;
  /** en modo presentador: id del jugador que siempre hace de psíquico */
  psychicId: number | null;
  bet: BetSide | null;
  bets: Record<string, BetSide> | null;
  betWon: boolean;
  lastPts: number;
  lastGains: Gain[];
  history: RoundLog[];
  /** claves (p{id}/t{id}) de los empatados en el desempate, o null */
  tiebreakKeys: string[] | null;
  tiebreakStart: number;
  /** forma de desempate que se está jugando de verdad (puede no ser la de los ajustes
   *  si no había suficientes eliminados), o null si no hay desempate */
  activeTiebreak: TiebreakMode | null;
  /** en el desempate "duel": eliminado al azar que da la pista esta ronda */
  tiebreakPsychicId: number | null;
};

export type ModePrefs = {
  players?: { name: string }[];
  teams?: { name: string; players: { name: string }[] }[];
  endRule?: EndRule;
  categories?: CategoryId[];
  options?: Options;
};
