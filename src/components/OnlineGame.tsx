import { useEffect, useRef, useState } from 'react';
import Dial from './Dial';
import ScoreTable from './ScoreTable';
import Confetti from './Confetti';
import RivalBet from './RivalBet';
import { CardPicker, CustomCardForm, ClueForm } from './CardPicker';
import { REVEAL_TEXT, buildRows, winnerText, Stats } from './gameShared';
import {
  psychicName,
  guesserNames,
  activeTeam,
  rivalTeam,
  ffaBystanderNames,
  isGameOver,
  leaders,
  totalRounds,
  type Action,
} from '../game/reducer';
import { roleFor, type Live } from '../game/online';
import { setSoundEnabled, sfx } from '../game/sound';
import type { GameState } from '../game/types';

type Props = {
  game: GameState;
  live: Live;
  assign: Record<string, number> | null;
  uid: string;
  isHost: boolean;
  sendAction: (a: Action) => void;
  setLiveNeedle: (angle: number) => void;
  backToLobby: () => void;
  onLeave: () => void;
};

function Waiting({ kicker, text }: { kicker: string; text: string }) {
  return (
    <section className="panel">
      <p className="panel__kicker">{kicker}</p>
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
  uid,
  isHost,
  sendAction,
  setLiveNeedle,
  backToLobby,
  onLeave,
}: Props) {
  const role = roleFor(s, assign, uid);
  const [localNeedle, setLocalNeedle] = useState(90);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const lastSent = useRef(0);
  const lastTick = useRef(90);

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
    if (s.phase !== 'guess' || !live.timerEnd) {
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
    const now = Date.now();
    if (now - lastSent.current > 100) {
      lastSent.current = now;
      setLiveNeedle(angle);
    }
  };

  const psy = psychicName(s);
  const inRound = !['standings', 'end'].includes(s.phase);
  const dialAngle = controlling ? localNeedle : s.phase === 'guess' ? (live.needle ?? s.needle) : s.needle;
  const showTarget = (s.phase === 'psychic' && role.isPsychic) || s.phase === 'reveal';
  const dialOpen = showTarget;
  const showCardStrip =
    s.card && ['psychic', 'clue', 'guess', 'rival-bet', 'reveal'].includes(s.phase);
  const rows = ['standings', 'end'].includes(s.phase) ? buildRows(s) : [];
  const total = s.tiebreakKeys ? null : totalRounds(s);

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
          />
          {s.phase === 'reveal' && s.lastPts === 4 && <Confetti />}
        </div>
      )}

      {s.phase === 'handoff' && <Waiting kicker={`Ronda ${s.round + 1}`} text={`Le toca de psíquico a ${psy}…`} />}

      {s.phase === 'card-pick' &&
        (role.isPsychic ? (
          <CardPicker
            psychic="tú"
            onRandom={() => sendAction({ type: 'PICK_RANDOM' })}
            onCustom={() => sendAction({ type: 'PICK_CUSTOM' })}
          />
        ) : (
          <Waiting kicker={`Psíquico: ${psy}`} text={`${psy} está eligiendo carta…`} />
        ))}

      {s.phase === 'custom-card' &&
        (role.isPsychic ? (
          <CustomCardForm
            onSubmit={(left, right, topic) => sendAction({ type: 'SET_CUSTOM_CARD', left, right, topic })}
            onBack={() => sendAction({ type: 'BEGIN_TURN' })}
          />
        ) : (
          <Waiting kicker={`Psíquico: ${psy}`} text={`${psy} está escribiendo su propia carta…`} />
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
          <Waiting kicker={`Psíquico: ${psy}`} text={`${psy} está memorizando la zona secreta…`} />
        ))}

      {s.phase === 'clue' &&
        (role.isPsychic ? (
          <ClueForm
            kicker="Psíquico: tú"
            guesser={guesserNames(s)}
            onSubmit={(text) => sendAction({ type: 'CLUE_GIVEN', text })}
          />
        ) : (
          <Waiting kicker={`Psíquico: ${psy}`} text={`Atentos: ${psy} va a dar la pista…`} />
        ))}

      {s.phase === 'guess' &&
        (role.isGuesser ? (
          <section className="panel">
            <p className="panel__kicker">Te toca</p>
            {s.clue ? (
              <p className="panel__text">
                Pista: <b>«{s.clue}»</b>
              </p>
            ) : (
              <p className="panel__text">Arrastra la aguja hasta donde creas que apunta la pista.</p>
            )}
            <button className="btn btn--primary" onClick={() => sendAction({ type: 'CONFIRM_GUESS' })}>
              Confirmar posición
            </button>
          </section>
        ) : (
          <Waiting
            kicker="Adivinando"
            text={s.clue ? `Pista: «${s.clue}»` : `${guesserNames(s)} está moviendo la aguja…`}
          />
        ))}

      {s.phase === 'rival-bet' &&
        (role.isRival ? (
          <RivalBet rivalName="Vuestra apuesta" onBet={(side) => sendAction({ type: 'PLACE_BET', side })} />
        ) : (
          <Waiting kicker="Apuesta rival" text={`${rivalTeam(s).name} está apostando…`} />
        ))}

      {s.phase === 'reveal' && (
        <section className="panel">
          <p className={`reveal-points ${s.lastPts === 0 ? 'reveal-points--miss' : ''}`}>
            {REVEAL_TEXT[s.lastPts]} <b>+{s.lastPts}</b>
          </p>
          <p className="panel__text">
            {s.mode === 'ffa' ? (
              <>
                {s.lastPts > 0
                  ? s.tiebreakKeys
                    ? `Para ${guesserNames(s)} (en muerte súbita solo puntúa quien adivina).`
                    : `Para ${psy} y ${guesserNames(s)}.`
                  : s.bet === null
                    ? 'Nadie puntúa esta ronda.'
                    : ''}
                {s.bet !== null && (
                  <>
                    {' '}
                    Apuesta de {ffaBystanderNames(s)}: {s.bet === 'left' ? '◀ izquierda' : 'derecha ▶'} —{' '}
                    {s.betWon ? <b>acierta, +1</b> : s.lastPts === 4 ? 'el 4 la anula' : 'falla'}.
                  </>
                )}
              </>
            ) : (
              <>
                {s.lastPts > 0 ? `Para ${activeTeam(s).name}. ` : s.bet === null ? 'Nadie puntúa esta ronda.' : ''}
                {s.bet !== null && (
                  <>
                    {rivalTeam(s).name} apostó {s.bet === 'left' ? '◀ izquierda' : 'derecha ▶'}:{' '}
                    {s.betWon ? <b>acierta, +1</b> : s.lastPts === 4 ? 'el 4 anula la apuesta' : 'falla'}.
                  </>
                )}
              </>
            )}
          </p>
          <button className="btn btn--primary" onClick={() => sendAction({ type: 'SHOW_STANDINGS' })}>
            Ver clasificación
          </button>
        </section>
      )}

      {s.phase === 'standings' && (
        <section className="panel panel--setup">
          <p className="panel__kicker">{s.tiebreakKeys ? '⚡ Muerte súbita' : `Ronda ${s.round + 1}`}</p>
          <h2 className="panel__title">Clasificación</h2>
          <ScoreTable rows={rows} />
          <button className="btn btn--primary" onClick={() => sendAction({ type: 'NEXT_ROUND' })}>
            {s.tiebreakKeys
              ? 'Continuar'
              : isGameOver(s) && (leaders(s).length === 1 || !s.options.tiebreak)
                ? 'Resultado final'
                : isGameOver(s)
                  ? '⚡ ¡Desempate!'
                  : 'Siguiente ronda'}
          </button>
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
