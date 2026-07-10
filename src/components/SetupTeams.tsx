import type { Dispatch } from 'react';
import type { GameState, Team } from '../game/types';
import type { Action } from '../game/reducer';
import { canStart, COLOR_COUNT } from '../game/reducer';
import { PlayerRow, EndConfig, CategoryPicker, ExtrasConfig } from './SetupShared';
import { useDragList } from './useDragList';

type Props = { s: GameState; dispatch: Dispatch<Action> };

function TeamBox({
  team,
  index,
  removable,
  dispatch,
}: {
  team: Team;
  index: number;
  removable: boolean;
  dispatch: Dispatch<Action>;
}) {
  const { handleProps, rowStyle } = useDragList({
    count: team.players.length,
    teamId: team.id,
    onReorder: (from, to) =>
      dispatch({ type: 'REORDER_TEAM_PLAYERS', teamId: team.id, from, to }),
    onMoveToTeam: (toTeamId, fromIndex) => {
      const player = team.players[fromIndex];
      if (player) {
        dispatch({
          type: 'MOVE_PLAYER_TO_TEAM',
          fromTeamId: team.id,
          playerId: player.id,
          toTeamId,
        });
      }
    },
  });

  return (
    <div className={`team-box c${index % COLOR_COUNT}`} data-team-id={team.id}>
      <div className="team-box__head">
        <span className="dot" aria-hidden="true" />
        <input
          className="input input--team"
          value={team.name}
          placeholder={`Equipo ${index + 1}`}
          maxLength={20}
          onChange={(e) => dispatch({ type: 'RENAME_TEAM', id: team.id, name: e.target.value })}
          onFocus={(e) => e.target.select()}
          aria-label={`Nombre del equipo ${index + 1}`}
        />
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: 'REMOVE_TEAM', id: team.id })}
          disabled={!removable}
          aria-label={`Eliminar ${team.name}`}
        >
          ✕
        </button>
      </div>
      {team.players.map((p, pi) => (
        <PlayerRow
          key={p.id}
          name={p.name}
          placeholder={`Jugador ${pi + 1}`}
          canRemove={team.players.length > 2}
          onRename={(name) =>
            dispatch({ type: 'RENAME_TEAM_PLAYER', teamId: team.id, playerId: p.id, name })
          }
          onRemove={() => dispatch({ type: 'REMOVE_TEAM_PLAYER', teamId: team.id, playerId: p.id })}
          handleProps={handleProps(pi)}
          style={rowStyle(pi)}
        />
      ))}
      <button
        className="btn btn--ghost btn--small"
        onClick={() => dispatch({ type: 'ADD_TEAM_PLAYER', teamId: team.id })}
      >
        + Añadir jugador
      </button>
    </div>
  );
}

export default function SetupTeams({ s, dispatch }: Props) {
  return (
    <section className="panel panel--setup">
      <p className="panel__kicker">Por equipos</p>
      <h2 className="panel__title">Montad los equipos</h2>
      <p className="end-config__hint">Arrastra el asa ⠿ para reordenar o cambiar de equipo.</p>

      {s.teams.map((t, ti) => (
        <TeamBox key={t.id} team={t} index={ti} removable={s.teams.length > 1} dispatch={dispatch} />
      ))}

      <div className="btn-row">
        <button className="btn btn--ghost btn--small" onClick={() => dispatch({ type: 'ADD_TEAM' })}>
          + Añadir equipo
        </button>
        <button
          className="btn btn--ghost btn--small"
          onClick={() => dispatch({ type: 'SHUFFLE_TEAMS_DISTRIBUTE' })}
        >
          🔀 Repartir al azar
        </button>
        <button
          className="btn btn--ghost btn--small"
          onClick={() => dispatch({ type: 'SHUFFLE_TEAMS_INTERNAL' })}
        >
          🔀 Barajar orden interno
        </button>
      </div>
      {s.teams.length < 2 && <p className="end-config__hint">Hacen falta al menos 2 equipos.</p>}

      <CategoryPicker
        categories={s.categories}
        onChange={(categories) => dispatch({ type: 'SET_CATEGORIES', categories })}
      />

      <EndConfig
        mode="teams"
        endRule={s.endRule}
        onChange={(endRule) => dispatch({ type: 'SET_END_RULE', endRule })}
      />

      <ExtrasConfig
        mode="teams"
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
