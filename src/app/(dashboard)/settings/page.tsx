import { getSavedBoards, getCompanySourceCatalog } from "@/server/actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [boards, catalog] = await Promise.all([
    getSavedBoards(),
    getCompanySourceCatalog(),
  ]);
  return <SettingsClient initialBoards={boards} initialCatalog={catalog} />;
}
