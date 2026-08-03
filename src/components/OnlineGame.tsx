import { useEffect, useRef, useState } from 'react';
import Dial, { scoreFor, type DialMarker } from './Dial';
import ScoreTable from './ScoreTable';
import Confetti from './Confetti';
import RivalBet from './RivalBet';
import { CardPicker, CustomCardForm, ClueForm } from './CardPicker';
import {
  REVEAL_TEXT,
  buildRows,
  winnerText,
  initialsOf,
  tiebreakLabel,
  tiebreakRevealText,
  Stats,
} from './gameShared';
import {
  psychicName,
  guesserNames,
  simultaneousGuess,
  teamOf,
  activeTeamIdx,
  ACTIVE_TEAM_MULT,
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
  competitorCount,
  totalRounds,
  type Action,
} from '../game/reducer';
import { roleFor, type Live, type LobbyPlayer } from '../game/online';
import { setSoundEnabled, sfx } from '../game/sound';
import type { GameState } from '../game/types';
import Avatar from './Avatar';
import PlayerCard, { type PlayerCardData } from './PlayerCard';

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
  /** revancha: rehace la partida con la gente que hay ahora en la lobby */
  playAgain: () => void;
  /** anfitrión: echar a alguien con la partida en marcha */
  onKick: (uid: string) => void;
  /** anfitrión: repetir la ronda actual */
  onRestartRound: () => void;
  hostUid: string;
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

