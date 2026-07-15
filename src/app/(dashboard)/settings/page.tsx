import { getSavedBoards } from "@/server/actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const boards = await getSavedBoards();
  return <SettingsClient initialBoards={boards} />;
}
