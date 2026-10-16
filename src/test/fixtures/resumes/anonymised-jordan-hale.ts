import { PDFDocument, PDFName, PDFString, StandardFonts, type PDFPage, type PDFRef } from "pdf-lib";

const NORTHWIND_LEAD = "Built a shared component library that cut interface";
const NORTHWIND_TAIL = "delivery time by 35 percent.";
const HARBOR_LEAD = "Created API adapters for the billing partner integration";
const HARBOR_TAIL = "with MongoDB indexes.";

const ROLE_SUMMARIES = {
  northwind: "Owns the billing workspace and partners with design on delivery.",
  brightpath: "Builds marketing sites and CMS workflows for studio clients.",
  harbor: "Maintains finance tools for the operations team.",
  lumen: "Teaches full stack reviews for the evening cohort.",
} as const;

const BULLETS = {
  northwind: [
    `${NORTHWIND_LEAD} ${NORTHWIND_TAIL}`,
    "Raised release confidence and cut production regressions by 40 percent.",
    "Shipped typed React views for the customer billing workspace.",
    "Introduced Playwright coverage for the checkout and account flows.",
    "Migrated the design tokens into a shared Storybook catalog.",
    "Tuned GraphQL queries that slowed the account dashboard.",
    "Mentored two product engineers on accessible form patterns.",
    "Automated preview deploys for every pull request in the monorepo.",
    "Documented the component API for the design and product partners.",
    "Replaced fragile CSS overrides with shared layout primitives.",
    "Led the migration of legacy pages onto the shared component library.",
  ],
  brightpath: [
    "Delivered a marketing site and CMS workflow for the studio team.",
    "Built authentication flows with Express and session storage.",
    "Improved page speed for the portfolio templates used by clients.",
    "Collaborated with design on a responsive component starter.",
  ],
  harbor: [
    "Implemented internal tools for the finance operations team.",
    "Reduced manual invoice checks with a typed review queue.",
    "Maintained the React admin console used by support staff.",
    `${HARBOR_LEAD} ${HARBOR_TAIL}`,
  ],
  lumen: [
    "Taught full stack project reviews for the evening cohort.",
    "Built sample apps that demonstrated React and Express together.",
    "Mentored graduates on testing habits and pull request reviews.",
    "Published workshop notes that new graduates reused.",
  ],
} as const;

export const ROLE_SUMMARY_LINES = Object.values(ROLE_SUMMARIES);

export const PORTFOLIO_URL = "https://jordan-hale.example";
export const COMPANY_URL = "https://jobs.northwind.example";
export const CREDENTIAL_URL = "https://www.certmetrics.com/amazon/public/verification.aspx";

export const ANONYMISED_RESUME_TEXT = [
  "Jordan Hale",
  "jordan-hale",
  "jordan-hale-dev",
  "Senior Software Developer",
  "jordan.hale @example.com",
  "Toronto, Canada",
  PORTFOLIO_URL,
  "Professional Summary",
  "Builds reliable product interfaces and measurable delivery improvements for web platforms.",
  "Core Technical Skills",
  "Integration and Data",
  "Cloud & Backend",
  "Sentry, Splunk, pnpm, CI/CD",
  "Node.js, Express, GraphQLAuthentication",
  "Frontend",
  "Engineering Practices",
  "React, TypeScript, Next.js, WCAG",
  "CSS3Responsive pipelinesTurborepo",
  "Design Systems",
  "Testing",
  "StorybookFigma",
  "Playwright, Jest",
  "UI/UX & Design",
  "Figma, accessibility",
  "Work Experience",
  "06/2022 - present",
  "Software Developer",
  "Northwind\u2060 Labs",
  "Toronto",
  "Key Contributions",
  ROLE_SUMMARIES.northwind,
  ...BULLETS.northwind.map((bullet) => `• ${bullet}`),
  "01/2021 - 05/2022",
  "Full Stack Developer",
  "Brightpath Studio",
  "Remote",
  ROLE_SUMMARIES.brightpath,
  ...BULLETS.brightpath.map((bullet) => `• ${bullet}`),
  "08/2019 - 12/2020",
  "Software Developer",
  "MongoDB",
  "Bank of Harbor",
  "Ottawa",
  ROLE_SUMMARIES.harbor,
  ...BULLETS.harbor.map((bullet) => `• ${bullet}`),
  "03/2018 - 07/2019",
  "Full Stack Developer",
  "Lumen Cohort",
  "Lagos",
  ROLE_SUMMARIES.lumen,
  ...BULLETS.lumen.map((bullet) => `• ${bullet}`),
  "Education",
  "Harbourview Polytechnic",
  "B.Eng Mechanical Engineering",
  "2014 - 2018",
  "Certificate in Full Stack Web Development",
  "Northline Academy",
  "2019",
  "Certifications",
  "AWS Certified Cloud",
  "Practitioner",
  "Validation Number",
  "NW-CLOUD-2048",
  CREDENTIAL_URL,
].join("\n");

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 40;
const RIGHT = 340;
const SIZE = 8;
const LEAD = 11;
const BULLET_DROP = 6;
const BODY_TOP = 700;
const BODY_BOTTOM = 88;
const HEADER_Y = 760;

const HEADER_TOKENS = ["Software Developer", "Developer", "Full Stack", "of", "Key Contributions", "•"] as const;

function addLink(page: PDFPage, refs: PDFRef[], x: number, y: number, width: number, url: string) {
  const annot = page.doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y - 2, x + width, y + SIZE + 2],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    },
  });
  refs.push(page.doc.context.register(annot));
}

