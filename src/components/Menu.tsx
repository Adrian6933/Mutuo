import type { Mode } from '../game/types';

type MenuProps = {
  onMode: (mode: Mode) => void;
  onOnline: () => void;
  onContinue?: () => void;
};

export default function Menu({ onMode, onOnline, onContinue }: MenuProps) {
  return (
    <section className="panel">
      <h1 className="panel__title">¿Estáis en la misma sintonía?</h1>
      <p className="panel__text">
        El psíquico ve la zona secreta y da una pista sobre el espectro. Los demás mueven la aguja.
        Cuanto más cerca, más puntos.
      </p>
      <div className="mode-grid">
        <button className="mode-card" onClick={() => onMode('ffa')}>
          <span className="mode-card__title">Todos contra todos</span>
          <span className="mode-card__desc">
            Uno da la pista y todos los demás marcan su aguja: cada uno puntúa por su cercanía y el
            psíquico gana +1 por acertante. (Se puede desactivar en ajustes.)
          </span>
        </button>
        <button className="mode-card" onClick={() => onMode('teams')}>
          <span className="mode-card__title">Por equipos</span>
          <span className="mode-card__desc">
            Pista dentro del equipo y puntos al marcador común. El equipo rival apuesta a qué lado
            se queda la aguja.
          </span>
        </button>
        <button className="mode-card mode-card--online" onClick={onOnline}>
          <span className="mode-card__title">🌐 Online</span>
          <span className="mode-card__desc">
            Cada uno desde su móvil: crea una lobby pública o privada con ID y clave, o únete a una.
          </span>
        </button>
      </div>
      {onContinue && (
        <button className="btn btn--ghost" onClick={onContinue}>
          Continuar partida guardada
        </button>
      )}
    </section>
  );
}