/** Panel del anfitrión durante la partida: echar a alguien y repetir la ronda si se atasca. */
function HostPanel({
  players,
  assign,
  uid,
  hostUid,
  onKick,
  onRestart,
}: {
  players: Record<string, LobbyPlayer>;
  assign: Record<string, number> | null;
  uid: string;
  hostUid: string;
  onKick: (uid: string) => void;
  onRestart: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const entries = Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  return (
    <div className="host-panel">
      <button
        type="button"
        className={`chip chip--mini ${open ? 'chip--on' : ''}`}
        onClick={() => {
          setOpen((v) => !v);
          setConfirm(null);
        }}
        aria-expanded={open}
      >
        👑 Jugadores ({entries.filter(([, p]) => p.online).length})
      </button>
      {open && (
        <div className="host-panel__body">
          {entries.map(([pUid, p]) => {
            const inGame = assign?.[pUid] !== undefined;
            return (
              <div key={pUid} className={`lobby-player ${p.online ? '' : 'lobby-player--off'}`}>
                <span className={`presence ${p.online ? 'presence--on' : ''}`} aria-hidden="true" />
                <Avatar name={p.name} avatar={p.avatar} size={26} colorIdx={0} />
                <span className="lobby-player__name">{p.name}</span>
                <span className="lobby-player__tags">
                  {pUid === hostUid && '👑'}
                  {pUid === uid && ' (tú)'}
                  {!inGame && ' ⏳'}
                </span>
                {pUid !== uid &&
                  (confirm === pUid ? (
                    <span className="chip-row chip-row--tight">
                      <button
                        type="button"
                        className="chip chip--mini chip--danger"
                        onClick={() => {
                          onKick(pUid);
                          setConfirm(null);
                        }}
                      >
                        Echar
                      </button>
                      <button
                        type="button"
                        className="chip chip--mini"
                        onClick={() => setConfirm(null)}
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      className="lobby-player__kick"
                      onClick={() => setConfirm(pUid)}
                      title={`Expulsar a ${p.name}`}
                      aria-label={`Expulsar a ${p.name}`}
                    >
                      ✕
                    </button>
                  ))}
              </div>
            );
          })}
          <p className="end-config__hint">
            Al echar a alguien a mitad de ronda, la ronda se repite con los que quedáis. Si vuelve a
            entrar, se le mete en la siguiente ronda.
          </p>
          {confirm === 'restart' ? (
            <div className="btn-row">
              <button
                className="btn btn--primary btn--small"
                onClick={() => {
                  onRestart();
                  setConfirm(null);
                }}
              >
                Sí, repetir
              </button>
              <button className="btn btn--ghost btn--small" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button className="btn btn--ghost btn--small" onClick={() => setConfirm('restart')}>
              🔄 Repetir esta ronda
            </button>
          )}
        </div>
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
  playAgain,
  onKick,
  onRestartRound,
  hostUid,
  onLeave,
}: Props) {
  const role = roleFor(s, assign, uid);
  const onlinePlayers = Object.entries(players).filter(([, p]) => p.online);
  const totalOnline = onlinePlayers.length;
  const skipVotes = live.skipVotes ?? {};
  const votedToSkipCount = onlinePlayers.filter(([pUid]) => skipVotes[pUid] === true).length;
  const hasVotedToSkip = Boolean(skipVotes[uid]);
  const allGuessMode = simultaneousGuess(s);
  const teamsAll = s.mode === 'teams' && s.options.teamsAllGuess;
  const myTeam = role.playerId !== null ? teamOf(s, role.playerId) : undefined;
  const activeIdx = s.teams.length > 0 ? activeTeamIdx(s) : -1;
  const hasVoted = s.mode === 'ffa' && s.bets && role.playerId !== null && s.bets[role.playerId.toString()] !== undefined;
  const myGuessDone = !allGuessMode
    ? false
    : teamsAll
      ? Boolean(myTeam && s.guesses?.[`t${myTeam.id}`] !== undefined)
      : Boolean(role.playerId !== null && s.guesses?.[role.playerId.toString()] !== undefined);
  const guessesInCount = allGuessMode ? Object.keys(s.guesses ?? {}).length : 0;
  const guessesTotalCount = !allGuessMode ? 0 : teamsAll ? s.teams.length : allGuessers(s).length;
  const isFfaBystander = s.mode === 'ffa' && !allGuessMode && role.playerId !== null && ffaBystanders(s).some((p) => p.id === role.playerId);
  // has entrado con la partida en marcha: aún no estás en la lista de jugadores
  const isLateWatcher = !role.isMember && s.phase !== 'end';
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
  const [card, setCard] = useState<PlayerCardData | null>(null);
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

  const allMarkers: DialMarker[] | null =
    !(allGuessMode && s.phase === 'reveal')
      ? null
      : teamsAll
        ? // un marcador por equipo, con el x3 ya aplicado al del psíquico
          s.teams.map((t, i) => {
            const angle = s.guesses?.[`t${t.id}`] ?? 90;
            const band = scoreFor(angle, s.target);
            return {
              angle,
              initials: initialsOf(t.name),
              name: t.name,
              colorIdx: colorIdx(s, `t${t.id}`),
              pts: i === activeIdx ? band * ACTIVE_TEAM_MULT : band,
              playerId: t.id,
            };
          })
        : allGuessers(s).map((p) => {
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
            playerId: p.id,
          };
        });

  // con mucha gente (directos) el dial y la lista se saturan: se enseñan los mejores,
  // y el tuyo siempre aunque no entre en el corte
  const MAX_MARKERS = 16;
  const MAX_RESULTS = 30;
  const ranked = allMarkers ? [...allMarkers].sort((a, b) => b.pts - a.pts) : null;
  // "el mío" es mi marcador, o el de mi equipo cuando adivinan los equipos
  const mineId = teamsAll ? myTeam?.id ?? null : role.playerId;
  const mineIn = (list: DialMarker[]) =>
    mineId !== null && allMarkers && !list.some((m) => m.playerId === mineId)
      ? [...list, ...allMarkers.filter((m) => m.playerId === mineId)]
      : list;
  const revealMarkers = ranked ? mineIn(ranked.slice(0, MAX_MARKERS)) : null;
  const resultRows = ranked ? mineIn(ranked.slice(0, MAX_RESULTS)) : null;
  const hiddenCount = ranked && resultRows ? ranked.length - resultRows.length : 0;
  const hitCount = ranked ? ranked.filter((m) => m.pts > 0).length : 0;
  const coopGain = s.lastGains.find((g) => g.key === 'coop')?.pts ?? 0;
  const psyGain = revealMarkers
    ? s.lastGains.find((g) => g.key === `p${ffaPsychic(s).id}`)?.pts ?? 0
    : 0;

  return (
    <>
      {card && <PlayerCard player={card} onClose={() => setCard(null)} />}

      {isLateWatcher && (
        <p className="lobby-notice late-join-notice">
          ⏳ Ya estás dentro. Entras a jugar en la siguiente ronda: de mientras, puedes ver la
          partida.
        </p>
      )}

      {isHost && (
        <HostPanel
          players={players}
          assign={assign}
          uid={uid}
          hostUid={hostUid}
          onKick={onKick}
          onRestart={onRestartRound}
        />
      )}

      {inRound && (
        <div className="online-status">
          <span className="round-pill">
            {s.tiebreakKeys
              ? tiebreakLabel(s)
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
            {teamsAll ? (
              <>
                {activeTeam(s).name} juega con <b>x{ACTIVE_TEAM_MULT}</b> por ser el equipo de{' '}
                {psy}.
              </>
            ) : s.options.coop ? (
              coopGain > 0 ? (
                <>
                  Habéis sumado <b>+{coopGain}</b> al marcador común.
                </>
              ) : (
                'Ronda en blanco: el marcador común se queda igual.'
              )
            ) : s.options.fixedPsychic ? (
              hitCount > 0 ? (
                <>
                  <b>{hitCount}</b> {hitCount === 1 ? 'ha caído' : 'han caído'} en la zona de{' '}
                  {psy}.
                </>
              ) : (
                `Nadie ha caído en la zona de ${psy}.`
              )
            ) : s.tiebreakKeys ? (
              tiebreakRevealText(s, psy, psyGain)
            ) : psyGain > 0 ? (
              <>
                {psy} se lleva <b>+{psyGain}</b> por {psyGain === 1 ? 'un acertante' : `${psyGain} acertantes`}.
              </>
            ) : (
              `Nadie ha caído en la zona: ${psy} se queda a cero.`
            )}
          </p>
          <ul className="all-results">
            {(resultRows ?? []).map((m) => (
              <li
                key={m.playerId ?? m.name}
                className={`all-results__item c${m.colorIdx} ${
                  m.playerId === mineId ? 'all-results__item--me' : ''
                }`}
              >
                <button
                  type="button"
                  className="avatar-btn"
                  onClick={() =>
                    setCard({
                      name: m.name,
                      avatar: m.avatar,
                      bio: m.bio,
                      colorIdx: m.colorIdx,
                      tags: [m.pts > 0 ? `+${m.pts} esta ronda` : 'Sin puntos esta ronda'],
                    })
                  }
                  aria-label={`Ver el perfil de ${m.name}`}
                >
                  {m.avatar ? (
                    <Avatar name={m.name} avatar={m.avatar} size={28} colorIdx={m.colorIdx} />
                  ) : (
                    <span className="all-results__badge">{m.initials}</span>
                  )}
                </button>
                <span className="all-results__name">{m.name}</span>
                <span className={`all-results__pts ${m.pts === 0 ? 'all-results__pts--miss' : ''}`}>
                  {m.pts > 0 ? `+${m.pts}` : '0'}
                </span>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <p className="end-config__hint">… y {hiddenCount} más.</p>
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
          <p className="panel__kicker">{s.tiebreakKeys ? tiebreakLabel(s) : `Ronda ${s.round + 1}`}</p>
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
                : isGameOver(s) && (leaders(s).length === 1 || !s.options.tiebreak || competitorCount(s) <= 2)
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
          <h2 className="panel__title">{winnerText(rows, s.options.coop)}</h2>
          <ScoreTable rows={rows} final />
          {s.options.stats && <Stats s={s} />}
          {isHost ? (
            <div className="btn-row">
              {/* rehace la partida con la gente que hay ahora: así entran los que llegaron tarde */}
              <button className="btn btn--primary" onClick={playAgain}>
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
