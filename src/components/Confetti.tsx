const COLORS = ['var(--w4)', 'var(--w3)', 'var(--w2)', 'var(--green)', 'var(--teal-700)', 'var(--red)'];

export default function Confetti() {
  const pieces = Array.from({ length: 26 }, (_, i) => {
    const style = {
      left: `${4 + Math.random() * 92}%`,
      background: COLORS[i % COLORS.length],
      animationDelay: `${Math.random() * 0.35}s`,
      transform: `rotate(${Math.random() * 360}deg)`,
      width: `${7 + Math.random() * 7}px`,
      height: `${10 + Math.random() * 8}px`,
    } as const;
    return <span key={i} className="confetti__piece" style={style} />;
  });
  return (
    <div className="confetti" aria-hidden="true">
      {pieces}
    </div>
  );
}
