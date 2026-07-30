import type { Dispatch } from 'react';
import type { GameState } from '../game/types';
import type { Action } from '../game/reducer';
import { canStart } from '../game/reducer';
import { PlayerRow, EndConfig, CategoryPicker, ExtrasConfig } from './SetupShared';
import { useDragList } from './useDragList';

type Props = { s: GameState; dispatch: Dispatch<Action> };

export default function SetupFfa({ s, dispatch }: Props) {
  const { handleProps, rowStyle } = useDragList({
    count: s.players.length,
    onReorder: (from, to) => dispatch({ type: 'REORDER_PLAYERS', from, to }),
  });

  return (
    <section className="panel panel--setup">
      <p className="panel__kicker">
        {s.options.fixedPsychic ? '🎤 Presentador' : 'Todos contra todos'}
      </p>
      <h2 className="panel__title">¿Quién juega?</h2>
      {s.options.fixedPsychic && (
        <p className="end-config__hint">
          Presenta <b>{s.players[0]?.name.trim() || 'Jugador 1'}</b> (el primero de la lista): da
          todas las pistas, no puntúa y no sale en la clasificación. Arrastra a otro arriba para
          cambiarlo.
        </p>
      )}

      <div className="player-list">
        {s.players.map((p, i) => (
          <PlayerRow
            key={p.id}
            name={p.name}
            placeholder={`Jugador ${i + 1}`}
            canRemove={s.players.length > 2}
            onRename={(name) => dispatch({ type: 'RENAME_PLAYER', id: p.id, name })}
            onRemove={() => dispatch({ type: 'REMOVE_PLAYER', id: p.id })}
            handleProps={handleProps(i)}
            style={rowStyle(i)}
          />
        ))}
      </div>
      <div className="btn-row">
        <button className="btn btn--ghost btn--small" onClick={() => dispatch({ type: 'ADD_PLAYER' })}>
          + Añadir jugador
        </button>
        <button
          className="btn btn--ghost btn--small"
          onClick={() => dispatch({ type: 'SHUFFLE_PLAYERS' })}
        >
          🔀 Orden aleatorio
        </button>
      </div>

      <CategoryPicker
        categories={s.categories}
        onChange={(categories) => dispatch({ type: 'SET_CATEGORIES', categories })}
      />

      <EndConfig
        mode={s.mode}
        endRule={s.endRule}
        onChange={(endRule) => dispatch({ type: 'SET_END_RULE', endRule })}
      />

      <ExtrasConfig
        mode={s.mode}
        options={s.options}
        onChange={(options) => dispatch({ type: 'SET_OPTIONS', options })}
      />

      <button
        className="btn btn--primary"
        disabled={!canStart(s)}
        onClick={() => dispatch({ type: 'START_GAME' })}
      >
        Empezar
      </button>
      <button className="link-btn" onClick={() => dispatch({ type: 'GO_HOME' })}>
        ← Menú
      </button>
    </section>
  );
}
