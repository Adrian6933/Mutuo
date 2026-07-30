import { useMemo, useRef, useState } from 'react';
import { CARDS, CATEGORIES, cardsOfBuiltin, type BuiltinCategoryId } from '../data/cards';
import {
  EMOJIS,
  MAX_NAME,
  MAX_SIDE,
  MAX_TOPIC,
  createCat,
  deleteCat,
  downloadJson,
  exportJson,
  importCats,
  parseImport,
  slugify,
  updateCat,
  useCustomCats,
  type CustomCategory,
} from '../game/customCats';

/* Pantalla "Cartas": ver las cartas que trae el juego y crear/editar/compartir las tuyas. */

type Props = {
  onBack: () => void;
  /** abre directamente la pestaña de categorías propias */
  startTab?: 'builtin' | 'mine';
};

function CardList({ cards }: { cards: { left: string; right: string; topic?: string }[] }) {
  return (
    <ul className="card-list">
      {cards.map((c, i) => (
        <li key={`${c.left}-${c.right}-${i}`} className="card-list__item">
          {c.topic && <span className="card-list__topic">{c.topic}</span>}
          <span className="card-list__row">
            <span className="card-list__side">{c.left}</span>
            <span className="card-list__vs">···</span>
            <span className="card-list__side card-list__side--right">{c.right}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---- pestaña de temas por defecto ---- */

const MAX_SHOWN = 300;

function BuiltinTab() {
  const [cat, setCat] = useState<BuiltinCategoryId | 'all'>('all');
  const [q, setQ] = useState('');
  const cards = useMemo(() => (cat === 'all' ? CARDS : cardsOfBuiltin(cat)), [cat]);
  const needle = q.trim().toLowerCase();
  const found = needle
    ? cards.filter((c) => `${c.left} ${c.right}`.toLowerCase().includes(needle))
    : cards;
  const shown = found.slice(0, MAX_SHOWN);
  const where = cat === 'all' ? 'todos los temas' : CATEGORIES.find((c) => c.id === cat)!.label;

  return (
    <>
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${cat === 'all' ? 'chip--on' : ''}`}
          onClick={() => setCat('all')}
        >
          Todos ({CARDS.length})
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${cat === c.id ? 'chip--on' : ''}`}
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        className="input"
        value={q}
        placeholder={cat === 'all' ? 'Buscar en todas las cartas…' : 'Buscar en este tema…'}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Buscar cartas"
      />
      <p className="end-config__hint">
        {found.length} {found.length === 1 ? 'carta' : 'cartas'}
        {needle ? ` de ${cards.length}` : ''} en {where}
        {found.length > MAX_SHOWN ? ` · se muestran las ${MAX_SHOWN} primeras` : ''}.
      </p>
      <CardList cards={shown} />
    </>
  );
}

/* ---- editor de una categoría propia ---- */

function CatEditor({ cat, onBack }: { cat: CustomCategory; onBack: () => void }) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [topic, setTopic] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const addCard = () => {
    const l = left.trim();
    const r = right.trim();
    if (!l || !r) return;
    const t = topic.trim();
    updateCat(cat.id, {
      cards: [...cat.cards, t ? { left: l, right: r, topic: t } : { left: l, right: r }],
    });
    setLeft('');
    setRight('');
    setTopic('');
  };

  const removeCard = (i: number) => {
    updateCat(cat.id, { cards: cat.cards.filter((_, j) => j !== i) });
    setEditIdx(null);
  };

  const patchCard = (i: number, patch: Partial<{ left: string; right: string; topic: string }>) => {
    updateCat(cat.id, {
      cards: cat.cards.map((c, j) => {
        if (j !== i) return c;
        const next = { ...c, ...patch };
        // el tema vacío se guarda como ausente, igual que al crear la carta
        if (!next.topic?.trim()) delete next.topic;
        return next;
      }),
    });
  };

  const copyJson = () => {
    void navigator.clipboard?.writeText(exportJson([cat])).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      <div className="cat-editor__head">
        <span className="chip-row chip-row--tight cat-editor__emojis">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`chip chip--mini ${cat.emoji === e ? 'chip--on' : ''}`}
              onClick={() => updateCat(cat.id, { emoji: e })}
              aria-label={`Icono ${e}`}
            >
              {e}
            </button>
          ))}
        </span>
        <input
          className="input"
          value={cat.name}
          maxLength={MAX_NAME}
          placeholder="Nombre de la categoría"
          onChange={(e) => updateCat(cat.id, { name: e.target.value })}
          aria-label="Nombre de la categoría"
        />
      </div>

      <div className="new-card-form">
        <p className="panel__kicker">Nueva carta</p>
        <div className="new-card-form__row">
          <input
            className="input"
            value={left}
            placeholder="Un extremo"
            maxLength={MAX_SIDE}
            onChange={(e) => setLeft(e.target.value)}
            aria-label="Extremo izquierdo"
          />
          <span className="new-card-form__vs">···</span>
          <input
            className="input"
            value={right}
            placeholder="El contrario"
            maxLength={MAX_SIDE}
            onChange={(e) => setRight(e.target.value)}
            aria-label="Extremo derecho"
          />
        </div>
        <input
          className="input"
          value={topic}
          placeholder="Tema de la carta (opcional)"
          maxLength={MAX_TOPIC}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCard();
          }}
          aria-label="Tema de la carta"
        />
        <button
          className="btn btn--primary btn--small"
          onClick={addCard}
          disabled={!left.trim() || !right.trim()}
        >
          + Añadir carta
        </button>
      </div>

      <p className="end-config__hint">
        {cat.cards.length === 0
          ? 'Todavía no hay cartas aquí.'
          : `${cat.cards.length} ${cat.cards.length === 1 ? 'carta' : 'cartas'} en esta categoría.`}
      </p>

      <ul className="card-list">
        {cat.cards.map((c, i) =>
          editIdx === i ? (
            <li key={`edit-${i}`} className="card-list__item card-list__item--editing">
              <div className="new-card-form__row">
                <input
                  className="input"
                  value={c.left}
                  maxLength={MAX_SIDE}
                  onChange={(e) => patchCard(i, { left: e.target.value })}
                  aria-label="Extremo izquierdo"
                />
                <span className="new-card-form__vs">···</span>
                <input
                  className="input"
                  value={c.right}
                  maxLength={MAX_SIDE}
                  onChange={(e) => patchCard(i, { right: e.target.value })}
                  aria-label="Extremo derecho"
                />
              </div>
              <input
                className="input"
                value={c.topic ?? ''}
                placeholder="Tema (opcional)"
                maxLength={MAX_TOPIC}
                onChange={(e) => patchCard(i, { topic: e.target.value })}
                aria-label="Tema de la carta"
              />
              <button className="btn btn--primary btn--small" onClick={() => setEditIdx(null)}>
                Listo
              </button>
            </li>
          ) : (
            <li key={`${c.left}-${i}`} className="card-list__item card-list__item--editable">
              <span className="card-list__body">
                {c.topic && <span className="card-list__topic">{c.topic}</span>}
                <span className="card-list__row">
                  <span className="card-list__side">{c.left}</span>
                  <span className="card-list__vs">···</span>
                  <span className="card-list__side card-list__side--right">{c.right}</span>
                </span>
              </span>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setEditIdx(i)}
                aria-label={`Editar ${c.left} / ${c.right}`}
              >
                ✎
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={() => removeCard(i)}
                aria-label={`Borrar ${c.left} / ${c.right}`}
              >
                ✕
              </button>
            </li>
          )
        )}
      </ul>

      <div className="btn-row">
        <button
          className="btn btn--ghost btn--small"
          onClick={() => downloadJson(`mutuo-${slugify(cat.name)}.json`, exportJson([cat]))}
        >
          ⬇ Exportar
        </button>
        <button className="btn btn--ghost btn--small" onClick={copyJson}>
          {copied ? '¡Copiado!' : '📋 Copiar código'}
        </button>
        {confirmDel ? (
          <button
            className="btn btn--ghost btn--small btn--danger"
            onClick={() => {
              deleteCat(cat.id);
              onBack();
            }}
          >
            ¿Seguro? Borrar
          </button>
        ) : (
          <button className="btn btn--ghost btn--small" onClick={() => setConfirmDel(true)}>
            🗑 Borrar categoría
          </button>
        )}
      </div>

      <button className="link-btn" onClick={onBack}>
        ← Mis categorías
      </button>
    </>
  );
}

