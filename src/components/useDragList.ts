import { useRef, useState } from 'react';
import type React from 'react';

export type DragState = {
  index: number;
  offset: number;
  overTeamId: number | null;
} | null;

type Params = {
  count: number;
  /** alto de fila + separación, para calcular la posición destino */
  rowHeight?: number;
  onReorder: (from: number, to: number) => void;
  /** si se define, soltar sobre un elemento con data-team-id distinto mueve el jugador */
  teamId?: number;
  onMoveToTeam?: (toTeamId: number, fromIndex: number) => void;
};

/**
 * Arrastre vertical de filas con pointer events, sin dependencias.
 * Devuelve props para el asa y estilos para cada fila.
 */
export function useDragList({ count, rowHeight = 54, onReorder, teamId, onMoveToTeam }: Params) {
  const [drag, setDragState] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);
  const start = useRef({ y: 0, index: 0 });
  const dragging = useRef(false);

  const setDrag = (d: DragState) => {
    dragRef.current = d;
    setDragState(d);
  };

  const targetIndex = (offset: number, index: number) =>
    Math.max(0, Math.min(count - 1, index + Math.round(offset / rowHeight)));

  const handleProps = (index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // sin captura también funciona mientras el puntero siga sobre el asa
      }
      dragging.current = true;
      start.current = { y: e.clientY, index };
      setDrag({ index, offset: 0, overTeamId: null });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const offset = e.clientY - start.current.y;
      let overTeamId: number | null = null;
      if (teamId !== undefined && onMoveToTeam) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const box = el?.closest('[data-team-id]');
        if (box) {
          const id = Number(box.getAttribute('data-team-id'));
          if (id !== teamId) overTeamId = id;
        }
      }
      setDrag({ index: start.current.index, offset, overTeamId });
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no había captura
      }
      const d = dragRef.current;
      if (d) {
        if (d.overTeamId !== null && onMoveToTeam) {
          onMoveToTeam(d.overTeamId, d.index);
        } else {
          const to = targetIndex(d.offset, d.index);
          if (to !== d.index) onReorder(d.index, to);
        }
      }
      setDrag(null);
    },
    onPointerCancel: () => {
      dragging.current = false;
      setDrag(null);
    },
  });

  const rowStyle = (index: number): React.CSSProperties => {
    if (!drag) return {};
    if (index === drag.index) {
      return {
        transform: `translateY(${drag.offset}px)`,
        zIndex: 5,
        position: 'relative',
        opacity: drag.overTeamId !== null ? 0.4 : 1,
        transition: 'none',
        // deja pasar elementFromPoint hacia la caja de destino (el asa retiene los eventos por pointer capture)
        pointerEvents: 'none',
      };
    }
    const to = drag.overTeamId !== null ? drag.index : targetIndex(drag.offset, drag.index);
    let shift = 0;
    if (drag.index < index && index <= to) shift = -rowHeight;
    else if (to <= index && index < drag.index) shift = rowHeight;
    return { transform: `translateY(${shift}px)`, transition: 'transform 150ms' };
  };

  return { drag, handleProps, rowStyle };
}
