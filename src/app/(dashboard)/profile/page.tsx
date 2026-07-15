import { getOrCreateProfile } from "@/server/actions";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const profile = await getOrCreateProfile();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Candidate Profile</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
