"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type AuthPhase = "idle" | "submitting" | "redirecting";

export function LoginForm({
  appConfigured,
  missingVars,
}: {
  appConfigured: boolean;
  missingVars: string[];
}) {
  const searchParams = useSearchParams();
  const missingEnv = searchParams.get("error") === "missing_env";
  const supabaseConfigured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<AuthPhase>("idle");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const busy = phase !== "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appConfigured || !supabaseConfigured) {
      setIsError(true);
      setMessage(
        `Missing environment variables: ${missingVars.join(", ")}. Add them in Vercel, then redeploy.`
      );
      return;
    }

    setPhase("submitting");
    setMessage("");
    setIsError(false);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setIsError(true);
          setMessage(error.message);
          setPhase("idle");
          return;
        }
        setMessage("Check your email to confirm signup.");
        setPhase("idle");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setIsError(true);
        setMessage(error.message);
        setPhase("idle");
        return;
      }

      setPhase("redirecting");
      window.location.assign("/jobs");
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setPhase("idle");
    }
  }

  const statusMessage =
    phase === "redirecting"
      ? "Signed in — opening your jobs…"
      : phase === "submitting"
        ? isSignUp
          ? "Creating your account…"
          : "Signing in…"
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Job Search Assistant</CardTitle>
          <p className="text-sm text-muted-foreground">
            Private-first matching and application tracking
          </p>
        </CardHeader>
        <CardContent>
          {(missingEnv || !appConfigured) && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Deployment configuration required</p>
              <p className="mt-1">
                Set these in Vercel → Project Settings → Environment Variables, then redeploy:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code>
                </li>
                <li>
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
                </li>
                <li>
                  <code className="rounded bg-amber-100 px-1">DATABASE_URL</code> (Supabase Session
                  pooler, port 6543)
                </li>
              </ul>
              {missingVars.length > 0 && (
                <p className="mt-2 text-xs">Currently missing: {missingVars.join(", ")}</p>
              )}
            </div>
          )}

          {statusMessage ? (
            <div
              className="mb-4 flex items-center gap-3 rounded-md border border-border bg-muted/60 p-4 text-sm font-medium"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Spinner className="h-5 w-5 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={busy}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!appConfigured || busy}
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={!appConfigured || busy}
                className="min-h-11"
              />
            </div>

            {message && !statusMessage ? (
              <p
                className={`text-sm ${isError ? "font-medium text-destructive" : "text-muted-foreground"}`}
                role={isError ? "alert" : "status"}
              >
                {message}
              </p>
            ) : null}

            <Button
              type="submit"
              className="min-h-11 w-full"
              loading={busy}
              disabled={busy || !appConfigured}
            >
              {phase === "redirecting"
                ? "Opening jobs…"
                : phase === "submitting"
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Sign Up"
                    : "Sign In"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setMessage("");
                setIsError(false);
              }}
              disabled={!appConfigured || busy}
            >
              {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
