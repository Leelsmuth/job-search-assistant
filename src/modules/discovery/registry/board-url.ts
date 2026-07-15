import type { AtsProvider } from "../../../../data/company-sources.schema";

export function boardUrlForProvider(provider: AtsProvider, boardSlug: string): string {
  const slug = boardSlug.trim();
  switch (provider) {
    case "greenhouse":
      return `https://boards.greenhouse.io/${slug}`;
    case "lever":
      return `https://jobs.lever.co/${slug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}`;
  }
}
