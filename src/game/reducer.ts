import { CATEGORIES, cardsFor, shuffle, type CategoryId } from '../data/cards';
import { scoreFor } from '../components/Dial';
import type {
  BetSide,
  EndRule,
  GameState,
  Mode,
  ModePrefs,
  Options,
  Player,
  Team,
  TeamPlayer,
} from './types';

export type Action =
  | { type: 'CHOOSE_MODE'; mode: Mode; prefs?: ModePrefs | null }
  | { type: 'BACK_TO_MENU' }
  | { type: 'GO_HOME' }
  | { type: 'SET_END_RULE'; endRule: EndRule }
  | { type: 'SET_CATEGORIES'; categories: CategoryId[] }
  | { type: 'SET_OPTIONS'; options: Partial<Options> }
  | { type: 'ADD_PLAYER' }
  | { type: 'REMOVE_PLAYER'; id: number }
  | { type: 'RENAME_PLAYER'; id: number; name: string }
  | { type: 'REORDER_PLAYERS'; from: number; to: number }
  | { type: 'SHUFFLE_PLAYERS' }
  | { type: 'ADD_TEAM' }
  | { type: 'REMOVE_TEAM'; id: number }
  | { type: 'RENAME_TEAM'; id: number; name: string }
  | { type: 'ADD_TEAM_PLAYER'; teamId: number }
  | { type: 'REMOVE_TEAM_PLAYER'; teamId: number; playerId: number }
  | { type: 'RENAME_TEAM_PLAYER'; teamId: number; playerId: number; name: string }
  | { type: 'REORDER_TEAM_PLAYERS'; teamId: number; from: number; to: number }
  | { type: 'MOVE_PLAYER_TO_TEAM'; fromTeamId: number; playerId: number; toTeamId: number }
  | { type: 'SHUFFLE_TEAMS_DISTRIBUTE' }
  | { type: 'SHUFFLE_TEAMS_INTERNAL' }
  | { type: 'START_GAME' }
  | { type: 'BEGIN_TURN' }
  | { type: 'PICK_RANDOM' }
  | { type: 'PICK_CUSTOM' }
  | { type: 'SET_CUSTOM_CARD'; left: string; right: string; topic?: string }
  | { type: 'HIDE_ZONE' }
  | { type: 'CLUE_GIVEN'; text?: string }
  | { type: 'SET_NEEDLE'; angle: number }
  | { type: 'CONFIRM_GUESS'; angle?: number }
  | { type: 'PLACE_BET'; side: BetSide; playerId?: number }
  | { type: 'REVEAL_FFA' }
  | { type: 'SHOW_STANDINGS' }
  | { type: 'NEXT_ROUND' }
  | { type: 'PLAY_AGAIN' }
  | { type: 'RESTORE'; state: GameState };

export const COLOR_COUNT = 6;
export const MAX_LAPS = 9;
export const MAX_GOAL = 100;

export const DEFAULT_OPTIONS: Options = {
  rivalBet: true,
  timerSecs: 0,
  tiebreak: true,
  stats: true,
  sound: true,
};

export const ALL_CATEGORIES: CategoryId[] = CATEGORIES.map((c) => c.id);

export function randomTarget(): number {
  return Math.random() * 180;
}

export const initialState: GameState = {
  phase: 'menu',
  mode: 'ffa',
  endRule: { kind: 'laps', laps: 1 },
  categories: ALL_CATEGORIES,
  options: DEFAULT_OPTIONS,
  players: [],
  teams: [],
  nextId: 1,
  round: 0,
  deck: [],
  deckIndex: 0,
  card: null,
  clue: null,
  target: 90,
  needle: 90,
  bet: null,
  bets: null,
  betWon: false,
  lastPts: 0,
  lastGains: [],
  history: [],
  tiebreakKeys: null,
  tiebreakStart: 0,
};

/* ---- selectores ---- */

