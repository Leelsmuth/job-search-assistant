import type { AtsProvider } from "../../../../../data/company-sources.schema";

export type DiscoveredCompanyCandidate = {
  companyName?: string;
  atsProvider: AtsProvider;
  boardSlug: string;
  boardUrl?: string;
  companyWebsite?: string;
  careersUrl?: string;
  headquartersCountry?: string;
  industries?: string[];
  discoverySource: string;
  discoveryNote?: string;
};

export interface CompanyDiscoverySource {
  name: string;
  discover(): Promise<DiscoveredCompanyCandidate[]>;
}
