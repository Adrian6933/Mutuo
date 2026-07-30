import { useEffect, useState } from 'react';

/* Perfil local: nombre, foto y frase. Solo se guarda en este móvil (localStorage);
 * la foto viaja a la lobby para que los demás vean tu marcador en el dial. */

export type Profile = {
  name: string;
  /** foto recortada a cuadrado y comprimida (data URL), o null si usa iniciales */
  avatar: string | null;
  bio: string;
};

const KEY = 'frecuencia-profile-v1';
/** clave antigua, solo con el nombre: se migra la primera vez */
const NICK_KEY = 'frecuencia-nick';

export const MAX_NAME = 16;
export const MAX_BIO = 60;
/** lado de la foto guardada: suficiente para el dial sin inflar la lobby */
const AVATAR_SIZE = 160;

export const EMPTY_PROFILE: Profile = { name: '', avatar: null, bio: '' };

let cache: Profile | null = null;
const listeners = new Set<() => void>();

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function read(): Profile {
  if (!hasStorage()) return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return {
        name: typeof p.name === 'string' ? p.name.slice(0, MAX_NAME) : '',
        avatar: typeof p.avatar === 'string' && p.avatar.startsWith('data:') ? p.avatar : null,
        bio: typeof p.bio === 'string' ? p.bio.slice(0, MAX_BIO) : '',
      };
    }
    const nick = localStorage.getItem(NICK_KEY);
    if (nick) return { ...EMPTY_PROFILE, name: nick.slice(0, MAX_NAME) };
  } catch {
    // sin almacenamiento: perfil en blanco
  }
  return EMPTY_PROFILE;
}

export function getProfile(): Profile {
  if (cache === null) cache = read();
  return cache;
}

/** Nombre para las lobbies: nunca vacío. */
export function profileName(p: Profile = getProfile()): string {
  return p.name.trim() || 'Anónimo';
}

export function setProfile(patch: Partial<Profile>): Profile {
  const next: Profile = { ...getProfile(), ...patch };
  next.name = next.name.slice(0, MAX_NAME);
  next.bio = next.bio.slice(0, MAX_BIO);
  cache = next;
  if (hasStorage()) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      // compatibilidad con el nick suelto que usaba el modo online
      localStorage.setItem(NICK_KEY, profileName(next));
    } catch {
      // p. ej. cuota llena por una foto muy grande
    }
  }
  listeners.forEach((l) => l());
  return next;
}

/** Perfil guardado, sincronizado entre pantallas. */
export function useProfile(): Profile {
  const [p, setP] = useState<Profile>(EMPTY_PROFILE);
  useEffect(() => {
    setP(getProfile());
    const l = () => setP(getProfile());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return p;
}

/** Iniciales para el marcador del dial: "Ana" → "AN", "Juan Pérez" → "JP", "Jugador 2" → "J2". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Recorta la imagen a un cuadrado centrado y la comprime a data URL. */
export function fileToAvatar(file: File, size = AVATAR_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Eso no es una imagen.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('sin canvas');
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size
        );
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        reject(new Error('No he podido preparar la foto.'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No he podido leer la imagen.'));
    };
    img.src = url;
  });
}
