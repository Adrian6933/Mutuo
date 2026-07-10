import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN as string | undefined,
  databaseURL: import.meta.env.PUBLIC_FIREBASE_DATABASE_URL as string | undefined,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID as string | undefined,
};

/** true si hay claves de Firebase configuradas en .env */
export const firebaseReady = Boolean(config.apiKey && config.databaseURL);

let app: FirebaseApp | null = null;

function getApp(): FirebaseApp {
  if (!firebaseReady) throw new Error('Firebase sin configurar');
  app ??= getApps()[0] ?? initializeApp(config as Record<string, string>);
  return app;
}

export function getDb(): Database {
  return getDatabase(getApp());
}

/** Inicia sesión anónima y devuelve el uid (estable por dispositivo). */
export function ensureAuth(): Promise<string> {
  const auth = getAuth(getApp());
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        stop();
        resolve(user.uid);
      }
    });
    signInAnonymously(auth).catch((e) => {
      stop();
      reject(e);
    });
  });
}
