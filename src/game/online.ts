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
  activeTeam,
  rivalTeam,
  teamPsychic,
  teamGuessers,
  type Action,
} from './reducer';
import { cardsFor, shuffle, type CategoryId } from '../data/cards';
import type { EndRule, GameState, Mode, Options } from './types';

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
};

export type NetConfig = {
  mode: Mode;
  endRule: EndRule;
  categories: CategoryId[];
  options: Options;
};

export type Live = { needle?: number; timerEnd?: number };

export type PublicLobby = { id: string; name: string; players: number; mode: Mode };

export type Role = {
  playerId: number | null;
  isPsychic: boolean;
  isGuesser: boolean;
  isRival: boolean;
  isMember: boolean;
};

const REJOIN_KEY = 'frecuencia-online-v1';
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
    case 'PLACE_BET':
      return role.isRival;
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
      localStorage.removeItem(REJOIN_KEY);
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
      if (action.type === 'CONFIRM_GUESS' && liveRef.current.needle !== undefined) {
        next = reducer(next, { type: 'SET_NEEDLE', angle: liveRef.current.needle });
      }
      let finalAction = action;
      if (action.type === 'PLACE_BET') {
        const playerId = asg[senderUid];
        finalAction = { ...action, playerId };
      }
      next = reducer(next, finalAction);
      if (next === st) return;
      publish(next);
      afterApply(next);
    };

    const afterApply = (st: GameState) => {
      // sin handoff online: cada uno ve su pantalla
      if (st.phase === 'handoff') {
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
      // temporizador
      if (timerHandle.current) {
        clearTimeout(timerHandle.current);
        timerHandle.current = null;
      }
      if (st.phase === 'guess' && st.options.timerSecs > 0) {
        const end = Date.now() + st.options.timerSecs * 1000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'guess' && cur.round === round) {
            applyAction({ type: 'CONFIRM_GUESS' }, uid);
          }
        }, st.options.timerSecs * 1000 + 300);
      } else if (st.phase === 'rival-bet') {
        const end = Date.now() + 5000;
        void set(ref(db, `${base}/live/timerEnd`), end);
        const round = st.round;
        timerHandle.current = setTimeout(() => {
          const cur = hostState.current;
          if (cur && cur.phase === 'rival-bet' && cur.round === round) {
            if (cur.mode === 'ffa') {
              const next = reducer(cur, { type: 'REVEAL_FFA' });
              hostState.current = next;
              void set(ref(db, `${base}/game`), stripDeck(next));
              void remove(ref(db, `${base}/live/timerEnd`));
            } else {
              applyAction({ type: 'PLACE_BET', side: null as any }, uid);
            }
          }
        }, 5300);
      } else {
        void remove(ref(db, `${base}/live/timerEnd`));
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
          config: defaultNetConfig(opts.mode),
          players: { [me]: { name: opts.playerName, online: true, joinedAt: Date.now() } },
        });
        localStorage.setItem(REJOIN_KEY, JSON.stringify({ id, key: meta.key }));
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
        localStorage.setItem(REJOIN_KEY, JSON.stringify({ id: clean, key: m.key }));
        setError(null);
        setLobbyId(clean);
      },

      leave() {
        const me = uid;
        const id = lobbyId;
        localStorage.removeItem(REJOIN_KEY);
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
        void update(ref(getDb(), `lobbies/${lobbyId}/config`), patch);
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

      startGame() {
        const me = requireUid();
        const id = lobbyId;
        const conf = configRef.current;
        if (!id || !conf || metaRef.current?.hostUid !== me) return;
        const db = getDb();
        const entries = Object.entries(playersRef.current)
          .filter(([, p]) => p.online)
          .sort((a, b) => a[1].joinedAt - b[1].joinedAt);
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
            return {
              id: teamId,
              name: `Equipo ${i + 1}`,
              score: 0,
              psychicIdx: 0,
              players: groups.get(ti)!.map(([pUid, p]) => {
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

      rejoinInfo(): { id: string; key: string | null } | null {
        try {
          const raw = localStorage.getItem(REJOIN_KEY);
          return raw ? (JSON.parse(raw) as { id: string; key: string | null }) : null;
        } catch {
          return null;
        }
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
      const next = reducer(game, { type: 'REVEAL_FFA' });
      if (hostState.current && hostState.current.phase === 'rival-bet' && hostState.current.round === game.round) {
        hostState.current = next;
        void set(ref(db, `${base}/game`), stripDeck(next));
        void remove(ref(db, `${base}/live/timerEnd`));
        if (timerHandle.current) {
          clearTimeout(timerHandle.current);
          timerHandle.current = null;
        }
      }
    }
  }, [players, lobbyId, uid, isHost, game, assign]);

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
