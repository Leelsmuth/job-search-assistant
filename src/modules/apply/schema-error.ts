export class AssistedApplySchemaError extends Error {
  constructor() {
    super(
      "Apply migration 0013_assisted_apply.sql in the Supabase SQL editor before using assisted apply."
    );
    this.name = "AssistedApplySchemaError";
  }
}

export function isAssistedApplySchemaError(error: unknown): boolean {
  if (error instanceof AssistedApplySchemaError) return true;
  return error instanceof Error && error.message.includes("0013_assisted_apply.sql");
}
