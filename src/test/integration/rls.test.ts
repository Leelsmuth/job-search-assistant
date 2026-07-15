import { describe, it } from "vitest";

describe.skip("RLS integration (requires Supabase with policies applied)", () => {
  it("withUserDb sets JWT claims so auth.uid() matches the session user", () => {
    // Run manually against a configured DATABASE_URL after applying 0002_rls_policies.sql
  });
});
