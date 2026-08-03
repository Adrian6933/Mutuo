import { useState } from 'react';
import type { LobbyMeta, LobbyPlayer, NetConfig } from '../game/online';
import MaxPlayersPicker from './MaxPlayers';
import type { Mode } from '../game/types';
import { CategoryPicker, EndConfig, ExtrasConfig } from './SetupShared';
import { COLOR_COUNT } from '../game/reducer';
import Avatar from './Avatar';
import PlayerCard, { type PlayerCardData } from './PlayerCard';

const LOBBY_MODES: { label: string; mode: Mode; presenter: boolean; coop: boolean }[] = [
  { label: 'Todos contra todos', mode: 'ffa', presenter: false, coop: false },
  { label: 'Por equipos', mode: 'teams', presenter: false, coop: false },
  { label: '🎤 Presentador', mode: 'ffa', presenter: true, coop: false },
  { label: '🤝 Cooperativo', mode: 'ffa', presenter: false, coop: true },
];

type Props = {
  lobbyId: string;
  meta: LobbyMeta;
  players: Record<string, LobbyPlayer>;
  config: NetConfig;
  uid: string;
  isHost: boolean;
  onSetConfig: (patch: Partial<NetConfig>) => void;
  onSetMaxPlayers: (max: number | null) => void;
  onAssignTeam: (uid: string, team: number) => void;
  onRename: (name: string) => void;
  onKick: (uid: string) => void;
  onShuffleFfa: () => void;
  onDistributeTeamsOfTwo: () => void;
  onShuffleTeamInternal: () => void;
  onStart: () => boolean;
  onLeave: () => void;
};

