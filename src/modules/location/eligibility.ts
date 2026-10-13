export const LOCATION_CLASSES = [
  "remote_canada",
  "remote_other",
  "hybrid_gta",
  "onsite_gta",
  "out_of_area",
] as const;

export type LocationClass = (typeof LOCATION_CLASSES)[number];

export type LocationFlag =
  | "us_only"
  | "us_work_authorization"
  | "visa_sponsorship_ambiguous"
  | "eligibility_ambiguous"
  | "region_restricted";

export type LocationEligibility = {
  class: LocationClass;
  flags: LocationFlag[];
  label: string;
  reason: string;
};

export const LOCATION_CLASS_LABELS: Record<LocationClass, string> = {
  remote_canada: "Remote-Canada",
  remote_other: "Remote-other/US-only",
  hybrid_gta: "Hybrid-GTA",
  onsite_gta: "Onsite-GTA",
  out_of_area: "Out-of-area",
};

/** Toronto and the rest of the Greater Toronto Area. Bare "York" is omitted so New York does not match. */
export const DEFAULT_GTA_CITIES = [
  "Toronto",
  "Mississauga",
  "Brampton",
  "Markham",
  "Vaughan",
  "Richmond Hill",
  "Oakville",
  "Burlington",
  "Pickering",
  "Ajax",
  "Whitby",
  "Oshawa",
  "Milton",
  "North York",
  "Scarborough",
  "Etobicoke",
  "East York",
  "Greater Toronto Area",
  "Greater Toronto",
  "GTA",
] as const;

export const LOCATION_FEED_RANK: Record<LocationClass, number> = {
  remote_canada: 0,
  hybrid_gta: 1,
  onsite_gta: 2,
  remote_other: 3,
  out_of_area: 4,
};

const US_OR_CANADA =
  /\b(?:us|u\.s\.|usa|united states)\s*(?:or|and|\/)\s*canada\b|\bcanada\s*(?:or|and|\/)\s*(?:the\s+)?(?:us|u\.s\.|usa|united states)\b/i;

const CANADA_ELIGIBLE = [
  /\bcanada\b/i,
  /\bcanadian\b/i,
  /\bworldwide\b/i,
  /\banywhere in the world\b/i,
  /\bwork from anywhere\b/i,
  /\bglobally remote\b/i,
  /\bglobal remote\b/i,
  /\bremote worldwide\b/i,
  /\ball countries\b/i,
];

const US_ONLY = [
  /\b(?:us|u\.s\.|usa|united states)[\s-]*only\b/i,
  /\bonly[\s-]+(?:in[\s-]+)?(?:the[\s-]+)?(?:us|u\.s\.|usa|united states)\b/i,
  /\bremote[\s\-–—]+(?:us|usa|united states)\b/i,
  /\b(?:us|u\.s\.|usa|united states)[\s\-–—]+remote\b/i,
  /\bmust be (?:located |based |residing )?(?:in|within) the (?:us|u\.s\.|united states)\b/i,
  /\b(?:us|u\.s\.) residents only\b/i,
];

const US_AUTH = [
  /\bauthorized to work in the (?:us|u\.s\.|united states|usa)\b/i,
  /\beligible to work in the (?:us|u\.s\.|united states|usa)\b/i,
  /\bus work authorization\b/i,
  /\brequires? (?:a )?us (?:work )?authorization\b/i,
  /\bmust be (?:legally )?authorized to work in the (?:united states|u\.s\.|us)\b/i,
];

const VISA = [
  /\bvisa sponsorship\b/i,
  /\bh-1b\b/i,
  /\bh1b\b/i,
  /\bwill sponsor\b/i,
  /\bsponsorship (?:is )?available\b/i,
];

const REGION_LOCKED = [
  /\b(?:uk|united kingdom|europe|eu|emea|apac|latam|australia|germany|france)[\s-]*only\b/i,
  /\bonly[\s-]+(?:in[\s-]+)?(?:the[\s-]+)?(?:uk|united kingdom|europe|eu)\b/i,
];

export type LocationEligibilityInput = {
  location?: string | null;
  workplaceType?: string | null;
  description?: string | null;
};

