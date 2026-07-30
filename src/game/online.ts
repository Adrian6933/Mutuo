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
  type Action,
} from './reducer';
import { cardsFor, shuffle, type CategoryId } from '../data/cards';
import type { EndRule, GameState, Mode, Options } from './types';
import { savePrefs, loadPrefs } from './storage';

/* ---- tipos de red ---- */

export type LobbyStatus = 'lobby' | 'playing';

export type LobbyMeta = {
  name: string;
  public: boolean;
  key: string | null;
  hostUid: string;
  status: LobbyStatus;
  createdAt: number;
};

export type LobbyPlayer = {
  name: string;
  online: boolean;
  joinedAt: number;
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

export type PublicLobby = { id: string; name: string; players: number; mode: Mode };

export type Role = {
  playerId: number | null;
  isPsychic: boolean;
  isGuesser: boolean;
  isRival: boolean;
  isMember: boolean;
};

const NICK_KEY = 'frecuencia-nick';

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
  return {
    mode,
    endRule: saved?.endRule ?? base.endRule,
    categories: saved?.categories ?? base.categories,
    options: { ...base.options, ...(saved?.options ?? {}) },
  };
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
    const isPsychic = ffaPsychic(s).id === playerId;
    if (s.options.allGuess) {
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
  const at = activeTeam(s);
  const rv = rivalTeam(s);
  const inActive = at.players.some((p) => p.id === playerId);
  const psychicId = teamPsychic(at).id;
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
      onValue(ref(db, `${base}/players`), (s) => setPlayers((s.val() as Record<string, LobbyPlayer>) ?? {})),
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

  /* presencia */
  useEffect(() => {
    if (!lobbyId || !uid) return;
    const db = getDb();
    const onlineRef = ref(db, `lobbies/${lobbyId}/players/${uid}/online`);
    const off = onValue(ref(db, '.info/connected'), (s) => {
      if (s.val() === true) {
        void onDisconnect(onlineRef).set(false);
        void set(onlineRef, true);
      }
    });
    return () => off();
  }, [lobbyId, uid]);

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
    if (hostPlayer && hostPlayer.online) return;
    const candidates = Object.entries(players)
      .filter(([, p]) => p.online)
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

  /* bucle de host: consumir la cola de acciones */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost) return;
    const db = getDb();
    const base = `lobbies/${lobbyId}`;

    // al asumir como host, reconstruye estado + mazo local
    if (game && (!hostState.current || hostState.current.round !== game.round || hostState.current.phase !== game.phase)) {
      const cats = game.categories ?? ALL_CATEGORIES;
      hostState.current = { ...game, deck: shuffle(cardsFor(cats)), deckIndex: 0 };
    }

    const publish = (st: GameState) => {
      hostState.current = st;
      void set(ref(db, `${base}/game`), stripDeck(st));
    };

    const applyAction = (action: Action, senderUid: string) => {
      const st = hostState.current;
      const m = metaRef.current;
      const asg = assignRef.current;
      if (!st || !m || !asg) return;
      if (!actionAllowed(st, asg, m, action, senderUid)) return;
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
      } else if (action.type === 'CONFIRM_GUESS' && st.mode === 'ffa' && st.options.allGuess) {
        // online: siempre se atribuye al remitente, nunca al playerId que mande el cliente
        finalAction = { ...action, playerId: asg[senderUid] };
      }
      next = reducer(next, finalAction);
      if (next === st) return;
      publish(next);
      afterApply(next);
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

      if (st.phase === 'clue') {
        const end = Date.now() + 25000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'clue' && cur.round === round) {
            applyAction({ type: 'CLUE_GIVEN', text: '' }, uid);
          }
        }, 25300);
      } else if (st.phase === 'guess' && st.mode === 'ffa' && st.options.allGuess && st.options.timerSecs > 0) {
        const end = Date.now() + st.options.timerSecs * 1000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        lastTimerPhase.current = st.phase;
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'guess' && cur.round === round) {
            applyAction({ type: 'FINALIZE_GUESSES' }, uid);
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
            applyAction({ type: 'CONFIRM_GUESS' }, uid);
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
              applyAction({ type: 'REVEAL_FFA' }, uid);
            } else {
              applyAction({ type: 'PLACE_BET', side: null as any }, uid);
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
            applyAction({ type: 'SHOW_STANDINGS' }, uid);
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
            applyAction({ type: 'NEXT_ROUND' }, uid);
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
      async createLobby(opts: { lobbyName: string; playerName: string; isPublic: boolean; mode: Mode }) {
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
        };
        await set(ref(db, `lobbies/${id}`), {
          meta,
          config: netConfigFor(opts.mode),
          players: { [me]: { name: opts.playerName, online: true, joinedAt: Date.now() } },
        });
        setError(null);
        setLobbyId(id);
      },

      async joinLobby(id: string, key: string, playerName: string) {
        const me = requireUid();
        const db = getDb();
        const clean = id.trim().toUpperCase();
        const snap = await get(ref(db, `lobbies/${clean}/meta`));
        const m = snap.val() as LobbyMeta | null;
        if (!m) {
          setError('No existe ninguna lobby con ese ID.');
          return;
        }
        if (!m.public && m.key !== key.trim()) {
          setError('Clave incorrecta.');
          return;
        }
        const already = (await get(ref(db, `lobbies/${clean}/players/${me}`))).exists();
        if (m.status === 'playing' && !already) {
          setError('Esa partida ya ha empezado.');
          return;
        }
        if (!already) {
          await set(ref(db, `lobbies/${clean}/players/${me}`), {
            name: playerName,
            online: true,
            joinedAt: Date.now(),
          });
        }
        setError(null);
        setLobbyId(clean);
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
        if (!me || !id) return;
        const db = getDb();
        const m = metaRef.current;
        const others = Object.entries(playersRef.current)
          .filter(([pUid, p]) => pUid !== me && p.online)
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
        // al cambiar de modo, recupera los ajustes guardados de ese modo en vez de arrastrar los del anterior
        const finalPatch: Partial<NetConfig> =
          patch.mode && patch.mode !== configRef.current.mode ? netConfigFor(patch.mode) : patch;
        void update(ref(getDb(), `lobbies/${lobbyId}/config`), finalPatch);
        const merged: NetConfig = { ...configRef.current, ...finalPatch };
        savePrefs(merged.mode, {
          endRule: merged.endRule,
          categories: merged.categories,
          options: merged.options,
        });
      },

      assignTeam(playerUid: string, team: number) {
        if (!lobbyId) return;
        void set(ref(getDb(), `lobbies/${lobbyId}/players/${playerUid}/team`), team);
      },

      renameSelf(name: string) {
        if (!lobbyId || !uid) return;
        const trimmed = name.trim().slice(0, 16) || 'Anónimo';
        localStorage.setItem(NICK_KEY, trimmed);
        void update(ref(getDb(), `lobbies/${lobbyId}/players/${uid}`), { name: trimmed });
      },

      kickPlayer(targetUid: string) {
        const id = lobbyId;
        if (!id || metaRef.current?.hostUid !== uid || targetUid === uid) return;
        void remove(ref(getDb(), `lobbies/${id}/players/${targetUid}`));
      },

      shuffleFfaOrder() {
        const id = lobbyId;
        if (!id || metaRef.current?.hostUid !== uid) return;
        const db = getDb();
        const onlineEntries = Object.entries(playersRef.current).filter(([, p]) => p.online);
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
        const onlineEntries = Object.entries(playersRef.current).filter(([, p]) => p.online);
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
        const onlineEntries = Object.entries(playersRef.current).filter(([, p]) => p.online);
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

      startGame() {
        const me = requireUid();
        const id = lobbyId;
        const conf = configRef.current;
        if (!id || !conf || metaRef.current?.hostUid !== me) return;
        const db = getDb();
        const entries = Object.entries(playersRef.current)
          .filter(([, p]) => p.online)
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
          if (entries.length < 2) return;
          base.players = entries.map(([pUid, p], i) => {
            assignMap[pUid] = i + 1;
            return { id: i + 1, name: p.name, score: 0 };
          });
          base.nextId = entries.length + 1;
        } else {
          const groups = new Map<number, [string, LobbyPlayer][]>();
          for (const e of entries) {
            const t = e[1].team ?? 0;
            groups.set(t, [...(groups.get(t) ?? []), e]);
          }
          const teamIdxs = [...groups.keys()].sort((a, b) => a - b);
          if (teamIdxs.length < 2 || teamIdxs.some((ti) => groups.get(ti)!.length < 2)) return;
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
        if (st.phase !== 'handoff') return;
        hostState.current = st;
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
        const dayAgo = Date.now() - 24 * 3600 * 1000;
        snap.forEach((child) => {
          const v = child.val() as {
            meta: LobbyMeta;
            players?: Record<string, LobbyPlayer>;
            config?: NetConfig;
          };
          if (v.meta?.status === 'lobby' && v.meta.createdAt > dayAgo) {
            out.push({
              id: child.key!,
              name: v.meta.name,
              players: Object.values(v.players ?? {}).filter((p) => p.online).length,
              mode: v.config?.mode ?? 'ffa',
            });
          }
        });
        return out.reverse().slice(0, 20);
      },

      backToLobby() {
        const me = uid;
        const id = lobbyId;
        if (!me || !id || metaRef.current?.hostUid !== me) return;
        hostState.current = null;
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
        if (!p.online) return false;
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
    if (
      !lobbyId ||
      !uid ||
      !isHost ||
      !game ||
      game.phase !== 'guess' ||
      game.mode !== 'ffa' ||
      !game.options.allGuess
    )
      return;
    const asg = assign;
    if (!asg) return;

    const gs = allGuessers(game);
    const onlineGuessers = Object.entries(players).filter(([pUid, p]) => {
      if (!p.online) return false;
      const pId = asg[pUid];
      return pId !== undefined && pId !== null && gs.some((g) => g.id === pId);
    });
    const allSubmitted =
      onlineGuessers.length > 0 &&
      onlineGuessers.every(([pUid]) => {
        const pId = asg[pUid];
        return game.guesses && game.guesses[pId!.toString()] !== undefined;
      });

    if (
      allSubmitted &&
      hostState.current &&
      hostState.current.phase === 'guess' &&
      hostState.current.round === game.round
    ) {
      void push(ref(getDb(), `lobbies/${lobbyId}/actions`), { uid, action: { type: 'FINALIZE_GUESSES' } });
    }
  }, [players, lobbyId, uid, isHost, game, assign]);

  /* host: auto-avanzar si los votos de saltar alcanzan el % fijado */
  useEffect(() => {
    if (!lobbyId || !uid || !isHost || !game) return;
    if (!['reveal', 'standings'].includes(game.phase)) return;
    if (game.options.advanceMode !== 'vote') return;

    const onlinePlayers = Object.entries(players).filter(([, p]) => p.online);
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
