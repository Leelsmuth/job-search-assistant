import { createClient } from "@/lib/supabase/server";

const BUCKET = "resumes";

export async function uploadResumeFile(
  userId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const supabase = await createClient();
  const path = `${userId}/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    if (error.message.toLowerCase().includes("bucket not found")) {
      throw new Error(
        "Resume storage is not configured. In Supabase SQL Editor, run drizzle/migrations/0003_storage_resumes_bucket.sql (see README.md)."
      );
    }
    throw new Error(`Failed to upload resume: ${error.message}`);
  }

  return path;
}

export async function deleteResumeFile(storagePath: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(`Failed to delete resume file: ${error.message}`);
  }
}

export async function getResumeSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error) return null;
  return data.signedUrl;
}
