import { fetchAllowlisted } from "@/modules/ingestion/ats-http";
import { annualSalary, listingToNormalizedJob } from "@/modules/ingestion/listing-job";
import { providerPostedDate } from "@/modules/ingestion/posted-date";
import type { NormalizedJob } from "@/modules/ingestion/types";

const OPEN_CANADA = /^(?:open|ouvert)\.canada\.ca$/i;
const DATASET_ID = "ea639e28-c0fc-48bf-b5dd-b8899bd43072";
const MAX_BYTES = 2_000_000;
const MAX_ROWS = 4_000;
const MAX_MATCHES = 30;

const TITLE_HINT = /front-?end|react|typescript|javascript|full[\s-]?stack|software|web|ui|ux|developer|engineer|programmer/i;

type CkanResource = {
  format?: string;
  url?: string;
  name?: string;
  created?: string;
  last_modified?: string;
  metadata_modified?: string;
};

export function pickJobBankCsv(resources: readonly CkanResource[]): string | null {
  const csv = resources.filter((resource) => {
    const format = (resource.format ?? "").toUpperCase();
    const url = resource.url ?? "";
    if (!url.startsWith("https://")) return false;
    if (format && format !== "CSV") return false;
    if (/-fr-|french|_fr\b/i.test(url) || /french/i.test(resource.name ?? "")) return false;
    return true;
  });
  const english = csv.filter(
    (resource) => /-en-|english|_en\b/i.test(resource.url ?? "") || /english/i.test(resource.name ?? "")
  );
  const pool = english.length > 0 ? english : csv;
  const ranked = [...pool].sort((a, b) => {
    const left = Date.parse(a.last_modified || a.metadata_modified || a.created || "") || 0;
    const right = Date.parse(b.last_modified || b.metadata_modified || b.created || "") || 0;
    return right - left;
  });
  return ranked[0]?.url ?? null;
}

export function decodeJobBankBytes(bytes: Uint8Array): string {
  const even = bytes.byteLength % 2 === 0 ? bytes : bytes.subarray(0, bytes.byteLength - 1);
  if (even.byteLength >= 2 && even[0] === 0xff && even[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(even);
  }
  if (even.byteLength >= 2 && even[0] === 0xfe && even[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(even);
  }
  if (even.byteLength >= 4 && even[1] === 0 && even[3] === 0) {
    return new TextDecoder("utf-16le").decode(even);
  }
  return new TextDecoder("utf-8").decode(even);
}

function cell(row: string[], index: number): string {
  const value = (row[index] ?? "").trim();
  return value.toUpperCase() === "NA" ? "" : value;
}

function headerIndex(header: string[], name: string): number {
  const wanted = name.toLowerCase().replace(/\s+/g, " ").trim();
  return header.findIndex((column) => column.toLowerCase().replace(/\s+/g, " ").trim() === wanted);
}

export function parseJobBankTable(text: string): NormalizedJob[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split("\t").map((column) => column.replace(/^\uFEFF/, ""));
  const idIndex = headerIndex(header, "WIC Job Location Snapshot ID");
  const titleIndex = headerIndex(header, "Job Title");
  const originalIndex = headerIndex(header, "Original Job Title");
  const provinceIndex = headerIndex(header, "Province/Territory");
  const cityIndex = headerIndex(header, "City");
  const teleIndex = headerIndex(header, "Employment Term Telework");
  const typeIndex = headerIndex(header, "Employment Type");
  const salaryPerIndex = headerIndex(header, "Salary Per");
  const salaryMinIndex = headerIndex(header, "Salary Minimum");
  const salaryMaxIndex = headerIndex(header, "Salary Maximum");
  const nocIndex = headerIndex(header, "NOC21 Code Name");
  const postedIndex = ["Date Posted", "Posting Date", "Job Posting Date"]
    .map((name) => headerIndex(header, name))
    .find((index) => index >= 0) ?? -1;
  if (titleIndex < 0) return [];

  const jobs: NormalizedJob[] = [];
  const limit = Math.min(lines.length, MAX_ROWS + 1);
  for (let index = 1; index < limit && jobs.length < MAX_MATCHES; index += 1) {
    const row = lines[index].split("\t");
    if (row.length < header.length / 2) continue;
    const original = cell(row, originalIndex);
    const normalizedTitle = cell(row, titleIndex);
    const title = original || normalizedTitle;
    if (!TITLE_HINT.test(`${title} ${normalizedTitle} ${cell(row, nocIndex)}`)) continue;
    const city = cell(row, cityIndex);
    const province = cell(row, provinceIndex);
    const telework = cell(row, teleIndex);
    const remote = /^y/i.test(telework);
    const place = [city, province, "Canada"].filter(Boolean).join(", ");
    const location = remote ? `Remote, ${place}` : place;
    const per = cell(row, salaryPerIndex);
    const annual = /year|annual/i.test(per);
    const min = annual ? annualSalary(Number(cell(row, salaryMinIndex))) : undefined;
    const max = annual ? annualSalary(Number(cell(row, salaryMaxIndex))) : undefined;
    const id = cell(row, idIndex) || `${title}-${location}`;
    const description = [
      title,
      normalizedTitle && normalizedTitle !== title ? `Job Bank title: ${normalizedTitle}` : "",
      cell(row, nocIndex) ? `Occupation: ${cell(row, nocIndex)}` : "",
      `Location: ${location}`,
      cell(row, typeIndex) ? `Employment type: ${cell(row, typeIndex)}` : "",
      telework ? `Telework: ${telework}` : "",
      min ? `Salary: ${min}${max ? `-${max}` : ""} CAD per year` : "",
      "Employer name is not included in the Job Bank open-data extract.",
    ]
      .filter(Boolean)
      .join("\n");
    jobs.push(
      listingToNormalizedJob({
        company: "Job Bank employer",
        title,
        location,
        workplaceType: remote ? "remote" : "unknown",
        description,
        jobUrl: `https://www.jobbank.gc.ca/jobsearch/jobposting/${encodeURIComponent(id)}`,
        sourceJobId: `jobbank:${id}`,
        employmentType: cell(row, typeIndex),
        salaryMin: min,
        salaryMax: max,
        salaryCurrency: "CAD",
        datePosted: providerPostedDate("jobbank", { datePosted: cell(row, postedIndex) }),
        provider: "jobbank",
      })
    );
  }
  return jobs;
}

async function readCapped(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.subarray(0, MAX_BYTES);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const next = await reader.read();
    if (next.done || !next.value) break;
    const room = MAX_BYTES - size;
    const slice = next.value.byteLength > room ? next.value.subarray(0, room) : next.value;
    chunks.push(slice);
    size += slice.byteLength;
    if (size >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function fetchJobBankJobs(): Promise<NormalizedJob[]> {
  const metaUrl = `https://open.canada.ca/data/api/3/action/package_show?id=${DATASET_ID}`;
  const metaResponse = await fetchAllowlisted(metaUrl, OPEN_CANADA);
  const meta = (await metaResponse.json()) as { result?: { resources?: CkanResource[] } };
  const csvUrl = pickJobBankCsv(meta.result?.resources ?? []);
  if (!csvUrl) return [];
  const csvResponse = await fetchAllowlisted(csvUrl, OPEN_CANADA);
  const bytes = await readCapped(csvResponse);
  return parseJobBankTable(decodeJobBankBytes(bytes));
}