export function eligiblePlayers(s: GameState): Player[] {
  if (!s.tiebreakKeys) return s.players;
  return s.players.filter((p) => s.tiebreakKeys!.includes(`p${p.id}`));
}

export function eligibleTeams(s: GameState): Team[] {
  if (!s.tiebreakKeys) return s.teams;
  return s.teams.filter((t) => s.tiebreakKeys!.includes(`t${t.id}`));
}

function turnIndex(s: GameState, count: number): number {
  const base = s.tiebreakKeys ? s.round - s.tiebreakStart : s.round;
  return ((base % count) + count) % count;
}

export function ffaPsychic(s: GameState): Player {
  const elig = eligiblePlayers(s);
  return elig[turnIndex(s, elig.length)]!;
}

export function ffaGuesser(s: GameState): Player {
  const elig = eligiblePlayers(s);
  return elig[(turnIndex(s, elig.length) + 1) % elig.length]!;
}

/** Jugadores que no son psíquico ni adivinador esta ronda: pueden apostar al lado. */
export function ffaBystanders(s: GameState): Player[] {
  const psy = ffaPsychic(s).id;
  const gsr = ffaGuesser(s).id;
  return s.players.filter((p) => p.id !== psy && p.id !== gsr);
}

export function ffaBystanderNames(s: GameState): string {
  const names = ffaBystanders(s).map((p) => p.name);
  if (names.length === 0) return '';
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
    : names[0]!;
}

export function activeTeamIdx(s: GameState): number {
  const elig = eligibleTeams(s);
  const team = elig[turnIndex(s, elig.length)]!;
  return s.teams.findIndex((t) => t.id === team.id);
}

export function activeTeam(s: GameState): Team {
  return s.teams[activeTeamIdx(s)]!;
}

export function rivalTeam(s: GameState): Team {
  const elig = eligibleTeams(s);
  return elig[(turnIndex(s, elig.length) + 1) % elig.length]!;
}

export function teamPsychic(t: Team): TeamPlayer {
  return t.players[t.psychicIdx % t.players.length]!;
}

export function teamGuessers(t: Team): TeamPlayer[] {
  const idx = t.psychicIdx % t.players.length;
  return t.players.filter((_, i) => i !== idx);
}

export function psychicName(s: GameState): string {
  return s.mode === 'ffa' ? ffaPsychic(s).name : teamPsychic(activeTeam(s)).name;
}

export function guesserNames(s: GameState): string {
  if (s.mode === 'ffa') return ffaGuesser(s).name;
  const names = teamGuessers(activeTeam(s)).map((p) => p.name);
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
    : names[0]!;
}

export function totalRounds(s: GameState): number | null {
  if (s.endRule.kind !== 'laps') return null;
  const n = s.mode === 'ffa' ? s.players.length : s.teams.length;
  return s.endRule.laps * n;
}

export function isGameOver(s: GameState): boolean {
  if (s.endRule.kind === 'points') {
    const scores = s.mode === 'ffa' ? s.players.map((p) => p.score) : s.teams.map((t) => t.score);
    return Math.max(...scores) >= s.endRule.goal;
  }
  return s.round + 1 >= (totalRounds(s) ?? Infinity);
}

export function leaders(s: GameState): string[] {
  const pool =
    s.mode === 'ffa'
      ? s.players.map((p) => ({ key: `p${p.id}`, score: p.score }))
      : s.teams.map((t) => ({ key: `t${t.id}`, score: t.score }));
  const sub = s.tiebreakKeys ? pool.filter((x) => s.tiebreakKeys!.includes(x.key)) : pool;
  const max = Math.max(...sub.map((x) => x.score));
  return sub.filter((x) => x.score === max).map((x) => x.key);
}

export function colorIdx(s: GameState, key: string): number {
  if (key.startsWith('t')) {
    const i = s.teams.findIndex((t) => `t${t.id}` === key);
    return (i >= 0 ? i : 0) % COLOR_COUNT;
  }
  const i = s.players.findIndex((p) => `p${p.id}` === key);
  return (i >= 0 ? i : 0) % COLOR_COUNT;
}

