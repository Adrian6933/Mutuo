import { useEffect, useRef, useState } from 'react';
import Dial, { scoreFor, type DialMarker } from './Dial';
import ScoreTable from './ScoreTable';
import Confetti from './Confetti';
import RivalBet from './RivalBet';
import { CardPicker, CustomCardForm, ClueForm } from './CardPicker';
import { REVEAL_TEXT, buildRows, winnerText, initialsOf, Stats } from './gameShared';
import {
  psychicName,
  guesserNames,
  activeTeam,
  rivalTeam,
  ffaBystanderNames,
  ffaBystanders,
  ffaPsychic,
  allGuessers,
  colorIdx,
  circularDelta,
  isGameOver,
  leaders,
  totalRounds,
  type Action,
} from '../game/reducer';
import { roleFor, type Live, type LobbyPlayer } from '../game/online';
import { setSoundEnabled, sfx } from '../game/sound';
import type { GameState } from '../game/types';
import Avatar from './Avatar';

type Props = {
  game: GameState;
  live: Live;
  assign: Record<string, number> | null;
  players: Record<string, LobbyPlayer>;
  uid: string;
  isHost: boolean;
  sendAction: (a: Action) => void;
  setLiveNeedle: (angle: number) => void;
  setSkipVote: (voted: boolean) => void;
  backToLobby: () => void;
  onLeave: () => void;
};

function SkipVoteBar({
  isHost,
  hasVoted,
  votedCount,
  totalOnline,
  requiredPct,
  advanceMode,
  onToggleVote,
  onHostAdvance,
  advanceLabel,
}: {
  isHost: boolean;
  hasVoted: boolean;
  votedCount: number;
  totalOnline: number;
  requiredPct: number;
  advanceMode: 'admin' | 'vote';
  onToggleVote: () => void;
  onHostAdvance: () => void;
  advanceLabel: string;
}) {
  const isVoteMode = advanceMode === 'vote';
  const currentPct = totalOnline > 0 ? Math.round((votedCount / totalOnline) * 100) : 0;

  return (
    <div className="skip-vote-wrap">
      {isVoteMode && (
        <div className="skip-vote-card">
          <div className="skip-vote-info">
            <span className="skip-vote-label">
              🗳️ Votos para avanzar: <b>{votedCount}/{totalOnline}</b> ({currentPct}%)
            </span>
            <span className="skip-vote-target">Meta: {requiredPct}%</span>
          </div>
          <button
            type="button"
            className={`btn ${hasVoted ? 'btn--ghost skip-vote-btn--voted' : 'btn--secondary'}`}
            onClick={onToggleVote}
          >
            {hasVoted ? '✅ Tu voto registrado (pulsar para cancelar)' : '🗳️ Votar para avanzar'}
          </button>
        </div>
      )}
      {isHost ? (
        <button className="btn btn--primary" onClick={onHostAdvance}>
          {isVoteMode ? `${advanceLabel} (Anfitrión)` : advanceLabel}
        </button>
      ) : (
        !isVoteMode && (
          <p className="end-config__hint" style={{ marginTop: '14px' }}>
            Esperando a que el anfitrión avance…
          </p>
        )
      )}
    </div>
  );
}

function Waiting({ kicker, text, timeLeft }: { kicker: string; text: string; timeLeft?: number | null }) {
  return (
    <section className="panel">
      <p className="panel__kicker">{kicker}</p>
      {timeLeft !== undefined && timeLeft !== null && (
        <div className={`panel__timer-large ${timeLeft <= 10 ? 'panel__timer-large--low' : ''}`}>
          ⏱️ {timeLeft}s
        </div>
      )}
      <p className="panel__text panel__text--waiting">{text}</p>
      <span className="waiting-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </section>
  );
}

