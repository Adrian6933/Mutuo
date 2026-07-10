import type { GameState } from '../game/types';
import { colorIdx } from '../game/reducer';
import type { Row } from './ScoreTable';

export const REVEAL_TEXT: Record<number, string> = {
  4: '¡En el centro!',
  3: '¡Muy cerca!',
  2: '¡Rozando!',
  0: 'Fuera de sintonía…',
};

export function buildRows(s: GameState): Row[] {
  const gains = new Map(s.lastGains.map((g) => [g.key, g.pts]));
  const base =
    s.mode === 'ffa'
      ? s.players.map((p) => ({ key: `p${p.id}`, name: p.name, score: p.score }))
      : s.teams.map((t) => ({
          key: `t${t.id}`,
          name: t.name,
          members: t.players.map((x) => x.name).join(', '),
          score: t.score,
        }));
  return base
    .map((r) => ({ ...r, delta: gains.get(r.key) ?? 0, colorIdx: colorIdx(s, r.key) }))
    .sort((a, b) => b.score - a.score);
}

export function winnerText(rows: Row[]): string {
  const top = rows[0]!.score;
  const winners = rows.filter((r) => r.score === top);
  if (winners.length === 1) return `¡Gana ${winners[0]!.name}!`;
  return `¡Empate entre ${winners.map((w) => w.name).join(' y ')}!`;
}

export function Stats({ s }: { s: GameState }) {
  const h = s.history;
  if (h.length === 0) return null;
  const fours = h.filter((r) => r.pts === 4).length;
  const byPsychic = new Map<string, number>();
  for (const r of h) byPsychic.set(r.psychic, (byPsychic.get(r.psychic) ?? 0) + r.pts);
  const bestPsychic = [...byPsychic.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const lines: string[] = [`${h.length} rondas jugadas`];
  lines.push(
    fours > 0
      ? `${fours} ${fours === 1 ? 'cuatro clavado' : 'cuatros clavados'} 🎯`
      : 'Ningún 4 clavado… habrá revancha'
  );
  if (bestPsychic[1] > 0) lines.push(`Mejor psíquico: ${bestPsychic[0]} (${bestPsychic[1]} pts)`);
  if (s.mode === 'ffa') {
    const byPair = new Map<string, number>();
    for (const r of h)
      byPair.set(`${r.psychic} y ${r.guesser}`, (byPair.get(`${r.psychic} y ${r.guesser}`) ?? 0) + r.pts);
    const best = [...byPair.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (best[1] > 0) lines.push(`Pareja en sintonía: ${best[0]} (${best[1]} pts)`);
  }
  if (s.options.rivalBet) {
    const bets = h.filter((r) => r.betWon).length;
    lines.push(`Apuestas de lado acertadas: ${bets}`);
  }
  return (
    <ul className="stats">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
