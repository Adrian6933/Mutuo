import { DEFAULT_OPTIONS } from './reducer';
import type { GameState, Mode, ModePrefs } from './types';

const STATE_KEY = 'frecuencia-state-v1';
const PREFS_KEY = 'frecuencia-prefs-v1';

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    // almacenamiento no disponible: se juega sin persistencia
  }
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s || typeof s !== 'object' || !s.phase || s.phase === 'menu' || s.phase === 'end') return null;
    if (!s.options || !s.categories) return null; // esquema antiguo
    // rellena ajustes añadidos después de guardar (clueSecs, tiebreakMode…)
    return { ...s, options: { ...DEFAULT_OPTIONS, ...s.options } };
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // nada que limpiar
  }
}

/* ---- historial de lobbies: para volver a entrar en las que sigan vivas ---- */

const RECENT_KEY = 'frecuencia-lobbies-v1';
const MAX_RECENT = 8;

export type RecentLobby = {
  id: string;
  name: string;
  /** clave de las privadas, para poder volver sin pedirla otra vez */
  key: string | null;
  at: number;
};

export function loadRecentLobbies(): RecentLobby[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentLobby[];
    if (!Array.isArray(list)) return [];
    return list.filter((l) => l && typeof l.id === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentLobby(entry: Omit<RecentLobby, 'at'>): void {
  try {
    const list = loadRecentLobbies().filter((l) => l.id !== entry.id);
    list.unshift({ ...entry, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // sin persistencia: no pasa nada, es solo un atajo
  }
}

export function forgetRecentLobby(id: string): void {
  try {
    const list = loadRecentLobbies().filter((l) => l.id !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // nada que limpiar
  }
}

type AllPrefs = Partial<Record<Mode, ModePrefs>>;

export function savePrefs(mode: Mode, prefs: ModePrefs): void {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const all: AllPrefs = raw ? (JSON.parse(raw) as AllPrefs) : {};
    all[mode] = prefs;
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
  } catch {
    // sin persistencia de preferencias
  }
}

export function loadPrefs(mode: Mode): ModePrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as AllPrefs;
    return all[mode] ?? null;
  } catch {
    return null;
  }
}

export function prefsFromState(s: GameState): ModePrefs {
  return s.mode === 'teams'
    ? {
        teams: s.teams.map((t) => ({
          name: t.name,
          players: t.players.map((p) => ({ name: p.name })),
        })),
        endRule: s.endRule,
        categories: s.categories,
        options: s.options,
      }
    : {
        players: s.players.map((p) => ({ name: p.name })),
        endRule: s.endRule,
        categories: s.categories,
        options: s.options,
      };
}
