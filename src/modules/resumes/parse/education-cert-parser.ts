import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";
import type { Certification, Education, SourceEvidence } from "@/modules/resumes/schema/resume-schema";
import { newEntityId } from "@/lib/entity-id";

const QUALIFICATION =
  /\b(b\.?\s*eng|b\.?\s*sc|m\.?\s*sc|m\.?\s*eng|bachelor|master|ph\.?\s*d|diploma|certificate|associate)\b/i;

const CREDENTIAL_LABEL =
  /^(validation number|credential id|credential identifier|certificate number|license number|certification id)$/i;

const CERT_CONTINUATION =
  /^(practitioner|associate|professional|specialty|expert|architect|developer)$/i;

const ISSUER =
  /\b(amazon web services|google|microsoft|oracle|cisco|comptia|linux foundation|coursera|udemy|amazon)\b/i;

function lineNo(line: GroupedLine, index: number): number {
  return line.lineNumber ?? index + 1;
}

function evidenceFor(lines: GroupedLine[], indexes: number[]): SourceEvidence[] {
  return indexes.map((index) => ({
    page: lines[index]?.page ?? null,
    lineStart: lineNo(lines[index], index),
    lineEnd: lineNo(lines[index], index),
    rawText: lines[index]?.text ?? "",
    normalizedText: lines[index]?.text ?? "",
  }));
}

function isEducationDate(text: string): boolean {
  return (
    /^\d{4}$/.test(text) ||
    /^(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current)$/i.test(text) ||
    /^\d{1,2}\/\d{4}\s*[-–—]\s*(?:\d{1,2}\/\d{4}|present|current)$/i.test(text)
  );
}

function splitEducationDate(text: string): { start: string | null; end: string | null } {
  if (/^\d{4}$/.test(text)) return { start: null, end: text };
  const parts = text.split(/\s*[-–—]\s*/);
  if (parts.length >= 2) return { start: parts[0]?.trim() || null, end: parts[1]?.trim() || null };
  return { start: null, end: text };
}

function splitQualification(text: string): { qualification: string; field: string | null } {
  const certificate = text.match(/^(certificate|diploma)\s+in\s+(.+)$/i);
  if (certificate) {
    return { qualification: text.trim(), field: certificate[2].trim() };
  }
  const degree = text.match(/^(b\.?\s*eng|b\.?\s*sc|m\.?\s*sc|m\.?\s*eng|bachelor(?:\s+of\s+[A-Za-z]+)?|master(?:\s+of\s+[A-Za-z]+)?)\b\s*(.*)$/i);
  if (degree) {
    const field = degree[2]?.replace(/^in\s+/i, "").trim();
    return { qualification: degree[1].trim(), field: field || null };
  }
  return { qualification: text.trim(), field: null };
}

function emptyEducation(): Education {
  return {
    id: newEntityId(),
    institution: null,
    qualification: null,
    fieldOfStudy: null,
    startDateText: null,
    endDateText: null,
    location: null,
    sourceLines: [],
  };
}

function parsePipeEducation(text: string, sourceLines: number[]): Education {
  const entry = emptyEducation();
  entry.sourceLines = sourceLines;
  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (isEducationDate(part) || /^\d{4}$/.test(part)) {
      const dates = splitEducationDate(part);
      entry.startDateText = dates.start;
      entry.endDateText = dates.end;
      continue;
    }
    if (QUALIFICATION.test(part) && !entry.qualification) {
      const split = splitQualification(part);
      entry.qualification = split.qualification;
      entry.fieldOfStudy = split.field;
      continue;
    }
    if (!entry.institution) entry.institution = part;
    else if (!entry.qualification) entry.qualification = part;
  }
  if (!entry.institution) entry.institution = parts[0] ?? text;
  return entry;
}

