import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowRight, KeyRound, Loader2, Mail, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

function getNextPath() {
  if (typeof window === "undefined") return "/messages";
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/messages";
  return value;
}

/** Supabase emails a recovery link carrying `?token_hash=…&type=recovery`. */
function getRecoveryToken() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("type") !== "recovery") return null;
  return params.get("token_hash");
}

export default function LoginPage() {
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const nextPath = useMemo(getNextPath, []);
  const recoveryToken = useMemo(getRecoveryToken, []);

  const [mode, setMode] = useState<Mode>(recoveryToken ? "forgot" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const completeReset = trpc.auth.completePasswordReset.useMutation({
    onSuccess: async () => {
      toast.success("Password updated. Sign in with your new password.");
      setNewPassword("");
      setMode("signin");
      window.history.replaceState({}, "", "/login");
    },
    onError: error => toast.error(error.message),
  });

  const signIn = trpc.auth.signIn.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = nextPath;
    },
    onError: error => toast.error(error.message),
  });

  const signUp = trpc.auth.signUp.useMutation({
    onSuccess: async result => {
      if (result.needsEmailConfirmation) {
        setSentTo(email.trim().toLowerCase());
        return;
      }
      await utils.auth.me.invalidate();
      window.location.href = nextPath;
    },
    onError: error => toast.error(error.message),
  });

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSentTo(email.trim().toLowerCase()),
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!loading && isAuthenticated) window.location.replace(nextPath);
  }, [isAuthenticated, loading, nextPath]);

  const busy =
    signIn.isPending || signUp.isPending || requestReset.isPending || completeReset.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recoveryToken) {
      completeReset.mutate({ tokenHash: recoveryToken, password: newPassword });
      return;
    }
    if (mode === "signin") {
      signIn.mutate({ email: email.trim().toLowerCase(), password });
    } else if (mode === "signup") {
      signUp.mutate({ name: name.trim(), email: email.trim().toLowerCase(), password });
    } else {
      requestReset.mutate({ email: email.trim().toLowerCase() });
    }
  };

  // --- "Check your inbox" confirmation -----------------------------------
  if (sentTo) {
    return (
      <Shell
        icon={<Mail className="size-5" />}
        eyebrow="Check your inbox"
        title="Confirm your email"
      >
        <p className="text-sm leading-6 text-[#4d5c48]">
          We sent a link to <span className="font-medium text-[#263126]">{sentTo}</span>. Open it
          to finish setting up your account.
        </p>
        <p className="text-xs leading-5 text-[#687462]">
          The link expires, so use it soon. Check spam if it hasn't arrived in a couple of minutes.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={() => {
            setSentTo(null);
            setMode("signin");
          }}
        >
          Back to sign in
        </Button>
      </Shell>
    );
  }

  const isReset = Boolean(recoveryToken);

  return (
    <Shell
      icon={isReset ? <KeyRound className="size-5" /> : <UserRound className="size-5" />}
      eyebrow={isReset ? "Password reset" : mode === "signup" ? "Create account" : "Welcome back"}
      title={isReset ? "Choose a new password" : mode === "signup" ? "Join Savanna" : "Sign in to Savanna"}
    >
      <form className="space-y-5" onSubmit={submit}>
        {mode === "signup" && !isReset ? (
          <Field id="name" label="Name" icon={<UserRound className="size-4" />}>
            <Input
              id="name"
              value={name}
              onChange={event => setName(event.target.value)}
              className="pl-9"
              minLength={2}
              maxLength={100}
              autoComplete="name"
              placeholder="Your name"
              required
            />
          </Field>
        ) : null}

        {isReset ? (
          <Field id="new-password" label="New password" icon={<KeyRound className="size-4" />}>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              className="pl-9"
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
            />
          </Field>
        ) : (
          <>
            <Field id="email" label="Email" icon={<Mail className="size-4" />}>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="pl-9"
                maxLength={320}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </Field>

            {mode !== "forgot" ? (
              <Field id="password" label="Password" icon={<KeyRound className="size-4" />}>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="pl-9"
                  minLength={8}
                  maxLength={72}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="At least 8 characters"
                  required
                />
              </Field>
            ) : null}
          </>
        )}

        <Button
          type="submit"
          disabled={busy || loading}
          className="h-11 w-full rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]"
        >
          {busy || loading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ArrowRight className="mr-2 size-4" />
          )}
          {isReset
            ? "Update password"
            : mode === "signup"
              ? "Create account"
              : mode === "forgot"
                ? "Send reset link"
                : "Sign in"}
        </Button>
      </form>

      {isReset ? null : (
        <div className="mt-5 space-y-2 text-center text-sm">
          {mode === "signin" ? (
            <>
              <p className="text-[#687462]">
                New here?{" "}
                <button
                  type="button"
                  className="font-medium text-[#31583a] underline underline-offset-4"
                  onClick={() => setMode("signup")}
                >
                  Create an account
                </button>
              </p>
              <p>
                <button
                  type="button"
                  className="text-[#687462] underline underline-offset-4"
                  onClick={() => setMode("forgot")}
                >
                  Forgot your password?
                </button>
              </p>
            </>
          ) : (
            <p className="text-[#687462]">
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-[#31583a] underline underline-offset-4"
                onClick={() => setMode("signin")}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      )}
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
    <main className="grid min-h-screen place-items-center bg-[#eef2ea] px-4 py-10 text-[#263126]">
      <section className="w-full max-w-[420px] rounded-[28px] border border-[#dce1d3] bg-white p-6 shadow-[0_18px_45px_rgba(39,54,37,0.08)] sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#dfe8d9] text-[#31583a]">
            {icon}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b8065]">{eyebrow}</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.055em]">{title}</h1>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}

function Field({
  id,
  label,
  icon,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b8065]">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
