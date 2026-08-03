import { useEffect, useReducer, useRef, useState } from 'react';
import Dial, { scoreFor, type DialMarker } from './Dial';
import Menu from './Menu';
import Online from './Online';
import ProfileScreen from './ProfileScreen';
import CardsScreen from './CardsScreen';
import SetupFfa from './SetupFfa';
import SetupTeams from './SetupTeams';
import { CardPicker, CustomCardForm, ClueForm } from './CardPicker';
import RivalBet from './RivalBet';
import ScoreTable from './ScoreTable';
import Confetti from './Confetti';
import {
  reducer,
  initialState,
  simultaneousGuess,
  currentGuessTeam,
  ACTIVE_TEAM_MULT,
  psychicName,
  guesserNames,
  activeTeam,
  activeTeamIdx,
  rivalTeam,
  ffaBystanderNames,
  ffaBystanders,
  ffaPsychic,
  allGuessers,
  currentGuesser,
  colorIdx,
  circularDelta,
  totalRounds,
  isGameOver,
  leaders,
  competitorCount,
  COLOR_COUNT,
} from '../game/reducer';
import { loadPrefs, savePrefs, prefsFromState, loadState, saveState, clearState } from '../game/storage';
import { setSoundEnabled, sfx } from '../game/sound';
import type { GameState } from '../game/types';

import {
  REVEAL_TEXT,
  buildRows,
  winnerText,
  initialsOf,
  tiebreakLabel,
  tiebreakRevealText,
  Stats,
} from './gameShared';

