import { useEffect, useRef, useState } from 'react';
import type { LobbyMeta, LobbyPlayer } from '../game/online';

/* Avisos de "fulano se ha ido" y de cambio de anfitrión, para no quedarte a cuadros
 * cuando la partida cambia de manos sin decir nada. */

type Notice = { id: number; text: string };

const LIFETIME = 6000;

/** Qué contar tras un cambio en la lobby: quién entró, quién se fue y quién manda ahora. */
export function diffNotices(
  prev: Record<string, LobbyPlayer>,
  players: Record<string, LobbyPlayer>,
  prevHostUid: string | null,
  hostUid: string | null,
  uid: string
): string[] {
  const texts: string[] = [];
  const wasOnline = (u: string) => Boolean(prev[u]?.online);
  const isOnline = (u: string) => Boolean(players[u]?.online);
  const nameOf = (u: string) => players[u]?.name ?? prev[u]?.name ?? 'Alguien';

  const hostChanged = hostUid !== null && prevHostUid !== null && hostUid !== prevHostUid;

  for (const u of new Set([...Object.keys(prev), ...Object.keys(players)])) {
    if (u === uid) continue;
    // al anfitrión que se va lo anuncia el mensaje de cambio de mando
    if (hostChanged && u === prevHostUid) continue;
    if (wasOnline(u) && !isOnline(u)) texts.push(`${nameOf(u)} se ha ido.`);
    // vale tanto para los nuevos como para quien vuelve tras irse (ahora se puede entrar a mitad)
    else if (!wasOnline(u) && isOnline(u)) texts.push(`${nameOf(u)} se ha unido.`);
  }

  if (hostChanged) {
    const oldName = prev[prevHostUid!]?.name ?? 'El anfitrión';
    const gone = !isOnline(prevHostUid!);
    const newName = hostUid === uid ? 'Ahora mandas tú' : `Ahora manda ${nameOf(hostUid!)}`;
    texts.push(gone ? `${oldName} se ha ido. ${newName}.` : `${newName}.`);
  }
  return texts;
}

export function useLobbyNotices(
  players: Record<string, LobbyPlayer>,
  meta: LobbyMeta | null,
  uid: string | null
): Notice[] {
  const [notices, setNotices] = useState<Notice[]>([]);
  const prevPlayers = useRef<Record<string, LobbyPlayer> | null>(null);
  const prevHost = useRef<string | null>(null);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // los avisos se limpian solos; los timers solo se cancelan al desmontar (si se cancelaban
  // en cada cambio de la lobby, los avisos se quedaban pegados en pantalla)
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  useEffect(() => {
    const prev = prevPlayers.current;
    const prevHostUid = prevHost.current;
    prevPlayers.current = players;
    prevHost.current = meta?.hostUid ?? null;
    if (!prev || !uid) return; // primera carga: no anunciamos a los que ya estaban

    const texts = diffNotices(prev, players, prevHostUid, meta?.hostUid ?? null, uid);
    if (texts.length === 0) return;
    const fresh = texts.map((text) => ({ id: ++seq.current, text }));
    setNotices((cur) => [...cur, ...fresh].slice(-4));
    const t = setTimeout(() => {
      const ids = new Set(fresh.map((n) => n.id));
      setNotices((cur) => cur.filter((n) => !ids.has(n.id)));
      timers.current = timers.current.filter((x) => x !== t);
    }, LIFETIME);
    timers.current.push(t);
  }, [players, meta?.hostUid, uid]);

  return notices;
}

export default function LobbyNotices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="lobby-notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <p key={n.id} className="lobby-notice">
          {n.text}
        </p>
      ))}
    </div>
  );
}