export function parseEducationEntries(lines: GroupedLine[]): Education[] {
  const entries: Education[] = [];
  let current: Education | null = null;

  function flush() {
    if (current && (current.institution?.trim() || current.qualification?.trim())) {
      entries.push(current);
    }
    current = null;
  }

  for (let index = 0; index < lines.length; index++) {
    const text = lines[index].text.trim();
    if (!text) continue;
    const sourceLine = lineNo(lines[index], index);

    if (text.includes("|")) {
      flush();
      entries.push(parsePipeEducation(text, [sourceLine]));
      continue;
    }

    if (QUALIFICATION.test(text)) {
      if (current && (current.qualification || current.institution)) flush();
      current = emptyEducation();
      const split = splitQualification(text);
      current.qualification = split.qualification;
      current.fieldOfStudy = split.field;
      current.sourceLines = [sourceLine];
      continue;
    }

    if (isEducationDate(text)) {
      current ??= emptyEducation();
      const dates = splitEducationDate(text);
      current.startDateText = dates.start;
      current.endDateText = dates.end;
      current.sourceLines = [...(current.sourceLines ?? []), sourceLine];
      continue;
    }

    if (!current) {
      current = emptyEducation();
      current.institution = text;
      current.sourceLines = [sourceLine];
      continue;
    }

    if (!current.institution) {
      current.institution = text;
      current.sourceLines = [...(current.sourceLines ?? []), sourceLine];
      continue;
    }

    if (!current.qualification) {
      current.qualification = text;
      current.sourceLines = [...(current.sourceLines ?? []), sourceLine];
      continue;
    }

    flush();
    current = emptyEducation();
    current.institution = text;
    current.sourceLines = [sourceLine];
  }

  flush();
  return entries.filter((entry) => entry.institution?.trim() || entry.qualification?.trim());
}

function emptyCertification(name: string): Certification {
  return {
    id: newEntityId(),
    name,
    issuer: null,
    issuedDateText: null,
    expirationDateText: null,
    credentialId: null,
    credentialUrl: null,
    sourceEvidence: [],
    sourceLines: [],
  };
}

function parsePipeCertification(text: string, line: GroupedLine, index: number): Certification {
  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  const cert = emptyCertification(parts[0] ?? text);
  cert.sourceLines = [lineNo(line, index)];
  cert.sourceEvidence = evidenceFor([line], [0]);
  for (const part of parts.slice(1)) {
    const id = part.match(/credential id:\s*(.+)/i);
    if (id) cert.credentialId = id[1].trim();
    else if (!cert.issuer) cert.issuer = part;
  }
  return cert;
}

export function parseCertificationEntries(lines: GroupedLine[]): Certification[] {
  const certifications: Certification[] = [];
  let current: Certification | null = null;
  let expectCredential = false;

  function flush() {
    if (current?.name.trim()) certifications.push(current);
    current = null;
    expectCredential = false;
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text) continue;
    const sourceLine = lineNo(line, index);

    if (text.includes("|")) {
      flush();
      certifications.push(parsePipeCertification(text, line, index));
      continue;
    }

    if (CREDENTIAL_LABEL.test(text)) {
      expectCredential = true;
      if (current) current.sourceLines = [...(current.sourceLines ?? []), sourceLine];
      continue;
    }

    if (expectCredential && current) {
      current.credentialId = text.replace(/^credential id:\s*/i, "").trim();
      current.sourceLines = [...(current.sourceLines ?? []), sourceLine];
      current.sourceEvidence = [
        ...current.sourceEvidence,
        ...evidenceFor(lines, [index]),
      ];
      expectCredential = false;
      continue;
    }

    if (current && CERT_CONTINUATION.test(text)) {
      current.name = `${current.name} ${text}`.replace(/\s+/g, " ").trim();
      current.sourceLines = [...(current.sourceLines ?? []), sourceLine];
      continue;
    }

    if (current && ISSUER.test(text) && !current.issuer) {
      current.issuer = text;
      current.sourceLines = [...(current.sourceLines ?? []), sourceLine];
      continue;
    }

    if (current?.name) flush();
    current = emptyCertification(text);
    current.sourceLines = [sourceLine];
    current.sourceEvidence = evidenceFor(lines, [index]);
  }

  flush();
  return certifications.filter((cert) => cert.name.trim().length > 0);
}
