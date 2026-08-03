import { useEffect } from 'react';
import Avatar from './Avatar';

export type PlayerCardData = {
  name: string;
  avatar?: string | null;
  bio?: string | null;
  colorIdx?: number;
  /** líneas sueltas debajo del nombre: anfitrión, equipo, puntos… */
  tags?: string[];
};

/** Ficha grande de un jugador: la foto a tamaño decente, su nombre y su frase. */
export default function PlayerCard({
  player,
  onClose,
}: {
  player: PlayerCardData;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="player-card-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Perfil de ${player.name}`}
      onClick={onClose}
    >
      <div className="player-card" onClick={(e) => e.stopPropagation()}>
        <button className="player-card__close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <Avatar
          name={player.name}
          avatar={player.avatar}
          size={200}
          colorIdx={player.colorIdx ?? 0}
          className="player-card__avatar"
        />
        <h3 className="player-card__name">{player.name}</h3>
        {player.bio && <p className="player-card__bio">«{player.bio}»</p>}
        {player.tags && player.tags.length > 0 && (
          <div className="player-card__tags">
            {player.tags.map((t) => (
              <span key={t} className="player-card__tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
