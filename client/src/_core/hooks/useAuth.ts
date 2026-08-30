import { startLogin } from "@/const";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { ensureUserProfile, type AppUser } from "@/lib/userProfile";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * The single source of truth about who is signed in.
 *
 * Previously this polled `trpc.auth.me`, which meant every page that needed
 * identity also needed the Express API — and on a static deploy where that API
 * wasn't reachable, sign-in failed with the misleading
 * `Unexpected token '<' ... is not valid JSON` (the SPA fallback serving HTML
 * where tRPC expected JSON). Identity now comes from Firebase Auth directly, so
 * it works with no backend of our own at all.
 *
 * The shape returned here is unchanged: pages still read `user`, `loading`,
 * `error`, `isAuthenticated` and still call `logout` / `refresh`. That was the
 * point of confining the change to this file.
 */
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};

  const configured = useMemo(() => isFirebaseConfigured(), []);

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    // Without config there is nothing to subscribe to. Report "not signed in"
    // rather than throwing, so the app still renders and can show a real
    // message instead of a blank screen.
    if (!configured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      getFirebaseAuth(),
      async user => {
        if (cancelled) return;
        setFirebaseUser(user);

        if (!user) {
          setProfile(null);
          setLoading(false);
          return;
        }

        try {
          // Creates the Firestore profile on first sign-in, reads it otherwise.
          const loaded = await ensureUserProfile(user);
          if (cancelled) return;
          setProfile(loaded);
          setError(null);
        } catch (cause) {
          if (cancelled) return;
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      cause => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [configured]);

  const refresh = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const loaded = await ensureUserProfile(firebaseUser);
      setProfile(loaded);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }, [firebaseUser]);

  const logout = useCallback(async () => {
    if (!configured) return;
    setSigningOut(true);
    try {
      await signOut(getFirebaseAuth());
      setProfile(null);
      setError(null);
    } finally {
      setSigningOut(false);
    }
  }, [configured]);

  // The Manus runtime reads this key to decorate error reports. It was
  // previously written as a side effect of a `useMemo` during render, which is
  // both a React correctness bug and a per-render write; moved into an effect
  // so it runs once per identity change instead.
  useEffect(() => {
    try {
      localStorage.setItem("manus-runtime-user-info", JSON.stringify(profile));
    } catch {
      // Private browsing and blocked storage both throw here. Losing this
      // diagnostic must never break sign-in.
    }
  }, [profile]);

  const state = useMemo(
    () => ({
      user: profile,
      loading: loading || signingOut,
      error,
      isAuthenticated: Boolean(profile),
    }),
    [profile, loading, signingOut, error]
  );

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    if (redirectPath) {
      window.location.href = redirectPath;
    } else {
      startLogin();
    }
  }, [redirectOnUnauthenticated, redirectPath, state.loading, state.user]);

  return {
    ...state,
    refresh,
    logout,
  };
}
