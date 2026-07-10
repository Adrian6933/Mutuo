export type Row = {
  key: string;
  name: string;
  members?: string;
  score: number;
  delta: number;
  colorIdx: number;
};

type Props = {
  rows: Row[];
  final?: boolean;
};

export default function ScoreTable({ rows, final = false }: Props) {
  return (
    <ol className={`score-table ${final ? 'score-table--final' : ''}`}>
      {rows.map((r, i) => (
        <li
          key={r.key}
          className={`score-table__row c${r.colorIdx} ${final && i === 0 ? 'score-table__row--winner' : ''}`}
        >
          <span className="score-table__rank">{i + 1}º</span>
          <span className="dot" aria-hidden="true" />
          <span className="score-table__name">
            {r.name}
            {r.members && <small>{r.members}</small>}
          </span>
          {r.delta > 0 && <span className="score-table__delta">+{r.delta}</span>}
          <span className="score-table__score">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}
