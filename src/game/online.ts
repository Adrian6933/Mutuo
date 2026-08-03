import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ref,
  set,
  get,
  update,
  push,
  remove,
  onValue,
  onChildAdded,
  onDisconnect,
  query,
  orderByChild,
  equalTo,
  runTransaction,
} from 'firebase/database';
import { getDb, ensureAuth, firebaseReady } from '../lib/firebase';
import {
  reducer,
  initialState,
  deckFor,
  ALL_CATEGORIES,
  DEFAULT_OPTIONS,
  ffaPsychic,
  ffaGuesser,
  ffaBystanders,
  allGuessers,
  activeTeam,
  rivalTeam,
  teamPsychic,
  teamGuessers,
  teamOf,
  guessingTeams,
  simultaneousGuess,
  totalRounds,
  type Action,
} from './reducer';
import { shuffle, type CategoryId } from '../data/cards';
import { sanitizeCategories } from './customCats';
import { getProfile, setProfile } from './profile';
import type { EndRule, GameState, Mode, Options } from './types';
import { savePrefs, loadPrefs, saveRecentLobby, forgetRecentLobby } from './storage';

/* ---- tipos de red ---- */

export type LobbyStatus = 'lobby' | 'playing';

export type LobbyMeta = {
  name: string;
  public: boolean;
  key: string | null;
  hostUid: string;
  status: LobbyStatus;
  createdAt: number;
  /** última señal de vida del anfitrión: con esto se sabe qué lobbies son basura */
  updatedAt?: number;
  /** tope de jugadores conectados, o null/ausente si no hay límite */
  maxPlayers?: number | null;
};

export type LobbyPlayer = {
  name: string;
  online: boolean;
  joinedAt: number;
  /** foto de perfil (data URL) para el dial y la lobby */
  avatar?: string | null;
  /** frase del perfil, para la burbuja del marcador */
  bio?: string | null;
  /** último latido: sirve para detectar los "online" que se quedaron colgados */
  seen?: number;
  /** índice de equipo asignado por el host (modo equipos) */
  team?: number;
  /** orden de lista o de equipo asignado */
  order?: number;
};

export type NetConfig = {
  mode: Mode;
  endRule: EndRule;
  categories: CategoryId[];
  options: Options;
};

export type Live = { needle?: number; timerEnd?: number; skipVotes?: Record<string, boolean> };

/** cara visible de un jugador en la lista de lobbies */
export type LobbyFace = { name: string; avatar: string | null };

export type PublicLobby = {
  id: string;
  name: string;
  players: number;
  mode: Mode;
  maxPlayers: number | null;
  /** primeras caras conectadas, para enseñarlas en la lista */
  faces: LobbyFace[];
  /** 'playing' = ya han empezado; se puede entrar igual y se juega desde la ronda siguiente */
  status: LobbyStatus;
  /** ronda en curso (1-based) si está jugando */
  round: number | null;
  /** rondas totales, o null si la partida va a puntos o está en desempate */
  total: number | null;
  /** puntos para ganar si el fin de partida va a puntos */
  goal: number | null;
  /** hay un desempate en marcha */
  tiebreak: boolean;
};

/** caras que se enseñan por lobby en la lista; a partir de ahí, puntos suspensivos */
export const MAX_FACES = 5;

/** cada cuánto avisa cada jugador de que sigue ahí */
const HEARTBEAT_MS = 30_000;
/** sin latido en este rato, no cuentas como conectado (margen para móviles en segundo plano) */
const STALE_MS = 4 * 60_000;
/** una lobby sin señales de vida en este rato es basura: cualquiera puede borrarla */
const DEAD_MS = 60 * 60_000;

/** Último momento en que se supo de un jugador (las lobbies viejas no tienen `seen`). */
function lastSeen(p: LobbyPlayer): number {
  return p.seen ?? p.joinedAt ?? 0;
}

/** ¿Está de verdad dentro? No basta con `online`: puede haberse quedado colgado. */
export function isReallyOnline(p: LobbyPlayer, now = Date.now()): boolean {
  return Boolean(p.online) && now - lastSeen(p) < STALE_MS;
}

export type Role = {
  playerId: number | null;
  isPsychic: boolean;
  isGuesser: boolean;
  isRival: boolean;
  isMember: boolean;
};