export function canStart(s: GameState): boolean {
  if (s.mode === 'ffa') return s.players.length >= 2;
  return s.teams.length >= 2 && s.teams.every((t) => t.players.length >= 2);
}

function totalTeamPlayers(teams: Team[]): number {
  return teams.reduce((n, t) => n + t.players.length, 0);
}

function clampEndRule(rule: EndRule): EndRule {
  if (rule.kind === 'laps') {
    return { kind: 'laps', laps: Math.max(1, Math.min(MAX_LAPS, Math.round(rule.laps) || 1)) };
  }
  return { kind: 'points', goal: Math.max(1, Math.min(MAX_GOAL, Math.round(rule.goal) || 1)) };
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const out = [...arr];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(arr.length - 1, to)), 0, item!);
  return out;
}

/* ---- puntuación ---- */

/** Lado del objetivo respecto a la aguja con envoltura circular (módulo 180). */
export function circularDelta(target: number, needle: number): number {
  return ((((target - needle) % 180) + 270) % 180) - 90;
}

function applyRevealFfaMultiple(s: GameState, bets: Record<string, BetSide> | null): GameState {
  const pts = scoreFor(s.needle, s.target);
  const psy = ffaPsychic(s);
  const gsr = ffaGuesser(s);
  const delta = circularDelta(s.target, s.needle);
  
  // En muerte súbita solo puntúa quien adivina.
  const scorers = s.tiebreakKeys ? [gsr] : [psy, gsr];
  const scoreIds = new Map<number, number>(scorers.map((p) => [p.id, pts]));
  
  const bystanders = ffaBystanders(s);
  const winningBystanders: Player[] = [];
  let anyBetWon = false;

  for (const b of bystanders) {
    const playerBet = bets ? bets[b.id.toString()] : null;
    if (playerBet) {
      const won = playerBet === 'miss'
        ? pts === 0
        : playerBet === 'exact'
          ? pts === 4
          : (pts > 0 && pts !== 4 && (playerBet === 'left' ? delta < 0 : delta > 0));
      if (won) {
        winningBystanders.push(b);
        scoreIds.set(b.id, (scoreIds.get(b.id) ?? 0) + 1);
        anyBetWon = true;
      }
    }
  }

  const players = s.players.map((p) =>
    scoreIds.has(p.id) ? { ...p, score: p.score + scoreIds.get(p.id)! } : p
  );

  const lastGains = [
    ...(pts > 0 ? scorers.map((p) => ({ key: `p${p.id}`, label: p.name, pts })) : []),
    ...winningBystanders.map((p) => ({ key: `p${p.id}`, label: p.name, pts: 1 })),
  ];

  const history = [...s.history, { psychic: psy.name, guesser: gsr.name, pts, betWon: anyBetWon }];
  return { ...s, bets, betWon: anyBetWon, lastPts: pts, lastGains, history, players, phase: 'reveal' };
}

function applyRevealFfa(s: GameState, side: BetSide | null): GameState {
  const bMap: Record<string, BetSide> = {};
  if (side !== null) {
    for (const b of ffaBystanders(s)) {
      bMap[b.id.toString()] = side;
    }
  }
  return applyRevealFfaMultiple(s, side !== null ? bMap : null);
}