export default function OnlineGame({
  game: s,
  live,
  assign,
  players,
  uid,
  isHost,
  sendAction,
  setLiveNeedle,
  setSkipVote,
  backToLobby,
  onLeave,
}: Props) {
  const role = roleFor(s, assign, uid);
  const onlinePlayers = Object.entries(players).filter(([, p]) => p.online);
  const totalOnline = onlinePlayers.length;
  const skipVotes = live.skipVotes ?? {};
  const votedToSkipCount = onlinePlayers.filter(([pUid]) => skipVotes[pUid] === true).length;
  const hasVotedToSkip = Boolean(skipVotes[uid]);
  const allGuessMode = s.mode === 'ffa' && s.options.allGuess;
  const hasVoted = s.mode === 'ffa' && s.bets && role.playerId !== null && s.bets[role.playerId.toString()] !== undefined;
  const myGuessDone =
    allGuessMode && role.playerId !== null && s.guesses ? s.guesses[role.playerId.toString()] !== undefined : false;
  const guessesInCount = allGuessMode ? Object.keys(s.guesses ?? {}).length : 0;
  const guessesTotalCount = allGuessMode ? allGuessers(s).length : 0;
  const isFfaBystander = s.mode === 'ffa' && !allGuessMode && role.playerId !== null && ffaBystanders(s).some((p) => p.id === role.playerId);
  const bystanderVote = isFfaBystander ? s.bets?.[role.playerId!.toString()] : null;
  const bystanderWon = isFfaBystander && bystanderVote
    ? (bystanderVote === 'miss'
        ? s.lastPts === 0
        : bystanderVote === 'exact'
          ? s.lastPts === 4
          : (s.lastPts > 0 && s.lastPts !== 4 && (bystanderVote === 'left' ? circularDelta(s.target, s.needle) < 0 : circularDelta(s.target, s.needle) > 0))
      )
    : false;

  const showPersonalGain = isFfaBystander && bystanderVote;
  const showTeamGain = s.mode === 'teams' && role.isRival && s.bet !== null;
  const [localNeedle, setLocalNeedle] = useState(90);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const lastSent = useRef(0);
  const lastTick = useRef(90);
  const pendingWrite = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingWrite.current) {
        clearTimeout(pendingWrite.current);
      }
    };
  }, []);

  const controlling = s.phase === 'guess' && role.isGuesser;

  // sincroniza la aguja local cuando no controlas
  useEffect(() => {
    if (!controlling) setLocalNeedle(live.needle ?? s.needle);
  }, [controlling, live.needle, s.needle]);

  // al empezar la fase de adivinar, parte de la aguja publicada
  useEffect(() => {
    if (s.phase === 'guess') setLocalNeedle(s.needle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);

  useEffect(() => {
    setSoundEnabled(s.options.sound);
  }, [s.options.sound]);

  useEffect(() => {
    if (s.phase !== 'reveal') return;
    if (s.lastPts === 4) sfx.tada();
    else if (s.lastPts > 0) sfx.reveal();
    else sfx.fail();
  }, [s.phase, s.lastPts]);

  // cuenta atrás desde live.timerEnd
  useEffect(() => {
    if (!['clue', 'guess', 'rival-bet', 'reveal', 'standings'].includes(s.phase) || !live.timerEnd) {
      setTimeLeft(null);
      return;
    }
    const compute = () => setTimeLeft(Math.max(0, Math.ceil((live.timerEnd! - Date.now()) / 1000)));
    compute();
    const id = setInterval(compute, 500);
    return () => clearInterval(id);
  }, [s.phase, live.timerEnd]);

  const onNeedle = (angle: number) => {
    setLocalNeedle(angle);
    if (Math.abs(angle - lastTick.current) >= 4) {
      lastTick.current = angle;
      sfx.tick();
    }

    // "todos adivinan": cada uno ve solo su aguja, no se comparte en vivo
    if (allGuessMode) return;

    if (pendingWrite.current) {
      clearTimeout(pendingWrite.current);
    }

    const now = Date.now();
    if (now - lastSent.current > 120) {
      lastSent.current = now;
      setLiveNeedle(angle);
    }

    pendingWrite.current = setTimeout(() => {
      setLiveNeedle(angle);
      lastSent.current = Date.now();
      pendingWrite.current = null;
    }, 150);
  };

  const psy = psychicName(s);
  const inRound = !['standings', 'end'].includes(s.phase);
  const dialAngle = controlling ? localNeedle : s.phase === 'guess' ? (live.needle ?? s.needle) : s.needle;
  const showTarget = (s.phase === 'psychic' && role.isPsychic) || s.phase === 'reveal';
  const dialOpen = showTarget;
  const showCardStrip =
    s.card && ['psychic', 'clue', 'guess', 'guess-handoff', 'rival-bet', 'reveal'].includes(s.phase);
  const rows = ['standings', 'end'].includes(s.phase) ? buildRows(s) : [];
  const total = s.tiebreakKeys ? null : totalRounds(s);

  // perfil (foto y frase) de cada playerId, vía la asignación uid → jugador
  const profileById = new Map<number, { avatar: string | null; bio: string | null }>();
  if (assign) {
    for (const [pUid, pid] of Object.entries(assign)) {
      const lp = players[pUid];
      if (lp) profileById.set(pid, { avatar: lp.avatar ?? null, bio: lp.bio ?? null });
    }
  }

  const revealMarkers: DialMarker[] | null =
    allGuessMode && s.phase === 'reveal'
      ? allGuessers(s).map((p) => {
          const angle = s.guesses?.[p.id.toString()] ?? 90;
          const prof = profileById.get(p.id);
          return {
            angle,
            initials: initialsOf(p.name),
            name: p.name,
            colorIdx: colorIdx(s, `p${p.id}`),
            pts: scoreFor(angle, s.target),
            avatar: prof?.avatar ?? null,
            bio: prof?.bio ?? null,
          };
        })
      : null;
  const psyGain = revealMarkers
    ? s.lastGains.find((g) => g.key === `p${ffaPsychic(s).id}`)?.pts ?? 0
    : 0;

  return (
    <>
      {inRound && (
        <div className="online-status">
          <span className="round-pill">
            {s.tiebreakKeys
              ? '⚡ Muerte súbita'
              : `Ronda ${s.round + 1}${total ? `/${total}` : ''}${
                  s.endRule.kind === 'points' ? ` · meta ${s.endRule.goal}` : ''
                }`}
          </span>
          {timeLeft !== null && (
            <span className={`round-pill timer-pill ${timeLeft <= 10 ? 'timer-pill--low' : ''}`}>
              ⏱ {timeLeft}s
            </span>
          )}
        </div>
      )}

      {showCardStrip && s.card ? (
        <div className="spectrum-card">
          {s.card.topic && <p className="spectrum-card__topic">{s.card.topic}</p>}
          <div className="spectrum-card__row">
            <span className="spectrum-card__end spectrum-card__end--left">◀ {s.card.left}</span>
            <span className="spectrum-card__vs">···</span>
            <span className="spectrum-card__end spectrum-card__end--right">{s.card.right} ▶</span>
          </div>
        </div>
      ) : (
        inRound && <div className="spectrum-card spectrum-card--empty" aria-hidden="true" />
      )}

      {inRound && (
        <div className="dial-wrap">
          <Dial
            angle={dialAngle}
            target={showTarget ? s.target : null}
            open={dialOpen}
            interactive={controlling}
            onChange={onNeedle}
            markers={revealMarkers}
            showNeedle={!revealMarkers}
          />
          {s.phase === 'reveal' && s.lastPts === 4 && <Confetti />}
        </div>
      )}

      {s.phase === 'handoff' && <Waiting kicker={`Ronda ${s.round + 1}`} text={`Le toca de psíquico a ${psy}…`} />}

      {s.phase === 'guess-handoff' && <Waiting kicker="Un momento" text="Preparando la ronda de adivinar…" />}

      {s.phase === 'card-pick' &&
        (role.isPsychic ? (
          <CardPicker
            psychic="tú"
            onRandom={() => sendAction({ type: 'PICK_RANDOM' })}
            onCustom={() => sendAction({ type: 'PICK_CUSTOM' })}
          />
        ) : (
          <Waiting kicker={`Psíquico: ${psy}`} text={`${psy} está eligiendo carta…`} timeLeft={timeLeft} />
        ))}

      {s.phase === 'custom-card' &&
        (role.isPsychic ? (
          <CustomCardForm
            onSubmit={(left, right, topic) => sendAction({ type: 'SET_CUSTOM_CARD', left, right, topic })}
            onBack={() => sendAction({ type: 'BEGIN_TURN' })}
          />
        ) : (
          <Waiting kicker={`Psíquico: ${psy}`} text={`${psy} está escribiendo su propia carta…`} timeLeft={timeLeft} />
        ))}

      {s.phase === 'psychic' &&
        (role.isPsychic ? (
          <section className="panel">
            <p className="panel__kicker">Solo para tus ojos</p>
            <p className="panel__text">
              Memoriza dónde está la zona. Piensa una pista entre <b>{s.card?.left}</b> y{' '}
              <b>{s.card?.right}</b>.
            </p>
            <button className="btn btn--primary" onClick={() => sendAction({ type: 'HIDE_ZONE' })}>
              Ocultar zona
            </button>
          </section>
        ) : (
          <Waiting kicker={`Psíquico: ${psy}`} text={`${psy} está memorizando la zona secreta…`} timeLeft={timeLeft} />
        ))}

      {s.phase === 'clue' &&
        (role.isPsychic ? (
          <ClueForm
            kicker="Psíquico: tú"
            guesser={guesserNames(s)}
            onSubmit={(text) => sendAction({ type: 'CLUE_GIVEN', text })}
            timeLeft={timeLeft}
          />
        ) : (
          <Waiting kicker={`Psíquico: ${psy}`} text={`Atentos: ${psy} va a dar la pista…`} timeLeft={timeLeft} />
        ))}

      {s.phase === 'guess' &&
        (role.isGuesser ? (
          <section className="panel">
            <p className="panel__kicker">
              {allGuessMode ? `Adivina ${guessesInCount + 1} de ${guessesTotalCount}` : 'Te toca'}
            </p>
            {timeLeft !== null && (
              <div className={`panel__timer-large ${timeLeft <= 10 ? 'panel__timer-large--low' : ''}`}>
                ⏱️ {timeLeft}s
              </div>
            )}
            {s.clue ? (
              <p className="panel__text">
                Pista: <b>«{s.clue}»</b>
              </p>
            ) : (
              <p className="panel__text">Arrastra la aguja hasta donde creas que apunta la pista.</p>
            )}
            <button className="btn btn--primary" onClick={() => sendAction({ type: 'CONFIRM_GUESS', angle: localNeedle })}>
              Confirmar posición
            </button>
          </section>
        ) : allGuessMode && myGuessDone ? (
          <Waiting
            kicker="Ya has adivinado"
            text={`Esperando al resto… (${guessesInCount}/${guessesTotalCount})`}
            timeLeft={timeLeft}
          />
        ) : allGuessMode ? (
          <Waiting
            kicker="Adivinando"
            text={`Todos están moviendo su aguja a la vez… (${guessesInCount}/${guessesTotalCount})`}
            timeLeft={timeLeft}
          />
        ) : (
          <Waiting
            kicker="Adivinando"
            text={s.clue ? `Pista: «${s.clue}»` : `${guesserNames(s)} está moviendo la aguja…`}
            timeLeft={timeLeft}
          />
        ))}

      {s.phase === 'rival-bet' &&
        (role.isRival ? (
          hasVoted ? (
            <Waiting kicker="Tu apuesta" text="Has votado. Esperando al resto de jugadores…" timeLeft={timeLeft} />
          ) : (
            <RivalBet rivalName="Vuestra apuesta" onBet={(side) => sendAction({ type: 'PLACE_BET', side })} timeLeft={timeLeft} />
          )
        ) : (
          <Waiting
            kicker={s.mode === 'ffa' ? 'Apuesta de los demás' : 'Apuesta rival'}
            text={s.mode === 'ffa' ? 'El resto de jugadores está apostando…' : `${rivalTeam(s).name} está apostando…`}
            timeLeft={timeLeft}
          />
        ))}

      {s.phase === 'reveal' && allGuessMode && revealMarkers && (
        <section className="panel">
          {timeLeft !== null && (
            <div className={`panel__timer-large ${timeLeft <= 10 ? 'panel__timer-large--low' : ''}`}>
              ⏱️ {timeLeft}s
            </div>
          )}
          <p className={`reveal-points ${s.lastPts === 0 ? 'reveal-points--miss' : ''}`}>
            {REVEAL_TEXT[s.lastPts]}
          </p>
          <p className="panel__text">
            {s.tiebreakKeys ? (
              'En muerte súbita solo puntúan los adivinadores.'
            ) : psyGain > 0 ? (
              <>
                {psy} se lleva <b>+{psyGain}</b> por {psyGain === 1 ? 'un acertante' : `${psyGain} acertantes`}.
              </>
            ) : (
              `Nadie ha caído en la zona: ${psy} se queda a cero.`
            )}
          </p>
          <ul className="all-results">
            {[...revealMarkers]
              .sort((a, b) => b.pts - a.pts)
              .map((m) => (
                <li key={m.name} className={`all-results__item c${m.colorIdx}`}>
                  {m.avatar ? (
                    <Avatar name={m.name} avatar={m.avatar} size={28} colorIdx={m.colorIdx} />
                  ) : (
                    <span className="all-results__badge">{m.initials}</span>
                  )}
                  <span className="all-results__name">{m.name}</span>
                  <span className={`all-results__pts ${m.pts === 0 ? 'all-results__pts--miss' : ''}`}>
                    {m.pts > 0 ? `+${m.pts}` : '0'}
                  </span>
                </li>
              ))}
          </ul>
          <SkipVoteBar
            isHost={isHost}
            hasVoted={hasVotedToSkip}
            votedCount={votedToSkipCount}
            totalOnline={totalOnline}
            requiredPct={s.options.skipVotePct ?? 50}
            advanceMode={s.options.advanceMode ?? 'admin'}
            onToggleVote={() => setSkipVote(!hasVotedToSkip)}
            onHostAdvance={() => sendAction({ type: 'SHOW_STANDINGS' })}
            advanceLabel="Ver clasificación"
          />
        </section>
      )}

      {s.phase === 'reveal' && !allGuessMode && (
        <section className="panel">
          {timeLeft !== null && (
            <div className={`panel__timer-large ${timeLeft <= 10 ? 'panel__timer-large--low' : ''}`}>
              ⏱️ {timeLeft}s
            </div>
          )}
          <p className={`reveal-points ${s.lastPts === 0 ? 'reveal-points--miss' : ''}`}>
            {REVEAL_TEXT[s.lastPts]} <b>+{s.lastPts}</b>
          </p>
          {showPersonalGain && (
            <p className={`bystander-personal-gain ${!bystanderWon ? 'bystander-personal-gain--fail' : ''}`}>
              Tu apuesta: <b>{bystanderWon ? '+1' : '+0'}</b> {bystanderWon ? '🎉' : '😢'}
            </p>
          )}
          {showTeamGain && (
            <p className={`bystander-personal-gain ${!s.betWon ? 'bystander-personal-gain--fail' : ''}`}>
              Apuesta de tu equipo: <b>{s.betWon ? '+1' : '+0'}</b> {s.betWon ? '🎉' : '😢'}
            </p>
          )}
          <p className="panel__text">
            {s.mode === 'ffa' ? (
              s.lastPts > 0
                ? s.tiebreakKeys
                  ? `Para ${guesserNames(s)} (en muerte súbita solo puntúa quien adivina).`
                  : `Para ${psy} y ${guesserNames(s)}.`
                : 'Nadie puntúa por la aguja.'
            ) : (
              <>
                {s.lastPts > 0 ? `Para ${activeTeam(s).name}. ` : s.bet === null ? 'Nadie puntúa esta ronda.' : ''}
                {s.bet !== null && (
                  <>
                    {rivalTeam(s).name} apostó {s.bet === 'left' ? '◀ izquierda' : s.bet === 'right' ? 'derecha ▶' : s.bet === 'exact' ? '🎯 4 Exacto' : '❌ no ha adivinado'}:{' '}
                    {s.betWon ? <b>acierta, +1</b> : 'falla'}.
                  </>
                )}
              </>
            )}
          </p>
          {s.mode === 'ffa' && s.bets && Object.keys(s.bets).length > 0 && (
            <div className="bystander-bets-summary">
              <p className="bystander-bets-summary__title">Apuestas de los demás:</p>
              <ul className="bystander-bets-summary__list">
                {ffaBystanders(s).map((p) => {
                  const vote = s.bets?.[p.id.toString()];
                  if (!vote) return null;
                  const voteLabel =
                    vote === 'left' ? '◀ Izquierda' :
                    vote === 'right' ? 'Derecha ▶' :
                    vote === 'exact' ? '🎯 4 Exacto' :
                    vote === 'miss' ? '❌ No ha adivinado' : 'Ninguno';
                  const delta = circularDelta(s.target, s.needle);
                  const won = vote === 'miss'
                    ? s.lastPts === 0
                    : vote === 'exact'
                      ? s.lastPts === 4
                      : (s.lastPts > 0 && s.lastPts !== 4 && (vote === 'left' ? delta < 0 : delta > 0));
                  return (
                    <li key={p.id} className="bystander-bets-summary__item">
                      <span><b>{p.name}</b>: {voteLabel}</span> {won ? <b className="won-text">acierta (+1)</b> : <span>falla</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <SkipVoteBar
            isHost={isHost}
            hasVoted={hasVotedToSkip}
            votedCount={votedToSkipCount}
            totalOnline={totalOnline}
            requiredPct={s.options.skipVotePct ?? 50}
            advanceMode={s.options.advanceMode ?? 'admin'}
            onToggleVote={() => setSkipVote(!hasVotedToSkip)}
            onHostAdvance={() => sendAction({ type: 'SHOW_STANDINGS' })}
            advanceLabel="Ver clasificación"
          />
        </section>
      )}

      {s.phase === 'standings' && (
        <section className="panel panel--setup">
          <p className="panel__kicker">{s.tiebreakKeys ? '⚡ Muerte súbita' : `Ronda ${s.round + 1}`}</p>
          <h2 className="panel__title">Clasificación</h2>
          <ScoreTable rows={rows} />
          <SkipVoteBar
            isHost={isHost}
            hasVoted={hasVotedToSkip}
            votedCount={votedToSkipCount}
            totalOnline={totalOnline}
            requiredPct={s.options.skipVotePct ?? 50}
            advanceMode={s.options.advanceMode ?? 'admin'}
            onToggleVote={() => setSkipVote(!hasVotedToSkip)}
            onHostAdvance={() => sendAction({ type: 'NEXT_ROUND' })}
            advanceLabel={
              s.tiebreakKeys
                ? 'Continuar'
                : isGameOver(s) && (leaders(s).length === 1 || !s.options.tiebreak || (s.mode === 'ffa' ? s.players.length : s.teams.length) <= 2)
                  ? 'Resultado final'
                  : isGameOver(s)
                    ? '⚡ ¡Desempate!'
                    : 'Siguiente ronda'
            }
          />
          {timeLeft !== null && (
            <p className="end-config__hint" style={{ marginTop: '10px' }}>
              Seguimos solos en {timeLeft}s…
            </p>
          )}
        </section>
      )}

      {s.phase === 'end' && (
        <section className="panel panel--setup">
          <p className="panel__kicker">Fin de la partida</p>
          <h2 className="panel__title">{winnerText(rows)}</h2>
          <ScoreTable rows={rows} final />
          {s.options.stats && <Stats s={s} />}
          {isHost ? (
            <div className="btn-row">
              <button className="btn btn--primary" onClick={() => sendAction({ type: 'PLAY_AGAIN' })}>
                Jugar otra vez
              </button>
              <button className="btn btn--ghost" onClick={backToLobby}>
                Volver a la lobby
              </button>
            </div>
          ) : (
            <p className="end-config__hint">El anfitrión decide si hay revancha…</p>
          )}
          <button className="link-btn" onClick={onLeave}>
            ← Salir de la lobby
          </button>
        </section>
      )}
    </>
  );
}
