import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getRemoteConfig } from "firebase-admin/remote-config";
import { env } from "./env";

/** Service account from env on Vercel; bare projectId for the emulators. */
function app() {
  const e = env();
  return (
    getApps()[0] ??
    initializeApp(
      e.FIREBASE_CLIENT_EMAIL && e.FIREBASE_PRIVATE_KEY
        ? { projectId: e.FIREBASE_PROJECT_ID, credential: cert({ projectId: e.FIREBASE_PROJECT_ID, clientEmail: e.FIREBASE_CLIENT_EMAIL, privateKey: e.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) }
        : { projectId: e.FIREBASE_PROJECT_ID },
    )
  );
}

let _db: Firestore | undefined;
export const db = () => {
  if (!_db) {
    _db = getFirestore(app());
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
};
export const auth = () => getAuth(app());
export const appCheck = () => getAppCheck(app());
export const remoteConfig = () => getRemoteConfig(app());
