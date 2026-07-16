import { getSavedBoardsWithHealth } from "@/server/actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const boards = await getSavedBoardsWithHealth();
  return <SettingsClient initialBoards={boards} />;
}
