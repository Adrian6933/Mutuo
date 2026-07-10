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
    return s;
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
  return s.mode === 'ffa'
    ? {
        players: s.players.map((p) => ({ name: p.name })),
        endRule: s.endRule,
        categories: s.categories,
        options: s.options,
      }
    : {
        teams: s.teams.map((t) => ({
          name: t.name,
          players: t.players.map((p) => ({ name: p.name })),
        })),
        endRule: s.endRule,
        categories: s.categories,
        options: s.options,
      };
}