function applyRevealTeams(s: GameState, side: BetSide | null): GameState {
  const pts = scoreFor(s.needle, s.target);
  const atIdx = activeTeamIdx(s);
  const rival = rivalTeam(s);
  const delta = circularDelta(s.target, s.needle);
  const betWon =
    side !== null &&
    (side === 'miss'
      ? pts === 0
      : side === 'exact'
        ? pts === 4
        : (pts > 0 && pts !== 4 && (side === 'left' ? delta < 0 : delta > 0)));
  const teams = s.teams.map((t, i) => {
    let add = 0;
    if (i === atIdx) add += pts;
    if (t.id === rival.id && betWon) add += 1;
    return add > 0 ? { ...t, score: t.score + add } : t;
  });
  const lastGains = [];
  if (pts > 0) lastGains.push({ key: `t${s.teams[atIdx]!.id}`, label: s.teams[atIdx]!.name, pts });
  if (betWon) lastGains.push({ key: `t${rival.id}`, label: rival.name, pts: 1 });
  const at = s.teams[atIdx]!;
  const history = [
    ...s.history,
    { psychic: teamPsychic(at).name, guesser: at.name, pts, betWon },
  ];
  return { ...s, teams, bet: side, betWon, lastPts: pts, lastGains, history, phase: 'reveal' };
}

/* ---- construcción desde prefs ---- */

function buildFromPrefs(mode: Mode, prefs: ModePrefs | null | undefined): GameState {
  const base: GameState = {
    ...initialState,
    mode,
    phase: 'setup',
    endRule: mode === 'ffa' ? { kind: 'laps', laps: 1 } : { kind: 'points', goal: 10 },
  };
  let id = 1;
  if (mode === 'ffa') {
    const names =
      prefs?.players && prefs.players.length >= 2
        ? prefs.players.map((p) => p.name)
        : ['Jugador 1', 'Jugador 2'];
    base.players = names.map((name) => ({ id: id++, name, score: 0 }));
  } else {
    const teamDefs =
      prefs?.teams && prefs.teams.length >= 1 && prefs.teams.every((t) => t.players.length >= 2)
        ? prefs.teams
        : [{ name: 'Equipo 1', players: [{ name: 'Jugador 1' }, { name: 'Jugador 2' }] }];
    base.teams = teamDefs.map((t) => ({
      id: id++,
      name: t.name,
      players: t.players.map((p) => ({ id: id++, name: p.name })),
      score: 0,
      psychicIdx: 0,
    }));
  }
  base.nextId = id;
  if (prefs?.endRule) base.endRule = clampEndRule(prefs.endRule);
  if (prefs?.categories && prefs.categories.length > 0) {
    base.categories = prefs.categories.filter((c) => ALL_CATEGORIES.includes(c));
    if (base.categories.length === 0) base.categories = ALL_CATEGORIES;
  }
  if (prefs?.options) base.options = { ...DEFAULT_OPTIONS, ...prefs.options };
  return base;
}

function freshRound(s: GameState): GameState {
  return {
    ...s,
    card: null,
    clue: null,
    needle: 90,
    target: randomTarget(),
    bet: null,
    bets: null,
    betWon: false,
    lastPts: 0,
    lastGains: [],
    phase: 'handoff',
  };
}

/* ---- reducer ---- */

