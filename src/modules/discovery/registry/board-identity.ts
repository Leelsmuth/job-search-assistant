import type { AtsProvider } from "../../../../data/company-sources.schema";

export type BoardIdentity = {
  provider: AtsProvider;
  boardSlug: string;
};

export function boardIdentityKey(identity: BoardIdentity): string {
  return `${identity.provider}:${identity.boardSlug.toLowerCase()}`;
}

export function slugifyCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function makeRegistryId(provider: AtsProvider, boardSlug: string): string {
  const slug = boardSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (provider === "greenhouse") return slug;
  return `${provider}-${slug}`;
}

export function formatCompanyNameFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
