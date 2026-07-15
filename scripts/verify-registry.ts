#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  companySourcesSeedSchema,
  type CompanyJobSource,
  type AtsProvider,
} from "../data/company-sources.schema";
import { verifyBoard, isActiveVerifiedStatus } from "../src/modules/discovery/registry/verification";

const SEED_PATH = join(process.cwd(), "data/company-sources.seed.json");

const PROVIDER_CONCURRENCY: Record<AtsProvider, number> = {
  greenhouse: 20,
  lever: 15,
  ashby: 5,
};

const PROVIDER_DELAY_MS: Record<AtsProvider, number> = {
  greenhouse: 150,
  lever: 200,
  ashby: 400,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (prefix: string) => {
    const match = args.find((a) => a.startsWith(`${prefix}=`));
    return match?.slice(prefix.length + 1);
  };
  return {
    write: args.includes("--write"),
    provider: getArg("--provider") as AtsProvider | undefined,
    limit: Number(getArg("--limit") ?? "0") || undefined,
    target: Number(getArg("--target") ?? "0") || undefined,
    reverify: args.includes("--reverify"),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runWorker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

function countVerified(companies: CompanyJobSource[], forProvider?: AtsProvider): number {
  return companies.filter(
    (c) =>
      isActiveVerifiedStatus(c.verificationStatus) &&
      (!forProvider || c.atsProvider === forProvider)
  ).length;
}

const VERIFIED_CATALOG_PATH = join(process.cwd(), "data/company-sources.verified.json");

function exportVerifiedCatalog(seed: ReturnType<typeof companySourcesSeedSchema.parse>) {
  const verified = seed.companies.filter((c) => c.enabled && c.verificationStatus === "verified");
  const catalog = {
    version: seed.version,
    updatedAt: new Date().toISOString(),
    companies: verified.sort((a, b) => a.companyName.localeCompare(b.companyName)),
  };
  writeFileSync(VERIFIED_CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Exported ${verified.length} verified entries to ${VERIFIED_CATALOG_PATH}`);
}

async function main() {
  const { write, provider, limit, target, reverify } = parseArgs();

  if (!existsSync(SEED_PATH)) {
    console.error(`Seed not found: ${SEED_PATH}`);
    process.exit(1);
  }

  const seed = companySourcesSeedSchema.parse(JSON.parse(readFileSync(SEED_PATH, "utf-8")));
  const verifiedCount = countVerified(seed.companies, provider);
  const scope = provider ? `${provider} ` : "";
  console.log(`Current ${scope}verified: ${verifiedCount}`);
  if (target && verifiedCount >= target) {
    console.log(`Already at ${scope}target (${verifiedCount} >= ${target})`);
    return;
  }

  let targets = seed.companies.filter((c) => !isActiveVerifiedStatus(c.verificationStatus));
  if (provider) targets = targets.filter((c) => c.atsProvider === provider);
  if (reverify) {
    targets = seed.companies.filter((c) => (provider ? c.atsProvider === provider : true));
  }
  if (limit) targets = targets.slice(0, limit);

  const batchSize = target ? Math.min(Math.max(target * 8, 2000), targets.length) : targets.length;
  const workQueue = targets.slice(0, batchSize);

  console.log(`Verifying up to ${workQueue.length} board(s) (target: ${target ?? "all"})...`);

  const stats = {
    verified: 0,
    empty: 0,
    invalid: 0,
    unavailable: 0,
    rate_limited: 0,
    verification_failed: 0,
  };

  const byProvider = Object.groupBy(workQueue, (t) => t.atsProvider) as Record<
    AtsProvider,
    CompanyJobSource[]
  >;

  for (const [prov, entries] of Object.entries(byProvider) as [AtsProvider, CompanyJobSource[]][]) {
    if (target) {
      const current = countVerified(seed.companies, provider ?? prov);
      if (current >= target) break;
    }

    const concurrency = PROVIDER_CONCURRENCY[prov];
    const delay = PROVIDER_DELAY_MS[prov];

    await runPool(entries, concurrency, async (entry) => {
      if (target) {
        const current = countVerified(seed.companies, provider ?? prov);
        if (current >= target) return null;
      }

      const result = await verifyBoard(entry.boardUrl, entry.atsProvider);
      stats[result.status]++;

      if (result.status === "verified" || result.status === "empty" || result.status === "invalid") {
        const statusLabel = result.status === "verified" ? `OK (${result.jobCount})` : result.status;
        console.log(
          `${result.status === "verified" ? "✓" : "✗"} [${prov}] ${entry.boardSlug.padEnd(24)} ${statusLabel}${result.error ? ` — ${result.error}` : ""}`
        );
      }

      const idx = seed.companies.findIndex(
        (c) => c.atsProvider === entry.atsProvider && c.boardSlug === entry.boardSlug
      );
      if (idx >= 0 && write) {
        seed.companies[idx] = {
          ...seed.companies[idx],
          companyName: result.companyName ?? seed.companies[idx].companyName,
          boardUrl: result.boardUrl,
          verificationStatus: result.status,
          verifiedAt: result.status === "verified" ? new Date().toISOString() : seed.companies[idx].verifiedAt,
          lastJobCount: result.jobCount,
          verificationError: result.error,
          observedSignals: result.observedSignals ?? seed.companies[idx].observedSignals,
          lastSyncedAt: new Date().toISOString(),
          enabled: result.status === "verified",
        };
      }

      await sleep(delay);
      return result;
    });
  }

  const newVerified = countVerified(seed.companies);
  const newScoped = countVerified(seed.companies, provider);
  console.log("\n=== Verification summary ===");
  console.log(stats);
  console.log(`Verified total: ${newVerified}`);
  if (provider) console.log(`Verified ${provider}: ${newScoped}`);

  if (write) {
    seed.updatedAt = new Date().toISOString();
    writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`);
    console.log(`Updated ${SEED_PATH}`);
    exportVerifiedCatalog(seed);
  } else {
    console.log("\nRun with --write to persist results.");
  }

  const targetCount = provider ? newScoped : newVerified;
  if (target && targetCount < target) {
    const remaining = seed.companies.filter(
      (c) =>
        !isActiveVerifiedStatus(c.verificationStatus) &&
        (!provider || c.atsProvider === provider)
    ).length;
    console.log(
      `\nWarning: ${scope}target ${target} not reached (${targetCount} verified, ${remaining} unverified remaining).`
    );
    console.log(
      `Run again: pnpm verify:registry --write${provider ? ` --provider=${provider}` : ""} --target=${target}`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
