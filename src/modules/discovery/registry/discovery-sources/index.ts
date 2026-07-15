import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { CompanyDiscoverySource, DiscoveredCompanyCandidate } from "./types";
import type { AtsProvider } from "../../../../../data/company-sources.schema";
import { boardUrlForProvider } from "../board-url";

type SlugListFile = {
  provider: AtsProvider;
  source: string;
  slugs: string[];
};

function readSlugList(path: string, provider: AtsProvider, source: string): DiscoveredCompanyCandidate[] {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const slugs: string[] = Array.isArray(raw) ? raw : raw.slugs ?? [];
  return slugs.map((slug) => ({
    atsProvider: provider,
    boardSlug: slug.trim(),
    boardUrl: boardUrlForProvider(provider, slug.trim()),
    discoverySource: source,
  }));
}

export class CommonCrawlSlugDiscoverySource implements CompanyDiscoverySource {
  name = "common-crawl-slugs";

  async discover(): Promise<DiscoveredCompanyCandidate[]> {
    const dir = join(process.cwd(), "data/discovery/sources");
    const candidates: DiscoveredCompanyCandidate[] = [];

    const files: SlugListFile[] = [
      {
        provider: "greenhouse",
        source: "feashliaa-common-crawl-greenhouse",
        slugs: [],
      },
      {
        provider: "ashby",
        source: "feashliaa-common-crawl-ashby",
        slugs: [],
      },
      {
        provider: "lever",
        source: "feashliaa-common-crawl-lever",
        slugs: [],
      },
    ];

    for (const file of files) {
      const path = join(dir, `${file.provider}_slugs.json`);
      candidates.push(...readSlugList(path, file.provider, file.source));
    }

    return candidates;
  }
}

export class AtsUrlImportDiscoverySource implements CompanyDiscoverySource {
  name = "ats-url-import";

  async discover(): Promise<DiscoveredCompanyCandidate[]> {
    const dir = join(process.cwd(), "data/discovery/imports");
    if (!existsSync(dir)) return [];

    const candidates: DiscoveredCompanyCandidate[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const raw = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      const items = Array.isArray(raw) ? raw : raw.candidates ?? [];
      for (const item of items) {
        if (!item.boardUrl && !item.boardSlug) continue;
        candidates.push({
          companyName: item.companyName,
          atsProvider: item.atsProvider,
          boardSlug: item.boardSlug,
          boardUrl: item.boardUrl,
          companyWebsite: item.companyWebsite,
          careersUrl: item.careersUrl,
          headquartersCountry: item.headquartersCountry,
          industries: item.industries,
          discoverySource: item.discoverySource ?? `import:${file}`,
          discoveryNote: item.discoveryNote,
        });
      }
    }
    return candidates;
  }
}

export class SeedFileDiscoverySource implements CompanyDiscoverySource {
  name = "existing-seed";

  async discover(): Promise<DiscoveredCompanyCandidate[]> {
    const path = join(process.cwd(), "data/company-sources.seed.json");
    if (!existsSync(path)) return [];
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const companies = raw.companies ?? [];
    return companies.map((c: Record<string, unknown>) => ({
      companyName: c.companyName as string,
      atsProvider: c.atsProvider as AtsProvider,
      boardSlug: c.boardSlug as string,
      boardUrl: c.boardUrl as string,
      companyWebsite: c.companyWebsite as string | undefined,
      careersUrl: c.careersUrl as string | undefined,
      headquartersCountry: (c.headquartersCountry ?? c.country) as string | undefined,
      industries: (c.industries ?? c.tags) as string[] | undefined,
      discoverySource: "existing-seed",
    }));
  }
}
