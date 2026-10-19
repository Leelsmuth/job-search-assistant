import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CURATED_CANADA_BOARDS } from "@/modules/discovery/curated-boards";
import { buildDiscoveryTargets } from "@/modules/discovery/discovery-batch";
import { DISCOVERY_FEEDS } from "@/modules/discovery/source-catalog";
import {
  defaultDiscoverySourceEnabled,
  incomingSourceWins,
  normalizeEnabledDiscoverySources,
} from "@/modules/discovery/source-catalog";
import { parseJobBankTable, pickJobBankCsv } from "@/modules/discovery/feeds/jobbank";
import {
  selectAdzunaJobs,
  selectHimalayasJobs,
  selectRemoteOkJobs,
  selectRemotiveJobs,
  selectWwrJobs,
  parseWwrRss,
} from "@/modules/discovery/feeds/aggregators";
import type { AdzunaJob, HimalayasJob, RemotiveJob } from "@/modules/discovery/feeds/aggregators";
import { normalizeBoardUrl } from "@/modules/ingestion/board-url";
import { normalizeBambooDetail, type BambooDetail } from "@/modules/ingestion/bamboohr";
import { canonicalApplyUrl, jobDedupeKey, normalizeLocationKey } from "@/modules/ingestion/job-dedupe";
import { parsePersonioXml, normalizePersonioPosition } from "@/modules/ingestion/personio";
import { normalizeRecruiteeOffer, type RecruiteeOffer } from "@/modules/ingestion/recruitee";
import { normalizeRipplingJob, ripplingLocationEligible, type RipplingDetail } from "@/modules/ingestion/rippling";
import { normalizeSmartRecruitersJob, type SmartRecruitersDetail } from "@/modules/ingestion/smartrecruiters";
import { normalizeTeamtailorItem, parseTeamtailorRss } from "@/modules/ingestion/teamtailor";
import { normalizeWorkableJob, type WorkableWidgetJob } from "@/modules/ingestion/workable";

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "src/test/fixtures/discovery", name), "utf8");
}

