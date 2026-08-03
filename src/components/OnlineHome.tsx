import { useEffect, useState } from 'react';
import type { Mode } from '../game/types';
import type { PublicLobby } from '../game/online';
import MaxPlayersPicker from './MaxPlayers';
import { MAX_NAME, profileName, setProfile, useProfile } from '../game/profile';
import Avatar from './Avatar';

type Props = {
  error: string | null;
  onCreate: (opts: {
    lobbyName: string;
    playerName: string;
    isPublic: boolean;
    mode: Mode;
    maxPlayers: number | null;
  }) => void;
  onJoin: (id: string, key: string, playerName: string) => void;
  listPublic: () => Promise<PublicLobby[]>;
  onExit: () => void;
};

export default function OnlineHome({ error, onCreate, onJoin, listPublic, onExit }: Props) {
  const profile = useProfile();
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const [lobbyName, setLobbyName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [mode, setMode] = useState<Mode>('ffa');
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null);
  const [joinId, setJoinId] = useState('');
  const [joinKey, setJoinKey] = useState('');
  const [lobbies, setLobbies] = useState<PublicLobby[] | null>(null);

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

  const name = profileName(profile);

  return (
    <section className="panel panel--setup">
      <p className="panel__kicker">Online</p>
      <h2 className="panel__title">Lobbies</h2>

      <div className="nick-row">
        <Avatar name={name} avatar={profile.avatar} size={42} colorIdx={0} />
        <input
          className="input input--nick"
          value={profile.name}
          placeholder="Tu nombre"
          maxLength={MAX_NAME}
          onChange={(e) => setProfile({ name: e.target.value })}
          aria-label="Tu nombre"
        />
      </div>



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
            {lobbies?.map((l) => {
              const full = l.maxPlayers !== null && l.players >= l.maxPlayers;
              const playing = l.status === 'playing';
              // cómo va la partida, para saber si merece la pena entrar ahora
              const progress = !playing
                ? null
                : l.tiebreak
                  ? '⚡ desempate'
                  : l.total !== null
                    ? `ronda ${l.round}/${l.total} · quedan ${Math.max(0, l.total - (l.round ?? 0))}`
                    : l.goal !== null
                      ? `ronda ${l.round} · meta ${l.goal} puntos`
                      : `ronda ${l.round}`;
              return (
                <button
                  key={l.id}
                  className={`lobby-item ${full ? 'lobby-item--full' : ''} ${
                    playing ? 'lobby-item--playing' : ''
                  }`}
                  onClick={() => onJoin(l.id, '', name)}
                  disabled={full}
                >
                  <span className="lobby-item__name">
                    {l.name}
                    <span className={`lobby-tag ${playing ? 'lobby-tag--live' : ''}`}>
                      {playing ? '● En juego' : 'Esperando'}
                    </span>
                  </span>
                  <span className="lobby-item__info">
                    {l.mode === 'ffa' ? 'Todos contra todos' : 'Equipos'} · {l.players}
                    {l.maxPlayers !== null ? `/${l.maxPlayers}` : ''}{' '}
                    {l.players === 1 && l.maxPlayers === null ? 'jugador' : 'jugadores'} · {l.id}
                    {full ? ' · llena' : ''}
                  </span>
                  {progress && (
                    <span className="lobby-item__info lobby-item__progress">
                      {progress} · entras en la siguiente ronda
                    </span>
                  )}
                  {l.faces.length > 0 && (
                    <span className="lobby-item__faces">
                      {l.faces.map((f, i) => (
                        <Avatar
                          key={`${f.name}-${i}`}
                          name={f.name}
                          avatar={f.avatar}
                          size={24}
                          colorIdx={i % 6}
                        />
                      ))}
                      {l.players > l.faces.length && (
                        <span
                          className="lobby-item__more"
                          title={`y ${l.players - l.faces.length} más`}
                        >
                          …
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
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
            onCreate({ lobbyName: lobbyName.trim(), playerName: name, isPublic, mode, maxPlayers });
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
              Todos contra todos
            </button>
            <button
              type="button"
              className={`seg__opt ${mode === 'teams' ? 'seg__opt--on' : ''}`}
              onClick={() => setMode('teams')}
            >
              Por equipos
            </button>
          </div>
          <MaxPlayersPicker value={maxPlayers} onChange={setMaxPlayers} />
          <p className="end-config__hint">
            {isPublic
              ? 'Aparecerá en la lista y cualquiera podrá unirse.'
              : 'Solo se podrá entrar con el ID y la clave de 4 dígitos.'}
            {maxPlayers !== null ? ` Como mucho ${maxPlayers} jugadores a la vez.` : ''}
          </p>
          <p className="end-config__hint">
            Los temas (incluidas <b>tus categorías</b>), el fin de partida y los extras se eligen
            dentro de la lobby, antes de empezar.
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