export type LocationEligibilityOptions = {
  gtaCities?: readonly string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesGtaCity(text: string, cities: readonly string[] = DEFAULT_GTA_CITIES): boolean {
  return cities.some((city) => {
    const trimmed = city.trim();
    if (trimmed.length < 3) return false;
    return new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i").test(text);
  });
}

function locationHaystack(location: string, description: string): string {
  if (description.length <= 2500) return `${location}\n${description}`;
  return `${location}\n${description.slice(0, 1600)}\n${description.slice(-900)}`;
}

function arrangement(input: LocationEligibilityInput): "remote" | "hybrid" | "onsite" {
  const workplace = (input.workplaceType ?? "").toLowerCase();
  const location = input.location ?? "";
  const description = input.description ?? "";

  if (
    workplace === "remote" ||
    /\bremote\b/i.test(location) ||
    /\bwork from anywhere\b/i.test(location) ||
    /\bworldwide\b/i.test(location)
  ) {
    return "remote";
  }
  if (workplace === "hybrid" || /\bhybrid\b/i.test(location)) return "hybrid";
  if (
    workplace === "on_site" ||
    workplace === "onsite" ||
    /\bon-?site\b/i.test(location) ||
    /\bin[- ]office\b/i.test(location)
  ) {
    return "onsite";
  }

  if (/\bhybrid\b/i.test(description) && !/\bremote\b/i.test(description)) return "hybrid";
  if (
    /\bremote\b/i.test(description) ||
    /\bwork from anywhere\b/i.test(description) ||
    /\bwork from home\b/i.test(description)
  ) {
    return "remote";
  }
  return "onsite";
}

function result(
  locationClass: LocationClass,
  flags: LocationFlag[],
  reason: string
): LocationEligibility {
  return {
    class: locationClass,
    flags,
    label: LOCATION_CLASS_LABELS[locationClass],
    reason,
  };
}

export function classifyLocationEligibility(
  input: LocationEligibilityInput,
  options?: LocationEligibilityOptions
): LocationEligibility {
  const location = input.location ?? "";
  const description = input.description ?? "";
  const text = locationHaystack(location, description);
  const mode = arrangement(input);
  const cities = options?.gtaCities?.length ? options.gtaCities : DEFAULT_GTA_CITIES;
  const usOrCanada = US_OR_CANADA.test(text);
  const canadaEligible = usOrCanada || CANADA_ELIGIBLE.some((pattern) => pattern.test(text));
  const usOnly = US_ONLY.some((pattern) => pattern.test(text)) && !usOrCanada;
  const usAuth = US_AUTH.some((pattern) => pattern.test(text)) && !canadaEligible;
  const regionLocked = REGION_LOCKED.some((pattern) => pattern.test(text)) && !canadaEligible;
  const visa = VISA.some((pattern) => pattern.test(text));
  const inGta = matchesGtaCity(text, cities);

  if (mode === "remote") {
    if (usOnly) {
      return result(
        "remote_other",
        ["us_only"],
        "Remote role is limited to the United States"
      );
    }
    if (usAuth) {
      return result(
        "remote_other",
        ["us_work_authorization"],
        "Remote role requires US work authorization"
      );
    }
    if (regionLocked) {
      return result(
        "remote_other",
        ["region_restricted"],
        "Remote role is limited to a region outside Canada"
      );
    }
    if (canadaEligible) {
      const flags: LocationFlag[] = visa ? ["visa_sponsorship_ambiguous"] : [];
      return result(
        "remote_canada",
        flags,
        visa
          ? "Remote role is open to Canada; visa-sponsorship language is ambiguous"
          : "Remote role is open to Canada"
      );
    }
    if (visa) {
      return result(
        "remote_other",
        ["visa_sponsorship_ambiguous"],
        "Remote role mentions visa sponsorship without saying Canada is eligible"
      );
    }
    return result(
      "remote_other",
      ["eligibility_ambiguous"],
      "Remote role does not say it is open to Canada"
    );
  }

  if (mode === "hybrid") {
    if (inGta) {
      return result("hybrid_gta", [], "Hybrid role is in the GTA");
    }
    return result("out_of_area", [], "Hybrid role is outside the GTA");
  }

  if (inGta) {
    return result("onsite_gta", [], "On-site role is in the GTA");
  }
  return result("out_of_area", [], "On-site role is outside the GTA");
}

export function isLocationClass(value: string | null | undefined): value is LocationClass {
  return LOCATION_CLASSES.includes(value as LocationClass);
}

export type LocationVisibility = {
  includeHybridGta: boolean;
  includeOnsiteGta: boolean;
  showRemoteOther: boolean;
  showOutOfArea: boolean;
};

export function isLocationVisible(locationClass: LocationClass, visibility: LocationVisibility): boolean {
  switch (locationClass) {
    case "remote_canada":
      return true;
    case "hybrid_gta":
      return visibility.includeHybridGta;
    case "onsite_gta":
      return visibility.includeOnsiteGta;
    case "remote_other":
      return visibility.showRemoteOther;
    case "out_of_area":
      return visibility.showOutOfArea;
  }
}
