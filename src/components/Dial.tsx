import { useEffect, useRef, useState } from 'react';
import type React from 'react';

const CX = 210;
const CY = 212;
const R = 170;
const VBW = 420;
const VBH = 266;

export const MIN_ANGLE = 4;
export const MAX_ANGLE = 176;

export const BANDS = [
  { from: -20, to: -12.5, pts: 2 },
  { from: -12.5, to: -5, pts: 3 },
  { from: -5, to: 5, pts: 4 },
  { from: 5, to: 12.5, pts: 3 },
  { from: 12.5, to: 20, pts: 2 },
] as const;

/** Distancia circular módulo 180: el extremo izquierdo es adyacente al derecho. */
export function scoreFor(needle: number, target: number): number {
  const d = Math.abs(needle - target) % 180;
  const diff = Math.min(d, 180 - d);
  if (diff <= 5) return 4;
  if (diff <= 12.5) return 3;
  if (diff <= 20) return 2;
  return 0;
}

function norm180(a: number): number {
  return ((a % 180) + 180) % 180;
}

/** Parte una banda [a1,a2] en tramos dentro de [0,180], con envoltura por los extremos. */
function wrapSegments(a1: number, a2: number): [number, number][] {
  const start = norm180(a1);
  const end = start + (a2 - a1);
  if (end <= 180) return [[start, end]];
  return [
    [start, 180],
    [0, end - 180],
  ];
}

