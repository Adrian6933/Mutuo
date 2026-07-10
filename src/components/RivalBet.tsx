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
        La aguja ya está fija. ¿A qué lado de la aguja creéis que está la zona secreta? Si acertáis
        (y no han clavado el 4), os lleváis <b>+1</b>.
      </p>
      <div className="btn-row">
        <button className="btn btn--bet" onClick={() => onBet('left')}>
          ◀ Izquierda
        </button>
        <button className="btn btn--bet" onClick={() => onBet('right')}>
          Derecha ▶
        </button>
      </div>
    </section>
  );
}
