import { useRef, useState } from 'react';
import Avatar from './Avatar';
import {
  MAX_BIO,
  MAX_NAME,
  fileToAvatar,
  profileName,
  setProfile,
  useProfile,
} from '../game/profile';

export default function ProfileScreen({ onBack }: { onBack: () => void }) {
  const profile = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setProfile({ avatar: await fileToAvatar(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No he podido usar esa foto.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="panel panel--setup">
      <p className="panel__kicker">Tu perfil</p>
      <h2 className="panel__title">¿Quién eres?</h2>

      <div className="profile-head">
        <button
          type="button"
          className="profile-avatar-btn"
          onClick={() => fileRef.current?.click()}
          aria-label="Cambiar foto de perfil"
        >
          <Avatar name={profileName(profile)} avatar={profile.avatar} size={104} colorIdx={0} />
          <span className="profile-avatar-btn__badge">{busy ? '…' : '📷'}</span>
        </button>
        <div className="profile-head__actions">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {profile.avatar ? 'Cambiar foto' : 'Poner foto'}
          </button>
          {profile.avatar && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setProfile({ avatar: null })}
            >
              Quitar foto
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void pickPhoto(e.target.files?.[0])}
      />

      {error && <p className="online-error">{error}</p>}

      <div className="profile-field">
        <label className="panel__kicker" htmlFor="profile-name">
          Nombre
        </label>
        <input
          id="profile-name"
          className="input"
          value={profile.name}
          placeholder="Tu nombre"
          maxLength={MAX_NAME}
          onChange={(e) => setProfile({ name: e.target.value })}
        />
        <p className="end-config__hint">Se pone solo al crear o unirte a una lobby.</p>
      </div>

      <div className="profile-field">
        <label className="panel__kicker" htmlFor="profile-bio">
          Frase
        </label>
        <input
          id="profile-bio"
          className="input"
          value={profile.bio}
          placeholder="Algo tuyo (opcional)"
          maxLength={MAX_BIO}
          onChange={(e) => setProfile({ bio: e.target.value })}
        />
        <p className="end-config__hint">
          Aparece al tocar tu marcador en el dial, con tu nombre completo.
        </p>
      </div>

      <div className="profile-preview">
        <p className="panel__kicker">Así te verán</p>
        <div className="profile-preview__row">
          <Avatar name={profileName(profile)} avatar={profile.avatar} size={46} colorIdx={0} />
          <span className="profile-preview__name">{profileName(profile)}</span>
          {profile.bio && <span className="profile-preview__bio">«{profile.bio}»</span>}
        </div>
      </div>

      <p className="end-config__hint">
        Todo esto se guarda solo en este móvil. La foto se envía a la lobby para que el resto la vea
        en el dial.
      </p>

      <button className="link-btn" onClick={onBack}>
        ← Menú
      </button>
    </section>
  );
}
