import { expect, test } from "vitest";
import { createFirebaseAuthAdapter } from "../src/firebase";

test("getIdToken waits for the first user instead of returning null at startup", async () => {
  let fire: (u: unknown) => void = () => {};
  let current: { getIdToken(): Promise<string> } | null = null;
  const a = createFirebaseAuthAdapter({
    auth: {},
    onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => void (fire = cb),
    signInAnonymously: async () => {},
    signOut: async () => {},
    currentUser: () => current,
    signInWithGoogle: async () => {},
  } as never);
  const token = a.getIdToken();
  current = { getIdToken: async () => "tok" };
  fire({ uid: "u1", isAnonymous: true, displayName: null, email: null, photoURL: null, ...current });
  expect(await token).toBe("tok");
});
