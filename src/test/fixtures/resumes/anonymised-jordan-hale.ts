import { PDFDocument, PDFName, PDFString, StandardFonts, type PDFPage, type PDFRef } from "pdf-lib";

const BULLETS = {
  northwind: [
    "Built a shared component library that cut interface delivery time by 35 percent.",
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
    "Created API adapters for the billing partner integration.",
  ],
  lumen: [
    "Taught full stack project reviews for the evening cohort.",
    "Built sample apps that demonstrated React and Express together.",
    "Mentored graduates on testing habits and pull request reviews.",
  ],
} as const;

export const ANONYMISED_RESUME_TEXT = [
  "Jordan Hale",
  "jordan-hale",
  "jordan-hale-dev",
  "Senior Software Developer",
  "jordan.hale @example.com",
  "Toronto, Canada",
  "Professional Summary",
  "Builds reliable product interfaces and measurable delivery improvements for web platforms.",
  "Core Technical Skills",
  "Frontend",
  "Cloud & Backend",
  "React, TypeScript, Next.js",
  "Node.js, Express, GraphQLAuthentication",
  "Engineering Practices",
  "Design Systems",
  "CSS3Responsive pipelinesTurborepo",
  "StorybookFigma",
  "UI/UX & Design",
  "Testing",
  "Figma, accessibility",
  "Playwright, Jest",
  "Work Experience 06/2022 - present",
  "Software Developer",
  "Northwind\u2060 Labs",
  "Toronto",
  "Key Contributions",
  ...BULLETS.northwind.map((bullet) => `• ${bullet}`),
  "01/2021 - 05/2022",
  "Full Stack Developer",
  "Brightpath Studio",
  "Remote",
  ...BULLETS.brightpath.map((bullet) => `• ${bullet}`),
  "08/2019 - 12/2020",
  "Software Developer",
  "Harbor & Co",
  "Ottawa",
  ...BULLETS.harbor.map((bullet) => `• ${bullet}`),
  "03/2018 - 07/2019",
  "Full Stack Developer",
  "Lumen Cohort",
  "Lagos",
  ...BULLETS.lumen.map((bullet) => `• ${bullet}`),
  "Education",
  "B.Eng Mechanical Engineering",
  "Harbourview Polytechnic",
  "2014 - 2018",
  "Certificate in Full Stack Web Development",
  "Northline Academy",
  "2019",
  "Certifications",
  "AWS Certified Cloud",
  "Practitioner",
  "Amazon Web Services",
  "Validation Number",
  "NW-CLOUD-2048",
].join("\n");

const LEFT = 40;
const RIGHT = 340;
const SIZE = 8;
const LEAD = 11;
const BULLET_DROP = 6;

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

export async function buildAnonymisedResumePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const links: PDFRef[] = [];
  let y = 776;

  function line(text: string, x = LEFT) {
    page.drawText(text, { x, y, size: SIZE, font });
    y -= LEAD;
  }

  function columns(left: string, right: string) {
    page.drawText(left, { x: LEFT, y, size: SIZE, font });
    page.drawText(right, { x: RIGHT, y, size: SIZE, font });
    y -= LEAD;
  }

  function bullet(text: string) {
    page.drawText(text, { x: LEFT + 12, y, size: SIZE, font });
    page.drawText("•", { x: LEFT, y: y - BULLET_DROP, size: SIZE, font });
    y -= LEAD;
  }

  line("Jordan Hale");
  const linkedInY = y;
  line("jordan-hale");
  const githubY = y;
  line("jordan-hale-dev");
  line("Senior Software Developer");
  const emailY = y;
  line("jordan.hale @example.com");
  line("Toronto, Canada");
  line("Professional Summary");
  line("Builds reliable product interfaces and measurable delivery improvements for web platforms.");
  line("Core Technical Skills");
  columns("Frontend", "Cloud & Backend");
  columns("React, TypeScript, Next.js", "Node.js, Express, GraphQLAuthentication");
  columns("Engineering Practices", "Design Systems");
  columns("CSS3Responsive pipelinesTurborepo", "StorybookFigma");
  columns("UI/UX & Design", "Testing");
  columns("Figma, accessibility", "Playwright, Jest");
  line("Work Experience 06/2022 - present");
  line("Software Developer");
  line("Northwind Labs");
  line("Toronto");
  line("Key Contributions");
  for (const text of BULLETS.northwind) bullet(text);
  columns("01/2021 - 05/2022", "Full Stack Developer");
  line("Brightpath Studio");
  line("Remote");
  for (const text of BULLETS.brightpath) bullet(text);
  line("08/2019 - 12/2020");
  line("Software Developer");
  line("Harbor & Co");
  line("Ottawa");
  for (const text of BULLETS.harbor) bullet(text);
  line("03/2018 - 07/2019");
  line("Full Stack Developer");
  line("Lumen Cohort");
  line("Lagos");
  for (const text of BULLETS.lumen) bullet(text);
  line("Education");
  line("B.Eng Mechanical Engineering");
  line("Harbourview Polytechnic");
  line("2014 - 2018");
  line("Certificate in Full Stack Web Development");
  line("Northline Academy");
  line("2019");
  line("Certifications");
  line("AWS Certified Cloud");
  line("Practitioner");
  line("Amazon Web Services");
  line("Validation Number");
  line("NW-CLOUD-2048");

  if (y < 24) {
    throw new Error(`Anonymised resume PDF overflowed the page (y=${y}).`);
  }

  addLink(page, links, LEFT, linkedInY, 80, "https://www.linkedin.com/in/jordan-hale");
  addLink(page, links, LEFT, githubY, 90, "https://github.com/jordan-hale-dev");
  addLink(page, links, LEFT, emailY, 140, "mailto:jordan.hale@example.com");
  page.node.set(PDFName.of("Annots"), doc.context.obj(links));

  return Buffer.from(await doc.save());
}
