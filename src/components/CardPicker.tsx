import { useState } from 'react';

type PickerProps = {
  psychic: string;
  onRandom: () => void;
  onCustom: () => void;
};

export function CardPicker({ psychic, onRandom, onCustom }: PickerProps) {
  return (
    <section className="panel">
      <p className="panel__kicker">Psíquico: {psychic}</p>
      <h2 className="panel__title">Elige tu carta</h2>
      <p className="panel__text">Roba una del mazo o inventa tu propio espectro.</p>
      <div className="btn-row">
        <button className="btn btn--primary" onClick={onRandom}>
          Carta aleatoria
        </button>
        <button className="btn btn--ghost" onClick={onCustom}>
          Escribir la mía
        </button>
      </div>
    </section>
  );
}

type CustomFormProps = {
  onSubmit: (left: string, right: string, topic: string) => void;
  onBack: () => void;
};

export function CustomCardForm({ onSubmit, onBack }: CustomFormProps) {
  const [topic, setTopic] = useState('');
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const valid = left.trim().length > 0 && right.trim().length > 0;

  return (
    <section className="panel">
      <p className="panel__kicker">Carta personalizada</p>
      <h2 className="panel__title">Elige el tema y los dos extremos</h2>
      <form
        className="custom-card-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(left, right, topic);
        }}
      >
        <input
          className="input"
          value={topic}
          maxLength={32}
          placeholder="Tema (opcional) — p. ej. Futbolistas guapos"
          onChange={(e) => setTopic(e.target.value)}
          aria-label="Tema o categoría"
        />
        <div className="custom-card-form__inputs">
          <input
            className="input"
            value={left}
            maxLength={24}
            placeholder="◀ p. ej. Feo"
            onChange={(e) => setLeft(e.target.value)}
            aria-label="Extremo izquierdo"
          />
          <input
            className="input"
            value={right}
            maxLength={24}
            placeholder="p. ej. Guapo ▶"
            onChange={(e) => setRight(e.target.value)}
            aria-label="Extremo derecho"
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={!valid}>
          Usar esta carta
        </button>
      </form>
      <button className="link-btn" onClick={onBack}>
        ← Volver
      </button>
    </section>
  );
}

type ClueFormProps = {
  kicker: string;
  guesser: string;
  onSubmit: (text?: string) => void;
  timeLeft?: number | null;
};

export function ClueForm({ kicker, guesser, onSubmit, timeLeft }: ClueFormProps) {
  const [text, setText] = useState('');

  return (
    <section className="panel">
      <p className="panel__kicker">{kicker}</p>
      {timeLeft !== undefined && timeLeft !== null && (
        <div className={`panel__timer-large ${timeLeft <= 10 ? 'panel__timer-large--low' : ''}`}>
          ⏱️ {timeLeft}s
        </div>
      )}
      <p className="panel__text">
        Di tu pista <b>en voz alta</b>, o escríbela si no estáis cerca. Le toca adivinar a{' '}
        <b>{guesser}</b>.
      </p>
      <input
        className="input"
        value={text}
        maxLength={60}
        placeholder="Escribe tu pista (opcional)"
        onChange={(e) => setText(e.target.value)}
        aria-label="Pista escrita"
      />
      <button className="btn btn--primary" onClick={() => onSubmit(text)}>
        Pista dada, ¡a adivinar!
      </button>
    </section>
  );
}