function polar(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: CX - radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

function sector(a1: number, a2: number, radius: number) {
  const p1 = polar(a1, radius);
  const p2 = polar(a2, radius);
  return `M ${CX} ${CY} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
}

export type DialMarker = {
  angle: number;
  initials: string;
  name: string;
  colorIdx: number;
  pts: number;
  /** foto de perfil (data URL); si falta, se pintan las iniciales */
  avatar?: string | null;
  /** frase del perfil, para la burbuja al tocar el marcador */
  bio?: string | null;
  /** id del jugador, para poder localizar el tuyo entre muchos */
  playerId?: number;
};

type DialProps = {
  angle: number;
  target: number | null;
  open: boolean;
  interactive: boolean;
  onChange?: (angle: number) => void;
  /** marcadores de los adivinadores (modo "todos adivinan") en el reveal */
  markers?: DialMarker[] | null;
  showNeedle?: boolean;
};

export default function Dial({
  angle,
  target,
  open,
  interactive,
  onChange,
  markers = null,
  showNeedle = true,
}: DialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [selMarker, setSelMarker] = useState<number | null>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    setSelMarker(null);
  }, [markers]);

  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = open;
    if (open && !was) {
      setSpinning(true);
      const t = setTimeout(() => setSpinning(false), 500);
      return () => clearTimeout(t);
    }
  }, [open]);

  const angleFromEvent = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return angle;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VBW;
    const sy = ((e.clientY - rect.top) / rect.height) * VBH;
    let deg = (Math.atan2(CY - sy, CX - sx) * 180) / Math.PI;
    if (deg < -90) deg = MAX_ANGLE;
    return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, deg));
  };

  const activePointerId = useRef<number | null>(null);
  const startX = useRef(0);
  const startAngle = useRef(0);
  const rectWidth = useRef(0);

  // Evitar el scroll vertical en iOS al arrastrar sobre el dial
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const preventDefault = (e: TouchEvent) => {
      if (interactive) {
        e.preventDefault();
      }
    };

    svg.addEventListener('touchstart', preventDefault, { passive: false });
    svg.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      svg.removeEventListener('touchstart', preventDefault);
      svg.removeEventListener('touchmove', preventDefault);
    };
  }, [interactive]);

  useEffect(() => {
    return () => {
      activePointerId.current = null;
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive || !onChange) return;
    if (activePointerId.current !== null && activePointerId.current !== e.pointerId) return;
    activePointerId.current = e.pointerId;

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    rectWidth.current = rect.width;
    startX.current = e.clientX;

    const initialAngle = angleFromEvent(e);
    startAngle.current = initialAngle;
    onChange(initialAngle);
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerId.current !== null && activePointerId.current !== e.pointerId) return;
      if (!interactive || !onChange) return;

      const dx = e.clientX - startX.current;
      const width = rectWidth.current || 300;
      // Multiplicador 1.3: arrastrar el ancho completo del dial equivale a 234 grados
      const newAngle = startAngle.current + (dx / width) * 180 * 1.3;
      onChange(Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, newAngle)));
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (activePointerId.current !== null && activePointerId.current !== e.pointerId) return;
      activePointerId.current = null;
      setDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragging, interactive, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive || !onChange) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(MIN_ANGLE, angle - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(MAX_ANGLE, angle + step));
    }
  };

  const scallops = [];
  for (let a = 0; a < 360; a += 9) {
    const p = polar(a, R + 8);
    scallops.push(
      <circle key={a} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={16} fill="var(--bezel)" />
    );
  }

  // Marcadores: si dos caen casi en el mismo ángulo, el siguiente baja de radio para no taparse.
  const markerSpots = (markers ?? []).map((m, i, arr) => {
    let level = 0;
    for (let j = 0; j < i; j++) {
      const d = Math.abs(arr[j]!.angle - m.angle) % 180;
      if (Math.min(d, 180 - d) < 9) level += 1;
    }
    return { ...m, ...polar(m.angle, R - 34 - level * 30), idx: i };
  });

  const sel = selMarker !== null ? markerSpots[selMarker] : null;
  const selLabel = sel ? `${sel.name} · ${sel.pts > 0 ? `+${sel.pts}` : '0'}` : '';
  const selBio = sel?.bio ? `«${sel.bio.slice(0, 40)}»` : '';
  const bubbleH = selBio ? 40 : 26;
  const bubbleW = Math.max(selLabel.length * 7.4, selBio.length * 6.2) + 22;
  const bubbleX = sel ? Math.max(6, Math.min(VBW - 6 - bubbleW, sel.x - bubbleW / 2)) : 0;
  const bubbleAbove = sel ? sel.y - 26 - bubbleH > 4 : true;
  const bubbleY = sel ? (bubbleAbove ? sel.y - 26 - bubbleH : sel.y + 22) : 0;

  const ticks = [];
  for (let a = 0; a <= 180; a += 6) {
    const major = a % 30 === 0;
    const p1 = polar(a, R - 6);
    const p2 = polar(a, major ? R - 24 : R - 16);
    ticks.push(
      <line
        key={a}
        x1={p1.x.toFixed(2)}
        y1={p1.y.toFixed(2)}
        x2={p2.x.toFixed(2)}
        y2={p2.y.toFixed(2)}
        stroke="var(--teal-900)"
        strokeOpacity={major ? 0.55 : 0.3}
        strokeWidth={major ? 3 : 2}
        strokeLinecap="round"
      />
    );
  }

  return (
    <svg
      ref={svgRef}
      className={`dial ${interactive ? 'dial--interactive' : ''}`}
      viewBox={`0 0 ${VBW} ${VBH}`}
      role={interactive ? 'slider' : 'img'}
      aria-label={interactive ? 'Aguja del dial' : 'Dial de Mutuo'}
      aria-valuemin={MIN_ANGLE}
      aria-valuemax={MAX_ANGLE}
      aria-valuenow={Math.round(angle)}
      tabIndex={interactive ? 0 : -1}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      style={{ touchAction: 'none' }}
    >
      <defs>
        <clipPath id="dial-face-clip">
          <path d={sector(-2, 182, R + 1)} />
        </clipPath>
        <radialGradient id="dial-face-grad" cx="50%" cy="100%" r="100%">
          <stop offset="0%" stopColor="var(--mint-hi)" />
          <stop offset="100%" stopColor="var(--mint)" />
        </radialGradient>
      </defs>

      {/* Bisel festoneado */}
      <g className={spinning ? 'dial__bezel-spin' : ''} style={{ transformOrigin: `${CX}px ${CY}px` }}>
        {scallops}
        <circle cx={CX} cy={CY} r={R + 10} fill="var(--bezel)" />
      </g>

      {/* Cara del dial */}
      <path d={sector(0, 180, R)} fill="url(#dial-face-grad)" />

      {/* Zona objetivo (bajo la pantalla), con envoltura por los extremos */}
      {target !== null && (
        <g clipPath="url(#dial-face-clip)">
          {BANDS.flatMap((b) =>
            wrapSegments(target + b.from, target + b.to).map(([s1, s2], i) => (
              <path
                key={`${b.from}-${i}`}
                d={sector(s1, s2, R - 1.5)}
                fill={`var(--w${b.pts})`}
                stroke="var(--teal-900)"
                strokeOpacity={0.25}
                strokeWidth={1}
              />
            ))
          )}
          {BANDS.map((b) => {
            const mid = polar(norm180(target + (b.from + b.to) / 2), R * 0.6);
            return (
              <text
                key={`t${b.from}`}
                x={mid.x}
                y={mid.y}
                className="dial__pts"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {b.pts}
              </text>
            );
          })}
        </g>
      )}

      {/* Pantalla giratoria que oculta la zona */}
      <g clipPath="url(#dial-face-clip)">
        <g
          style={{
            transform: open ? 'rotate(184deg)' : 'rotate(0deg)',
            transformOrigin: `${CX}px ${CY}px`,
            transition: open
              ? 'transform 950ms cubic-bezier(.65,.05,.25,1) 400ms'
              : 'transform 950ms cubic-bezier(.65,.05,.25,1)',
          }}
        >
          <path d={sector(0, 180, R)} fill="url(#dial-face-grad)" />
          {Array.from({ length: 15 }, (_, i) => i * 12).map((a) => (
            <path
              key={a}
              d={sector(a, a + 6, R)}
              fill="var(--teal-900)"
              opacity={0.05}
            />
          ))}
        </g>
      </g>

      {/* Marcas */}
      {ticks}

      {/* Base */}
      <rect x={12} y={CY - 4} width={VBW - 24} height={52} rx={18} fill="var(--teal-900)" />
      <rect x={32} y={CY - 4} width={VBW - 64} height={10} rx={5} fill="var(--teal-950)" opacity={0.5} />

      {/* Aguja */}
      {showNeedle && (
        <g
          style={{
            transform: `rotate(${angle - 90}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: dragging ? 'none' : 'transform 420ms cubic-bezier(.3,1.4,.4,1)',
          }}
        >
          <polygon
            points={`${CX - 6},${CY} ${CX + 6},${CY} ${CX + 1.5},${CY - R + 14} ${CX - 1.5},${CY - R + 14}`}
            fill="var(--red)"
            stroke="var(--red-dark)"
            strokeWidth={1}
          />
        </g>
      )}
      <circle cx={CX} cy={CY} r={17} fill="var(--red)" stroke="var(--red-dark)" strokeWidth={3} />
      <circle cx={CX} cy={CY} r={6} fill="var(--red-dark)" />

      {/* Marcadores de los adivinadores */}
      {markerSpots.map((m) => (
        <g
          key={m.idx}
          className={`dial-marker c${m.colorIdx}`}
          style={{ animationDelay: `${1350 + m.idx * 130}ms` }}
          onMouseEnter={() => setSelMarker(m.idx)}
          onMouseLeave={() => setSelMarker((cur) => (cur === m.idx ? null : cur))}
          onClick={() => setSelMarker((cur) => (cur === m.idx ? null : m.idx))}
        >
          <title>{`${m.name} · ${m.pts > 0 ? `+${m.pts}` : '0'}`}</title>
          {m.avatar ? (
            <>
              <clipPath id={`mk-clip-${m.idx}`}>
                <circle cx={m.x.toFixed(2)} cy={m.y.toFixed(2)} r={13.5} />
              </clipPath>
              <circle
                cx={m.x.toFixed(2)}
                cy={m.y.toFixed(2)}
                r={14}
                fill="var(--pc)"
                stroke="var(--pc)"
                strokeWidth={3}
              />
              <image
                href={m.avatar}
                x={(m.x - 13.5).toFixed(2)}
                y={(m.y - 13.5).toFixed(2)}
                width={27}
                height={27}
                clipPath={`url(#mk-clip-${m.idx})`}
                preserveAspectRatio="xMidYMid slice"
              />
              <circle
                cx={m.x.toFixed(2)}
                cy={m.y.toFixed(2)}
                r={14}
                fill="none"
                stroke="var(--paper)"
                strokeWidth={3}
              />
            </>
          ) : (
            <>
              <circle
                cx={m.x.toFixed(2)}
                cy={m.y.toFixed(2)}
                r={14}
                fill="var(--pc)"
                stroke="var(--paper)"
                strokeWidth={3}
              />
              <text x={m.x.toFixed(2)} y={m.y.toFixed(2)} className="dial-marker__txt">
                {m.initials}
              </text>
            </>
          )}
        </g>
      ))}

      {/* Burbuja con el nombre completo del marcador tocado */}
      {sel && (
        <g className="dial-marker-tip" pointerEvents="none">
          <rect x={bubbleX} y={bubbleY} width={bubbleW} height={bubbleH} rx={13} fill="var(--teal-900)" />
          <text
            x={bubbleX + bubbleW / 2}
            y={bubbleY + 13}
            className="dial-marker-tip__txt"
          >
            {selLabel}
          </text>
          {selBio && (
            <text
              x={bubbleX + bubbleW / 2}
              y={bubbleY + 29}
              className="dial-marker-tip__txt dial-marker-tip__txt--bio"
            >
              {selBio}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
