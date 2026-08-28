import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, Mail, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

function getNextPath() {
  if (typeof window === "undefined") return "/messages";
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/messages";
  return value;
}

export default function LoginPage() {
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const nextPath = useMemo(getNextPath, []);
  const [name, setName] = useState(() => localStorage.getItem("savanna-local-name") ?? "Local User");
  const [email, setEmail] = useState(() => localStorage.getItem("savanna-local-email") ?? "local@savanna.dev");

  const localLogin = trpc.auth.localLogin.useMutation({
    onSuccess: async () => {
      localStorage.setItem("savanna-local-name", name.trim());
      localStorage.setItem("savanna-local-email", email.trim().toLowerCase());
      await utils.auth.me.invalidate();
      window.location.href = nextPath;
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!loading && isAuthenticated) {
      window.location.replace(nextPath);
    }
  }, [isAuthenticated, loading, nextPath]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    localLogin.mutate({ name, email });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2ea] px-4 py-10 text-[#263126]">
      <section className="w-full max-w-[420px] rounded-[28px] border border-[#dce1d3] bg-white p-6 shadow-[0_18px_45px_rgba(39,54,37,0.08)] sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#dfe8d9] text-[#31583a]">
            <UserRound className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b8065]">Local auth</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.055em]">Sign in to Savanna</h1>
          </div>
        </div>

        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="local-name">Name</Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6b8065]" />
              <Input
                id="local-name"
                value={name}
                onChange={event => setName(event.target.value)}
                className="pl-9"
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="local-email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6b8065]" />
              <Input
                id="local-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="pl-9"
                maxLength={320}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={localLogin.isPending || loading}
            className="h-11 w-full rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]"
          >
            {localLogin.isPending || loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-2 size-4" />
            )}
            Continue
          </Button>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-[#687462]">Development session for Savanna.</p>
      </section>
    </main>
  );
}
