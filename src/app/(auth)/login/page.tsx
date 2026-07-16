import { Suspense } from "react";
import {
  isAppConfigured,
  getMissingEnvVars,
  getSupabaseConfigOrNull,
} from "@/lib/env";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const appConfigured = isAppConfigured();
  const missingVars = getMissingEnvVars();
  const supabaseConfig = getSupabaseConfigOrNull();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <LoginForm
        appConfigured={appConfigured}
        missingVars={missingVars}
        supabaseConfig={supabaseConfig}
      />
    </Suspense>
  );
}
