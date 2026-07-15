"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appConfigured || !supabaseConfigured) {
      setMessage(
        `Missing environment variables: ${missingVars.join(", ")}. Add them in Vercel, then redeploy.`
      );
      return;
    }

    setLoading(true);
    setMessage("");
    const supabase = createClient();

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : "Check your email to confirm signup.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.href = "/jobs";
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!appConfigured}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={!appConfigured}
              />
            </div>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              disabled={loading || !appConfigured}
            >
              {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={!appConfigured}
            >
              {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
