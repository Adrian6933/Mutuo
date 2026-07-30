import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  isCustomCat,
  type Card,
  type CategoryId,
  type CustomCategoryId,
} from '../data/cards';

/* Categorías de cartas creadas por el jugador. Viven solo en su móvil (localStorage)
 * y se pueden exportar/importar para pasárselas a otro. */

export type CustomCard = {
  left: string;
  right: string;
  topic?: string;
};

export type CustomCategory = {
  id: string;
  name: string;
  emoji: string;
  cards: CustomCard[];
  updatedAt: number;
};

const KEY = 'frecuencia-custom-cats-v1';
const EXPORT_KIND = 'mutuo-categorias';

export const MAX_NAME = 24;
export const MAX_SIDE = 40;
export const MAX_TOPIC = 40;

export const EMOJIS = ['🃏', '⭐', '🔥', '🎯', '🎬', '🍕', '⚽', '🎵', '🐙', '🚀', '💀', '👑', '🌵', '🧠'];

/* ---- almacén reactivo ---- */

let cache: CustomCategory[] | null = null;
const listeners = new Set<() => void>();

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function sanitizeCard(raw: unknown): CustomCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const left = typeof c.left === 'string' ? c.left.trim().slice(0, MAX_SIDE) : '';
  const right = typeof c.right === 'string' ? c.right.trim().slice(0, MAX_SIDE) : '';
  if (!left || !right) return null;
  const topic = typeof c.topic === 'string' ? c.topic.trim().slice(0, MAX_TOPIC) : '';
  return topic ? { left, right, topic } : { left, right };
}

function sanitizeCat(raw: unknown): CustomCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim().slice(0, 24) : newCatId();
  const name = typeof c.name === 'string' ? c.name.trim().slice(0, MAX_NAME) : '';
  if (!name) return null;
  const emoji = typeof c.emoji === 'string' && c.emoji ? [...c.emoji][0]! : '🃏';
  const cards = Array.isArray(c.cards)
    ? c.cards.map(sanitizeCard).filter((x): x is CustomCard => x !== null)
    : [];
  const updatedAt = typeof c.updatedAt === 'number' ? c.updatedAt : Date.now();
  return { id, name, emoji, cards, updatedAt };
}

function read(): CustomCategory[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCat).filter((x): x is CustomCategory => x !== null);
  } catch {
    return [];
  }
}

export function loadCustomCats(): CustomCategory[] {
  if (cache === null) cache = read();
  return cache;
}

export function saveCustomCats(list: CustomCategory[]): void {
  cache = list;
  if (hasStorage()) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // sin espacio o sin almacenamiento: se queda en memoria esta sesión
    }
  }
  listeners.forEach((l) => l());
}

/** Categorías propias, actualizadas cuando cambian desde cualquier pantalla. */
export function useCustomCats(): CustomCategory[] {
  const [cats, setCats] = useState<CustomCategory[]>([]);
  useEffect(() => {
    setCats(loadCustomCats());
    const l = () => setCats(loadCustomCats());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return cats;
}

/* ---- operaciones ---- */

const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newCatId(): string {
  let id = '';
  for (let i = 0; i < 8; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return id;
}

export function catIdOf(cat: CustomCategory | string): CustomCategoryId {
  return `custom:${typeof cat === 'string' ? cat : cat.id}`;
}

export function createCat(name: string, emoji = '🃏'): CustomCategory {
  const cat: CustomCategory = {
    id: newCatId(),
    name: name.trim().slice(0, MAX_NAME) || 'Mi categoría',
    emoji,
    cards: [],
    updatedAt: Date.now(),
  };
  saveCustomCats([...loadCustomCats(), cat]);
  return cat;
}

export function updateCat(id: string, patch: Partial<Omit<CustomCategory, 'id'>>): void {
  saveCustomCats(
    loadCustomCats().map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c))
  );
}

export function deleteCat(id: string): void {
  saveCustomCats(loadCustomCats().filter((c) => c.id !== id));
}

/* ---- cartas para el mazo ---- */

export function cardsOfCat(cat: CustomCategory): Card[] {
  return cat.cards.map((c) => ({ ...c, cat: catIdOf(cat) }));
}

/** Cartas de las categorías propias seleccionadas, para inyectarlas en el mazo. */
export function customPoolFor(categories: readonly CategoryId[]): Card[] {
  const wanted = new Set<CustomCategoryId>(categories.filter(isCustomCat));
  if (wanted.size === 0) return [];
  return loadCustomCats()
    .filter((c) => wanted.has(catIdOf(c)))
    .flatMap(cardsOfCat);
}

const BUILTIN_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

/** Descarta categorías propias que ya no existen en este móvil (p. ej. borradas). */
export function sanitizeCategories(categories: readonly CategoryId[]): CategoryId[] {
  const mine = new Set<string>(loadCustomCats().map((c) => catIdOf(c)));
  const out = categories.filter((c) => BUILTIN_IDS.has(c) || mine.has(c));
  return out.length > 0 ? out : categories.filter((c) => BUILTIN_IDS.has(c));
}

/* ---- exportar / importar ---- */

export function exportJson(cats: CustomCategory[]): string {
  return JSON.stringify(
    {
      kind: EXPORT_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: cats.map(({ id, name, emoji, cards }) => ({ id, name, emoji, cards })),
    },
    null,
    2
  );
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'categorias'
  );
}

export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lee un JSON exportado. Lanza Error con un mensaje legible si no vale. */
export function parseImport(text: string): CustomCategory[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Eso no es un archivo de categorías válido.');
  }
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).categories)
      ? ((data as Record<string, unknown>).categories as unknown[])
      : null;
  if (!raw) throw new Error('El archivo no contiene ninguna categoría.');
  const cats = raw.map(sanitizeCat).filter((x): x is CustomCategory => x !== null);
  if (cats.length === 0) throw new Error('No he encontrado ninguna categoría con cartas dentro.');
  return cats;
}

/** Añade las importadas sin pisar las tuyas: si el id ya existe, entra como copia. */
export function importCats(incoming: CustomCategory[]): { added: number } {
  const current = loadCustomCats();
  const taken = new Set(current.map((c) => c.id));
  const names = new Set(current.map((c) => c.name.toLowerCase()));
  const added = incoming.map((c) => {
    const id = taken.has(c.id) ? newCatId() : c.id;
    taken.add(id);
    let name = c.name;
    if (names.has(name.toLowerCase())) name = `${name} (2)`.slice(0, MAX_NAME);
    names.add(name.toLowerCase());
    return { ...c, id, name, updatedAt: Date.now() };
  });
  saveCustomCats([...current, ...added]);
  return { added: added.length };
}
