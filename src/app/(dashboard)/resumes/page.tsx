import { listResumeDocuments } from "@/server/actions";
import { ResumesClient } from "./resumes-client";

export default async function ResumesPage() {
  const documents = await listResumeDocuments();
  return <ResumesClient initialDocuments={documents} />;
}
