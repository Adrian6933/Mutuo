import { useLobby } from '../game/online';
import { COLOR_COUNT } from '../game/reducer';
import OnlineHome from './OnlineHome';
import LobbyRoom from './LobbyRoom';
import OnlineGame from './OnlineGame';
import LobbyNotices, { useLobbyNotices } from './LobbyNotices';

export default function Online({ onExit }: { onExit: () => void }) {
  const lobby = useLobby();
  const notices = useLobbyNotices(lobby.players, lobby.meta, lobby.uid);

  const exit = () => {
    lobby.leave();
    onExit();
  };

  const playing = lobby.meta?.status === 'playing';

  return (
    <div className="game">
      <header className="game__header">
        <button className="logo logo--btn" onClick={exit} aria-label="Salir al menú">
          MUTUO
        </button>
        {lobby.lobbyId && (
          <div className="scoreboard">
            <span className="round-pill round-pill--code">{lobby.lobbyId}</span>
            {playing &&
              lobby.game?.mode === 'teams' &&
              lobby.game.teams.length <= 3 &&
              lobby.game.teams.map((t, i) => (
                <span key={t.id} className={`score-chip c${i % COLOR_COUNT}`}>
                  {t.name} <b>{t.score}</b>
                </span>
              ))}
          </div>
        )}
      </header>

      {lobby.lobbyId && <LobbyNotices notices={notices} />}

      <main className="game__table">
        {!lobby.ready && (
          <section className="panel">
            <p className="panel__kicker">Online</p>
            <h2 className="panel__title">Falta configurar Firebase</h2>
            <p className="panel__text">
              El modo online necesita un proyecto de Firebase (gratis). Crea uno en
              console.firebase.google.com, activa <b>Realtime Database</b> y{' '}
              <b>Authentication anónima</b>, y copia las claves web en el archivo <b>.env</b>{' '}
              (plantilla en <b>.env.example</b>). Las reglas están en <b>firebase-rules.json</b>.
            </p>
            <button className="btn btn--primary" onClick={onExit}>
              Volver al menú
            </button>
          </section>
        )}

        {lobby.ready && !lobby.uid && (
          <section className="panel">
            <p className="panel__text panel__text--waiting">Conectando…</p>
            {lobby.error && <p className="online-error">{lobby.error}</p>}
            <button className="link-btn" onClick={onExit}>
              ← Menú
            </button>
          </section>
        )}

        {lobby.ready && lobby.uid && !lobby.lobbyId && (
          <OnlineHome
            error={lobby.error}
            onCreate={(opts) => void lobby.createLobby(opts)}
            onJoin={(id, key, name) => void lobby.joinLobby(id, key, name)}
            listPublic={lobby.listPublic}
            lobbyStatus={lobby.lobbyStatus}
            onExit={onExit}
          />
        )}

        {lobby.ready && lobby.uid && lobby.lobbyId && lobby.meta && !playing && lobby.config && (
          <LobbyRoom
            lobbyId={lobby.lobbyId}
            meta={lobby.meta}
            players={lobby.players}
            config={lobby.config}
            uid={lobby.uid}
            isHost={lobby.isHost}
            onSetConfig={lobby.setConfig}
            onSetMaxPlayers={lobby.setMaxPlayers}
            onAssignTeam={lobby.assignTeam}
            onRename={lobby.renameSelf}
            onKick={lobby.kickPlayer}
            onShuffleFfa={lobby.shuffleFfaOrder}
            onDistributeTeamsOfTwo={lobby.distributeTeamsOfTwo}
            onShuffleTeamInternal={lobby.shuffleTeamInternalOrder}
            onStart={lobby.startGame}
            onLeave={exit}
          />
        )}

        {/* recién entrado a una partida en marcha: el estado tarda un instante en llegar */}
        {lobby.ready && lobby.uid && lobby.lobbyId && playing && !lobby.game && (
          <section className="panel">
            <p className="panel__kicker">Partida en marcha</p>
            <p className="panel__text panel__text--waiting">Cargando la partida…</p>
            <button className="link-btn" onClick={exit}>
              ← Salir de la lobby
            </button>
          </section>
        )}

        {lobby.ready && lobby.uid && lobby.lobbyId && playing && lobby.game && (
          <OnlineGame
            game={lobby.game}
            live={lobby.live}
            assign={lobby.assign}
            players={lobby.players}
            uid={lobby.uid}
            isHost={lobby.isHost}
            sendAction={lobby.sendAction}
            setLiveNeedle={lobby.setLiveNeedle}
            setSkipVote={lobby.setSkipVote}
            backToLobby={lobby.backToLobby}
            playAgain={() => {
              // si la gente de ahora no da para rehacer la partida, revancha con la plantilla vieja
              if (!lobby.startGame()) lobby.sendAction({ type: 'PLAY_AGAIN' });
            }}
            onKick={lobby.kickPlayer}
            onRestartRound={lobby.restartRound}
            hostUid={lobby.meta?.hostUid ?? ''}
            onLeave={exit}
          />
        )}
      </main>
    </div>
  );
}
