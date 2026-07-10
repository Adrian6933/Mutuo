# Mutuo

Versión web del juego de mesa *Wavelength* para jugar en un solo dispositivo o en línea, por equipos o todos contra todos.

## Cómo se juega

1. El **psíquico** ve la zona secreta en el dial y la oculta.
2. Elige carta del mazo o escribe la suya, y da una **pista en voz alta** que encaje en ese punto del espectro (p. ej. entre *Frío* y *Caliente*).
3. Quien adivina **arrastra la aguja** hasta donde crea que apunta la pista.
4. Se revela la zona: **4 / 3 / 2 puntos** según lo cerca que esté la aguja.

### Modos

- **Todos contra todos** — el psíquico rota y el siguiente jugador adivina: los puntos son para los dos. Fin por vueltas (máx. 9) o por puntos (máx. 100).
- **Por equipos** — pista dentro del equipo, puntos al marcador común y **apuesta rival** opcional: el otro equipo apuesta a qué lado de la aguja está la zona (+1 si acierta y no hay 4).

### Configuración

- **~500 cartas** en 10 temas (fútbol, comida, vida cotidiana, cine, música, motor, tecnología, animales, viajes y clásicas) con filtro multiselección.
- El psíquico puede robar **carta aleatoria** o escribir la suya. La zona puede caer en los bordes y **envolver** al otro lado del dial, como en el juego físico.
- Extras conmutables: **temporizador** para adivinar (30/60/90 s), **desempate** a muerte súbita, **estadísticas** finales y **sonidos**.
- Jugadores reordenables **arrastrando el asa ⠿** (entre equipos también) y botones de orden aleatorio.
- La partida en curso y las preferencias (nombres, temas, extras) se guardan en `localStorage`.

### En línea (multijugador)

- Cada jugador desde su móvil: **lobbies públicas** (listadas) o **privadas** (ID de 6 caracteres + clave de 4 dígitos), crear o unirse.
- El anfitrión configura modo, temas, fin y extras; en equipos asigna jugadores. La aguja se ve moverse **en tiempo real** en todos los dispositivos; cada rol ve solo su pantalla (la zona secreta, solo el psíquico).
- Backend: **Firebase Realtime Database** con sesión anónima; el anfitrión es la autoridad (ejecuta el reducer y publica el estado; si se va, otro jugador hereda el rol). Sin claves configuradas, el modo muestra las instrucciones.
- Setup y publicación: ver [DEPLOY.md](DEPLOY.md). Claves en `.env` (plantilla `.env.example`), reglas en `firebase-rules.json`.
- Nota anti-tramposos: el estado viaja por la base de datos; con devtools se podría ver la zona. Para partidas caseras, irrelevante.

## Stack

- [Astro 5](https://astro.build) + [React 19](https://react.dev)
- Dial SVG interactivo (arrastre con puntero + flechas de teclado)

## Desarrollo

```sh
npm install
npm run dev -- --port 4777
```

Las cartas de espectro viven en `src/data/cards/` (un archivo por tema) — añade ahí nuevas parejas de conceptos.
