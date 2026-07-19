import { useEffect, useState } from 'react';
import type { Mode } from '../game/types';
import type { PublicLobby } from '../game/online';

const NICK_KEY = 'frecuencia-nick';

type Props = {
  error: string | null;
  onCreate: (opts: { lobbyName: string; playerName: string; isPublic: boolean; mode: Mode }) => void;
  onJoin: (id: string, key: string, playerName: string) => void;
  listPublic: () => Promise<PublicLobby[]>;
  onExit: () => void;
};

export default function OnlineHome({ error, onCreate, onJoin, listPublic, onExit }: Props) {
  const [nick, setNick] = useState('');
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const [lobbyName, setLobbyName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [mode, setMode] = useState<Mode>('ffa');
  const [joinId, setJoinId] = useState('');
  const [joinKey, setJoinKey] = useState('');
  const [lobbies, setLobbies] = useState<PublicLobby[] | null>(null);

  useEffect(() => {
    setNick(localStorage.getItem(NICK_KEY) ?? '');
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => listPublic().then((l) => alive && setLobbies(l)).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [listPublic]);

  const saveNick = (n: string) => {
    setNick(n);
    localStorage.setItem(NICK_KEY, n);
  };

  const name = nick.trim() || 'Anónimo';

  return (
    <section className="panel panel--setup">
      <p className="panel__kicker">Online</p>
      <h2 className="panel__title">Lobbies</h2>

      <input
        className="input input--nick"
        value={nick}
        placeholder="Tu nombre"
        maxLength={16}
        onChange={(e) => saveNick(e.target.value)}
        aria-label="Tu nombre"
      />



      <div className="seg">
        <button
          className={`seg__opt ${tab === 'join' ? 'seg__opt--on' : ''}`}
          onClick={() => setTab('join')}
        >
          Unirse
        </button>
        <button
          className={`seg__opt ${tab === 'create' ? 'seg__opt--on' : ''}`}
          onClick={() => setTab('create')}
        >
          Crear lobby
        </button>
      </div>

      {error && <p className="online-error">{error}</p>}

      {tab === 'join' ? (
        <>
          <div className="lobby-list">
            {lobbies === null && <p className="end-config__hint">Buscando lobbies públicas…</p>}
            {lobbies !== null && lobbies.length === 0 && (
              <p className="end-config__hint">No hay lobbies públicas ahora mismo. ¡Crea una!</p>
            )}
            {lobbies?.map((l) => (
              <button key={l.id} className="lobby-item" onClick={() => onJoin(l.id, '', name)}>
                <span className="lobby-item__name">{l.name}</span>
                <span className="lobby-item__info">
                  {l.mode === 'ffa' ? 'En cadena' : 'Equipos'} · {l.players}{' '}
                  {l.players === 1 ? 'jugador' : 'jugadores'} · {l.id}
                </span>
              </button>
            ))}
          </div>
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (joinId.trim()) onJoin(joinId, joinKey, name);
            }}
          >
            <p className="panel__kicker">Con código</p>
            <div className="join-form__row">
              <input
                className="input input--code"
                value={joinId}
                placeholder="ID (p. ej. K7XM2P)"
                maxLength={6}
                onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                aria-label="ID de la lobby"
              />
              <input
                className="input input--code"
                value={joinKey}
                placeholder="Clave"
                maxLength={4}
                inputMode="numeric"
                onChange={(e) => setJoinKey(e.target.value)}
                aria-label="Clave de la lobby"
              />
            </div>
            <button className="btn btn--primary" type="submit" disabled={joinId.trim().length < 4}>
              Unirse
            </button>
          </form>
        </>
      ) : (
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ lobbyName: lobbyName.trim(), playerName: name, isPublic, mode });
          }}
        >
          <input
            className="input"
            value={lobbyName}
            placeholder={`Partida de ${name}`}
            maxLength={24}
            onChange={(e) => setLobbyName(e.target.value)}
            aria-label="Nombre de la lobby"
          />
          <div className="seg">
            <button
              type="button"
              className={`seg__opt ${isPublic ? 'seg__opt--on' : ''}`}
              onClick={() => setIsPublic(true)}
            >
              Pública
            </button>
            <button
              type="button"
              className={`seg__opt ${!isPublic ? 'seg__opt--on' : ''}`}
              onClick={() => setIsPublic(false)}
            >
              Privada
            </button>
          </div>
          <div className="seg">
            <button
              type="button"
              className={`seg__opt ${mode === 'ffa' ? 'seg__opt--on' : ''}`}
              onClick={() => setMode('ffa')}
            >
              En cadena
            </button>
            <button
              type="button"
              className={`seg__opt ${mode === 'teams' ? 'seg__opt--on' : ''}`}
              onClick={() => setMode('teams')}
            >
              Por equipos
            </button>
          </div>
          <p className="end-config__hint">
            {isPublic
              ? 'Aparecerá en la lista y cualquiera podrá unirse.'
              : 'Solo se podrá entrar con el ID y la clave de 4 dígitos.'}
          </p>
          <button className="btn btn--primary" type="submit">
            Crear lobby
          </button>
        </form>
      )}

      <button className="link-btn" onClick={onExit}>
        ← Menú
      </button>
    </section>
  );
}
