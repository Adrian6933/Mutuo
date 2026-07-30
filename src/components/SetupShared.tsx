import type React from 'react';
import { CATEGORIES, type CategoryId } from '../data/cards';
import { ALL_CATEGORIES, MAX_GOAL, MAX_LAPS } from '../game/reducer';
import type { EndRule, Mode, Options } from '../game/types';

type PlayerRowProps = {
  name: string;
  placeholder: string;
  canRemove: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  handleProps?: React.HTMLAttributes<HTMLButtonElement>;
  style?: React.CSSProperties;
};

export function PlayerRow({
  name,
  placeholder,
  canRemove,
  onRename,
  onRemove,
  handleProps,
  style,
}: PlayerRowProps) {
  return (
    <div className="player-row" style={style}>
      {handleProps && (
        <button
          className="drag-handle"
          type="button"
          aria-label={`Mover a ${name || placeholder}`}
          {...handleProps}
        >
          ⠿
        </button>
      )}
      <input
        className="input"
        value={name}
        placeholder={placeholder}
        maxLength={20}
        onChange={(e) => onRename(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-label={`Nombre de ${placeholder}`}
      />
      <button
        className="icon-btn"
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Eliminar ${name || placeholder}`}
      >
        ✕
      </button>
    </div>
  );
}

const LAPS_OPTIONS = [1, 2, 3];
const GOAL_OPTIONS = [10, 15, 20];

type EndConfigProps = {
  mode: Mode;
  endRule: EndRule;
  onChange: (rule: EndRule) => void;
};

export function EndConfig({ mode, endRule, onChange }: EndConfigProps) {
  const lapsLabel = mode !== 'teams' ? 'Vueltas' : 'Rondas';
  const isLaps = endRule.kind === 'laps';
  const value = isLaps ? endRule.laps : endRule.goal;
  const max = isLaps ? MAX_LAPS : MAX_GOAL;
  const presets = isLaps ? LAPS_OPTIONS : GOAL_OPTIONS;

  return (
    <div className="end-config">
      <p className="panel__kicker">Fin de partida</p>
      <div className="seg" role="tablist" aria-label="Tipo de fin de partida">
        <button
          type="button"
          className={`seg__opt ${isLaps ? 'seg__opt--on' : ''}`}
          onClick={() => onChange({ kind: 'laps', laps: 1 })}
        >
          {lapsLabel}
        </button>
        <button
          type="button"
          className={`seg__opt ${!isLaps ? 'seg__opt--on' : ''}`}
          onClick={() => onChange({ kind: 'points', goal: 10 })}
        >
          Puntos
        </button>
      </div>
      <div className="chip-row">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            className={`chip ${value === n ? 'chip--on' : ''}`}
            onClick={() => onChange(isLaps ? { kind: 'laps', laps: n } : { kind: 'points', goal: n })}
          >
            {isLaps ? `${n} ${mode !== 'teams' ? (n === 1 ? 'vuelta' : 'vueltas') : 'por equipo'}` : `${n} puntos`}
          </button>
        ))}
        <label className={`chip chip--custom ${!presets.includes(value) ? 'chip--on' : ''}`}>
          <input
            type="number"
            min={1}
            max={max}
            value={value}
            onChange={(e) => {
              const n = Math.max(1, Math.min(max, Number(e.target.value) || 1));
              onChange(isLaps ? { kind: 'laps', laps: n } : { kind: 'points', goal: n });
            }}
            aria-label={isLaps ? `Número de ${lapsLabel.toLowerCase()} (máx. ${max})` : `Puntos para ganar (máx. ${max})`}
          />
          <span>máx. {max}</span>
        </label>
      </div>
      <p className="end-config__hint">
        {isLaps
          ? mode !== 'teams'
            ? 'Una vuelta = cada jugador es psíquico una vez.'
            : 'Cada equipo juega ese número de rondas.'
          : 'Gana quien llegue primero a la meta.'}
      </p>
    </div>
  );
}

type CategoryPickerProps = {
  categories: CategoryId[];
  onChange: (categories: CategoryId[]) => void;
};

export function CategoryPicker({ categories, onChange }: CategoryPickerProps) {
  const allOn = categories.length === ALL_CATEGORIES.length;
  const toggle = (id: CategoryId) => {
    const next = categories.includes(id)
      ? categories.filter((c) => c !== id)
      : [...categories, id];
    onChange(next.length === 0 ? [id] : next);
  };
  return (
    <div className="end-config">
      <p className="panel__kicker">Temas de las cartas</p>
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${allOn ? 'chip--on' : ''}`}
          onClick={() => onChange([...ALL_CATEGORIES])}
        >
          Todas
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${!allOn && categories.includes(c.id) ? 'chip--on' : ''}`}
            onClick={() => (allOn ? onChange([c.id]) : toggle(c.id))}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="end-config__hint">
        {allOn
          ? 'Cartas de todos los temas.'
          : categories.length === 1
            ? '1 tema activo.'
            : `${categories.length} temas activos.`}
      </p>
    </div>
  );
}

type ToggleProps = {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

export function ToggleRow({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      className="toggle-row"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {hint && <span className="toggle-row__hint">{hint}</span>}
      </span>
      <span className={`switch ${checked ? 'switch--on' : ''}`} aria-hidden="true">
        <span className="switch__knob" />
      </span>
    </button>
  );
}

const TIMER_OPTIONS: Options['timerSecs'][] = [0, 15, 20, 30];
const REVEAL_OPTIONS: Options['revealSecs'][] = [0, 5, 10, 15];
const STANDINGS_OPTIONS: Options['standingsSecs'][] = [0, 8, 15];
const VOTE_PCT_OPTIONS: Options['skipVotePct'][] = [50, 60, 75, 100];

type ExtrasProps = {
  mode: Mode;
  options: Options;
  onChange: (options: Partial<Options>) => void;
};

export function ExtrasConfig({ mode, options, onChange }: ExtrasProps) {
  return (
    <div className="end-config extras">
      <p className="panel__kicker">Extras</p>
      {mode === 'ffa' && (
        <ToggleRow
          label="Todos adivinan a la vez"
          hint={
            'Cada uno mueve su propia aguja sin ver la del resto (online: a la vez; local: uno detrás de otro sin enseñarla). ' +
            'El psíquico gana +1 punto por cada acertante. Si lo desactivas, solo adivina el siguiente y el resto apuesta de qué lado cae.'
          }
          checked={options.allGuess}
          onChange={(v) => onChange({ allGuess: v })}
        />
      )}
      {(mode === 'teams' || (mode === 'ffa' && !options.allGuess)) && (
        <ToggleRow
          label={mode === 'teams' ? 'Apuesta rival' : 'Apuesta de lado'}
          hint={
            mode === 'teams'
              ? 'El otro equipo apuesta a qué lado de la aguja está la zona (+1 si acierta).'
              : 'Los que no juegan esta ronda apuestan a qué lado está la zona (+1 si aciertan).'
          }
          checked={options.rivalBet}
          onChange={(v) => onChange({ rivalBet: v })}
        />
      )}
      <div className="toggle-row toggle-row--static">
        <span className="toggle-row__text">
          <span className="toggle-row__label">Temporizador para adivinar</span>
          <span className="toggle-row__hint">A cero, la aguja se queda donde esté.</span>
        </span>
        <span className="chip-row chip-row--tight">
          {TIMER_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip chip--mini ${options.timerSecs === t ? 'chip--on' : ''}`}
              onClick={() => onChange({ timerSecs: t })}
            >
              {t === 0 ? 'Off' : `${t}s`}
            </button>
          ))}
          <div className="custom-timer-input-wrap">
            <input
              type="number"
              className="input custom-timer-input"
              value={!TIMER_OPTIONS.includes(options.timerSecs) ? options.timerSecs : ''}
              placeholder="Pers."
              min={1}
              max={50}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  onChange({ timerSecs: Math.max(1, Math.min(50, val)) });
                } else {
                  onChange({ timerSecs: 0 });
                }
              }}
            />
          </div>
        </span>
      </div>
      <div className="toggle-row toggle-row--static">
        <span className="toggle-row__text">
          <span className="toggle-row__label">Temporizador para ver resultados</span>
          <span className="toggle-row__hint">A cero, la pantalla de resultados no se pasa sola.</span>
        </span>
        <span className="chip-row chip-row--tight">
          {REVEAL_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip chip--mini ${options.revealSecs === t ? 'chip--on' : ''}`}
              onClick={() => onChange({ revealSecs: t })}
            >
              {t === 0 ? 'Off' : `${t}s`}
            </button>
          ))}
          <div className="custom-timer-input-wrap">
            <input
              type="number"
              className="input custom-timer-input"
              value={!REVEAL_OPTIONS.includes(options.revealSecs) ? options.revealSecs : ''}
              placeholder="Pers."
              min={1}
              max={60}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  onChange({ revealSecs: Math.max(1, Math.min(60, val)) });
                } else {
                  onChange({ revealSecs: 0 });
                }
              }}
            />
          </div>
        </span>
      </div>
      <div className="toggle-row toggle-row--static">
        <span className="toggle-row__text">
          <span className="toggle-row__label">Avanzar de ronda solo</span>
          <span className="toggle-row__hint">
            Al ver la clasificación, pasa a la siguiente ronda sin esperar a que alguien pulse el
            botón.
          </span>
        </span>
        <span className="chip-row chip-row--tight">
          {STANDINGS_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip chip--mini ${options.standingsSecs === t ? 'chip--on' : ''}`}
              onClick={() => onChange({ standingsSecs: t })}
            >
              {t === 0 ? 'Off' : `${t}s`}
            </button>
          ))}
          <div className="custom-timer-input-wrap">
            <input
              type="number"
              className="input custom-timer-input"
              value={!STANDINGS_OPTIONS.includes(options.standingsSecs) ? options.standingsSecs : ''}
              placeholder="Pers."
              min={1}
              max={60}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  onChange({ standingsSecs: Math.max(1, Math.min(60, val)) });
                } else {
                  onChange({ standingsSecs: 0 });
                }
              }}
            />
          </div>
        </span>
      </div>
      <div className="toggle-row toggle-row--static">
        <span className="toggle-row__text">
          <span className="toggle-row__label">Modo para pasar de fase</span>
          <span className="toggle-row__hint">
            {options.advanceMode === 'vote'
              ? 'Los jugadores pueden votar para avanzar. Al alcanzar el porcentaje necesario, pasa automáticamente.'
              : 'Solo el anfitrión (o el temporizador) puede hacer avanzar la pantalla.'}
          </span>
        </span>
        <span className="seg">
          <button
            type="button"
            className={`seg__opt ${options.advanceMode === 'admin' ? 'seg__opt--on' : ''}`}
            onClick={() => onChange({ advanceMode: 'admin' })}
          >
            Anfitrión
          </button>
          <button
            type="button"
            className={`seg__opt ${options.advanceMode === 'vote' ? 'seg__opt--on' : ''}`}
            onClick={() => onChange({ advanceMode: 'vote' })}
          >
            Por votos
          </button>
        </span>
      </div>
      {options.advanceMode === 'vote' && (
        <div className="toggle-row toggle-row--static">
          <span className="toggle-row__text">
            <span className="toggle-row__label">Votos para avanzar</span>
            <span className="toggle-row__hint">Porcentaje de jugadores conectados que deben votar para avanzar.</span>
          </span>
          <span className="chip-row chip-row--tight">
            {VOTE_PCT_OPTIONS.map((pct) => (
              <button
                key={pct}
                type="button"
                className={`chip chip--mini ${options.skipVotePct === pct ? 'chip--on' : ''}`}
                onClick={() => onChange({ skipVotePct: pct })}
              >
                {pct}%
              </button>
            ))}
          </span>
        </div>
      )}
      <ToggleRow
        label="Desempate automático"
        hint="Si hay empate al final, muerte súbita entre los empatados."
        checked={options.tiebreak}
        onChange={(v) => onChange({ tiebreak: v })}
      />
      <ToggleRow
        label="Rotación aleatoria"
        hint="Cambia el orden de turnos aleatoriamente tras cada ronda completa."
        checked={options.randomRotation}
        onChange={(v) => onChange({ randomRotation: v })}
      />
      <ToggleRow
        label="Estadísticas al final"
        hint="Cuatros clavados, mejor psíquico y más."
        checked={options.stats}
        onChange={(v) => onChange({ stats: v })}
      />
      <ToggleRow
        label="Sonidos"
        hint="Tics de la aguja y fanfarria al clavar el 4."
        checked={options.sound}
        onChange={(v) => onChange({ sound: v })}
      />
    </div>
  );
}
