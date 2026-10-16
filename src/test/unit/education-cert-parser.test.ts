import { describe, expect, it } from "vitest";
import { parseCertificationEntries, parseEducationEntries } from "@/modules/resumes/parse/education-cert-parser";
import type { GroupedLine } from "@/modules/resumes/normalize/line-grouper";

function lines(text: string): GroupedLine[] {
  return text.split("\n").map((line, index) => ({
    text: line,
    page: 1,
    items: [],
    isBullet: false,
    lineNumber: index + 1,
  }));
}

describe("education and certification parsers", () => {
  it("classifies institution and qualification by keywords in either order", () => {
    const entries = parseEducationEntries(
      lines(
        [
          "Harbourview Polytechnic",
          "B.Eng Mechanical Engineering",
          "2014 - 2018",
          "Certificate in Full Stack Web Development",
          "Northline Academy",
          "2019",
        ].join("\n")
      )
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      institution: "Harbourview Polytechnic",
      qualification: "B.Eng",
      fieldOfStudy: "Mechanical Engineering",
    });
    expect(entries[1]).toMatchObject({
      institution: "Northline Academy",
      qualification: "Certificate in Full Stack Web Development",
    });
  });

  it("infers the AWS issuer and keeps a certmetrics url", () => {
    const certs = parseCertificationEntries(
      lines(
        [
          "AWS Certified Cloud",
          "Practitioner",
          "Validation Number",
          "NW-CLOUD-2048",
          "https://www.certmetrics.com/amazon/public/verification.aspx",
        ].join("\n")
      )
    );
    expect(certs).toHaveLength(1);
    expect(certs[0].name).toBe("AWS Certified Cloud Practitioner");
    expect(certs[0].issuer).toBe("Amazon Web Services");
    expect(certs[0].credentialId).toBe("NW-CLOUD-2048");
    expect(certs[0].credentialUrl).toContain("certmetrics");
  });
});
