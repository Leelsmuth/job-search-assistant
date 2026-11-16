import type { LocationClass, LocationFlag } from "@/modules/location/eligibility";
import type { MatchClassification } from "@/lib/utils";

/**
 * Fictional jobs for the public demo. No company, role, or link here is real.
 * Dates are offsets so the feed looks fresh whenever the demo is (re)seeded.
 */
export type DemoJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  workplaceType: "remote" | "hybrid" | "on_site";
  locationClass: LocationClass;
  locationFlags: LocationFlag[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  sourceLabel: string;
  postedHoursAgo: number;
  fitScore: number;
  classification: MatchClassification;
  fitReasons: string[];
  topConcern: string | null;
  matchingSkills: string[];
  technologies: string[];
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
};

export const DEMO_JOBS: readonly DemoJob[] = [
  {
    id: "northwind-senior-frontend",
    title: "Senior Frontend Engineer",
    company: "Northwind Labs",
    location: "Canada",
    workplaceType: "remote",
    locationClass: "remote_canada",
    locationFlags: [],
    salaryMin: 140000,
    salaryMax: 165000,
    salaryCurrency: "CAD",
    sourceLabel: "Greenhouse",
    postedHoursAgo: 5,
    fitScore: 91,
    classification: "excellent",
    fitReasons: ["React + TypeScript core stack", "Remote within Canada", "Next.js in production"],
    topConcern: null,
    matchingSkills: ["React", "TypeScript", "Next.js"],
    technologies: ["React", "TypeScript", "Next.js", "Playwright", "Tailwind CSS"],
    summary:
      "Northwind Labs builds scheduling software for independent clinics. You'll own customer-facing features in our Next.js app and help shape the component library.",
    responsibilities: [
      "Ship React and TypeScript features end to end with product and design",
      "Improve Core Web Vitals on high-traffic booking pages",
      "Grow our Playwright suite and review frontend pull requests",
    ],
    requirements: [
      "5+ years building production web applications",
      "Strong React and TypeScript",
      "Experience running Next.js in production",
    ],
    niceToHave: ["Accessibility audits", "Design system experience"],
  },
  {
    id: "maple-pine-design-systems",
    title: "Frontend Developer, Design Systems",
    company: "Maple & Pine Commerce",
    location: "Toronto, ON",
    workplaceType: "hybrid",
    locationClass: "hybrid_gta",
    locationFlags: [],
    salaryMin: 115000,
    salaryMax: 135000,
    salaryCurrency: "CAD",
    sourceLabel: "Lever",
    postedHoursAgo: 20,
    fitScore: 86,
    classification: "strong",
    fitReasons: ["Component library work", "Accessibility focus", "Hybrid in Toronto"],
    topConcern: "Figma token pipeline experience not shown on your profile",
    matchingSkills: ["React", "Storybook", "CSS"],
    technologies: ["React", "Storybook", "CSS", "Figma"],
    summary:
      "Join the team behind Maple & Pine's shared UI kit, used by six product squads across storefront and merchant tools.",
    responsibilities: [
      "Build and document accessible React components in Storybook",
      "Partner with designers to keep Figma and code tokens in sync",
      "Help squads adopt new components and retire legacy CSS",
    ],
    requirements: [
      "3+ years of frontend development",
      "Deep CSS knowledge, including layout and theming",
      "Experience with Storybook or a similar workshop tool",
    ],
    niceToHave: ["Design token tooling (Style Dictionary)", "WCAG 2.2 experience"],
  },
  {
    id: "quill-graphql-frontend",
    title: "Frontend Engineer, GraphQL",
    company: "Quill Studio",
    location: "Canada",
    workplaceType: "remote",
    locationClass: "remote_canada",
    locationFlags: [],
    salaryMin: 125000,
    salaryMax: 145000,
    salaryCurrency: "CAD",
    sourceLabel: "Ashby",
    postedHoursAgo: 12,
    fitScore: 83,
    classification: "strong",
    fitReasons: ["React + GraphQL client work", "Remote within Canada"],
    topConcern: "Apollo Federation on the server side",
    matchingSkills: ["React", "GraphQL", "TypeScript"],
    technologies: ["React", "GraphQL", "Apollo", "TypeScript"],
    summary:
      "Quill Studio makes collaborative writing tools for newsrooms. The web team owns the editor, comments, and publishing flows.",
    responsibilities: [
      "Build editor features backed by our GraphQL API",
      "Design client-side caching strategies with Apollo",
      "Work with backend engineers on schema design",
    ],
    requirements: [
      "4+ years with React",
      "Production GraphQL client experience",
      "Comfort with TypeScript generics",
    ],
    niceToHave: ["Apollo Federation", "Rich-text editors (ProseMirror, Lexical)"],
  },
  {
    id: "civic-form-accessibility",
    title: "UI Engineer, Accessibility",
    company: "Civic Form Co.",
    location: "Ottawa, ON",
    workplaceType: "remote",
    locationClass: "remote_canada",
    locationFlags: [],
    salaryMin: 110000,
    salaryMax: 130000,
    salaryCurrency: "CAD",
    sourceLabel: "Workable",
    postedHoursAgo: 12 * 24,
    fitScore: 88,
    classification: "strong",
    fitReasons: ["Accessibility is the core of the role", "React forms experience"],
    topConcern: null,
    matchingSkills: ["React", "Accessibility", "TypeScript"],
    technologies: ["React", "TypeScript", "axe-core", "Testing Library"],
    summary:
      "Civic Form Co. builds online forms for municipal services. Every screen we ship has to work for every resident.",
    responsibilities: [
      "Build accessible form components used by 40+ municipalities",
      "Run screen-reader testing and fix what you find",
      "Coach other engineers on accessible patterns",
    ],
    requirements: [
      "3+ years of frontend development",
      "Working knowledge of WCAG 2.1 AA",
      "Experience testing with at least one screen reader",
    ],
    niceToHave: ["French language skills", "Public-sector experience"],
  },
  {
    id: "tidewater-web-platform",
    title: "Senior Software Engineer, Web Platform",
    company: "Tidewater Fintech",
    location: "New York, NY",
    workplaceType: "remote",
    locationClass: "remote_other",
    locationFlags: ["us_work_authorization"],
    salaryMin: 170000,
    salaryMax: 200000,
    salaryCurrency: "USD",
    sourceLabel: "Greenhouse",
    postedHoursAgo: 6 * 24,
    fitScore: 80,
    classification: "strong",
    fitReasons: ["Web platform and build tooling", "TypeScript monorepo"],
    topConcern: "Requires US work authorization",
    matchingSkills: ["TypeScript", "React", "Vite"],
    technologies: ["TypeScript", "React", "Vite", "Turborepo"],
    summary:
      "Tidewater's web platform team owns the build system, shared libraries, and performance budgets for every customer-facing app.",
    responsibilities: [
      "Own the monorepo build and release pipeline",
      "Set and enforce bundle-size and performance budgets",
      "Maintain shared React libraries used by twelve teams",
    ],
    requirements: [
      "6+ years of software engineering",
      "Deep TypeScript and JavaScript tooling knowledge",
      "Authorized to work in the United States",
    ],
    niceToHave: ["Turborepo or Nx", "Experience in regulated industries"],
  },
  {
    id: "lumen-staff-frontend",
    title: "Staff Frontend Engineer",
    company: "Lumen Health",
    location: "Canada",
    workplaceType: "remote",
    locationClass: "remote_canada",
    locationFlags: [],
    salaryMin: 180000,
    salaryMax: 210000,
    salaryCurrency: "CAD",
    sourceLabel: "Ashby",
    postedHoursAgo: 2 * 24,
    fitScore: 78,
    classification: "stretch",
    fitReasons: ["Frontend architecture", "Remote within Canada"],
    topConcern: "Staff-level scope: org-wide technical leadership",
    matchingSkills: ["React", "TypeScript"],
    technologies: ["React", "TypeScript", "Next.js", "Module Federation"],
    summary:
      "Lumen Health is hiring its first staff frontend engineer to set direction for a 25-person web organization.",
    responsibilities: [
      "Define frontend architecture across patient and clinician apps",
      "Lead cross-team technical initiatives",
      "Mentor senior engineers",
    ],
    requirements: [
      "8+ years of frontend engineering",
      "Track record leading multi-team technical projects",
      "Strong React and TypeScript",
    ],
    niceToHave: ["Micro-frontends", "Healthcare or PHI experience"],
  },
  {
    id: "harbourline-fullstack",
    title: "Full-Stack Engineer (React/Node)",
    company: "Harbourline Logistics",
    location: "Toronto, ON",
    workplaceType: "hybrid",
    locationClass: "hybrid_gta",
    locationFlags: [],
    salaryMin: 120000,
    salaryMax: 140000,
    salaryCurrency: "CAD",
    sourceLabel: "Greenhouse",
    postedHoursAgo: 20 * 24,
    fitScore: 74,
    classification: "possible",
    fitReasons: ["React frontend half of the role", "Hybrid in Toronto"],
    topConcern: "Kubernetes operations experience",
    matchingSkills: ["React", "Node.js"],
    technologies: ["React", "Node.js", "PostgreSQL", "Kubernetes"],
    summary:
      "Harbourline builds dispatch software for freight carriers. The shipments team owns tracking from pickup to delivery.",
    responsibilities: [
      "Build React dashboards for dispatchers",
      "Write Node.js services that process carrier updates",
      "Take part in the on-call rotation",
    ],
    requirements: [
      "4+ years of full-stack development",
      "React and Node.js in production",
      "Experience operating services on Kubernetes",
    ],
    niceToHave: ["PostgreSQL performance tuning", "Event-driven systems"],
  },
  {
    id: "aurora-react-native",
    title: "React Native Engineer",
    company: "Aurora Transit",
    location: "Vancouver, BC",
    workplaceType: "on_site",
    locationClass: "out_of_area",
    locationFlags: [],
    salaryMin: 120000,
    salaryMax: 150000,
    salaryCurrency: "CAD",
    sourceLabel: "Lever",
    postedHoursAgo: 2 * 24,
    fitScore: 70,
    classification: "possible",
    fitReasons: ["React skills transfer to React Native"],
    topConcern: "Mobile release pipeline (Fastlane) not on your profile",
    matchingSkills: ["React", "TypeScript"],
    technologies: ["React Native", "TypeScript", "Expo", "Fastlane"],
    summary:
      "Aurora Transit's rider app helps 300,000 people a day plan trips across the Lower Mainland.",
    responsibilities: [
      "Build features in our React Native rider app",
      "Own release builds for iOS and Android",
      "Improve offline support for trip planning",
    ],
    requirements: [
      "3+ years with React or React Native",
      "Shipped at least one app to the App Store or Play Store",
      "On-site in Vancouver four days a week",
    ],
    niceToHave: ["Expo EAS", "Mapping SDKs"],
  },
  {
    id: "brightlane-vue",
    title: "Frontend Engineer (Vue)",
    company: "Brightlane Analytics",
    location: "Canada",
    workplaceType: "remote",
    locationClass: "remote_canada",
    locationFlags: [],
    salaryMin: 105000,
    salaryMax: 125000,
    salaryCurrency: "CAD",
    sourceLabel: "Lever",
    postedHoursAgo: 4 * 24,
    fitScore: 62,
    classification: "stretch",
    fitReasons: ["Remote within Canada", "Data visualization work"],
    topConcern: "Vue 3 and Pinia; your profile is React-focused",
    matchingSkills: ["TypeScript", "D3"],
    technologies: ["Vue 3", "Pinia", "TypeScript", "D3"],
    summary:
      "Brightlane turns warehouse sensor data into dashboards for operations teams.",
    responsibilities: [
      "Build charting components in Vue 3",
      "Optimize rendering for large time-series datasets",
      "Work closely with the data engineering team",
    ],
    requirements: [
      "3+ years of frontend development",
      "Vue 3 with the Composition API",
      "Data visualization experience",
    ],
    niceToHave: ["D3", "WebGL charting"],
  },
  {
    id: "pixel-orchard-junior",
    title: "Junior Frontend Developer",
    company: "Pixel Orchard",
    location: "Mississauga, ON",
    workplaceType: "on_site",
    locationClass: "onsite_gta",
    locationFlags: [],
    salaryMin: 70000,
    salaryMax: 85000,
    salaryCurrency: "CAD",
    sourceLabel: "Workable",
    postedHoursAgo: 8 * 24,
    fitScore: 58,
    classification: "possible",
    fitReasons: ["Frontend role in the GTA"],
    topConcern: "Junior role; may under-level your experience",
    matchingSkills: ["React", "CSS"],
    technologies: ["React", "CSS", "WordPress"],
    summary:
      "Pixel Orchard is a small agency building marketing sites and web apps for local businesses.",
    responsibilities: [
      "Build marketing pages from designer mockups",
      "Maintain client WordPress themes",
      "Help with small React projects",
    ],
    requirements: ["1+ year of frontend development", "HTML, CSS, and JavaScript", "On-site in Mississauga"],
    niceToHave: ["React", "WordPress theme development"],
  },
];

const JOBS_BY_ID = new Map(DEMO_JOBS.map((job) => [job.id, job]));

export function getDemoJob(jobId: string): DemoJob | null {
  return JOBS_BY_ID.get(jobId) ?? null;
}

export function isDemoJobId(jobId: string): boolean {
  return JOBS_BY_ID.has(jobId);
}
