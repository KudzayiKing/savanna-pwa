import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { isFirebaseConfigured } from "@/lib/firebase";
import { describeGoogleAuthError, signInWithGoogle } from "@/lib/googleAuth";
import {
  confirmOtp,
  createRecaptchaVerifier,
  describePhoneAuthError,
  isValidPhoneNumber,
  normalizePhoneNumber,
  requestOtp,
} from "@/lib/phoneAuth";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { ArrowLeft, ArrowRight, Loader2, Mail, Phone, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

type Step = "phone" | "code";

const OTP_LENGTH = 6;
const RECAPTCHA_CONTAINER_ID = "recaptcha-container";

function getNextPath() {
  if (typeof window === "undefined") return "/messages";
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/messages";
  return value;
}

export default function LoginPage() {
  const { isAuthenticated, loading } = useAuth();
  const nextPath = useMemo(getNextPath, []);

  const configured = useMemo(() => isFirebaseConfigured(), []);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // `ConfirmationResult` is the handle Firebase gives back after sending the
  // SMS; the code is confirmed against it later. It is not serialisable, so it
  // lives in a ref-backed state rather than anywhere persistent.
  const [pending, setPending] = useState<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const submittingRef = useRef(false);

  /**
   * Creates the invisible reCAPTCHA verifier once the container is mounted.
   *
   * The verifier is stateful and bound to a DOM element: leaving it behind on
   * unmount makes the next mount throw "reCAPTCHA has already been rendered in
   * this element", which is why the cleanup clears it.
   */
  const buildVerifier = useCallback(() => {
    verifierRef.current?.clear();
    verifierRef.current = createRecaptchaVerifier(RECAPTCHA_CONTAINER_ID);
    return verifierRef.current;
  }, []);

  useEffect(() => {
    if (!configured) return;
    buildVerifier();
    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, [configured, buildVerifier]);

  useEffect(() => {
    if (!loading && isAuthenticated) window.location.replace(nextPath);
  }, [isAuthenticated, loading, nextPath]);

  const sendCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (busy) return;

    const e164 = normalizePhoneNumber(phone);
    if (!isValidPhoneNumber(e164)) {
      toast.error("Enter a valid mobile number, e.g. 0772 123 456.");
      return;
    }

    setBusy(true);
    try {
      const result = await requestOtp(e164, buildVerifier());
      setPending(result);
      setSentTo(e164);
      setCode("");
      setStep("code");
      toast.success(`Code sent to ${e164}`);
    } catch (error) {
      // A failed attempt leaves reCAPTCHA in an unusable state, so rebuild it
      // or every retry after the first failure fails the same way.
      buildVerifier();
      toast.error(describePhoneAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      toast.success("Welcome to Savanna");
      window.location.href = nextPath;
    } catch (error) {
      toast.error(describeGoogleAuthError(error));
      setGoogleBusy(false);
    }
  };

  const verifyCode = async () => {
    if (busy || submittingRef.current) return;
    if (!pending) {
      setStep("phone");
      return;
    }
    if (code.length !== OTP_LENGTH) return;

    submittingRef.current = true;
    setBusy(true);
    try {
      await confirmOtp(pending, code);
      toast.success("Welcome to Savanna");
      window.location.href = nextPath;
    } catch (error) {
      submittingRef.current = false;
      toast.error(describePhoneAuthError(error));
      setCode("");
      setBusy(false);
    }
    // No `finally` reset on the success path: we are navigating away, and
    // clearing busy state here would flash the disabled button mid-redirect.
  };

  // Submit as soon as the last digit lands. Guarded by the same ref as the
  // button so auto-submit and a click cannot both fire.
  useEffect(() => {
    if (step === "code" && code.length === OTP_LENGTH) void verifyCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  if (!configured) {
    return (
      <Shell icon={<ShieldCheck className="size-5" />} eyebrow="Setup needed" title="Firebase isn't configured">
        <p className="text-sm leading-6 text-[#5F6861] dark:text-[#B9B09F]">
          Sign-in needs the Firebase web config. Copy <code className="text-[#D9A441]">.env.example</code> to{" "}
          <code className="text-[#D9A441]">.env</code>, fill in the six{" "}
          <code className="text-[#D9A441]">VITE_FIREBASE_*</code> values from your project settings, then restart the
          dev server.
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      icon={step === "code" ? <ShieldCheck className="size-5" /> : <Phone className="size-5" />}
      eyebrow={step === "code" ? "Verify" : "Welcome"}
      title={step === "code" ? "Enter your code" : "Sign in to Savanna"}
    >
      {step === "phone" ? (
        <div className="space-y-5">
          <Button
            type="button"
            disabled={googleBusy || loading}
            onClick={continueWithGoogle}
            className="h-12 w-full rounded-xl border border-[#eadfca] bg-white px-4 text-[#151A17] shadow-none hover:bg-[#fffaf0] dark:border-[#2C3336] dark:bg-[#0A1014]/40 dark:text-[#E9EDEF] dark:hover:bg-[#202C33]"
          >
            <span className="mr-3 grid size-8 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]">
              {googleBusy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            </span>
            Continue with Gmail
          </Button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[#eadfca] dark:bg-[#2C3336]" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A948D]">or phone</span>
            <span className="h-px flex-1 bg-[#eadfca] dark:bg-[#2C3336]" />
          </div>

          <form className="space-y-5" onSubmit={sendCode}>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#D9A441]">
                  <Phone className="size-4" />
                </span>
                <Input
                  id="phone"
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  className="border-[#DDE3DC] bg-white pl-9 shadow-none dark:border-[#2C3336] dark:bg-[#0A1014]/40"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0772 123 456"
                  aria-describedby="phone-hint"
                  required
                />
              </div>
              <p id="phone-hint" className="text-xs leading-5 text-[#5F6861] dark:text-[#B9B09F]">
                Phone sign-in may require Firebase billing. Gmail is available for testing now.
              </p>
            </div>

            <Button
              type="submit"
              disabled={busy || loading || !phone.trim()}
              className="savanna-brand-token h-11 w-full rounded-xl shadow-none"
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRight className="mr-2 size-4" />}
              Send code
            </Button>
          </form>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void verifyCode(); }}>
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <InputOTP
              id="otp"
              maxLength={OTP_LENGTH}
              value={code}
              onChange={setCode}
              disabled={busy}
              containerClassName="justify-center"
            >
              <InputOTPGroup>
                {Array.from({ length: OTP_LENGTH }, (_, index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p className="text-center text-xs leading-5 text-[#5F6861] dark:text-[#B9B09F]">
              Sent to <span className="font-medium text-[#151A17] dark:text-[#E9EDEF]">{sentTo}</span>
            </p>
          </div>

          <Button
            type="submit"
            disabled={busy || code.length !== OTP_LENGTH}
            className="savanna-brand-token h-11 w-full rounded-xl shadow-none"
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRight className="mr-2 size-4" />}
            Verify and continue
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="inline-flex items-center text-[#5F6861] underline underline-offset-4 dark:text-[#B9B09F]"
              onClick={() => {
                setStep("phone");
                setCode("");
                setPending(null);
              }}
            >
              <ArrowLeft className="mr-1 size-3.5" />
              Wrong number?
            </button>
            <button
              type="button"
              className="font-medium text-[#D9A441] underline underline-offset-4"
              disabled={busy}
              onClick={() => {
                setCode("");
                setStep("phone");
                // Back to the phone step so the user can correct a typo before
                // spending another SMS.
              }}
            >
              Resend code
            </button>
          </div>
        </form>
      )}

      {/*
        Firebase renders the invisible reCAPTCHA challenge into this element.
        It must exist in the DOM before `signInWithPhoneNumber` is called, and
        it must not be conditionally rendered away once the verifier is built.
      */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </Shell>
  );
}

function Shell({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-10 text-[#151A17] dark:bg-[#0A1014] dark:text-[#E9EDEF]">
      <section className="w-full max-w-[420px] rounded-[28px] border border-[#DDE3DC] bg-[#F6F5F5] px-6 py-6 shadow-[0_14px_32px_rgba(21,26,23,0.06)] dark:border-[#2C3336] dark:bg-[#131A1E] sm:px-10 sm:py-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
            {icon}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D9A441]">{eyebrow}</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.055em]">{title}</h1>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
