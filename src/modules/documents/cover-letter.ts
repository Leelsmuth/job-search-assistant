import { reviewCoverLetter, profileCorpus } from "@/modules/documents/grounding";
import { clipWords, countWords, toCanadianEnglish } from "@/modules/documents/text";
import type { ProfileSnapshot, ResolvedResume } from "@/modules/documents/types";

export const MIN_COVER_LETTER_WORDS = 250;
export const MAX_COVER_LETTER_WORDS = 350;

const PREFERENCE_SENTENCES = [
  "I like to ship in small increments and explain tradeoffs in plain language.",
  "I care about the details that make a product feel reliable for the people using it.",
  "I do my best work when design and engineering can look at the same problem and decide together.",
  "I would rather keep a solution simple and solid than add moving parts that the team has to carry.",
  "Clear writing and careful review matter as much to me as the code that ships.",
  "I am glad to walk through recent work, how I made decisions, and what I would do differently now.",
  "When I join a team I look for a shared bar on quality, a readable codebase, and room to ask questions early.",
  "I am comfortable working remotely across Canadian time zones and coming into the Toronto area when a hybrid team needs it.",
  "The posting describes problems I want to help solve, and I would like to hear how the team is approaching them.",
];

export type CoverLetterInput = {
  profile: ProfileSnapshot;
  jobTitle: string;
  companyName: string | null;
  highlighted: ResolvedResume;
};

function paragraph(sentences: Array<string | null | undefined | false>): string {
  return sentences.filter((sentence): sentence is string => Boolean(sentence && sentence.trim())).join(" ");
}

function experienceSentence(
  experience: ResolvedResume["experiences"][number],
  bulletWords: number
): string | null {
  const bullet = experience.bullets[0];
  if (!bullet) return `I have worked as ${experience.title} at ${experience.company}.`;
  return `As ${experience.title} at ${experience.company}, ${clipWords(bullet, bulletWords)}.`;
}

export function buildTemplateCoverLetter(input: CoverLetterInput): { body: string; wordCount: number } {
  const name = input.profile.displayName?.trim() ?? "";
  const role = input.jobTitle.trim() || "frontend role";
  const company = input.companyName?.trim() || null;
  const experiences = input.highlighted.experiences.filter((item) => item.company && item.title);
  const project = input.highlighted.projects[0];
  const education = input.highlighted.education[0];
  const skills = input.highlighted.skills.slice(0, 8);

  let experienceCount = Math.min(2, experiences.length);
  let includeProject = Boolean(project);
  let includeEducation = Boolean(education);
  let extraCount = 0;
  let bulletWords = 35;

  const render = () => {
    const intro = paragraph([
      company
        ? `I am writing to apply for the ${role} role at ${company}.`
        : `I am writing to apply for the ${role} role.`,
      input.profile.location ? `I am based in ${input.profile.location}.` : null,
      input.profile.yearsExperience != null
        ? `I have ${input.profile.yearsExperience} years of experience.`
        : null,
      input.profile.summary ? clipWords(input.profile.summary, 45) : null,
    ]);
    const experienceParagraphs = experiences
      .slice(0, experienceCount)
      .map((experience) => experienceSentence(experience, bulletWords))
      .filter((sentence): sentence is string => Boolean(sentence));
    const support = paragraph([
      skills.length > 0 ? `My strongest overlap with this role includes ${skills.join(", ")}.` : null,
      includeProject && project
        ? `${project.name}${project.description ? `: ${clipWords(project.description, 30)}` : "."}`
        : null,
      includeEducation && education
        ? education.degree
          ? `I completed ${[education.degree, education.field].filter(Boolean).join(" in ")} at ${education.institution}.`
          : `I studied at ${education.institution}.`
        : null,
    ]);
    const interest = paragraph([
      "I am looking for frontend work that is remote within Canada or hybrid in the Greater Toronto Area.",
      "I favour user-centred interfaces, calm collaboration, and leaving a codebase easier to change than I found it.",
      ...PREFERENCE_SENTENCES.slice(0, extraCount),
    ]);
    const close = paragraph([
      "Thank you for considering my application. I would welcome a conversation about how I can help the team.",
    ]);
    const signoff = name ? `Sincerely,\n${name}` : "Sincerely,";
    return ["Dear Hiring Manager,", intro, ...experienceParagraphs, support, interest, close, signoff]
      .filter((part) => part && part.trim())
      .join("\n\n");
  };

  let body = render();
  while (countWords(body) > MAX_COVER_LETTER_WORDS) {
    if (extraCount > 0) extraCount -= 1;
    else if (includeEducation) includeEducation = false;
    else if (includeProject) includeProject = false;
    else if (experienceCount > 0) experienceCount -= 1;
    else if (bulletWords > 12) bulletWords -= 5;
    else break;
    body = render();
  }
  while (countWords(body) < MIN_COVER_LETTER_WORDS && extraCount < PREFERENCE_SENTENCES.length) {
    extraCount += 1;
    const next = render();
    if (countWords(next) > MAX_COVER_LETTER_WORDS) {
      extraCount -= 1;
      break;
    }
    body = next;
  }

  return { body, wordCount: countWords(body) };
}

export function finalizeCoverLetter(
  candidate: string | null,
  input: CoverLetterInput
): { body: string; wordCount: number; generationMode: "llm" | "template"; unsupportedClaims: string[] } {
  const template = buildTemplateCoverLetter(input);
  const corpus = profileCorpus(input.profile);
  const reviewOptions = {
    organizations: [
      ...input.profile.experiences.map((experience) => experience.company),
      input.companyName ?? "",
    ].filter(Boolean),
    jobTitle: input.jobTitle,
    titles: input.profile.experiences.map((experience) => experience.title),
  };

  if (!candidate?.trim()) {
    return { ...template, generationMode: "template", unsupportedClaims: [] };
  }

  const letter = toCanadianEnglish(candidate.trim());
  const review = reviewCoverLetter(letter, corpus, reviewOptions);
  const words = countWords(letter);
  if (!review.grounded || words < MIN_COVER_LETTER_WORDS || words > MAX_COVER_LETTER_WORDS) {
    return {
      ...template,
      generationMode: "template",
      unsupportedClaims: review.grounded
        ? [`Model draft was ${words} words, outside the ${MIN_COVER_LETTER_WORDS}-${MAX_COVER_LETTER_WORDS} range, so a template draft was used.`]
        : [
            "The model draft was replaced with a template because it was not fully grounded in your profile.",
            ...review.unsupportedClaims,
          ],
    };
  }

  return {
    body: letter,
    wordCount: words,
    generationMode: "llm",
    unsupportedClaims: [],
  };
}