describe("discovery source fixtures", () => {
  it("normalizes a SmartRecruiters posting", () => {
    const detail = JSON.parse(fixture("smartrecruiters-posting.json")) as SmartRecruitersDetail;
    const job = normalizeSmartRecruitersJob(detail, "Bosch");
    expect(job.company).toBe("Bosch Group");
    expect(job.title).toBe("Senior Frontend Engineer");
    expect(job.workplaceType).toBe("hybrid");
    expect(job.jobUrl).toContain("smartrecruiters.com");
    expect(job.description).toContain("React");
  });

  it("normalizes a Workable job", () => {
    const raw = JSON.parse(fixture("workable-job.json")) as WorkableWidgetJob;
    const job = normalizeWorkableJob(raw, "Citylitics");
    expect(job.company).toBe("Citylitics");
    expect(job.location).toContain("Toronto");
    expect(job.sourceJobId).toBe("CITY01");
  });

  it("normalizes a Recruitee offer", () => {
    const raw = JSON.parse(fixture("recruitee-offer.json")) as RecruiteeOffer;
    const job = normalizeRecruiteeOffer(raw, "Example");
    expect(job.workplaceType).toBe("remote");
    expect(job.jobUrl).toContain("recruitee.com");
  });

  it("normalizes a BambooHR detail", () => {
    const raw = JSON.parse(fixture("bamboohr-detail.json")) as BambooDetail;
    const job = normalizeBambooDetail(raw, "d1g1t", "12");
    expect(job.company).toBe("d1g1t");
    expect(job.salaryMin).toBe(140000);
    expect(job.salaryMax).toBe(180000);
    expect(job.location).toContain("Toronto");
  });

  it("normalizes a Teamtailor RSS item", () => {
    const parsed = parseTeamtailorRss(fixture("teamtailor.rss"));
    expect(parsed.companyName).toBe("Teamtailor");
    const job = normalizeTeamtailorItem(parsed.items[0], parsed.companyName);
    expect(job.title).toBe("Frontend Engineer");
    expect(job.workplaceType).toBe("hybrid");
    expect(job.location).toContain("Toronto");
    expect(job.description).toContain("React");
  });

  it("normalizes a Personio XML position", () => {
    const positions = parsePersonioXml(fixture("personio.xml"));
    const job = normalizePersonioPosition(positions[0], "example.jobs.personio.de", "Example");
    expect(job.company).toBe("Example GmbH");
    expect(job.title).toBe("Frontend Engineer");
    expect(job.jobUrl).toBe("https://example.jobs.personio.de/job/9001?language=en");
    expect(job.description).toContain("web app");
  });

  it("normalizes a Rippling job and skips US-only remote before detail fetches", () => {
    const detail = JSON.parse(fixture("rippling-job.json")) as RipplingDetail;
    const job = normalizeRipplingJob(detail, "Rippling");
    expect(job.location).toContain("Toronto");
    expect(job.jobUrl).toContain("ats.rippling.com");
    expect(ripplingLocationEligible("Remote (United States)")).toBe(false);
    expect(ripplingLocationEligible("Toronto, Ontario, Canada")).toBe(true);
    expect(ripplingLocationEligible("Remote")).toBe(true);
  });

  it("keeps software rows from the Job Bank open-data extract", () => {
    const jobs = parseJobBankTable(fixture("jobbank.tsv"));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Frontend Developer");
    expect(jobs[0]?.company).toBe("Job Bank employer");
    expect(jobs[0]?.workplaceType).toBe("remote");
    expect(jobs[0]?.salaryMin).toBe(140000);
    expect(jobs[0]?.description).toContain("Open Government Licence");
    expect(jobDedupeKey({
      company: jobs[0].company,
      title: jobs[0].title,
      location: jobs[0].location,
      provider: "jobbank",
      sourceJobId: jobs[0].sourceJobId,
    })).toBe("jobbank:15839611");
  });

  it("picks the newest English Job Bank CSV", () => {
    const url = pickJobBankCsv([
      {
        format: "CSV",
        url: "https://open.canada.ca/data/en/job-bank-fr.csv",
        name: "French",
        last_modified: "2026-10-01",
      },
      {
        format: "CSV",
        url: "https://open.canada.ca/data/en/job-bank-en-aug.csv",
        name: "English August",
        last_modified: "2026-08-01",
      },
      {
        format: "CSV",
        url: "https://open.canada.ca/data/en/job-bank-en-sept.csv",
        name: "English September",
        last_modified: "2026-09-01",
      },
    ]);
    expect(url).toBe("https://open.canada.ca/data/en/job-bank-en-sept.csv");
  });

  it("keeps Canada-eligible aggregator jobs and names the publisher", () => {
    const remotive = selectRemotiveJobs(JSON.parse(fixture("remotive-jobs.json")) as RemotiveJob[]);
    expect(remotive.map((job) => job.company)).toEqual(["Northwind"]);
    expect(remotive[0]?.description).toContain("remotive.com");

    const wwr = selectWwrJobs(parseWwrRss(fixture("weworkremotely.rss")));
    expect(wwr.map((job) => job.company)).toEqual(["Northwind"]);
    expect(wwr[0]?.jobUrl).toContain("weworkremotely.com");
    expect(wwr[0]?.description).toContain("We Work Remotely");

    const himalayas = selectHimalayasJobs(JSON.parse(fixture("himalayas-jobs.json")) as HimalayasJob[]);
    expect(himalayas).toHaveLength(1);
    expect(himalayas[0]?.jobUrl).toContain("himalayas.app");
    expect(himalayas[0]?.salaryCurrency).toBe("CAD");

    const epoch = 1_760_000_000;
    const dated = selectHimalayasJobs([
      {
        title: "Frontend Engineer",
        companyName: "Northwind",
        description: "Remote, Canada.",
        applicationLink: "https://himalayas.app/companies/northwind/jobs/frontend-engineer",
        guid: "him-epoch",
        locationRestrictions: ["Canada"],
        pubDate: epoch,
      },
    ]);
    expect(dated).toHaveLength(1);
    expect(dated[0]?.datePosted).toBe(new Date(epoch * 1000).toISOString());

    const remoteOk = selectRemoteOkJobs(JSON.parse(fixture("remoteok-jobs.json")) as unknown[]);
    expect(remoteOk).toHaveLength(1);
    expect(remoteOk[0]?.jobUrl).toBe("https://remoteok.com/remote-jobs/77");
    expect(remoteOk[0]?.description).toContain("Remote OK");

    const adzuna = selectAdzunaJobs(JSON.parse(fixture("adzuna-jobs.json")) as AdzunaJob[]);
    expect(adzuna).toHaveLength(2);
    expect(adzuna[0]?.salaryMin).toBe(140000);
    expect(adzuna[1]?.salaryMin).toBeUndefined();
    expect(adzuna[0]?.description).toContain("adzuna.ca");
  });
});