/* ---- utilidades ---- */

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newLobbyId(): string {
  let id = '';
  for (let i = 0; i < 6; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return id;
}

function newKey(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** RTDB pierde arrays vacíos y nulls: repone los valores por defecto. */
function normalizeGame(raw: Partial<GameState> | null): GameState | null {
  if (!raw || !raw.phase) return null;
  return {
    ...initialState,
    ...raw,
    deck: [],
    players: raw.players ?? [],
    teams: (raw.teams ?? []).map((t) => ({ ...t, players: t.players ?? [] })),
    categories: raw.categories ?? ALL_CATEGORIES,
    options: { ...DEFAULT_OPTIONS, ...(raw.options ?? {}) },
    lastGains: raw.lastGains ?? [],
    history: raw.history ?? [],
    tiebreakKeys: raw.tiebreakKeys ?? null,
    card: raw.card ?? null,
    bet: raw.bet ?? null,
    bets: raw.bets ?? null,
    psychicId: raw.psychicId ?? null,
  };
}

function stripDeck(s: GameState): Omit<GameState, 'deck'> {
  const { deck, ...rest } = s;
  return rest;
}

export function defaultNetConfig(mode: Mode): NetConfig {
  return {
    mode,
    endRule: mode === 'ffa' ? { kind: 'laps', laps: 1 } : { kind: 'points', goal: 10 },
    categories: ALL_CATEGORIES,
    options: DEFAULT_OPTIONS,
  };
}

/** config por defecto, sobrescrita con los últimos ajustes guardados para ese modo (locales u online) */
function netConfigFor(mode: Mode): NetConfig {
  const base = defaultNetConfig(mode);
  const saved = loadPrefs(mode);
  const categories = saved?.categories ? sanitizeCategories(saved.categories) : base.categories;
  return {
    mode,
    endRule: saved?.endRule ?? base.endRule,
    categories: categories.length > 0 ? categories : base.categories,
    options: { ...base.options, ...(saved?.options ?? {}) },
  };
}

/** datos del perfil local que viajan con el jugador a la lobby */
function profileFields(): { avatar: string | null; bio: string | null } {
  const p = getProfile();
  return { avatar: p.avatar, bio: p.bio.trim() || null };
}

/* ---- roles ---- */

export function roleFor(
  s: GameState | null,
  assign: Record<string, number> | null,
  uid: string | null
): Role {
  const none: Role = { playerId: null, isPsychic: false, isGuesser: false, isRival: false, isMember: false };
  if (!s || !assign || !uid) return none;
  const playerId = assign[uid] ?? null;
  if (playerId === null) return none;
  if (s.mode === 'ffa') {
    if (s.players.length === 0) return { ...none, playerId, isMember: true };
    if (!s.players.some((p) => p.id === playerId)) return none; // entró tarde: aún no está en la partida
    const isPsychic = ffaPsychic(s).id === playerId;
    if (simultaneousGuess(s)) {
      const already = s.guesses ? s.guesses[playerId.toString()] !== undefined : false;
      const isGuesser = !isPsychic && !already && allGuessers(s).some((p) => p.id === playerId);
      // en "todos adivinan" no hay espectadores que apuesten
      return { playerId, isMember: true, isPsychic, isGuesser, isRival: false };
    }
    const isGuesser = ffaGuesser(s).id === playerId;
    return {
      playerId,
      isMember: true,
      isPsychic,
      isGuesser,
      isRival: !isPsychic && !isGuesser,
    };
  }
  if (s.teams.length === 0) return { ...none, playerId, isMember: true };
  if (!s.teams.some((t) => t.players.some((p) => p.id === playerId))) return none;
  const at = activeTeam(s);
  const rv = rivalTeam(s);
  const inActive = at.players.some((p) => p.id === playerId);
  const psychicId = teamPsychic(at).id;
  if (s.options.teamsAllGuess) {
    // cada equipo coloca una aguja: vale cualquiera de sus miembros, y no hay apuesta
    const mine = teamOf(s, playerId);
    const done = mine ? s.guesses?.[`t${mine.id}`] !== undefined : true;
    const isPsychic = inActive && psychicId === playerId;
    return {
      playerId,
      isMember: true,
      isPsychic,
      isGuesser: !isPsychic && !done && mine !== undefined,
      isRival: false,
    };
  }
  return {
    playerId,
    isMember: true,
    isPsychic: inActive && psychicId === playerId,
    isGuesser: inActive && psychicId !== playerId,
    isRival: rv.players.some((p) => p.id === playerId),
  };
}

/** uids autorizados para cada tipo de acción (validación del host) */
function actionAllowed(
  s: GameState,
  assign: Record<string, number>,
  meta: LobbyMeta,
  action: Action,
  senderUid: string
): boolean {
  const role = roleFor(s, assign, senderUid);
  if (!role.isMember && senderUid !== meta.hostUid) return false;
  switch (action.type) {
    case 'BEGIN_TURN':
      // auto-avance del host o "volver" del psíquico desde la carta personalizada
      return senderUid === meta.hostUid || role.isPsychic;
    case 'PICK_RANDOM':
    case 'PICK_CUSTOM':
    case 'SET_CUSTOM_CARD':
    case 'HIDE_ZONE':
    case 'CLUE_GIVEN':
      return role.isPsychic;
    case 'SET_NEEDLE':
    case 'CONFIRM_GUESS':
      return role.isGuesser || senderUid === meta.hostUid; // host: temporizador
    case 'FINALIZE_GUESSES':
      return senderUid === meta.hostUid; // cierre de "todos adivinan": timeout o todos enviados
    case 'PLACE_BET':
      return role.isRival;
    case 'REVEAL_FFA':
      return senderUid === meta.hostUid; // cierre de apuestas: timeout o todos votados
    case 'SHOW_STANDINGS':
    case 'NEXT_ROUND':
      return senderUid === meta.hostUid;
    case 'PLAY_AGAIN':
    case 'ADD_LATE':
    case 'KICK_PLAYERS':
    case 'RESTART_ROUND':
      return senderUid === meta.hostUid;
    default:
      return false;
  }
}

/* ---- hook principal ---- */

export function useLobby() {
  const [uid, setUid] = useState<string | null>(null);
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [meta, setMeta] = useState<LobbyMeta | null>(null);
  const [players, setPlayers] = useState<Record<string, LobbyPlayer>>({});
  const [config, setConfigState] = useState<NetConfig | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [assign, setAssign] = useState<Record<string, number> | null>(null);
  const [live, setLive] = useState<Live>({});
  const [error, setError] = useState<string | null>(null);

  const hostState = useRef<GameState | null>(null);
  const liveRef = useRef<Live>({});
  const timerHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimerPhase = useRef<string | null>(null);
  const metaRef = useRef<LobbyMeta | null>(null);
  const assignRef = useRef<Record<string, number> | null>(null);
  const configRef = useRef<NetConfig | null>(null);
  const playersRef = useRef<Record<string, LobbyPlayer>>({});
  /** uids a los que el host ya ha metido en la partida empezada (evita duplicarlos) */
  const lateAdded = useRef<Set<string>>(new Set());

  metaRef.current = meta;
  assignRef.current = assign;
  configRef.current = config;
  playersRef.current = players;
  liveRef.current = live;

  const isHost = uid !== null && meta?.hostUid === uid;

  useEffect(() => {
    if (!firebaseReady) return;
    ensureAuth()
      .then(setUid)
      .catch(() => setError('No se pudo conectar con Firebase.'));
  }, []);

  /* suscripciones a la lobby */
  useEffect(() => {
    if (!lobbyId) return;
    const db = getDb();
    const base = `lobbies/${lobbyId}`;
    const offs = [
      onValue(ref(db, `${base}/meta`), (s) => {
        const m = s.val() as LobbyMeta | null;
        setMeta(m);
        if (!m) {
          setLobbyId(null);
          setError('La lobby ya no existe.');
        }
      }),
      onValue(ref(db, `${base}/players`), (s) => {
        const v = (s.val() as Record<string, LobbyPlayer>) ?? {};
        // quien ya no está en la sala deja de contar como "ya metido": si vuelve, se le mete otra vez
        for (const u of [...lateAdded.current]) if (!v[u]) lateAdded.current.delete(u);
        setPlayers(v);
      }),
      onValue(ref(db, `${base}/config`), (s) => {
        const c = s.val() as NetConfig | null;
        if (c) {
          setConfigState({
            ...c,
            categories: c.categories ?? ALL_CATEGORIES,
            options: { ...DEFAULT_OPTIONS, ...(c.options ?? {}) },
          });
        }
      }),
      onValue(ref(db, `${base}/game`), (s) => setGame(normalizeGame(s.val()))),
      onValue(ref(db, `${base}/assign`), (s) => setAssign((s.val() as Record<string, number>) ?? null)),
      onValue(ref(db, `${base}/live`), (s) => setLive((s.val() as Live) ?? {})),
    ];
    return () => offs.forEach((off) => off());
  }, [lobbyId]);

  /* presencia + latido: `seen` dice cuándo se supo de ti por última vez, así se distingue
   * a quien está de verdad de un "online: true" que se quedó colgado. */
  useEffect(() => {
    if (!lobbyId || !uid) return;
    const db = getDb();
    const meRef = ref(db, `lobbies/${lobbyId}/players/${uid}`);
    const onlineRef = ref(db, `lobbies/${lobbyId}/players/${uid}/online`);
    const beat = () => {
      void update(meRef, { online: true, seen: Date.now() });
      // el anfitrión marca además la lobby entera: es la marca que mira la limpieza automática
      if (isHost) void update(ref(db, `lobbies/${lobbyId}/meta`), { updatedAt: Date.now() });
    };
    const off = onValue(ref(db, '.info/connected'), (s) => {
      if (s.val() === true) {
        void onDisconnect(onlineRef).set(false);
        beat();
      }
    });
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      off();
      clearInterval(id);
      // clave: si no se cancela, al cerrar la pestaña el servidor escribe igual en una lobby
      // ya borrada y la resucita como fantasma (media base llena de restos por esto)
      void onDisconnect(onlineRef).cancel();
    };
  }, [lobbyId, uid, isHost]);

  /* si soy el único dentro, la lobby se borra sola al cerrar la pestaña:
   * así no quedan lobbies vacías en la lista. En cuanto entra alguien más, se cancela. */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost) return;
    const lobbyRef = ref(getDb(), `lobbies/${lobbyId}`);
    const others = Object.entries(players).filter(([pUid, p]) => pUid !== uid && isReallyOnline(p)).length;
    if (others === 0) void onDisconnect(lobbyRef).remove();
    else void onDisconnect(lobbyRef).cancel();
    return () => {
      void onDisconnect(lobbyRef).cancel();
    };
  }, [lobbyId, uid, isHost, players]);

  /* detecta si nos han expulsado de la lobby (desaparecemos de players) */
  const wasMember = useRef(false);
  useEffect(() => {
    if (!lobbyId || !uid) {
      wasMember.current = false;
      return;
    }
    if (players[uid]) {
      wasMember.current = true;
      return;
    }
    if (wasMember.current) {
      wasMember.current = false;
      setLobbyId(null);
      setMeta(null);
      setGame(null);
      setAssign(null);
      hostState.current = null;
      setError('Te han expulsado de la lobby.');
    }
  }, [players, lobbyId, uid]);

  /* migración de host: el jugador online más antiguo reclama el puesto */
  useEffect(() => {
    if (!lobbyId || !uid || !meta || meta.hostUid === uid) return;
    const hostPlayer = players[meta.hostUid];
    if (hostPlayer && isReallyOnline(hostPlayer)) return;
    const candidates = Object.entries(players)
      .filter(([, p]) => isReallyOnline(p))
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    if (candidates.length === 0 || candidates[0]![0] !== uid) return;
    const t = setTimeout(() => {
      const db = getDb();
      void runTransaction(ref(db, `lobbies/${lobbyId}/meta/hostUid`), (cur) =>
        cur === meta.hostUid ? uid : cur
      );
    }, 4000);
    return () => clearTimeout(t);
  }, [lobbyId, uid, meta, players]);

  /* red de seguridad: si te toca ser host y aún no tienes estado (p. ej. te has quedado solo
   * en una partida ya empezada), se reconstruye en cuanto llega el estado publicado.
   * Solo cuando está vacío: así no se pisa el estado bueno con un eco viejo de la base. */
  useEffect(() => {
    if (!isHost) return;
    if (!game || hostState.current) return;
    hostState.current = {
      ...game,
      deck: shuffle(deckFor(game.categories ?? ALL_CATEGORIES)),
      deckIndex: 0,
    };
  }, [isHost, game]);

  /* bucle de host: consumir la cola de acciones */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost) return;
    const db = getDb();
    const base = `lobbies/${lobbyId}`;

    // al asumir como host, reconstruye estado + mazo local
    if (game && (!hostState.current || hostState.current.round !== game.round || hostState.current.phase !== game.phase)) {
      const cats = game.categories ?? ALL_CATEGORIES;
      hostState.current = { ...game, deck: shuffle(deckFor(cats)), deckIndex: 0 };
    }

    const publish = (st: GameState) => {
      hostState.current = st;
      void set(ref(db, `${base}/game`), stripDeck(st));
    };

    /** `force` = la acción la dispara un temporizador del host, no una persona: no se valida el rol
     *  (si no, el cierre de la pista o de la apuesta no funcionaba cuando el anfitrión no jugaba ese papel). */
    const applyAction = (action: Action, senderUid: string, force = false) => {
      const st = hostState.current;
      const m = metaRef.current;
      const asg = assignRef.current;
      if (!st || !m || !asg) return;
      if (!force && !actionAllowed(st, asg, m, action, senderUid)) return;
      let next = st;
      if (action.type === 'CONFIRM_GUESS') {
        const finalAngle = action.angle !== undefined ? action.angle : liveRef.current.needle;
        if (finalAngle !== undefined) {
          next = reducer(next, { type: 'SET_NEEDLE', angle: finalAngle });
        }
      }
      let finalAction = action;
      if (action.type === 'PLACE_BET') {
        const playerId = asg[senderUid];
        finalAction = { ...action, playerId };
      } else if (action.type === 'CONFIRM_GUESS' && simultaneousGuess(st)) {
        // online: siempre se atribuye al remitente, nunca al playerId que mande el cliente
        finalAction = { ...action, playerId: asg[senderUid] };
      }
      next = reducer(next, finalAction);
      if (next === st) return;
      publish(next);
      // meter gente nueva no cambia de fase: no hay que rearmar temporizadores ni borrar votos
      if (action.type !== 'ADD_LATE') afterApply(next);
    };

    const afterApply = (st: GameState) => {
      // sin handoff online: cada uno ve su pantalla
      if (st.phase === 'handoff') {
        if (timerHandle.current) {
          clearTimeout(timerHandle.current);
          timerHandle.current = null;
        }
        void remove(ref(db, `${base}/live/timerEnd`));
        lastTimerPhase.current = null;

        setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'handoff') {
            const next = reducer(cur, { type: 'BEGIN_TURN' });
            publish(next);
            afterApply(next);
          }
        }, 400);
        return;
      }

      // "todos adivinan" online: sin pase de turno, todos entran a la vez en 'guess'
      if (st.phase === 'guess-handoff') {
        if (timerHandle.current) {
          clearTimeout(timerHandle.current);
          timerHandle.current = null;
        }
        void remove(ref(db, `${base}/live/timerEnd`));
        lastTimerPhase.current = null;

        setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'guess-handoff') {
            const next = reducer(cur, { type: 'BEGIN_GUESS' });
            publish(next);
            afterApply(next);
          }
        }, 0);
        return;
      }

      // Si la fase no ha cambiado, no volvemos a iniciar el temporizador
      if (lastTimerPhase.current === st.phase) {
        return;
      }

      // Al cambiar de fase, limpiamos el temporizador anterior y los votos de saltar
      void remove(ref(db, `${base}/live/skipVotes`));
      if (timerHandle.current) {
        clearTimeout(timerHandle.current);
        timerHandle.current = null;
      }

      if (st.phase === 'clue' && (st.options.clueSecs ?? 0) > 0) {
        const secs = st.options.clueSecs;
        const end = Date.now() + secs * 1000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'clue' && cur.round === round) {
            // a cero se pasa solo a adivinar, aunque el psíquico no haya escrito nada
            applyAction({ type: 'CLUE_GIVEN', text: '' }, uid, true);
          }
        }, secs * 1000 + 300);
      } else if (st.phase === 'guess' && simultaneousGuess(st) && st.options.timerSecs > 0) {
        const end = Date.now() + st.options.timerSecs * 1000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'guess' && cur.round === round) {
            applyAction({ type: 'FINALIZE_GUESSES' }, uid, true);
          }
        }, st.options.timerSecs * 1000 + 300);
      } else if (st.phase === 'guess' && st.options.timerSecs > 0) {
        const end = Date.now() + st.options.timerSecs * 1000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'guess' && cur.round === round) {
            applyAction({ type: 'CONFIRM_GUESS' }, uid, true);
          }
        }, st.options.timerSecs * 1000 + 300);
      } else if (st.phase === 'rival-bet') {
        const end = Date.now() + 10000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'rival-bet' && cur.round === round) {
            if (cur.mode === 'ffa') {
              // por applyAction para que afterApply arme el auto-avance del reveal
              applyAction({ type: 'REVEAL_FFA' }, uid, true);
            } else {
              applyAction({ type: 'PLACE_BET', side: null as any }, uid, true);
            }
          }
        }, 10300);
      } else if (st.phase === 'reveal' && st.options.revealSecs > 0) {
        const end = Date.now() + st.options.revealSecs * 1000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'reveal' && cur.round === round) {
            applyAction({ type: 'SHOW_STANDINGS' }, uid, true);
          }
        }, st.options.revealSecs * 1000 + 300);
      } else if (st.phase === 'standings' && st.options.standingsSecs > 0) {
        const end = Date.now() + st.options.standingsSecs * 1000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'standings' && cur.round === round) {
            applyAction({ type: 'NEXT_ROUND' }, uid, true);
          }
        }, st.options.standingsSecs * 1000 + 300);
      } else {
        void remove(ref(db, `${base}/live/timerEnd`));
        lastTimerPhase.current = null;
      }
    };

    const actionsQuery = ref(db, `${base}/actions`);
    const off = onChildAdded(actionsQuery, (snap) => {
      const val = snap.val() as { uid: string; action: Action } | null;
      void remove(snap.ref);
      if (val?.action && val.uid) applyAction(val.action, val.uid);
    });
    return () => {
      off();
      if (timerHandle.current) clearTimeout(timerHandle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, uid, isHost]);

  /* ---- API ---- */

  const api = useMemo(() => {
    const requireUid = () => {
      if (!uid) throw new Error('sin uid');
      return uid;
    };

    return {
      async createLobby(opts: {
        lobbyName: string;
        playerName: string;
        isPublic: boolean;
        mode: Mode;
        maxPlayers?: number | null;
      }) {
        const me = requireUid();
        const db = getDb();
        const id = newLobbyId();
        const meta: LobbyMeta = {
          name: opts.lobbyName || `Partida de ${opts.playerName}`,
          public: opts.isPublic,
          key: opts.isPublic ? null : newKey(),
          hostUid: me,
          status: 'lobby',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          maxPlayers: opts.maxPlayers ?? null,
        };
        await set(ref(db, `lobbies/${id}`), {
          meta,
          config: netConfigFor(opts.mode),
          players: {
            [me]: { name: opts.playerName, online: true, joinedAt: Date.now(), ...profileFields() },
          },
        });
        setError(null);
        setLobbyId(id);
        saveRecentLobby({ id, name: meta.name, key: meta.key });
      },

      async joinLobby(id: string, key: string, playerName: string) {
        const me = requireUid();
        const db = getDb();
        const clean = id.trim().toUpperCase();
        const snap = await get(ref(db, `lobbies/${clean}/meta`));
        const m = snap.val() as LobbyMeta | null;
        if (!m) {
          setError('No existe ninguna lobby con ese ID.');
          forgetRecentLobby(clean);
          return;
        }
        if (!m.public && m.key !== key.trim()) {
          setError('Clave incorrecta.');
          return;
        }
        const roster = ((await get(ref(db, `lobbies/${clean}/players`))).val() ??
          {}) as Record<string, LobbyPlayer>;
        const already = Boolean(roster[me]);
        // con la partida empezada también se puede entrar: el anfitrión mete a la gente nueva
        // en la clasificación, y quien vuelve conserva sus puntos (sigue en `assign`)
        const connected = Object.values(roster).filter((p) => isReallyOnline(p)).length;
        if (!already && m.maxPlayers && connected >= m.maxPlayers) {
          setError(`La lobby está llena (${connected}/${m.maxPlayers}).`);
          return;
        }
        if (!already) {
          await set(ref(db, `lobbies/${clean}/players/${me}`), {
            name: playerName,
            online: true,
            joinedAt: Date.now(),
            ...profileFields(),
          });
        } else {
          // por si has cambiado la foto o la frase desde la última vez
          await update(ref(db, `lobbies/${clean}/players/${me}`), profileFields());
        }
        setError(null);
        setLobbyId(clean);
        saveRecentLobby({ id: clean, name: m.name, key: m.key });
      },

      leave() {
        const me = uid;
        const id = lobbyId;
        setLobbyId(null);
        setMeta(null);
        setGame(null);
        setAssign(null);
        setError(null);
        hostState.current = null;
        lateAdded.current = new Set();
        if (!me || !id) return;
        const db = getDb();
        const m = metaRef.current;
        const others = Object.entries(playersRef.current)
          .filter(([pUid, p]) => pUid !== me && isReallyOnline(p))
          .sort((a, b) => a[1].joinedAt - b[1].joinedAt);
        void remove(ref(db, `lobbies/${id}/players/${me}`));
        if (m?.hostUid === me) {
          if (others.length === 0) {
            void remove(ref(db, `lobbies/${id}`));
          } else {
            void set(ref(db, `lobbies/${id}/meta/hostUid`), others[0]![0]);
          }
        }
      },

      setConfig(patch: Partial<NetConfig>) {
        if (!lobbyId || !configRef.current) return;
        // al cambiar de modo, recupera los ajustes guardados de ese modo en vez de arrastrar los del
        // anterior, pero lo que venga explícito en el patch manda (p. ej. activar presentador)
        const finalPatch: Partial<NetConfig> =
          patch.mode && patch.mode !== configRef.current.mode
            ? { ...netConfigFor(patch.mode), ...patch }
            : patch;
        void update(ref(getDb(), `lobbies/${lobbyId}/config`), finalPatch);
        const merged: NetConfig = { ...configRef.current, ...finalPatch };
        savePrefs(merged.mode, {
          endRule: merged.endRule,
          categories: merged.categories,
          options: merged.options,
        });
      },

      setMaxPlayers(max: number | null) {
        const id = lobbyId;
        if (!id || metaRef.current?.hostUid !== uid) return;
        void set(ref(getDb(), `lobbies/${id}/meta/maxPlayers`), max);
      },

      assignTeam(playerUid: string, team: number) {
        if (!lobbyId) return;
        void set(ref(getDb(), `lobbies/${lobbyId}/players/${playerUid}/team`), team);
      },

      renameSelf(name: string) {
        if (!lobbyId || !uid) return;
        const trimmed = name.trim().slice(0, 16) || 'Anónimo';
        setProfile({ name: trimmed });
        void update(ref(getDb(), `lobbies/${lobbyId}/players/${uid}`), { name: trimmed });
      },

      kickPlayer(targetUid: string) {
        const id = lobbyId;
        if (!id || metaRef.current?.hostUid !== uid || targetUid === uid) return;
        const db = getDb();
        const pid = assignRef.current?.[targetUid];
        // con la partida en marcha además hay que sacarlo del juego, no solo de la sala
        if (pid !== undefined && metaRef.current?.status === 'playing') {
          // marcarlo evita que el auto-alta lo vuelva a meter en el hueco entre los dos borrados
          lateAdded.current.add(targetUid);
          void remove(ref(db, `lobbies/${id}/assign/${targetUid}`));
          void push(ref(db, `lobbies/${id}/actions`), {
            uid,
            action: { type: 'KICK_PLAYERS', ids: [pid] },
          });
        }
        void remove(ref(db, `lobbies/${id}/players/${targetUid}`));
      },

      restartRound() {
        const id = lobbyId;
        if (!id || !uid || metaRef.current?.hostUid !== uid) return;
        void push(ref(getDb(), `lobbies/${id}/actions`), { uid, action: { type: 'RESTART_ROUND' } });
      },

      shuffleFfaOrder() {
        const id = lobbyId;
        if (!id || metaRef.current?.hostUid !== uid) return;
        const db = getDb();
        const onlineEntries = Object.entries(playersRef.current).filter(([, p]) => isReallyOnline(p));
        const shuffled = shuffle(onlineEntries);
        const updates: Record<string, number> = {};
        shuffled.forEach(([pUid], idx) => {
          updates[`lobbies/${id}/players/${pUid}/order`] = idx;
        });
        void update(ref(db), updates);
      },

      distributeTeamsOfTwo() {
        const id = lobbyId;
        if (!id || metaRef.current?.hostUid !== uid) return;
        const db = getDb();
        const onlineEntries = Object.entries(playersRef.current).filter(([, p]) => isReallyOnline(p));
        const shuffled = shuffle(onlineEntries);
        const updates: Record<string, number> = {};
        shuffled.forEach(([pUid], idx) => {
          const teamIdx = Math.floor(idx / 2);
          updates[`lobbies/${id}/players/${pUid}/team`] = teamIdx;
          updates[`lobbies/${id}/players/${pUid}/order`] = idx % 2;
        });
        void update(ref(db), updates);
      },

      shuffleTeamInternalOrder() {
        const id = lobbyId;
        if (!id || metaRef.current?.hostUid !== uid) return;
        const db = getDb();
        const onlineEntries = Object.entries(playersRef.current).filter(([, p]) => isReallyOnline(p));
        const teamsMap = new Map<number, [string, LobbyPlayer][]>();
        for (const e of onlineEntries) {
          const t = e[1].team ?? 0;
          teamsMap.set(t, [...(teamsMap.get(t) ?? []), e]);
        }
        const updates: Record<string, number> = {};
        for (const [, teamPlayers] of teamsMap) {
          const shuffled = shuffle(teamPlayers);
          shuffled.forEach(([pUid], idx) => {
            updates[`lobbies/${id}/players/${pUid}/order`] = idx;
          });
        }
        void update(ref(db), updates);
      },

      /** Empieza (o rehace) la partida con la gente conectada. Devuelve false si no se puede. */
      startGame(): boolean {
        const me = requireUid();
        const id = lobbyId;
        const conf = configRef.current;
        if (!id || !conf || metaRef.current?.hostUid !== me) return false;
        const db = getDb();
        const entries = Object.entries(playersRef.current)
          .filter(([, p]) => isReallyOnline(p))
          .sort((a, b) => (a[1].order ?? a[1].joinedAt) - (b[1].order ?? b[1].joinedAt));
        const assignMap: Record<string, number> = {};
        let base: GameState = {
          ...initialState,
          mode: conf.mode,
          endRule: conf.endRule,
          categories: conf.categories,
          options: conf.options,
          phase: 'setup',
        };
        if (conf.mode === 'ffa') {
          if (entries.length < 2) return false;
          base.players = entries.map(([pUid, p], i) => {
            assignMap[pUid] = i + 1;
            return { id: i + 1, name: p.name, score: 0 };
          });
          base.nextId = entries.length + 1;
          // modo presentador: presenta el anfitrión, que es quien lleva el directo
          if (conf.options.fixedPsychic) {
            base.psychicId = assignMap[me] ?? base.players[0]?.id ?? null;
          }
        } else {
          const groups = new Map<number, [string, LobbyPlayer][]>();
          for (const e of entries) {
            const t = e[1].team ?? 0;
            groups.set(t, [...(groups.get(t) ?? []), e]);
          }
          const teamIdxs = [...groups.keys()].sort((a, b) => a - b);
          if (teamIdxs.length < 2 || teamIdxs.some((ti) => groups.get(ti)!.length < 2)) return false;
          let nid = 1;
          base.teams = teamIdxs.map((ti, i) => {
            const teamId = nid++;
            const sortedTeamPlayers = groups
              .get(ti)!
              .sort((a, b) => (a[1].order ?? a[1].joinedAt) - (b[1].order ?? b[1].joinedAt));
            return {
              id: teamId,
              name: `Equipo ${i + 1}`,
              score: 0,
              psychicIdx: 0,
              players: sortedTeamPlayers.map(([pUid, p]) => {
                const pid = nid++;
                assignMap[pUid] = pid;
                return { id: pid, name: p.name };
              }),
            };
          });
          base.nextId = nid;
        }
        const st = reducer(base, { type: 'START_GAME' });
        if (st.phase !== 'handoff') return false;
        hostState.current = st;
        lateAdded.current = new Set();
        void update(ref(db, `lobbies/${id}`), {
          assign: assignMap,
          game: stripDeck(st),
          'meta/status': 'playing',
          actions: null,
          live: null,
        });
        // arranca el auto-avance del handoff
        setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'handoff') {
            const next = reducer(cur, { type: 'BEGIN_TURN' });
            hostState.current = next;
            void set(ref(db, `lobbies/${id}/game`), stripDeck(next));
          }
        }, 400);
        return true;
      },

      sendAction(action: Action) {
        const me = uid;
        if (!me || !lobbyId) return;
        void push(ref(getDb(), `lobbies/${lobbyId}/actions`), { uid: me, action });
      },

      setLiveNeedle(angle: number) {
        if (!lobbyId) return;
        void set(ref(getDb(), `lobbies/${lobbyId}/live/needle`), Math.round(angle * 10) / 10);
      },

      setSkipVote(voted: boolean) {
        const me = uid;
        const id = lobbyId;
        if (!me || !id) return;
        const voteRef = ref(getDb(), `lobbies/${id}/live/skipVotes/${me}`);
        if (voted) {
          void set(voteRef, true);
        } else {
          void remove(voteRef);
        }
      },

      async listPublic(): Promise<PublicLobby[]> {
        const db = getDb();
        const q = query(ref(db, 'lobbies'), orderByChild('meta/public'), equalTo(true));
        const snap = await get(q);
        const out: PublicLobby[] = [];
        const now = Date.now();
        const dayAgo = now - 24 * 3600 * 1000;
        const basura: string[] = [];
        snap.forEach((child) => {
          const v = child.val() as {
            meta: LobbyMeta;
            players?: Record<string, LobbyPlayer>;
            config?: NetConfig;
            game?: Partial<GameState> | null;
          };
          // última señal de vida de la lobby: el latido más reciente de cualquiera
          const beats = Object.values(v.players ?? {}).map(lastSeen);
          const alive = Math.max(v.meta?.createdAt ?? 0, ...(beats.length > 0 ? beats : [0]));
          if (now - alive > DEAD_MS) {
            basura.push(child.key!);
            return;
          }
          if (!v.meta || v.meta.createdAt <= dayAgo) return;
          const playing = v.meta.status === 'playing';
          const connected = Object.values(v.players ?? {})
            .filter((p) => isReallyOnline(p, now))
            .sort((a, b) => a.joinedAt - b.joinedAt);
          // lobby fantasma: se creó y se fueron todos, no tiene sentido enseñarla
          if (connected.length === 0) return;
          // las partidas en marcha se siguen enseñando para poder entrar a mitad,
          // con la ronda por la que van; las acabadas no
          let round: number | null = null;
          let total: number | null = null;
          let goal: number | null = null;
          let tiebreak = false;
          if (playing) {
            const g = normalizeGame(v.game ?? null);
            if (!g || g.phase === 'end') return;
            round = g.round + 1;
            tiebreak = Boolean(g.tiebreakKeys);
            total = tiebreak ? null : totalRounds(g);
            goal = g.endRule.kind === 'points' ? g.endRule.goal : null;
          }
          out.push({
            id: child.key!,
            name: v.meta.name,
            players: connected.length,
            mode: v.config?.mode ?? 'ffa',
            maxPlayers: v.meta.maxPlayers ?? null,
            faces: connected
              .slice(0, MAX_FACES)
              .map((p) => ({ name: p.name, avatar: p.avatar ?? null })),
            status: playing ? 'playing' : 'lobby',
            round,
            total,
            goal,
            tiebreak,
          });
        });
        // recogida de basura: las lobbies sin señales de vida se borran solas (unas pocas por
        // pasada para no liarla). Necesita las reglas nuevas; si no, falla en silencio.
        for (const dead of basura.slice(0, 8)) {
          remove(ref(db, `lobbies/${dead}`)).catch(() => {});
        }
        // primero las que aún no han empezado: son las más fáciles de aprovechar
        return out
          .reverse()
          .sort((a, b) => Number(a.status === 'playing') - Number(b.status === 'playing'))
          .slice(0, 20);
      },

      /** Estado actual de unas lobbies concretas (para el historial de "donde has jugado"). */
      async lobbyStatus(ids: string[]): Promise<Record<string, PublicLobby | null>> {
        const db = getDb();
        const now = Date.now();
        const pairs = await Promise.all(
          ids.slice(0, 12).map(async (id) => {
            try {
              const snap = await get(ref(db, `lobbies/${id}`));
              const v = snap.val() as {
                meta?: LobbyMeta;
                players?: Record<string, LobbyPlayer>;
                config?: NetConfig;
                game?: Partial<GameState> | null;
              } | null;
              if (!v?.meta) return [id, null] as const;
              const connected = Object.values(v.players ?? {})
                .filter((p) => isReallyOnline(p, now))
                .sort((a, b) => a.joinedAt - b.joinedAt);
              if (connected.length === 0) return [id, null] as const;
              const playing = v.meta.status === 'playing';
              let round: number | null = null;
              let total: number | null = null;
              let goal: number | null = null;
              let tiebreak = false;
              if (playing) {
                const g = normalizeGame(v.game ?? null);
                if (!g || g.phase === 'end') return [id, null] as const;
                round = g.round + 1;
                tiebreak = Boolean(g.tiebreakKeys);
                total = tiebreak ? null : totalRounds(g);
                goal = g.endRule.kind === 'points' ? g.endRule.goal : null;
              }
              const lobby: PublicLobby = {
                id,
                name: v.meta.name,
                players: connected.length,
                mode: v.config?.mode ?? 'ffa',
                maxPlayers: v.meta.maxPlayers ?? null,
                faces: connected
                  .slice(0, MAX_FACES)
                  .map((p) => ({ name: p.name, avatar: p.avatar ?? null })),
                status: playing ? 'playing' : 'lobby',
                round,
                total,
                goal,
                tiebreak,
              };
              return [id, lobby] as const;
            } catch {
              return [id, null] as const;
            }
          })
        );
        return Object.fromEntries(pairs);
      },

      backToLobby() {
        const me = uid;
        const id = lobbyId;
        if (!me || !id || metaRef.current?.hostUid !== me) return;
        hostState.current = null;
        lateAdded.current = new Set();
        void update(ref(getDb(), `lobbies/${id}`), {
          'meta/status': 'lobby',
          game: null,
          assign: null,
          actions: null,
          live: null,
        });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, lobbyId]);

  /* host: avanzar fase si todos los online han votado en ffa */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost || !game || game.phase !== 'rival-bet' || game.mode !== 'ffa') return;
    const db = getDb();
    const base = `lobbies/${lobbyId}`;
    const asg = assign;
    if (!asg) return;

    const onlineBystanders = Object.entries(players)
      .filter(([pUid, p]) => {
        if (!isReallyOnline(p)) return false;
        const pId = asg[pUid];
        return pId !== undefined && pId !== null && ffaBystanders(game).some((b) => b.id === pId);
      });

    const allVoted = onlineBystanders.every(([pUid]) => {
      const pId = asg[pUid];
      return game.bets && game.bets[pId!.toString()] !== undefined;
    });

    if (allVoted || onlineBystanders.length === 0) {
      if (hostState.current && hostState.current.phase === 'rival-bet' && hostState.current.round === game.round) {
        // por la cola: applyAction valida, publica y afterApply arma el auto-avance
        void push(ref(db, `${base}/actions`), { uid, action: { type: 'REVEAL_FFA' } });
      }
    }
  }, [players, lobbyId, uid, isHost, game, assign]);

  /* host: cierra "todos adivinan" en cuanto todos los guessers online han confirmado
   * (los desconectados se rellenan con la aguja al centro, sin bloquear la ronda) */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost || !game || game.phase !== 'guess' || !simultaneousGuess(game))
      return;
    const asg = assign;
    if (!asg) return;

    let allSubmitted: boolean;
    if (game.mode === 'teams') {
      // por equipos: basta con que cada equipo que tenga a alguien conectado haya colocado aguja
      const teamsWithPeople = guessingTeams(game).filter((t) =>
        Object.entries(players).some(([pUid, p]) => {
          const pId = asg[pUid];
          return isReallyOnline(p) && pId !== undefined && t.players.some((tp) => tp.id === pId);
        })
      );
      // sin nadie conectado a quien esperar, se cierra la ronda igual (agujas al centro)
      allSubmitted = teamsWithPeople.every((t) => game.guesses?.[`t${t.id}`] !== undefined);
    } else {
      const gs = allGuessers(game);
      const onlineGuessers = Object.entries(players).filter(([pUid, p]) => {
        if (!isReallyOnline(p)) return false;
        const pId = asg[pUid];
        return pId !== undefined && pId !== null && gs.some((g) => g.id === pId);
      });
      // si no queda ningún adivinador conectado, no tiene sentido esperar: se resuelve la ronda
      allSubmitted = onlineGuessers.every(([pUid]) => {
        const pId = asg[pUid];
        return game.guesses && game.guesses[pId!.toString()] !== undefined;
      });
    }

    if (
      allSubmitted &&
      hostState.current &&
      hostState.current.phase === 'guess' &&
      hostState.current.round === game.round
    ) {
      void push(ref(getDb(), `lobbies/${lobbyId}/actions`), { uid, action: { type: 'FINALIZE_GUESSES' } });
    }
  }, [players, lobbyId, uid, isHost, game, assign]);

  /* host: mete en la partida a quien haya entrado con ella ya empezada.
   * Se hace en la clasificación, así nadie aparece a mitad de ronda: entran en la siguiente. */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost || !game || game.phase !== 'standings') return;
    const asg = assign ?? {};
    const pending = Object.entries(players).filter(
      ([pUid, p]) => isReallyOnline(p) && asg[pUid] === undefined && !lateAdded.current.has(pUid)
    );
    if (pending.length === 0) return;

    let nid = game.nextId;
    const entries: { id: number; name: string; teamId?: number }[] = [];
    const assignPatch: Record<string, number> = {};
    // en equipos van al que menos gente tenga, para no desequilibrar
    const sizes = new Map(game.teams.map((t) => [t.id, t.players.length]));
    for (const [pUid, p] of pending) {
      const id = nid++;
      if (game.mode === 'teams') {
        const smallest = [...sizes.entries()].sort((a, b) => a[1] - b[1])[0];
        if (!smallest) break;
        sizes.set(smallest[0], smallest[1] + 1);
        entries.push({ id, name: p.name, teamId: smallest[0] });
      } else {
        entries.push({ id, name: p.name });
      }
      assignPatch[pUid] = id;
      lateAdded.current.add(pUid);
    }
    if (entries.length === 0) return;
    const db = getDb();
    void push(ref(db, `lobbies/${lobbyId}/actions`), { uid, action: { type: 'ADD_LATE', entries } });
    void update(ref(db, `lobbies/${lobbyId}/assign`), assignPatch);
  }, [players, lobbyId, uid, isHost, game, assign]);

  /* host: auto-avanzar si los votos de saltar alcanzan el % fijado */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost || !game) return;
    if (!['reveal', 'standings'].includes(game.phase)) return;
    if (game.options.advanceMode !== 'vote') return;

    const onlinePlayers = Object.entries(players).filter(([, p]) => isReallyOnline(p));
    const totalOnline = onlinePlayers.length;
    if (totalOnline === 0) return;

    const votesMap = live.skipVotes ?? {};
    const votedCount = onlinePlayers.filter(([pUid]) => votesMap[pUid] === true).length;
    const targetPct = game.options.skipVotePct ?? 50;
    const currentPct = (votedCount / totalOnline) * 100;

    if (currentPct >= targetPct) {
      const db = getDb();
      const base = `lobbies/${lobbyId}`;
      if (hostState.current && hostState.current.round === game.round) {
        if (game.phase === 'reveal' && hostState.current.phase === 'reveal') {
          void push(ref(db, `${base}/actions`), { uid, action: { type: 'SHOW_STANDINGS' } });
        } else if (game.phase === 'standings' && hostState.current.phase === 'standings') {
          void push(ref(db, `${base}/actions`), { uid, action: { type: 'NEXT_ROUND' } });
        }
      }
    }
  }, [players, live.skipVotes, lobbyId, uid, isHost, game]);

  return {
    ready: firebaseReady,
    uid,
    lobbyId,
    meta,
    players,
    config,
    game,
    assign,
    live,
    error,
    isHost,
    setError,
    ...api,
  };
}
