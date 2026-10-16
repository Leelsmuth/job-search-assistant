import { getCandidateSkillNames, getOrCreateProfile, getSearchPreferences } from "@/server/actions";
import { categoryForCanonicalSkill } from "@/modules/candidate/skill-dictionary";
import { resolveSharedTargets } from "@/modules/matching/shared-targets";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const profile = await getOrCreateProfile();
  const preferences = await getSearchPreferences();
  const skillNames = await getCandidateSkillNames();
  const targets = resolveSharedTargets({
    profileTitles: profile.targetTitles,
    preferenceTitles: preferences.targetTitles,
    profileSalary: profile.minimumSalary,
    preferenceSalary: preferences.minimumSalaryCad,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Candidate Profile</h1>
      <ProfileForm
        profile={{
          ...profile,
          targetTitles: targets.targetTitles,
          minimumSalary: targets.minimumSalaryCad,
          skills: skillNames.map((name) => ({
            name,
            category: categoryForCanonicalSkill(name),
          })),
        }}
      />
    </div>
  );
}
