import clasicas from './clasicas';
import futbol from './futbol';
import comida from './comida';
import cotidiano from './cotidiano';
import cine from './cine';
import musica from './musica';
import motor from './motor';
import tecno from './tecno';
import animales from './animales';
import lugares from './lugares';
import series from './series';
import historia from './historia';
import geografia from './geografia';
import internet from './internet';

export type CategoryId =
  | 'clasicas'
  | 'futbol'
  | 'comida'
  | 'cotidiano'
  | 'cine'
  | 'musica'
  | 'motor'
  | 'tecno'
  | 'animales'
  | 'lugares'
  | 'series'
  | 'historia'
  | 'geografia'
  | 'internet';

export type Card = {
  left: string;
  right: string;
  cat: CategoryId;
  /** tema u observación de la carta, solo en cartas personalizadas (p. ej. "Futbolistas guapos") */
  topic?: string;
};

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'clasicas', label: 'Clásicas' },
  { id: 'futbol', label: 'Fútbol' },
  { id: 'comida', label: 'Comida' },
  { id: 'cotidiano', label: 'Vida cotidiana' },
  { id: 'cine', label: 'Cine' },
  { id: 'musica', label: 'Música y famoseo' },
  { id: 'motor', label: 'Coches y transporte' },
  { id: 'tecno', label: 'Tecnología y videojuegos' },
  { id: 'animales', label: 'Animales' },
  { id: 'lugares', label: 'Viajes y lugares' },
  { id: 'series', label: 'Series y TV' },
  { id: 'historia', label: 'Historia' },
  { id: 'geografia', label: 'Geografía' },
  { id: 'internet', label: 'Internet y memes' },
];

const RAW: Record<CategoryId, [string, string][]> = {
  clasicas,
  futbol,
  comida,
  cotidiano,
  cine,
  musica,
  motor,
  tecno,
  animales,
  lugares,
  series,
  historia,
  geografia,
  internet,
};

export const CARDS: Card[] = CATEGORIES.flatMap((c) =>
  RAW[c.id].map(([left, right]) => ({ left, right, cat: c.id }))
);

export function cardsFor(categories: CategoryId[]): Card[] {
  if (categories.length === 0) return CARDS;
  const filtered = CARDS.filter((c) => categories.includes(c.cat));
  return filtered.length > 0 ? filtered : CARDS;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
