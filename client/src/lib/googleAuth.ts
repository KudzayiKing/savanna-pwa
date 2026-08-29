import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type AuthError,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle(): Promise<UserCredential | void> {
  const auth = getFirebaseAuth();

  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    const code = (error as AuthError | undefined)?.code;
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      return signInWithRedirect(auth, googleProvider);
    }
    throw error;
  }
}

export function describeGoogleAuthError(error: unknown): string {
  const code = (error as AuthError | undefined)?.code;
  const fallback = error instanceof Error ? error.message : "Google sign-in failed. Please try again.";

  switch (code) {
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled yet. Enable Google under Firebase Authentication sign-in methods.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow popups for this site and try again.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before it finished.";
    case "auth/account-exists-with-different-credential":
      return "This email is already linked to another sign-in method.";
    case "auth/app-not-authorized":
      return "This domain is not authorised for Firebase Auth. Add it in Firebase Authentication settings.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return fallback;
  }
}