/* ---- pestaña de categorías propias ---- */

function MineTab({
  editing,
  setEditing,
}: {
  editing: string | null;
  setEditing: (id: string | null) => void;
}) {
  const cats = useCustomCats();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const current = editing ? cats.find((c) => c.id === editing) : null;

  const doImport = (text: string) => {
    setError(null);
    setMsg(null);
    try {
      const { added } = importCats(parseImport(text));
      setMsg(`${added} ${added === 1 ? 'categoría importada' : 'categorías importadas'}.`);
      setPasting(false);
      setPaste('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No he podido importar eso.');
    }
  };

  if (current) return <CatEditor cat={current} onBack={() => setEditing(null)} />;

  return (
    <>
      <div className="new-cat-form">
        <input
          className="input"
          value={newName}
          placeholder="Nombre de tu categoría"
          maxLength={MAX_NAME}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) {
              setEditing(createCat(newName).id);
              setNewName('');
            }
          }}
          aria-label="Nombre de la nueva categoría"
        />
        <button
          className="btn btn--primary btn--small"
          disabled={!newName.trim()}
          onClick={() => {
            setEditing(createCat(newName).id);
            setNewName('');
          }}
        >
          + Crear
        </button>
      </div>

      {cats.length === 0 ? (
        <p className="end-config__hint">
          Aún no tienes categorías. Crea una y mete dentro todas las cartas que quieras: luego podrás
          elegirlas al montar la partida, solas o mezcladas con los temas del juego.
        </p>
      ) : (
        <ul className="cat-list">
          {cats.map((c) => (
            <li key={c.id}>
              <button className="cat-item" onClick={() => setEditing(c.id)}>
                <span className="cat-item__emoji">{c.emoji}</span>
                <span className="cat-item__body">
                  <span className="cat-item__name">{c.name}</span>
                  <span className="cat-item__info">
                    {c.cards.length} {c.cards.length === 1 ? 'carta' : 'cartas'}
                  </span>
                </span>
                <span className="cat-item__go">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="btn-row">
        <button className="btn btn--ghost btn--small" onClick={() => fileRef.current?.click()}>
          ⬆ Importar archivo
        </button>
        <button className="btn btn--ghost btn--small" onClick={() => setPasting((v) => !v)}>
          📋 Pegar código
        </button>
        {cats.length > 0 && (
          <button
            className="btn btn--ghost btn--small"
            onClick={() => downloadJson('mutuo-mis-categorias.json', exportJson(cats))}
          >
            ⬇ Exportar todas
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,.txt"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void file
            .text()
            .then(doImport)
            .catch(() => setError('No he podido leer el archivo.'));
          e.target.value = '';
        }}
      />

      {pasting && (
        <div className="paste-box">
          <textarea
            className="input paste-box__area"
            value={paste}
            placeholder="Pega aquí el código que te han pasado…"
            onChange={(e) => setPaste(e.target.value)}
            aria-label="Código de categorías"
          />
          <button
            className="btn btn--primary btn--small"
            disabled={!paste.trim()}
            onClick={() => doImport(paste)}
          >
            Importar
          </button>
        </div>
      )}

      {msg && <p className="end-config__hint end-config__hint--ok">{msg}</p>}
      {error && <p className="online-error">{error}</p>}
    </>
  );
}

export default function CardsScreen({ onBack, startTab = 'builtin' }: Props) {
  const [tab, setTab] = useState<'builtin' | 'mine'>(startTab);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="panel panel--setup">
      <p className="panel__kicker">Cartas</p>
      <h2 className="panel__title">Las cartas del juego</h2>

      <div className="seg">
        <button
          type="button"
          className={`seg__opt ${tab === 'builtin' ? 'seg__opt--on' : ''}`}
          onClick={() => setTab('builtin')}
        >
          Por defecto
        </button>
        <button
          type="button"
          className={`seg__opt ${tab === 'mine' ? 'seg__opt--on' : ''}`}
          onClick={() => setTab('mine')}
        >
          Mis categorías
        </button>
      </div>

      {tab === 'builtin' ? <BuiltinTab /> : <MineTab editing={editing} setEditing={setEditing} />}

      <button className="link-btn" onClick={onBack}>
        ← Menú
      </button>
    </section>
  );
}