export default function Game() {
  const [s, dispatch] = useReducer(reducer, initialState);
  const [online, setOnline] = useState(false);
  const [screen, setScreen] = useState<'profile' | 'cards' | null>(null);
  const [homeConfirm, setHomeConfirm] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [standingsLeft, setStandingsLeft] = useState<number | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const prevPhase = useRef(s.phase);
  const lastTick = useRef(90);

  // partida guardada de una sesión anterior (en efecto: localStorage no existe en SSR)
  useEffect(() => {
    setSaved(loadState());
  }, []);

  // guarda preferencias al arrancar partida desde el setup, y la partida en curso
  useEffect(() => {
    if (prevPhase.current === 'setup' && s.phase === 'handoff') {
      savePrefs(s.mode, prefsFromState(s));
    }
    if (prevPhase.current !== s.phase) setHomeConfirm(false);
    // al volver al menú, reofrece la partida guardada (p. ej. tras "Salir")
    if (prevPhase.current !== 'menu' && s.phase === 'menu') setSaved(loadState());
    prevPhase.current = s.phase;
    if (!['menu', 'setup'].includes(s.phase)) {
      if (s.phase === 'end') clearState();
      else saveState(s);
    }
  }, [s]);

  useEffect(() => {
    setSoundEnabled(s.options.sound);
  }, [s.options.sound]);

  // sonidos de reveal
  useEffect(() => {
    if (s.phase !== 'reveal') return;
    if (s.lastPts === 4) sfx.tada();
    else if (s.lastPts > 0) sfx.reveal();
    else sfx.fail();
  }, [s.phase, s.lastPts]);

  // temporizador de adivinar
  useEffect(() => {
    if (s.phase !== 'guess' || s.options.timerSecs === 0) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(s.options.timerSecs);
    const id = setInterval(() => setTimeLeft((t) => (t === null ? null : t - 1)), 1000);
    return () => clearInterval(id);
  }, [s.phase, s.options.timerSecs]);

  useEffect(() => {
    if (timeLeft === 0 && s.phase === 'guess') dispatch({ type: 'CONFIRM_GUESS' });
  }, [timeLeft, s.phase]);

  // temporizador para dar la pista: a cero se pasa a adivinar con lo que haya escrito
  const [clueLeft, setClueLeft] = useState<number | null>(null);

  useEffect(() => {
    const secs = s.options.clueSecs ?? 0;
    if (s.phase !== 'clue' || secs <= 0) {
      setClueLeft(null);
      return;
    }
    setClueLeft(secs);
    const id = setInterval(() => setClueLeft((t) => (t === null ? null : t - 1)), 1000);
    return () => clearInterval(id);
  }, [s.phase, s.round, s.options.clueSecs]);

  useEffect(() => {
    if (clueLeft === 0 && s.phase === 'clue') dispatch({ type: 'CLUE_GIVEN', text: '' });
  }, [clueLeft, s.phase]);

  const [revealLeft, setRevealLeft] = useState<number | null>(null);

  // avance automático de los resultados a la clasificación
  useEffect(() => {
    if (s.phase !== 'reveal' || !s.options.revealSecs || s.options.revealSecs === 0) {
      setRevealLeft(null);
      return;
    }
    setRevealLeft(s.options.revealSecs);
    const id = setInterval(() => setRevealLeft((t) => (t === null ? null : t - 1)), 1000);
    return () => clearInterval(id);
  }, [s.phase, s.round, s.options.revealSecs]);

  useEffect(() => {
    if (revealLeft === 0 && s.phase === 'reveal') dispatch({ type: 'SHOW_STANDINGS' });
  }, [revealLeft, s.phase]);

  // avance automático de la clasificación a la siguiente ronda
  useEffect(() => {
    if (s.phase !== 'standings' || s.options.standingsSecs === 0) {
      setStandingsLeft(null);
      return;
    }
    setStandingsLeft(s.options.standingsSecs);
    const id = setInterval(() => setStandingsLeft((t) => (t === null ? null : t - 1)), 1000);
    return () => clearInterval(id);
  }, [s.phase, s.round, s.options.standingsSecs]);

  useEffect(() => {
    if (standingsLeft === 0 && s.phase === 'standings') dispatch({ type: 'NEXT_ROUND' });
  }, [standingsLeft, s.phase]);

  const onNeedle = (angle: number) => {
    if (Math.abs(angle - lastTick.current) >= 4) {
      lastTick.current = angle;
      sfx.tick();
    }
    dispatch({ type: 'SET_NEEDLE', angle });
  };

  const goHome = () => {
    if (s.phase === 'menu') return;
    if (s.phase === 'setup' || s.phase === 'end') {
      dispatch({ type: 'GO_HOME' });
      return;
    }
    setHomeConfirm(true);
  };

  if (online) return <Online onExit={() => setOnline(false)} />;

  if (screen) {
    return (
      <div className="game">
        <header className="game__header">
          <button className="logo logo--btn" onClick={() => setScreen(null)} aria-label="Volver al inicio">
            MUTUO
          </button>
        </header>
        <main className="game__table">
          {screen === 'profile' ? (
            <ProfileScreen onBack={() => setScreen(null)} />
          ) : (
            <CardsScreen onBack={() => setScreen(null)} />
          )}
        </main>
      </div>
    );
  }

  const inRound = !['menu', 'setup', 'standings', 'end'].includes(s.phase);
  const dialVisible = s.phase === 'menu' || inRound;
  const dialOpen = s.phase === 'psychic' || s.phase === 'reveal';
  const showCardStrip = ['psychic', 'clue', 'guess', 'guess-handoff', 'rival-bet', 'reveal'].includes(s.phase);
  const rows = ['standings', 'end'].includes(s.phase) ? buildRows(s) : [];
  const total = s.tiebreakKeys ? null : inRound || s.phase === 'standings' ? totalRounds(s) : null;

  // reveal de "todos adivinan": marcador por adivinador sobre el dial
  const revealAll = s.phase === 'reveal' && simultaneousGuess(s);
  const activeIdx = s.mode === 'teams' && s.teams.length > 0 ? activeTeamIdx(s) : -1;
  const markers: DialMarker[] | null = !revealAll
    ? null
    : s.mode === 'teams'
      ? // un marcador por equipo; el del psíquico puntúa x3
        s.teams.map((t, i) => {
          const angle = s.guesses?.[`t${t.id}`] ?? 90;
          const band = scoreFor(angle, s.target);
          return {
            angle,
            initials: initialsOf(t.name),
            name: t.name,
            colorIdx: colorIdx(s, `t${t.id}`),
            pts: i === activeIdx ? band * ACTIVE_TEAM_MULT : band,
          };
        })
      : allGuessers(s).map((p) => {
          const angle = s.guesses?.[p.id.toString()] ?? 90;
          return {
            angle,
            initials: initialsOf(p.name),
            name: p.name,
            colorIdx: colorIdx(s, `p${p.id}`),
            pts: scoreFor(angle, s.target),
          };
        });
  const psyGain = revealAll && s.mode === 'ffa'
    ? s.lastGains.find((g) => g.key === `p${ffaPsychic(s).id}`)?.pts ?? 0
    : 0;

  return (
    <div className="game">
      <header className="game__header">
        <button className="logo logo--btn" onClick={goHome} aria-label="Volver al inicio">
          MUTUO
        </button>
        {(inRound || s.phase === 'standings') && (
          <div className="scoreboard">
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
            {revealLeft !== null && (
              <span className={`round-pill timer-pill ${revealLeft <= 5 ? 'timer-pill--low' : ''}`}>
                ⏱ {revealLeft}s
              </span>
            )}
            {s.mode === 'teams' &&
              s.teams.length <= 3 &&
              s.teams.map((t, i) => (
                <span
                  key={t.id}
                  className={`score-chip c${i % COLOR_COUNT} ${
                    inRound && i === activeTeamIdx(s) ? 'score-chip--active' : ''
                  }`}
                >
                  {t.name} <b>{t.score}</b>
                </span>
              ))}
          </div>
        )}
      </header>

      {homeConfirm && (
        <div className="home-confirm">
          <span>¿Volver al inicio? La partida queda guardada.</span>
          <div className="home-confirm__actions">
            <button
              className="btn btn--ghost btn--small"
              onClick={() => {
                setHomeConfirm(false);
                dispatch({ type: 'GO_HOME' });
              }}
            >
              Salir
            </button>
            <button className="btn btn--primary btn--small" onClick={() => setHomeConfirm(false)}>
              Seguir jugando
            </button>
          </div>
        </div>
      )}

      <main className="game__table">
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
          dialVisible && <div className="spectrum-card spectrum-card--empty" aria-hidden="true" />
        )}

        {dialVisible && (
          <div className="dial-wrap">
            <Dial
              angle={s.needle}
              target={dialOpen && s.card ? s.target : null}
              open={dialOpen}
              interactive={s.phase === 'guess'}
              onChange={onNeedle}
              markers={markers}
              showNeedle={!revealAll}
            />
            {s.phase === 'reveal' && s.lastPts === 4 && <Confetti />}
          </div>
        )}

        {s.phase === 'menu' && (
          <Menu
            onMode={(mode, variant) =>
              dispatch({
                type: 'CHOOSE_MODE',
                mode,
                prefs: loadPrefs(mode),
                presenter: !!variant?.presenter,
                coop: !!variant?.coop,
              })
            }
            onOnline={() => setOnline(true)}
            onProfile={() => setScreen('profile')}
            onCards={() => setScreen('cards')}
            onContinue={
              saved
                ? () => {
                    // spread sobre initialState: rellena campos añadidos después de guardar (clue, bets…)
                    dispatch({ type: 'RESTORE', state: { ...initialState, ...saved } });
                    setSaved(null);
                  }
                : undefined
            }
          />
        )}

        {s.phase === 'setup' &&
          (s.mode === 'teams' ? (
            <SetupTeams s={s} dispatch={dispatch} />
          ) : (
            <SetupFfa s={s} dispatch={dispatch} />
          ))}

        {s.phase === 'handoff' && (
          <section className="panel">
            <p className="panel__kicker">
              {s.tiebreakKeys ? tiebreakLabel(s) : `Ronda ${s.round + 1}`}
              {s.mode === 'teams' ? ` · ${activeTeam(s).name}` : ''}
            </p>
            <h2 className="panel__title">{psychicName(s)}, te toca de psíquico</h2>
            <p className="panel__text">Pasadle el móvil. Que nadie más mire la pantalla.</p>
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'BEGIN_TURN' })}>
              Soy {psychicName(s)}
            </button>
          </section>
        )}

        {s.phase === 'card-pick' && (
          <CardPicker
            psychic={psychicName(s)}
            onRandom={() => dispatch({ type: 'PICK_RANDOM' })}
            onCustom={() => dispatch({ type: 'PICK_CUSTOM' })}
          />
        )}

        {s.phase === 'custom-card' && (
          <CustomCardForm
            onSubmit={(left, right, topic) => dispatch({ type: 'SET_CUSTOM_CARD', left, right, topic })}
            onBack={() => dispatch({ type: 'BEGIN_TURN' })}
          />
        )}

        {s.phase === 'psychic' && (
          <section className="panel">
            <p className="panel__kicker">Solo para tus ojos</p>
            <p className="panel__text">
              Memoriza dónde está la zona. Piensa una pista que encaje justo en ese punto entre{' '}
              <b>{s.card?.left}</b> y <b>{s.card?.right}</b>.
            </p>
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'HIDE_ZONE' })}>
              Ocultar zona
            </button>
          </section>
        )}

        {s.phase === 'clue' && (
          <ClueForm
            kicker={`Psíquico: ${psychicName(s)}`}
            guesser={guesserNames(s)}
            onSubmit={(text) => dispatch({ type: 'CLUE_GIVEN', text })}
            timeLeft={clueLeft}
          />
        )}

        {s.phase === 'guess-handoff' && (
          <section className="panel">
            <p className="panel__kicker">
              Adivina {s.guesserIdx + 1} de{' '}
              {s.mode === 'teams' ? s.teams.length : allGuessers(s).length}
            </p>
            <h2 className="panel__title">
              {s.mode === 'teams'
                ? `${currentGuessTeam(s).name}, os toca adivinar`
                : `${currentGuesser(s).name}, te toca adivinar`}
            </h2>
            {s.clue && (
              <p className="panel__text">
                Pista: <b>«{s.clue}»</b>
              </p>
            )}
            <p className="panel__text">Pasadle el móvil sin comentar la jugada.</p>
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'BEGIN_GUESS' })}>
              {s.mode === 'teams'
                ? `Somos ${currentGuessTeam(s).name}`
                : `Soy ${currentGuesser(s).name}`}
            </button>
          </section>
        )}

        {s.phase === 'guess' && (
          <section className="panel">
            <p className="panel__kicker">
              {s.mode === 'teams' && s.options.teamsAllGuess
                ? `${currentGuessTeam(s).name} · ${s.guesserIdx + 1}/${s.teams.length}${
                    activeIdx === s.teams.findIndex((t) => t.id === currentGuessTeam(s).id)
                      ? ' · x3'
                      : ''
                  }`
                : s.mode === 'ffa' && simultaneousGuess(s)
                  ? `${currentGuesser(s).name} · ${s.guesserIdx + 1}/${allGuessers(s).length}`
                  : guesserNames(s)}
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
              <p className="panel__text">
                {s.mode === 'ffa' && simultaneousGuess(s)
                  ? 'Arrastra la aguja hasta donde creas que apunta la pista.'
                  : 'Arrastrad la aguja hasta donde creáis que apunta la pista.'}
              </p>
            )}
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'CONFIRM_GUESS' })}>
              Confirmar posición
            </button>
          </section>
        )}

        {s.phase === 'rival-bet' && (
          <RivalBet
            rivalName={s.mode === 'ffa' ? ffaBystanderNames(s) : rivalTeam(s).name}
            onBet={(side) => dispatch({ type: 'PLACE_BET', side })}
          />
        )}

        {revealAll && markers && (
          <section className="panel">
            <p className={`reveal-points ${s.lastPts === 0 ? 'reveal-points--miss' : ''}`}>
              {REVEAL_TEXT[s.lastPts]}
            </p>
            <p className="panel__text">
              {s.mode === 'teams' ? (
                <>
                  {activeTeam(s).name} juega con <b>x{ACTIVE_TEAM_MULT}</b> por ser el equipo de{' '}
                  {psychicName(s)}.
                </>
              ) : s.options.coop ? (
                (() => {
                  const won = s.lastGains.find((g) => g.key === 'coop')?.pts ?? 0;
                  return won > 0
                    ? `Habéis sumado +${won} al marcador común.`
                    : 'Ronda en blanco: el marcador común se queda igual.';
                })()
              ) : s.options.fixedPsychic ? (
                (() => {
                  const hits = markers.filter((m) => m.pts > 0).length;
                  return hits > 0
                    ? `${hits} ${hits === 1 ? 'ha caído' : 'han caído'} en la zona de ${psychicName(s)}.`
                    : `Nadie ha caído en la zona de ${psychicName(s)}.`;
                })()
              ) : s.tiebreakKeys ? (
                tiebreakRevealText(s, psychicName(s), psyGain)
              ) : psyGain > 0 ? (
                <>
                  {psychicName(s)} se lleva <b>+{psyGain}</b> por{' '}
                  {psyGain === 1 ? 'un acertante' : `${psyGain} acertantes`}.
                </>
              ) : (
                `Nadie ha caído en la zona: ${psychicName(s)} se queda a cero.`
              )}
            </p>
            <ul className="all-results">
              {[...markers]
                .sort((a, b) => b.pts - a.pts)
                .map((m) => (
                  <li key={m.name} className={`all-results__item c${m.colorIdx}`}>
                    <span className="all-results__badge">{m.initials}</span>
                    <span className="all-results__name">{m.name}</span>
                    <span className={`all-results__pts ${m.pts === 0 ? 'all-results__pts--miss' : ''}`}>
                      {m.pts > 0 ? `+${m.pts}` : '0'}
                    </span>
                  </li>
                ))}
            </ul>
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'SHOW_STANDINGS' })}>
              Ver clasificación
            </button>
          </section>
        )}

        {s.phase === 'reveal' && !revealAll && (
          <section className="panel">
            <p className={`reveal-points ${s.lastPts === 0 ? 'reveal-points--miss' : ''}`}>
              {REVEAL_TEXT[s.lastPts]} <b>+{s.lastPts}</b>
            </p>
            <p className="panel__text">
              {s.mode === 'ffa' ? (
                s.lastPts > 0
                  ? s.tiebreakKeys
                    ? `Para ${guesserNames(s)} (en muerte súbita solo puntúa quien adivina).`
                    : `Para ${psychicName(s)} y ${guesserNames(s)}.`
                  : 'Nadie puntúa por la aguja.'
              ) : (
                <>
                  {s.lastPts > 0
                    ? `Para ${activeTeam(s).name}. `
                    : s.bet === null
                      ? 'Nadie puntúa esta ronda.'
                      : ''}
                  {s.bet !== null && (
                    <>
                      {rivalTeam(s).name} apostó {s.bet === 'left' ? '◀ izquierda' : s.bet === 'right' ? 'derecha ▶' : s.bet === 'exact' ? '🎯 4 Exacto' : '❌ no ha adivinado'}:{' '}
                      {s.betWon ? (
                        <b>acierta, +1</b>
                      ) : (
                        'falla'
                      )}
                      .
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
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'SHOW_STANDINGS' })}>
              Ver clasificación
            </button>
          </section>
        )}

        {s.phase === 'standings' && (
          <section className="panel panel--setup">
            <p className="panel__kicker">
              {s.tiebreakKeys ? tiebreakLabel(s) : `Ronda ${s.round + 1}`}
            </p>
            <h2 className="panel__title">Clasificación</h2>
            <ScoreTable rows={rows} />
            <button className="btn btn--primary" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>
              {s.tiebreakKeys
                ? 'Continuar'
                : isGameOver(s) && (leaders(s).length === 1 || !s.options.tiebreak || competitorCount(s) <= 2)
                  ? 'Resultado final'
                  : isGameOver(s)
                    ? '⚡ ¡Desempate!'
                    : 'Siguiente ronda'}
            </button>
            {standingsLeft !== null && (
              <p className="end-config__hint">Seguimos solos en {standingsLeft}s…</p>
            )}
          </section>
        )}

        {s.phase === 'end' && (
          <section className="panel panel--setup">
            <p className="panel__kicker">Fin de la partida</p>
            <h2 className="panel__title">{winnerText(rows, s.options.coop)}</h2>
            <ScoreTable rows={rows} final />
            {s.options.stats && <Stats s={s} />}
            <div className="btn-row">
              <button className="btn btn--primary" onClick={() => dispatch({ type: 'PLAY_AGAIN' })}>
                Jugar otra vez
              </button>
              <button className="btn btn--ghost" onClick={() => dispatch({ type: 'BACK_TO_MENU' })}>
                Menú
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