export default function LobbyRoom({
  lobbyId,
  meta,
  players,
  config,
  uid,
  isHost,
  onSetConfig,
  onSetMaxPlayers,
  onAssignTeam,
  onRename,
  onKick,
  onShuffleFfa,
  onDistributeTeamsOfTwo,
  onShuffleTeamInternal,
  onStart,
  onLeave,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [card, setCard] = useState<PlayerCardData | null>(null);

  const entries = Object.entries(players).sort(
    (a, b) => (a[1].order ?? a[1].joinedAt) - (b[1].order ?? b[1].joinedAt)
  );
  const online = entries.filter(([, p]) => p.online);

  const teamCount = Math.max(2, ...online.map(([, p]) => (p.team ?? 0) + 1));

  const canStart =
    config.mode === 'ffa'
      ? online.length >= 2
      : (() => {
          const sizes = new Map<number, number>();
          for (const [, p] of online) {
            const t = p.team ?? 0;
            sizes.set(t, (sizes.get(t) ?? 0) + 1);
          }
          return sizes.size >= 2 && [...sizes.values()].every((n) => n >= 2);
        })();

  const copyInvite = () => {
    const text = meta.key ? `Lobby ${lobbyId} · clave ${meta.key}` : `Lobby ${lobbyId}`;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const renderPlayerRow = (pUid: string, p: LobbyPlayer) => (
    <div key={pUid} className={`lobby-player ${p.online ? '' : 'lobby-player--off'}`}>
      <span className={`presence ${p.online ? 'presence--on' : ''}`} aria-hidden="true" />
      <button
        type="button"
        className="avatar-btn"
        onClick={() =>
          setCard({
            name: p.name,
            avatar: p.avatar,
            bio: p.bio,
            colorIdx: (p.team ?? 0) % COLOR_COUNT,
            tags: [
              ...(pUid === meta.hostUid ? ['👑 Anfitrión'] : []),
              ...(pUid === uid ? ['Eres tú'] : []),
              ...(config.mode === 'teams' ? [`Equipo ${(p.team ?? 0) + 1}`] : []),
              ...(p.online ? [] : ['Desconectado']),
            ],
          })
        }
        aria-label={`Ver el perfil de ${p.name}`}
      >
        <Avatar name={p.name} avatar={p.avatar} size={30} colorIdx={(p.team ?? 0) % COLOR_COUNT} />
      </button>
      {pUid === uid ? (
        <input
          className="input input--nick input--inline"
          defaultValue={p.name}
          maxLength={16}
          aria-label="Tu nombre"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== p.name) onRename(v);
            else e.target.value = p.name;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <span className="lobby-player__name">{p.name}</span>
      )}
      <span className="lobby-player__tags">
        {pUid === meta.hostUid && ' 👑'}
        {pUid === uid && ' (tú)'}
      </span>
      {isHost && pUid !== uid && (
        <button
          className="lobby-player__kick"
          onClick={() => onKick(pUid)}
          title={`Expulsar a ${p.name}`}
          aria-label={`Expulsar a ${p.name}`}
        >
          ✕
        </button>
      )}
      {config.mode === 'teams' && (
        <span className="chip-row chip-row--tight" style={{ marginLeft: 'auto' }}>
          {Array.from({ length: teamCount }, (_, i) => (
            <button
              key={i}
              className={`chip chip--mini c${i % COLOR_COUNT} ${(p.team ?? 0) === i ? 'chip--on' : ''}`}
              onClick={() => onAssignTeam(pUid, i)}
              title={`Mover a Equipo ${i + 1}`}
            >
              E{i + 1}
            </button>
          ))}
          {teamCount < 4 && isHost && (
            <button
              className="chip chip--mini"
              onClick={() => onAssignTeam(pUid, teamCount)}
              title="Añadir equipo"
            >
              +
            </button>
          )}
        </span>
      )}
    </div>
  );

  return (
    <section className="panel panel--setup">
      {card && <PlayerCard player={card} onClose={() => setCard(null)} />}
      <p className="panel__kicker">{meta.public ? 'Lobby pública' : 'Lobby privada'}</p>
      <h2 className="panel__title">{meta.name}</h2>

      <button className="lobby-code" onClick={copyInvite} title="Copiar invitación">
        <span className="lobby-code__id">{lobbyId}</span>
        {meta.key && <span className="lobby-code__key">clave {meta.key}</span>}
        <span className="lobby-code__copy">{copied ? '¡Copiado!' : 'Copiar'}</span>
      </button>

      {isHost && (
        <div className="seg" style={{ marginBottom: '12px' }}>
          {LOBBY_MODES.map((m) => {
            const on =
              config.mode === m.mode &&
              !!config.options.fixedPsychic === m.presenter &&
              !!config.options.coop === m.coop;
            return (
              <button
                key={m.label}
                className={`seg__opt ${on ? 'seg__opt--on' : ''}`}
                onClick={() =>
                  onSetConfig({
                    mode: m.mode,
                    endRule:
                      m.coop && config.endRule.kind !== 'points'
                        ? { kind: 'points', goal: 20 }
                        : config.endRule,
                    options: {
                      ...config.options,
                      fixedPsychic: m.presenter,
                      coop: m.coop,
                      ...(m.presenter || m.coop ? { allGuess: true } : {}),
                    },
                  })
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {config.mode === 'teams' ? (
        <div className="teams-container" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Array.from({ length: teamCount }, (_, ti) => {
            const teamPlayers = online.filter(([, p]) => (p.team ?? 0) === ti);
            return (
              <div key={ti} className={`team-box c${ti % COLOR_COUNT}`}>
                <div className="team-box__head">
                  <span className="dot" aria-hidden="true" />
                  <span className="team-box__title" style={{ fontWeight: 800, fontSize: '1rem' }}>
                    Equipo {ti + 1}
                  </span>
                  <span
                    className={`score-chip c${ti % COLOR_COUNT}`}
                    style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '2px 8px' }}
                  >
                    {teamPlayers.length}/2 jugadores
                  </span>
                </div>
                {teamPlayers.length === 0 ? (
                  <p className="end-config__hint" style={{ margin: '6px 0', opacity: 0.7 }}>
                    Sin jugadores asignados.
                  </p>
                ) : (
                  teamPlayers.map(([pUid, p]) => renderPlayerRow(pUid, p))
                )}
                {teamPlayers.length < 2 && (
                  <p className="end-config__hint" style={{ marginTop: '4px', fontSize: '0.8rem' }}>
                    ⚠️ Hacen falta al menos 2 jugadores por equipo.
                  </p>
                )}
              </div>
            );
          })}

          {/* Jugadores desconectados */}
          {entries.some(([, p]) => !p.online) && (
            <div style={{ marginTop: '8px' }}>
              <p className="panel__kicker">Jugadores desconectados</p>
              {entries
                .filter(([, p]) => !p.online)
                .map(([pUid, p]) => renderPlayerRow(pUid, p))}
            </div>
          )}

          {isHost && (
            <div className="btn-row">
              <button className="btn btn--ghost btn--small" onClick={onDistributeTeamsOfTwo}>
                🔀 Repartir en equipos de 2
              </button>
              <button className="btn btn--ghost btn--small" onClick={onShuffleTeamInternal}>
                🔀 Barajar orden interno
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="player-list">
            {entries.map(([pUid, p]) => renderPlayerRow(pUid, p))}
          </div>

          {isHost && (
            <div className="btn-row">
              <button className="btn btn--ghost btn--small" onClick={onShuffleFfa}>
                🔀 Orden aleatorio
              </button>
            </div>
          )}
        </>
      )}

      <p className="end-config__hint" style={{ marginTop: '10px' }}>
        {online.length}
        {meta.maxPlayers ? `/${meta.maxPlayers}` : ''}{' '}
        {online.length === 1 && !meta.maxPlayers ? 'jugador conectado' : 'jugadores conectados'}.{' '}
        {meta.maxPlayers && online.length >= meta.maxPlayers
          ? 'La lobby está llena.'
          : 'Comparte el código para que se unan.'}
      </p>

      {isHost && (
        <MaxPlayersPicker
          value={meta.maxPlayers ?? null}
          onChange={onSetMaxPlayers}
          min={Math.max(2, online.length)}
        />
      )}

      {isHost ? (
        <>
          <CategoryPicker
            categories={config.categories}
            onChange={(categories) => onSetConfig({ categories })}
          />
          <EndConfig
            mode={config.mode}
            endRule={config.endRule}
            onChange={(endRule) => onSetConfig({ endRule })}
          />
          <ExtrasConfig
            mode={config.mode}
            options={config.options}
            onChange={(options) => onSetConfig({ options: { ...config.options, ...options } })}
          />
          <button className="btn btn--primary" disabled={!canStart} onClick={onStart}>
            Empezar partida
          </button>
          {!canStart && (
            <p className="end-config__hint">
              {config.mode === 'ffa'
                ? 'Hacen falta al menos 2 jugadores conectados.'
                : 'Hacen falta al menos 2 equipos con 2 jugadores cada uno.'}
            </p>
          )}
        </>
      ) : (
        <p className="panel__text">
          El anfitrión está configurando la partida:{' '}
          <b>
            {config.mode === 'teams'
              ? 'por equipos'
              : config.options.fixedPsychic
                ? 'presentador (él da todas las pistas)'
                : 'todos contra todos'}
          </b>
          ,{' '}
          {config.endRule.kind === 'laps'
            ? `${config.endRule.laps} ${config.mode === 'ffa' && !config.options.fixedPsychic ? 'vueltas' : 'rondas'}`
            : `meta de ${config.endRule.goal} puntos`}
          . En cuanto pulse empezar, ¡dentro!
        </p>
      )}

      <button className="link-btn" onClick={onLeave}>
        ← Salir de la lobby
      </button>
    </section>
  );
}