export async function buildAnonymisedResumePdf(options?: {
  inlineGlyphs?: boolean;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages: Array<{ page: PDFPage; links: PDFRef[]; y: number }> = [];

  function startPage() {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const state = { page, links: [] as PDFRef[], y: BODY_TOP };
    pages.push(state);
    HEADER_TOKENS.forEach((token, index) => {
      page.drawText(token, { x: LEFT + index * 90, y: HEADER_Y, size: SIZE, font });
    });
    page.drawText(String(pages.length), { x: 300, y: 28, size: SIZE, font });
    return state;
  }

  let state = startPage();

  function ensure(lines = 1) {
    if (state.y - lines * LEAD >= BODY_BOTTOM) return;
    state = startPage();
  }

  function textLine(text: string, x = LEFT): number {
    ensure();
    const drawnY = state.y;
    state.page.drawText(text, { x, y: drawnY, size: SIZE, font });
    state.y -= LEAD;
    return drawnY;
  }

  function columns(left: string, right: string) {
    ensure();
    state.page.drawText(left, { x: LEFT, y: state.y, size: SIZE, font });
    state.page.drawText(right, { x: RIGHT, y: state.y, size: SIZE, font });
    state.y -= LEAD;
  }

  function bullet(text: string, tail?: string) {
    if (options?.inlineGlyphs) {
      ensure(tail ? 2 : 1);
      const drawnY = state.y;
      state.page.drawText("•", { x: LEFT + 12, y: drawnY, size: 0.75, font });
      state.page.drawText(text, { x: LEFT + 12, y: drawnY, size: SIZE, font });
      state.y -= LEAD;
      if (tail) textLine(tail, LEFT + 12);
      return;
    }
    const drawnY = textLine(text, LEFT + 12);
    state.page.drawText("•", { x: LEFT, y: drawnY - BULLET_DROP, size: SIZE, font });
    if (tail) textLine(tail, LEFT + 12);
  }

  textLine("Jordan Hale");
  const linkedInY = textLine("jordan-hale");
  const githubY = textLine("jordan-hale-dev");
  textLine("Senior Software Developer");
  const emailY = textLine("jordan.hale@example.com");
  textLine("Toronto, Canada");
  const portfolioY = textLine("jordan-hale.example");
  textLine("Professional Summary");
  textLine("Builds reliable product interfaces and measurable delivery improvements for web platforms.");
  textLine("Core Technical Skills");
  columns("Integration and Data", "Cloud & Backend");
  columns("Sentry, Splunk, pnpm, CI/CD", "Node.js, Express, GraphQLAuthentication");
  columns("Frontend", "Engineering Practices");
  columns("React, TypeScript, Next.js, WCAG", "CSS3Responsive pipelinesTurborepo");
  columns("Design Systems", "Testing");
  columns("StorybookFigma", "Playwright, Jest");
  columns("UI/UX & Design", "Figma, accessibility");
  textLine("Work Experience");
  textLine("06/2022 - present");
  textLine("Software Developer");
  const companyY = textLine("Northwind Labs");
  textLine("Toronto");
  textLine("Key Contributions");
  textLine(ROLE_SUMMARIES.northwind);
  bullet(NORTHWIND_LEAD, NORTHWIND_TAIL);
  for (const text of BULLETS.northwind.slice(1)) bullet(text);

  state = startPage();
  textLine("01/2021 - 05/2022");
  textLine("Full Stack Developer");
  textLine("Brightpath Studio");
  textLine("Remote");
  textLine(ROLE_SUMMARIES.brightpath);
  for (const text of BULLETS.brightpath) bullet(text);
  textLine("08/2019 - 12/2020");
  textLine("Software Developer");
  textLine("MongoDB");
  textLine("Bank of Harbor");
  textLine("Ottawa");
  textLine(ROLE_SUMMARIES.harbor);
  for (const text of BULLETS.harbor.slice(0, 3)) bullet(text);
  bullet(HARBOR_LEAD, HARBOR_TAIL);

  state = startPage();
  textLine("03/2018 - 07/2019");
  textLine("Full Stack Developer");
  textLine("Lumen Cohort");
  textLine("Lagos");
  textLine(ROLE_SUMMARIES.lumen);
  for (const text of BULLETS.lumen) bullet(text);
  textLine("Education");
  textLine("Harbourview Polytechnic");
  textLine("B.Eng Mechanical Engineering");
  textLine("2014 - 2018");
  textLine("Certificate in Full Stack Web Development");
  textLine("Northline Academy");
  textLine("2019");
  textLine("Certifications");
  const certY = textLine("AWS Certified Cloud");
  textLine("Practitioner");
  textLine("Validation Number");
  textLine("NW-CLOUD-2048");

  const first = pages[0];
  addLink(first.page, first.links, LEFT, linkedInY, 80, "https://www.linkedin.com/in/jordan-hale");
  addLink(first.page, first.links, LEFT, githubY, 110, "https://github.com/jordan-hale-dev");
  addLink(first.page, first.links, LEFT, emailY, 160, "mailto:jordan.hale@example.com");
  addLink(first.page, first.links, LEFT, portfolioY, 120, PORTFOLIO_URL);
  addLink(first.page, first.links, LEFT, companyY, 120, COMPANY_URL);
  const last = pages[pages.length - 1];
  addLink(last.page, last.links, LEFT, certY, 140, CREDENTIAL_URL);

  for (const entry of pages) {
    if (entry.links.length === 0) continue;
    entry.page.node.set(PDFName.of("Annots"), doc.context.obj(entry.links));
  }

  return Buffer.from(await doc.save());
}
