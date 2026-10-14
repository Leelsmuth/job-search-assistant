import { getSavedBoardsWithHealth, getSearchPreferences } from "@/server/actions";
import { getApplicationProfile } from "@/server/actions/apply-actions";
import { getDigestSettings } from "@/server/actions/digest-actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  // Each call opens its own withUserDb transaction. Keep them sequential so
  // they do not compete for the shared postgres.js pool.
  const boards = await getSavedBoardsWithHealth();
  const preferences = await getSearchPreferences();
  const applicationProfile = await getApplicationProfile();
  const digest = await getDigestSettings();
  return (
    <SettingsClient
      initialBoards={boards}
      preferences={preferences}
      applicationProfile={applicationProfile.profile}
      applicationProfileReady={applicationProfile.schemaReady}
      digestEmailsEnabled={digest.emailsEnabled}
      digestSchemaReady={digest.schemaReady}
      digestLastSentAt={digest.lastSentAt}
    />
  );
}