describe("cross-source dedupe and board links", () => {
  it("collapses the same company, title, and remote location, and strips tracking", () => {
    expect(normalizeLocationKey("Remote, Canada")).toBe("remote");
    expect(normalizeLocationKey("Remote, Worldwide")).toBe("remote");
    expect(normalizeLocationKey("Toronto, ON")).toBe("toronto");
    expect(normalizeLocationKey("Remote (United States)")).not.toBe("remote");

    const left = jobDedupeKey({
      company: "Northwind Inc.",
      title: "Senior Frontend Engineer (Remote)",
      location: "Remote, Canada",
    });
    const right = jobDedupeKey({
      company: "Northwind",
      title: "Senior Frontend Engineer",
      location: "Remote - Canada",
    });
    expect(left).toBe(right);

    expect(
      canonicalApplyUrl("https://www.example.com/jobs/1/?utm_source=feed&gh_src=abc")
    ).toBe("https://example.com/jobs/1");
    expect(incomingSourceWins("remotive", "greenhouse")).toBe(true);
    expect(incomingSourceWins("greenhouse", "remotive")).toBe(false);
    expect(incomingSourceWins(undefined, "greenhouse")).toBe(false);
  });

  it("accepts careers boards and rejects single postings", () => {
    expect(normalizeBoardUrl("https://jobs.smartrecruiters.com/BoschGroup").boardSlug).toBe("BoschGroup");
    expect(normalizeBoardUrl("https://apply.workable.com/citylitics/").boardUrl).toBe(
      "https://apply.workable.com/citylitics"
    );
    expect(normalizeBoardUrl("https://example.recruitee.com").provider).toBe("recruitee");
    expect(normalizeBoardUrl("https://d1g1t.bamboohr.com/careers/list").boardUrl).toBe(
      "https://d1g1t.bamboohr.com/careers"
    );
    expect(normalizeBoardUrl("https://career.teamtailor.com/jobs").provider).toBe("teamtailor");
    expect(normalizeBoardUrl("https://example.jobs.personio.de").boardSlug).toBe("example.de");
    expect(normalizeBoardUrl("https://ats.rippling.com/rippling/jobs").boardUrl).toBe(
      "https://ats.rippling.com/rippling/jobs"
    );

    expect(() => normalizeBoardUrl("https://apply.workable.com/citylitics/j/ABC")).toThrow(/single job/i);
    expect(() => normalizeBoardUrl("https://jobs.smartrecruiters.com/BoschGroup/123-role")).toThrow(/single job/i);
    expect(() => normalizeBoardUrl("https://d1g1t.bamboohr.com/careers/12")).toThrow(/single job/i);
    expect(() => normalizeBoardUrl("https://career.teamtailor.com/jobs/123-role")).toThrow(/single job/i);
    expect(() => normalizeBoardUrl("https://example.jobs.personio.de/job/1")).toThrow(/single job/i);
    expect(() =>
      normalizeBoardUrl("https://ats.rippling.com/rippling/jobs/11111111-1111-4111-8111-111111111111")
    ).toThrow(/single job/i);
  });

  it("adds the verified boards and lets Settings turn a provider off", () => {
    for (const board of CURATED_CANADA_BOARDS) {
      expect(normalizeBoardUrl(board.boardUrl, board.provider).provider).toBe(board.provider);
    }
    expect(CURATED_CANADA_BOARDS.some((board) => board.provider === "smartrecruiters")).toBe(true);
    expect(CURATED_CANADA_BOARDS.some((board) => board.companyName === "d1g1t")).toBe(true);

    const defaults = normalizeEnabledDiscoverySources({});
    expect(defaults.adzuna).toBe(false);
    expect(defaults.jobbank).toBe(true);
    expect(defaultDiscoverySourceEnabled("greenhouse")).toBe(true);

    const { curatedTargets } = buildDiscoveryTargets({
      curatedBoards: CURATED_CANADA_BOARDS.filter((board) => board.provider === "workable").slice(0, 1),
      savedBoards: [],
      users: [
        {
          userId: "user-1",
          includeCurated: true,
          excludedCuratedBoardUrls: [],
          enabledDiscoverySources: { workable: false, jobbank: true },
        },
      ],
      feeds: DISCOVERY_FEEDS.filter((feed) => feed.id === "jobbank"),
    });
    expect(curatedTargets.map((target) => target.key)).toEqual(["feed:jobbank"]);
  });
});

describe("discovery sources migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0021_discovery_sources.sql"),
    "utf8"
  );

  it("adds providers, dedupe columns, and restates RLS", () => {
    for (const provider of [
      "smartrecruiters",
      "workable",
      "recruitee",
      "bamboohr",
      "teamtailor",
      "personio",
      "rippling",
      "jobbank",
      "remotive",
      "weworkremotely",
      "himalayas",
      "remoteok",
      "adzuna",
    ]) {
      expect(migration).toContain(`'${provider}'`);
    }
    expect(migration).toContain("enabled_discovery_sources");
    expect(migration).toContain('"adzuna": false');
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS dedupe_key text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS canonical_apply_url text");
    expect(migration).toContain("idx_jobs_user_dedupe_key");
    expect(migration).toContain("idx_jobs_user_canonical_apply_url");
    expect(migration).toContain("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE search_preferences FROM anon");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jobs TO authenticated");
    expect(migration).toContain('POLICY "Users own their jobs"');
    expect(migration).toContain('POLICY "Users own their search preferences"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
    expect(migration).toContain("before merge");
  });
});
