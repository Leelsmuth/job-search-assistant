import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  companySourcesSeedSchema,
  type CompanyJobSource,
  type CompanySourcesSeed,
} from "../data/company-sources.schema";
import { normalizeBoardUrl } from "../src/modules/ingestion/board-url";
import { getAdapterForProvider } from "../src/modules/ingestion/adapters";
import { normalizeBoardJobs } from "../src/modules/ingestion/board-normalize";

const SEED_PATH = join(process.cwd(), "data/company-sources.seed.json");

type VerifyResult = {
  id: string;
  companyName: string;
  ok: boolean;
  jobCount?: number;
  error?: string;
};

async function verifyEntry(entry: CompanyJobSource): Promise<VerifyResult> {
  try {
    const parsed = normalizeBoardUrl(entry.boardUrl, entry.atsProvider);
    const adapter = getAdapterForProvider(parsed.provider);
    if (!adapter) {
      return { id: entry.id, companyName: entry.companyName, ok: false, error: "No adapter" };
    }
    const raw = await adapter.fetch(parsed.boardUrl);
    const jobs = normalizeBoardJobs(raw);
    if (jobs.length === 0) {
      return {
        id: entry.id,
        companyName: entry.companyName,
        ok: false,
        error: "Board returned 0 jobs",
      };
    }
    return {
      id: entry.id,
      companyName: entry.companyName,
      ok: true,
      jobCount: jobs.length,
    };
  } catch (error) {
    return {
      id: entry.id,
      companyName: entry.companyName,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const idFilter = args.find((a) => a.startsWith("--id="))?.slice(5);

  if (!existsSync(SEED_PATH)) {
    console.error(`Seed file not found: ${SEED_PATH}`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
  const seed = companySourcesSeedSchema.parse(raw);

  let targets = seed.companies.filter((c) => c.enabled);
  if (idFilter) {
    targets = targets.filter((c) => c.id === idFilter);
  }

  console.log(`Verifying ${targets.length} board(s)...\n`);

  const results: VerifyResult[] = [];
  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i];
    const result = await verifyEntry(entry);
    results.push(result);

    const status = result.ok ? `OK (${result.jobCount} jobs)` : `FAIL: ${result.error}`;
    console.log(`${result.ok ? "✓" : "✗"} ${entry.companyName.padEnd(28)} ${status}`);

    const idx = seed.companies.findIndex((c) => c.id === entry.id);
    if (idx >= 0 && write) {
      if (result.ok) {
        seed.companies[idx] = {
          ...seed.companies[idx],
          enabled: true,
          verifiedAt: new Date().toISOString(),
          lastJobCount: result.jobCount,
          lastVerifyError: undefined,
          boardUrl: normalizeBoardUrl(entry.boardUrl, entry.atsProvider).boardUrl,
        };
      } else {
        seed.companies[idx] = {
          ...seed.companies[idx],
          enabled: false,
          lastVerifyError: result.error,
        };
      }
    }

    if (i < targets.length - 1) await sleep(300);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);

  if (write) {
    const updated: CompanySourcesSeed = {
      ...seed,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(SEED_PATH, `${JSON.stringify(updated, null, 2)}\n`);
    console.log(`Updated ${SEED_PATH}`);
  } else if (failed.length > 0) {
    console.log("\nRun with --write to persist verification results.");
  }

  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
