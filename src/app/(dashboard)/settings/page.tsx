import { getSavedBoardsWithHealth, getSearchPreferences } from "@/server/actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [boards, preferences] = await Promise.all([
    getSavedBoardsWithHealth(),
    getSearchPreferences(),
  ]);
  return <SettingsClient initialBoards={boards} preferences={preferences} />;
}
