# Poner Mutuo en internet

Dos piezas: **Firebase** (lobbies en tiempo real) y un **hosting estático** (la web). Ambas gratis.

## 1. Firebase (obligatorio para el modo en línea)

1. Entra en [console.firebase.google.com](https://console.firebase.google.com) → **Añadir proyecto** (nombre libre, sin Analytics).
2. Menú **Compilación → Realtime Database** → *Crear base de datos* (zona europea, modo **bloqueado**).
3. En la pestaña **Reglas**, pega el contenido de [`firebase-rules.json`](firebase-rules.json) y publica.
4. Menú **Compilación → Authentication** → *Empezar* → pestaña **Sign-in method** → habilita **Anónimo**.
5. Rueda dentada → **Configuración del proyecto** → *Tus apps* → icono **Web** (`</>`) → registra la app.
   Copia los valores de `firebaseConfig` a un archivo **`.env`** en la raíz del repo (plantilla: [`.env.example`](.env.example)).
   `databaseURL` aparece en la pestaña de Realtime Database si no sale en el snippet.
6. Prueba en local: `npm run dev -- --port 4777` → menú → **En línea**.

## 2. Publicar la web (Netlify, el más directo)

1. Crea cuenta en [netlify.com](https://netlify.com) (con GitHub si tienes, o email).
2. Opción A (sin GitHub): `npm run build` y arrastra la carpeta **`dist/`** a *Deploys → drag & drop*.
   ⚠️ Con este método, cada cambio requiere repetir build + arrastre.
3. Opción B (recomendada): sube el repo a GitHub y en Netlify *Add new site → Import from Git*:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - En *Site configuration → Environment variables* añade las mismas `PUBLIC_FIREBASE_*` del `.env`.
4. Cuando tengas la URL definitiva, descomenta `site:` en `astro.config.mjs` con esa URL (activa el canonical y og:url para SEO) y vuelve a desplegar.
5. Comparte la URL (`https://loquesea.netlify.app`) — cada uno entra desde su móvil.

## Notas

- Las claves `PUBLIC_FIREBASE_*` son públicas por diseño (van en el JavaScript del navegador); la seguridad la ponen las reglas de la base de datos.
- Anti-tramposos: el estado de la partida (incluida la zona secreta) viaja por la base de datos; alguien con las herramientas de desarrollador podría verla. Para partidas caseras es irrelevante.
- El plan gratuito de Firebase (Spark) da de sobra para muchas partidas simultáneas.
