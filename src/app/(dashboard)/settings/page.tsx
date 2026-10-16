import { getCandidateSkillNames, getSavedBoardsWithHealth, getSearchPreferences } from "@/server/actions";
import { getApplicationProfile } from "@/server/actions/apply-actions";
import { getDigestSettings } from "@/server/actions/digest-actions";
import { getAlertSettings } from "@/server/actions/alert-actions";
import { getExtensionSettings } from "@/server/actions/extension-actions";
import { checkOpenAiHealth } from "@/modules/ai/openai-health";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  // Each call opens its own withUserDb transaction. Keep them sequential so
  // they do not compete for the shared postgres.js pool.
  const boards = await getSavedBoardsWithHealth();
  const preferences = await getSearchPreferences();
  const skills = await getCandidateSkillNames();
  const applicationProfile = await getApplicationProfile();
  const digest = await getDigestSettings();
  const alerts = await getAlertSettings();
  const extension = await getExtensionSettings();
  const openAi = await checkOpenAiHealth();
  return (
    <SettingsClient
      openAi={openAi}
      extensionTokens={extension.tokens}
      extensionSchemaReady={extension.schemaReady}
      initialBoards={boards}
      preferences={preferences}
      skills={skills}
      applicationProfile={applicationProfile.profile}
      applicationProfileReady={applicationProfile.schemaReady}
      digestEmailsEnabled={digest.emailsEnabled}
      digestSchemaReady={digest.schemaReady}
      digestLastSentAt={digest.lastSentAt}
      alertsEnabled={alerts.enabled}
      alertsDailyCap={alerts.dailyCap}
      alertsSchemaReady={alerts.schemaReady}
    />
  );
}
