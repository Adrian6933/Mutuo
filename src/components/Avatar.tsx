import { initialsOf } from '../game/profile';

type AvatarProps = {
  name: string;
  avatar?: string | null;
  /** lado en píxeles */
  size?: number;
  colorIdx?: number;
  className?: string;
};

/** Foto de perfil redonda; si no hay foto, las iniciales sobre el color del jugador. */
export default function Avatar({ name, avatar, size = 40, colorIdx, className = '' }: AvatarProps) {
  const cls = `avatar ${colorIdx !== undefined ? `c${colorIdx}` : ''} ${className}`.trim();
  return (
    <span
      className={cls}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      title={name}
    >
      {avatar ? (
        <img className="avatar__img" src={avatar} alt="" draggable={false} />
      ) : (
        <span className="avatar__txt">{initialsOf(name)}</span>
      )}
    </span>
  );
}
