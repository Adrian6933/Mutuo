---
name: verify
description: Receta para verificar Mutuo (juego Wavelength, Astro+React+Firebase) en ejecución — arranque, flujos que merece la pena recorrer y trucos del entorno.
---

# Verificar Mutuo en ejecución

## Arranque

- Servidor dev: `preview_start` con `{name: "mutuo-dev"}` (de `.claude/launch.json`, puerto 4777, autoPort false).
- `preview_screenshot`/`computer screenshot` hacen **timeout en este entorno** — usa `read_page`, `javascript_tool` (leer `document.body.innerText`) y `read_console_messages`.
- Los errores de consola pueden venir **bufferizados de antes de un fix** — verifica siempre contra el DOM/HTML vivo, no contra el log.
- Estado guardado: `localStorage` claves `frecuencia-state-v1` (partida), `frecuencia-prefs-v1` (prefs), `frecuencia-nick`, `frecuencia-online-v1` (rejoin). Bórralas para partir de cero.

## Flujos que hay que recorrer

1. **FFA local 3 jugadores** (cubre apuesta de lado): menú → Todos contra todos → Empezar → handoff → carta → ocultar → pista (escrita u oral) → confirmar → apuesta del espectador → reveal → clasificación.
2. **Equipos**: necesita 2 equipos × 2 jugadores ("+ Añadir equipo" y 2 × "+ Añadir jugador").
3. **Persistencia**: recargar a mitad → "Continuar partida guardada" en el menú.
4. **Animación bisel**: al abrirse el cover, `.dial__bezel-spin` aparece ~150ms y desaparece ~700ms (comprobar con setTimeout en `javascript_tool`).
5. **Aguja por teclado**: `focus()` en `.dial` + `KeyboardEvent ArrowLeft/Right` cambia `aria-valuenow`.

## Multijugador sin segundo navegador

Las pestañas del preview comparten uid anónimo de Firebase. Para jugadores extra reales:

1. Crear usuarios anónimos vía REST: `POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$PUBLIC_FIREBASE_API_KEY` body `{"returnSecureToken":true}` → `localId` (uid) + `idToken`.
2. Operar la RTDB como ese jugador: `curl -X PUT/POST/GET "$PUBLIC_FIREBASE_DATABASE_URL/<path>.json?auth=$ID_TOKEN"`.
   - Unirse: `PUT lobbies/<ID>/players/<uid>` con `{"name","online":true,"joinedAt":<ms>}`.
   - Acciones: `POST lobbies/<ID>/actions` con `{"uid":"<uid>","action":{...}}` (el host las valida con `actionAllowed` — SHOW_STANDINGS/NEXT_ROUND son **solo host**, no es un bug).
   - Aguja en vivo: `PUT lobbies/<ID>/live/needle` con el ángulo.
3. Limpiar al acabar: borrar lobby y `POST accounts:delete {idToken}` por cada usuario de prueba.

Límites conocidos: la reacción del cliente expulsado ("Te han expulsado") y la migración de host reclamada por transaction necesitan un segundo cliente React real (claude-in-chrome o un móvil).

## Gotchas

- React inputs: setear valor con el setter nativo (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`) + `dispatchEvent(new Event('input',{bubbles:true}))`; para blur usar `focusout`, no `blur`.
- Editar `src/game/online.ts` con el server corriendo fuerza recarga completa; la sesión de lobby se reincorpora sola (REJOIN), pero justo tras la recarga puede haber estados transitorios raros — no diagnosticar carreras en ese minuto.
- Temporizadores online: pista 10s, apuesta 10s, reveal 5s — si conduces por REST, encadena las llamadas con sleeps cortos en UN solo Bash o el temporizador te ganará.
