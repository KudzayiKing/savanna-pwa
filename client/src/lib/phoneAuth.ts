import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type AuthError,
  type ConfirmationResult,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

/**
 * Firebase Phone Auth.
 *
 * Two things about phone auth on the Spark plan, which is where this project
 * starts: it allows roughly ten SMS per day, and reCAPTCHA must be able to run
 * on the current domain. Before the Blaze plan is on, add test phone numbers
 * under Firebase console → Authentication → Sign-in method → Phone → Phone
 * numbers for testing. A test number verifies against a fixed code and sends
 * no SMS, so development does not eat the daily quota.
 */

const DEFAULT_COUNTRY_CODE = import.meta.env.VITE_DEFAULT_COUNTRY_CODE?.trim() || "+263";

/**
 * Turns whatever a user types into E.164, which is the only format Firebase
 * accepts. Handles the forms people actually type in Zimbabwe:
 *
 *   "0772 123 456"  -> "+263772123456"
 *   "772123456"     -> "+263772123456"
 *   "263772123456"  -> "+263772123456"
 *   "+263772123456" -> "+263772123456"
 */
export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // An explicit "+" means the caller has already given a full international
  // number, so trust it rather than guessing about a country code.
  if (trimmed.startsWith("+")) return `+${digits}`;

  const country = DEFAULT_COUNTRY_CODE.replace(/\D/g, "");

  // Already includes the country code, just missing the "+".
  if (digits.startsWith(country)) return `+${digits}`;

  // Local trunk prefix (0...) is dropped, not kept.
  if (digits.startsWith("0")) return `+${country}${digits.slice(1)}`;

  return `+${country}${digits}`;
}

/** E.164: "+" then 8–15 digits, country code not starting with 0. */
export function isValidPhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/**
 * Builds an invisible reCAPTCHA verifier.
 *
 * `size: "invisible"` means no puzzle for the user in the normal case; Firebase
 * solves it during `signInWithPhoneNumber`. The element referenced by
 * `containerId` must exist in the DOM when this is called, and must stay
 * mounted until the SMS is requested.
 *
 * Call `verifier.clear()` when unmounting, or a second mount will throw
 * "reCAPTCHA has already been rendered in this element".
 */
export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(getFirebaseAuth(), containerId, {
    size: "invisible",
    // Keep the badge visible: hiding it with CSS breaks reCAPTCHA's terms and
    // makes a real-user failure impossible to debug.
    badge: "bottomright",
  });
}

/** Sends the SMS. The returned result is what you later confirm the code against. */
export async function requestOtp(
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(getFirebaseAuth(), phoneNumber, verifier);
}

/** Verifies the six-digit code the user typed. */
export async function confirmOtp(
  pending: ConfirmationResult,
  code: string
): Promise<UserCredential> {
  return pending.confirm(code);
}

/**
 * Maps Firebase error codes to something a person can act on.
 *
 * Firebase's own messages are developer-facing ("The SMS verification code
 * used to create the phone auth credential is invalid"), which is hostile to
 * put in a toast. Anything unmapped falls through to the raw message rather
 * than a generic "something went wrong", so a new failure is still
 * diagnosable.
 */
export function describePhoneAuthError(error: unknown): string {
  const code = (error as AuthError | undefined)?.code;
  const fallback = error instanceof Error ? error.message : "Something went wrong. Please try again.";

  switch (code) {
    case "auth/invalid-phone-number":
      return "That phone number isn't valid. Check it and try again.";
    case "auth/missing-phone-number":
      return "Enter your phone number first.";
    case "auth/invalid-verification-code":
      return "That code is incorrect. Check the SMS and try again.";
    case "auth/code-expired":
      return "That code has expired. Request a new one.";
    case "auth/too-many-requests":
      return "Too many attempts from this device. Wait a while and try again.";
    case "auth/quota-exceeded":
      return "We've hit our SMS limit for now. Try again later, or upgrade the Firebase plan.";
    case "auth/operation-not-allowed":
      return "Phone sign-in isn't enabled on this Firebase project yet. Enable it under Authentication → Sign-in method → Phone.";
    case "auth/captcha-check-failed":
      return "We couldn't verify you're human. Reload the page and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/app-not-authorized":
      return "This domain isn't authorised for Firebase Auth. Add it under Authentication → Settings → Authorized domains.";
    default:
      return fallback;
  }
}
