import type { BetSide } from '../game/types';

type Props = {
  rivalName: string;
  onBet: (side: BetSide) => void;
};

export default function RivalBet({ rivalName, onBet }: Props) {
  return (
    <section className="panel">
      <p className="panel__kicker">Apuesta</p>
      <h2 className="panel__title">{rivalName}</h2>
      <p className="panel__text">
        La aguja ya está fija. ¿Dónde creéis que está el centro (4) de la zona secreta? Si acertáis, os lleváis <b>+1</b>.
      </p>
      <div className="btn-row">
        <button className="btn btn--bet" onClick={() => onBet('left')}>
          ◀ Izquierda
        </button>
        <button className="btn btn--bet" onClick={() => onBet('exact')}>
          🎯 4 Exacto
        </button>
        <button className="btn btn--bet" onClick={() => onBet('right')}>
          Derecha ▶
        </button>
        <button className="btn btn--bet" style={{ width: '100%', marginTop: '4px' }} onClick={() => onBet('miss')}>
          ❌ No ha adivinado (0 pts)
        </button>
      </div>
    </section>
  );
}