export function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'CHOOSE_MODE':
      return buildFromPrefs(a.mode, a.prefs);

    case 'BACK_TO_MENU':
    case 'GO_HOME':
      return { ...initialState };

    case 'SET_END_RULE':
      return { ...s, endRule: clampEndRule(a.endRule) };

    case 'SET_CATEGORIES':
      return { ...s, categories: a.categories };

    case 'SET_OPTIONS':
      return { ...s, options: { ...s.options, ...a.options } };

    case 'ADD_PLAYER':
      return {
        ...s,
        players: [...s.players, { id: s.nextId, name: `Jugador ${s.players.length + 1}`, score: 0 }],
        nextId: s.nextId + 1,
      };

    case 'REMOVE_PLAYER':
      if (s.players.length <= 2) return s;
      return { ...s, players: s.players.filter((p) => p.id !== a.id) };

    case 'RENAME_PLAYER':
      return {
        ...s,
        players: s.players.map((p) => (p.id === a.id ? { ...p, name: a.name } : p)),
      };

    case 'REORDER_PLAYERS':
      return { ...s, players: moveItem(s.players, a.from, a.to) };

    case 'SHUFFLE_PLAYERS':
      return { ...s, players: shuffle(s.players) };

    case 'ADD_TEAM': {
      const base = totalTeamPlayers(s.teams);
      return {
        ...s,
        teams: [
          ...s.teams,
          {
            id: s.nextId,
            name: `Equipo ${s.teams.length + 1}`,
            players: [
              { id: s.nextId + 1, name: `Jugador ${base + 1}` },
              { id: s.nextId + 2, name: `Jugador ${base + 2}` },
            ],
            score: 0,
            psychicIdx: 0,
          },
        ],
        nextId: s.nextId + 3,
      };
    }

    case 'REMOVE_TEAM':
      if (s.teams.length <= 1) return s;
      return { ...s, teams: s.teams.filter((t) => t.id !== a.id) };

    case 'RENAME_TEAM':
      return { ...s, teams: s.teams.map((t) => (t.id === a.id ? { ...t, name: a.name } : t)) };

    case 'ADD_TEAM_PLAYER': {
      const base = totalTeamPlayers(s.teams);
      return {
        ...s,
        teams: s.teams.map((t) =>
          t.id === a.teamId
            ? { ...t, players: [...t.players, { id: s.nextId, name: `Jugador ${base + 1}` }] }
            : t
        ),
        nextId: s.nextId + 1,
      };
    }

    case 'REMOVE_TEAM_PLAYER':
      return {
        ...s,
        teams: s.teams.map((t) =>
          t.id === a.teamId && t.players.length > 2
            ? { ...t, players: t.players.filter((p) => p.id !== a.playerId) }
            : t
        ),
      };

    case 'RENAME_TEAM_PLAYER':
      return {
        ...s,
        teams: s.teams.map((t) =>
          t.id === a.teamId
            ? {
                ...t,
                players: t.players.map((p) => (p.id === a.playerId ? { ...p, name: a.name } : p)),
              }
            : t
        ),
      };

    case 'REORDER_TEAM_PLAYERS':
      return {
        ...s,
        teams: s.teams.map((t) =>
          t.id === a.teamId ? { ...t, players: moveItem(t.players, a.from, a.to) } : t
        ),
      };

    case 'MOVE_PLAYER_TO_TEAM': {
      if (a.fromTeamId === a.toTeamId) return s;
      const from = s.teams.find((t) => t.id === a.fromTeamId);
      const player = from?.players.find((p) => p.id === a.playerId);
      if (!from || !player) return s;
      return {
        ...s,
        teams: s.teams.map((t) => {
          if (t.id === a.fromTeamId)
            return { ...t, players: t.players.filter((p) => p.id !== a.playerId) };
          if (t.id === a.toTeamId) return { ...t, players: [...t.players, player] };
          return t;
        }),
      };
    }

    case 'SHUFFLE_TEAMS_DISTRIBUTE': {
      const pool = shuffle(s.teams.flatMap((t) => t.players));
      let i = 0;
      return {
        ...s,
        teams: s.teams.map((t) => {
          const players = pool.slice(i, i + t.players.length);
          i += t.players.length;
          return { ...t, players };
        }),
      };
    }

    case 'SHUFFLE_TEAMS_INTERNAL':
      return { ...s, teams: s.teams.map((t) => ({ ...t, players: shuffle(t.players) })) };

    case 'START_GAME': {
      if (!canStart(s)) return s;
      const players = s.players.map((p, i) => ({
        ...p,
        name: p.name.trim() || `Jugador ${i + 1}`,
        score: 0,
      }));
      let counter = 0;
      const teams = s.teams.map((t, i) => ({
        ...t,
        name: t.name.trim() || `Equipo ${i + 1}`,
        score: 0,
        psychicIdx: 0,
        players: t.players.map((p) => {
          counter += 1;
          return { ...p, name: p.name.trim() || `Jugador ${counter}` };
        }),
      }));
      return freshRound({
        ...s,
        players,
        teams,
        deck: shuffle(cardsFor(s.categories)),
        deckIndex: 0,
        round: 0,
        history: [],
        tiebreakKeys: null,
        tiebreakStart: 0,
      });
    }

    case 'BEGIN_TURN':
      return { ...s, phase: 'card-pick' };

    case 'PICK_RANDOM': {
      let deck = s.deck;
      let di = s.deckIndex;
      if (di >= deck.length) {
        deck = shuffle(cardsFor(s.categories));
        di = 0;
      }
      return { ...s, deck, deckIndex: di + 1, card: deck[di]!, target: randomTarget(), phase: 'psychic' };
    }

    case 'PICK_CUSTOM':
      return { ...s, phase: 'custom-card' };

    case 'SET_CUSTOM_CARD': {
      const left = a.left.trim();
      const right = a.right.trim();
      const topic = a.topic?.trim();
      if (!left || !right) return s;
      return {
        ...s,
        card: { left, right, cat: 'clasicas', ...(topic ? { topic } : {}) },
        target: randomTarget(),
        phase: 'psychic',
      };
    }

    case 'HIDE_ZONE':
      return { ...s, phase: 'clue' };

    case 'CLUE_GIVEN':
      return { ...s, clue: a.text?.trim() || null, phase: 'guess' };

    case 'SET_NEEDLE':
      return { ...s, needle: a.angle };

    case 'CONFIRM_GUESS': {
      const hasBettors =
        s.mode === 'ffa' ? ffaBystanders(s).length > 0 : s.teams.length >= 2;
      if (s.options.rivalBet && hasBettors) return { ...s, phase: 'rival-bet' };
      return s.mode === 'ffa' ? applyRevealFfa(s, null) : applyRevealTeams(s, null);
    }

    case 'PLACE_BET': {
      if (s.mode === 'teams') {
        return applyRevealTeams(s, a.side);
      }
      if (a.playerId === undefined || a.playerId === null) {
        return applyRevealFfa(s, a.side);
      }
      const newBets = { ...(s.bets || {}), [a.playerId.toString()]: a.side };
      return { ...s, bets: newBets };
    }

    case 'REVEAL_FFA':
      return applyRevealFfaMultiple(s, s.bets);

    case 'SHOW_STANDINGS':
      return { ...s, phase: 'standings' };

    case 'NEXT_ROUND': {
      // rota el psíquico del equipo que acaba de jugar
      let next: GameState = s;
      if (s.mode === 'teams') {
        const idx = activeTeamIdx(s);
        next = {
          ...s,
          teams: s.teams.map((t, i) => (i === idx ? { ...t, psychicIdx: t.psychicIdx + 1 } : t)),
        };
      }

      if (next.tiebreakKeys) {
        const eligCount =
          next.mode === 'ffa' ? eligiblePlayers(next).length : eligibleTeams(next).length;
        const played = next.round + 1 - next.tiebreakStart;
        if (played % eligCount === 0) {
          const lead = leaders(next);
          if (lead.length === 1) return { ...next, phase: 'end' };
          return freshRound({
            ...next,
            tiebreakKeys: lead,
            tiebreakStart: next.round + 1,
            round: next.round + 1,
          });
        }
        return freshRound({ ...next, round: next.round + 1 });
      }

      if (isGameOver(next)) {
        const lead = leaders(next);
        if (next.options.tiebreak && lead.length > 1) {
          return freshRound({
            ...next,
            tiebreakKeys: lead,
            tiebreakStart: next.round + 1,
            round: next.round + 1,
          });
        }
        return { ...next, phase: 'end' };
      }

      return freshRound({ ...next, round: next.round + 1 });
    }

    case 'PLAY_AGAIN':
      return reducer({ ...s, phase: 'setup' }, { type: 'START_GAME' });

    case 'RESTORE':
      return a.state;

    default:
      return s;
  }
}
