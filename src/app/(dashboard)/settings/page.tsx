import { getSavedBoardsWithHealth, getSearchPreferences } from "@/server/actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const boards = await getSavedBoardsWithHealth();
  const preferences = await getSearchPreferences();
  return <SettingsClient initialBoards={boards} preferences={preferences} />;
}
