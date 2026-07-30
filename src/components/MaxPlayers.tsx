/** Tope de jugadores de una lobby: atajos + un hueco para escribir el tuyo. */

export const MAX_PLAYERS_PRESETS: (number | null)[] = [null, 4, 6, 8, 10, 12];
export const MAX_PLAYERS_LIMIT = 500;

type Props = {
  value: number | null;
  onChange: (value: number | null) => void;
  /** no se puede bajar del número de gente que ya está dentro */
  min?: number;
};

export default function MaxPlayersPicker({ value, onChange, min = 2 }: Props) {
  const isCustom = value !== null && !MAX_PLAYERS_PRESETS.includes(value);
  return (
    <div className="limit-row">
      <p className="panel__kicker">Límite de jugadores</p>
      <div className="chip-row chip-row--tight">
        {MAX_PLAYERS_PRESETS.map((n) => (
          <button
            key={n ?? 'sin'}
            type="button"
            className={`chip chip--mini ${value === n ? 'chip--on' : ''}`}
            onClick={() => onChange(n)}
            disabled={n !== null && n < min}
            title={n !== null && n < min ? `Ya hay ${min} jugadores dentro` : undefined}
          >
            {n === null ? 'Sin límite' : n}
          </button>
        ))}
        <div className="custom-timer-input-wrap">
          <input
            type="number"
            className={`input custom-timer-input ${isCustom ? 'custom-timer-input--on' : ''}`}
            value={isCustom ? value : ''}
            placeholder="Otro"
            min={min}
            max={MAX_PLAYERS_LIMIT}
            aria-label="Límite personalizado de jugadores"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isNaN(n)) onChange(null);
              else onChange(Math.max(min, Math.min(MAX_PLAYERS_LIMIT, n)));
            }}
          />
        </div>
      </div>
    </div>
  );
}
