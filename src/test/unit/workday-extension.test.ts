// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultApplicationProfile } from "@/modules/apply/profile";
import type { ApplicationProfile } from "@/modules/apply/types";
import { detectWorkdayStep } from "@/modules/extension/workday/detect";
import { fillWorkdayStep } from "@/modules/extension/workday/fill";
import { parseMonthYear, workdayHistoryFromCandidate } from "@/modules/extension/workday/history";
import {
  markStepFilled,
  parseStoredSession,
  shouldAutoFillStep,
  workdayRequisitionKey,
} from "@/modules/extension/workday/session";
import { emptyWorkdayHistory, workdayStatusMessage, type WorkdayFillInput, type WorkdayHistory } from "@/modules/extension/workday/types";
import { watchWorkdayPage } from "@/modules/extension/workday/watch";
import { clickWorkdayControl, showWorkdayToast } from "@/modules/extension/workday/widgets";

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "src/test/fixtures/extension", name), "utf8");
}

let navClicks = 0;
let harness = new AbortController();

beforeEach(() => {
  harness.abort();
  harness = new AbortController();
  navClicks = 0;
  document.body.innerHTML = "";
  document.getElementById("jsa-workday-toast")?.remove();
  document.getElementById("jsa-attention-style")?.remove();
  document.getElementById("jsa-workday-toast-style")?.remove();
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement)) return;
  const id = button.getAttribute("data-automation-id") ?? "";
  const label = button.textContent ?? "";
  if (/next|submit|signin|createaccount/i.test(id) || /save and continue|^next$|^submit$|sign in|create account/i.test(label)) {
    navClicks += 1;
  }
});

function mount(name: string) {
  document.body.innerHTML = fixture(name);
}

function listen(type: string, handler: EventListener) {
  document.addEventListener(type, handler, { signal: harness.signal });
}

function profile(): ApplicationProfile {
  return {
    ...defaultApplicationProfile(),
    legalName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "416-555-0100",
    city: "Toronto",
    province: "ON",
    linkedinUrl: "https://www.linkedin.com/in/ada",
    workAuthorization: "Canadian citizen",
    requiresSponsorship: false,
    willingToRelocate: false,
    eeoGender: "Prefer not to say",
    savedAnswers: [{ id: "clearance", question: "Do you hold an active security clearance?", answer: "No" }],
  };
}

function fillInput(history: WorkdayHistory = emptyWorkdayHistory(), extra: Partial<WorkdayFillInput> = {}): WorkdayFillInput {
  return {
    profile: profile(),
    preparedAnswers: [{ label: "Why do you want this role?", answer: "I have shipped design systems." }],
    history,
    coverLetterBody: null,
    resume: null,
    ...extra,
  };
}

function installListboxes() {
  listen("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button[aria-haspopup='listbox']");
    if (button instanceof HTMLButtonElement) {
      const popup = document.getElementById(button.getAttribute("aria-controls") ?? "");
      if (popup) popup.hidden = false;
      return;
    }
    const option = target.closest("[role='option']");
    if (!(option instanceof HTMLElement)) return;
    let owner: Element | null = null;
    let node: Element | null = option;
    while (node && !owner) {
      if (node.id) {
        const escaped = node.id.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
        owner = document.querySelector(`button[aria-controls="${escaped}"]`);
      }
      node = node.parentElement;
    }
    if (owner) owner.textContent = option.textContent?.trim() ?? "";
    const popup = option.closest("[data-automation-id='responsiveMonikerPrompt'], [role='listbox']");
    if (popup instanceof HTMLElement) popup.hidden = true;
  });
  listen("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const popup = input.closest("[data-automation-id='responsiveMonikerPrompt']");
    if (!popup) return;
    const query = input.value.trim().toLowerCase();
    for (const option of popup.querySelectorAll("[role='option']")) {
      if (!(option instanceof HTMLElement)) continue;
      const text = option.textContent?.toLowerCase() ?? "";
      option.hidden = Boolean(query) && !text.includes(query);
    }
  });
}

function addPill(value: string) {
  const list = document.querySelector("[data-automation-id='selectedItemList']");
  const skill = value.trim();
  if (!list || !skill) return;
  const exists = [...list.querySelectorAll("[data-automation-id='selectedItem']")].some(
    (item) => item.textContent?.trim().toLowerCase() === skill.toLowerCase()
  );
  if (exists) return;
  const item = document.createElement("li");
  item.setAttribute("data-automation-id", "selectedItem");
  item.textContent = skill;
  list.append(item);
}

function installSkills(mode: "enter" | "click") {
  const list = document.querySelector("#skill-list");
  listen("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.getAttribute("data-automation-id") !== "searchBox") return;
    if (!(list instanceof HTMLElement)) return;
    list.hidden = false;
    const query = input.value.trim().toLowerCase();
    for (const option of list.querySelectorAll("[role='option']")) {
      if (!(option instanceof HTMLElement)) continue;
      option.hidden = Boolean(query) && !(option.textContent ?? "").toLowerCase().includes(query);
    }
  });
  listen("keydown", (event) => {
    if (mode !== "enter" || !(event instanceof KeyboardEvent) || event.key !== "Enter") return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    addPill(input.value);
    input.value = "";
    if (list instanceof HTMLElement) list.hidden = true;
  });
  listen("click", (event) => {
    if (mode !== "click") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const option = target.closest("#skill-list [role='option']");
    if (!(option instanceof HTMLElement)) return;
    addPill(option.textContent ?? "");
    if (list instanceof HTMLElement) list.hidden = true;
  });
}

function workPanel(index: number): string {
  return `<div data-automation-id="workExperience-${index}">
    <label for="title-${index}">Job Title</label>
    <input id="title-${index}" data-automation-id="jobTitle" />
    <label for="company-${index}">Company</label>
    <input id="company-${index}" data-automation-id="company" />
    <label for="loc-${index}">Location</label>
    <input id="loc-${index}" data-automation-id="location" />
    <label for="current-${index}">I currently work here</label>
    <input id="current-${index}" type="checkbox" data-automation-id="currentlyWorkHere" />
    <div data-automation-id="formField-startDate">
      <label>From</label>
      <input data-automation-id="dateSectionMonth-input" role="spinbutton" aria-label="Month" />
      <input data-automation-id="dateSectionYear-input" role="spinbutton" aria-label="Year" />
    </div>
    <div data-automation-id="formField-endDate">
      <label>To</label>
      <input data-automation-id="dateSectionMonth-input" role="spinbutton" aria-label="Month" />
      <input data-automation-id="dateSectionYear-input" role="spinbutton" aria-label="Year" />
    </div>
    <label for="desc-${index}">Role Description</label>
    <textarea id="desc-${index}" data-automation-id="roleDescription"></textarea>
  </div>`;
}

function educationPanel(index: number): string {
  return `<div data-automation-id="education-${index}">
    <label for="school-${index}">School</label>
    <input id="school-${index}" data-automation-id="school" />
    <label for="degree-${index}">Degree</label>
    <input id="degree-${index}" data-automation-id="degree" />
    <label for="field-${index}">Field of Study</label>
    <input id="field-${index}" data-automation-id="fieldOfStudy" />
    <div data-automation-id="formField-startDate">
      <label>From</label>
      <input data-automation-id="dateSectionMonth-input" role="spinbutton" aria-label="Month" />
      <input data-automation-id="dateSectionYear-input" role="spinbutton" aria-label="Year" />
    </div>
    <div data-automation-id="formField-endDate">
      <label>To</label>
      <input data-automation-id="dateSectionMonth-input" role="spinbutton" aria-label="Month" />
      <input data-automation-id="dateSectionYear-input" role="spinbutton" aria-label="Year" />
    </div>
  </div>`;
}

function installRepeaters() {
  listen("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-automation-id='add-button']");
    if (!(button instanceof HTMLElement)) return;
    const section = button.closest("[data-automation-id='workExperienceSection'], [data-automation-id='educationSection']");
    if (!(section instanceof HTMLElement)) return;
    const experience = section.getAttribute("data-automation-id") === "workExperienceSection";
    const index = section.querySelectorAll(experience ? "[data-automation-id^='workExperience-']" : "[data-automation-id^='education-']").length + 1;
    section.insertAdjacentHTML("beforeend", experience ? workPanel(index) : educationPanel(index));
  });
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function checked(label: string): string | null {
  const group = [...document.querySelectorAll("[role='radiogroup']")].find((element) =>
    (element.getAttribute("aria-labelledby") ?? "") &&
    document.getElementById(element.getAttribute("aria-labelledby") ?? "")?.textContent?.includes(label)
  );
  const selected = group?.querySelector("[aria-checked='true']");
  return selected?.textContent?.trim() ?? null;
}

describe("Workday step detection and session", () => {
  it("keys a session by the job requisition and ignores the apply wizard suffix", () => {
    const posted = "https://rbc.wd3.myworkdayjobs.com/en-US/RBCGLOBAL1/job/Toronto/Engineer_R-100";
    const applying = "https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/Toronto/Engineer_R-100/apply/applyManually?source=referral";
    expect(workdayRequisitionKey(posted)).toBe(workdayRequisitionKey(applying));
    expect(workdayRequisitionKey("https://td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers/job/Toronto/Analyst_R-9/apply")).toBe(
      "https://td.wd3.myworkdayjobs.com/td_bank_careers/job/toronto/analyst_r-9"
    );
  });

  it("fills a step once unless more controls appear", () => {
    let session = parseStoredSession("job", null);
    expect(shouldAutoFillStep(session, "myInformation", 4)).toBe(true);
    expect(shouldAutoFillStep(session, "review", 4)).toBe(false);
    expect(shouldAutoFillStep(session, "signIn", 2)).toBe(false);
    session = markStepFilled(session, "myExperience", {
      controlCount: 6,
      experienceAdded: 2,
      educationAdded: 1,
      skills: ["TypeScript"],
    });
    expect(shouldAutoFillStep(session, "myExperience", 6)).toBe(false);
    expect(shouldAutoFillStep(session, "myExperience", 9)).toBe(true);
    const stored = parseStoredSession("job", session);
    expect(stored.filled.myExperience?.experienceAdded).toBe(2);
  });

  it("maps candidate history into experience, education, and skills", () => {
    expect(parseMonthYear("2019-04")).toEqual({ month: "04", year: "2019" });
    expect(parseMonthYear("March 2020")).toEqual({ month: "03", year: "2020" });
    expect(parseMonthYear("Present")).toBeNull();
    const history = workdayHistoryFromCandidate({
      experiences: [
        {
          title: "Engineer",
          company: "Old Co",
          startDate: "2018-01",
          endDate: "2020-06",
          description: "",
          bullets: [{ text: "Did a thing" }],
        },
        { title: "Staff Engineer", company: "New Co", startDate: "2021-03", endDate: null, description: "Lead" },
      ],
      education: [{ institution: "University of Toronto", degree: "BSc", field: "Computer Science", startDate: "2014-09", endDate: "2018-06" }],
      skills: [{ name: "TypeScript" }, { name: "typescript" }, { name: "React" }],
    });
    expect(history.experiences.map((item) => item.title)).toEqual(["Staff Engineer", "Engineer"]);
    expect(history.experiences[0].current).toBe(true);
    expect(history.experiences[1].description).toBe("Did a thing");
    expect(history.education[0].school).toBe("University of Toronto");
    expect(history.skills).toEqual(["TypeScript", "React"]);
  });

  it("detects wizard steps from the progress bar and debounces step changes", async () => {
    mount("workday-wizard.html");
    const seen: string[] = [];
    const stop = watchWorkdayPage(document, (step) => seen.push(step.id), { debounceMs: 0 });
    try {
      await flush();
      expect(seen).toEqual(["myInformation"]);
      const title = document.querySelector(".title");
      const heading = document.querySelector("[data-automation-id='applyFlowPageTitle']");
      if (title) title.textContent = "My Experience";
      if (heading) heading.textContent = "My Experience";
      if (title) title.textContent = "Application Questions";
      if (heading) heading.textContent = "Application Questions";
      await flush();
      expect(seen).toEqual(["myInformation", "applicationQuestions"]);
      const note = document.getElementById("note");
      if (note) note.textContent = "still the same step";
      await flush();
      expect(seen).toEqual(["myInformation", "applicationQuestions"]);
      document.body.append(document.createElement("input"));
      await flush();
      expect(seen).toEqual(["myInformation", "applicationQuestions", "applicationQuestions"]);
      if (title) title.textContent = "Review";
      if (heading) heading.textContent = "Review";
      history.pushState({}, "", "/apply/applyManually");
      await flush();
      expect(seen.at(-1)).toBe("review");
      const before = seen.length;
      history.pushState({}, "", "/apply");
      await flush();
      expect(seen.length).toBe(before);
    } finally {
      stop();
    }
  });

  it("recognizes every standard Workday step title", () => {
    mount("workday-wizard.html");
    const cases = [
      ["My Information", "myInformation"],
      ["My Experience", "myExperience"],
      ["Application Questions", "applicationQuestions"],
      ["Voluntary Disclosures", "voluntaryDisclosures"],
      ["Self Identify", "selfIdentify"],
      ["Review", "review"],
    ] as const;
    for (const [title, id] of cases) {
      const active = document.querySelector(".title");
      const heading = document.querySelector("[data-automation-id='applyFlowPageTitle']");
      if (active) active.textContent = title;
      if (heading) heading.textContent = title;
      expect(detectWorkdayStep(document).id).toBe(id);
    }
    document.body.innerHTML = `<h1>Create Account</h1><input type="password" /><button type="button">Create Account</button>`;
    expect(detectWorkdayStep(document).id).toBe("createAccount");
  });
});

describe("Workday widgets", () => {
  it("refuses Next, Submit, and account buttons, and allows Add", () => {
    document.body.innerHTML = [
      `<button type="button" id="next" data-automation-id="bottom-navigation-next-button"><span id="next-label">Save and Continue</span></button>`,
      `<button type="button" id="add" data-automation-id="add-button">Add</button>`,
    ].join("");
    const nextLabel = document.getElementById("next-label");
    const add = document.getElementById("add");
    expect(nextLabel).toBeInstanceOf(HTMLElement);
    expect(add).toBeInstanceOf(HTMLElement);
    expect(clickWorkdayControl(nextLabel as HTMLElement)).toBe(false);
    expect(clickWorkdayControl(add as HTMLElement)).toBe(true);
    expect(navClicks).toBe(0);
  });

  it("opens a listbox, types to filter, and chooses the matching option", async () => {
    mount("workday-dropdown.html");
    installListboxes();
    const first = document.getElementById("legalNameSection_firstName");
    const events: string[] = [];
    first?.addEventListener("input", () => events.push("input"));
    first?.addEventListener("change", () => events.push("change"));
    first?.addEventListener("blur", () => events.push("blur"));
    const result = await fillWorkdayStep(document, fillInput());
    expect(events).toEqual(["input", "change", "blur"]);
    expect((document.getElementById("legalNameSection_firstName") as HTMLInputElement).value).toBe("Ada");
    expect((document.getElementById("legalNameSection_lastName") as HTMLInputElement).value).toBe("Lovelace");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("ada@example.com");
    expect((document.getElementById("phone-number") as HTMLInputElement).value).toBe("416-555-0100");
    expect((document.getElementById("addressSection_city") as HTMLInputElement).value).toBe("Toronto");
    expect(document.querySelector("[data-automation-id='countryDropdown']")?.textContent).toBe("Canada");
    expect(document.querySelector("[data-automation-id='addressSection_countryRegion']")?.textContent).toBe("Ontario");
    expect(document.querySelector("[data-automation-id='phone-device-type']")?.textContent).toBe("Mobile");
    expect((document.getElementById("addressSection_postalCode") as HTMLInputElement).value).toBe("");
    expect(document.getElementById("addressSection_postalCode")?.classList.contains("jsa-needs-attention")).toBe(true);
    expect(document.getElementById("addressSection_addressLine1")?.classList.contains("jsa-needs-attention")).toBe(true);
    expect(result.message).toBe("My Information filled, 2 fields need you");
    expect(result.step.id).toBe("myInformation");
    expect(navClicks).toBe(0);
    expect(workdayStatusMessage("My Information", 2)).toBe(result.message);
  });

  it("adds skills from the multiselect prompt with Enter, then by clicking a result", async () => {
    const history: WorkdayHistory = {
      ...emptyWorkdayHistory(),
      skills: ["TypeScript", "React"],
    };
    mount("workday-multiselect.html");
    installSkills("enter");
    const first = await fillWorkdayStep(document, fillInput(history));
    const pills = () => [...document.querySelectorAll("[data-automation-id='selectedItem']")].map((item) => item.textContent);
    expect(pills()).toEqual(["TypeScript", "React"]);
    expect(first.skillsAdded).toEqual(["TypeScript", "React"]);
    const second = await fillWorkdayStep(document, fillInput(history));
    expect(pills()).toEqual(["TypeScript", "React"]);
    expect(second.skillsAdded).toEqual([]);
    expect(navClicks).toBe(0);

    mount("workday-multiselect.html");
    installSkills("click");
    const clicked = await fillWorkdayStep(document, fillInput(history));
    expect(pills()).toEqual(["TypeScript", "React"]);
    expect(clicked.skillsAdded).toEqual(["TypeScript", "React"]);
    expect(navClicks).toBe(0);
  });

  it("writes month and year spinbuttons and does not click Add when the block exists", async () => {
    mount("workday-dates.html");
    let adds = 0;
    listen("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-automation-id='add-button']")) adds += 1;
    });
    const month = document.querySelector("[data-automation-id='formField-startDate'] [aria-label='Month']");
    const events: string[] = [];
    month?.addEventListener("input", () => events.push("input"));
    month?.addEventListener("change", () => events.push("change"));
    month?.addEventListener("blur", () => events.push("blur"));
    await fillWorkdayStep(
      document,
      fillInput({
        ...emptyWorkdayHistory(),
        experiences: [
          {
            title: "Engineer",
            company: "Old Co",
            location: "Ottawa",
            startDate: "2019-04",
            endDate: "2021-11",
            current: false,
            description: "Shipped the portal",
          },
        ],
      })
    );
    const start = document.querySelector("[data-automation-id='formField-startDate']");
    const end = document.querySelector("[data-automation-id='formField-endDate']");
    expect((start?.querySelector("[aria-label='Month']") as HTMLInputElement).value).toBe("04");
    expect((start?.querySelector("[aria-label='Year']") as HTMLInputElement).value).toBe("2019");
    expect((end?.querySelector("[aria-label='Month']") as HTMLInputElement).value).toBe("11");
    expect((end?.querySelector("[aria-label='Year']") as HTMLInputElement).value).toBe("2021");
    expect(events).toEqual(["input", "change", "blur"]);
    expect((document.getElementById("current") as HTMLInputElement).checked).toBe(false);
    expect(adds).toBe(0);
    expect(navClicks).toBe(0);
  });

  it("adds one repeater block per profile entry and does not add them again", async () => {
    mount("workday-repeater.html");
    installRepeaters();
    installSkills("enter");
    const history: WorkdayHistory = {
      experiences: [
        {
          title: "Staff Engineer",
          company: "New Co",
          location: "Toronto",
          startDate: "2021-03",
          endDate: "",
          current: true,
          description: "Lead the design system",
        },
        {
          title: "Engineer",
          company: "Old Co",
          location: "Ottawa",
          startDate: "2018-01",
          endDate: "2020-06",
          current: false,
          description: "Built the portal",
        },
      ],
      education: [
        {
          school: "University of Toronto",
          degree: "BSc",
          field: "Computer Science",
          location: "",
          startDate: "2014-09",
          endDate: "2018-06",
        },
      ],
      skills: ["TypeScript"],
    };
    const first = await fillWorkdayStep(document, fillInput(history, { resume: { filename: "resume.pdf", bytes: [1, 2, 3] } }));
    expect(first.experienceAdded).toBe(2);
    expect(first.educationAdded).toBe(1);
    expect(document.querySelectorAll("[data-automation-id^='workExperience-']")).toHaveLength(2);
    expect((document.getElementById("title-1") as HTMLInputElement).value).toBe("Staff Engineer");
    expect((document.getElementById("company-1") as HTMLInputElement).value).toBe("New Co");
    expect((document.getElementById("loc-1") as HTMLInputElement).value).toBe("Toronto");
    expect((document.getElementById("current-1") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("desc-1") as HTMLTextAreaElement).value).toBe("Lead the design system");
    const currentStart = document.querySelector("[data-automation-id='workExperience-1'] [data-automation-id='formField-startDate']");
    expect((currentStart?.querySelector("[aria-label='Month']") as HTMLInputElement).value).toBe("03");
    expect((currentStart?.querySelector("[aria-label='Year']") as HTMLInputElement).value).toBe("2021");
    const currentEnd = document.querySelector("[data-automation-id='workExperience-1'] [data-automation-id='formField-endDate'] [aria-label='Year']") as HTMLInputElement;
    expect(currentEnd.value).toBe("");
    expect((document.getElementById("title-2") as HTMLInputElement).value).toBe("Engineer");
    const pastEnd = document.querySelector("[data-automation-id='workExperience-2'] [data-automation-id='formField-endDate']");
    expect((pastEnd?.querySelector("[aria-label='Month']") as HTMLInputElement).value).toBe("06");
    expect((pastEnd?.querySelector("[aria-label='Year']") as HTMLInputElement).value).toBe("2020");
    expect((document.getElementById("current-2") as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("school-1") as HTMLInputElement).value).toBe("University of Toronto");
    expect((document.getElementById("degree-1") as HTMLInputElement).value).toBe("BSc");
    expect((document.getElementById("field-1") as HTMLInputElement).value).toBe("Computer Science");
    expect(document.querySelector("[data-automation-id='selectedItem']")?.textContent).toBe("TypeScript");
    expect((document.getElementById("resume") as HTMLInputElement).files?.length).toBe(1);
    expect(first.filled.some((item) => item.label === "Resume" && item.value === "resume.pdf")).toBe(true);

    const second = await fillWorkdayStep(document, fillInput(history, { resume: { filename: "resume.pdf", bytes: [1, 2, 3] } }));
    expect(second.experienceAdded).toBe(0);
    expect(second.educationAdded).toBe(0);
    expect(document.querySelectorAll("[data-automation-id^='workExperience-']")).toHaveLength(2);
    expect(document.querySelectorAll("[data-automation-id^='education-']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-automation-id='selectedItem']")).toHaveLength(1);
    expect(navClicks).toBe(0);
  });

  it("maps standard questions and leaves unknown ones blank", async () => {
    mount("workday-questions.html");
    const result = await fillWorkdayStep(document, fillInput());
    expect(checked("authorized to work")).toBe("Yes");
    expect(checked("sponsorship")).toBe("No");
    expect(checked("security clearance")).toBe("No");
    expect(checked("favorite color")).toBeNull();
    expect((document.getElementById("whyRole") as HTMLTextAreaElement).value).toBe("I have shipped design systems.");
    expect(document.querySelector("[data-automation-id='formField-color']")?.classList.contains("jsa-needs-attention")).toBe(true);
    expect(result.attention.some((item) => /favorite color/i.test(item.label))).toBe(true);
    expect(result.message).toBe("Application Questions filled, 1 field needs you");
    expect(navClicks).toBe(0);
  });

  it("fills voluntary disclosures from the profile and highlights an unknown question", async () => {
    mount("workday-voluntary.html");
    const result = await fillWorkdayStep(document, fillInput());
    expect(checked("Gender")).toBe("Prefer not to say");
    expect(checked("staffing agency")).toBeNull();
    expect(document.querySelector("[data-automation-id='formField-agency']")?.classList.contains("jsa-needs-attention")).toBe(true);
    expect(result.step.id).toBe("voluntaryDisclosures");
    expect(navClicks).toBe(0);
  });

  it("does not fill or submit a review step", async () => {
    mount("workday-review.html");
    const result = await fillWorkdayStep(document, fillInput());
    expect(result.blocked).toBe(true);
    expect(result.filled).toEqual([]);
    expect(result.message).toMatch(/will not submit/i);
    expect((document.getElementById("legalNameSection_firstName") as HTMLInputElement).value).toBe("");
    expect(navClicks).toBe(0);
    showWorkdayToast(document, result.message);
    expect(document.getElementById("jsa-workday-toast")?.textContent).toMatch(/will not submit/i);
  });

  it("does not enter a password or create an account", async () => {
    mount("workday-signin.html");
    const result = await fillWorkdayStep(document, fillInput());
    expect(result.blocked).toBe(true);
    expect(result.step.id).toBe("signIn");
    expect((document.getElementById("password") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("userName") as HTMLInputElement).value).toBe("");
    expect(result.message).toMatch(/does not enter passwords or create accounts/i);
    expect(navClicks).toBe(0);
  });

  it("fills the simple information page and highlights an unanswered experience question", async () => {
    mount("workday-information.html");
    const information = await fillWorkdayStep(document, fillInput());
    expect(information.step.id).toBe("myInformation");
    expect((document.getElementById("legalNameSection_firstName") as HTMLInputElement).value).toBe("Ada");
    expect((document.getElementById("region") as HTMLInputElement).value).toBe("Ontario");
    expect((document.getElementById("city") as HTMLInputElement).value).toBe("Toronto");
    expect(navClicks).toBe(0);

    mount("workday-experience.html");
    const experience = await fillWorkdayStep(document, fillInput(emptyWorkdayHistory(), { resume: { filename: "resume.pdf", bytes: [4, 5] } }));
    expect(experience.step.id).toBe("myExperience");
    expect((document.getElementById("resume") as HTMLInputElement).files?.length).toBe(1);
    expect((document.getElementById("years") as HTMLInputElement).value).toBe("");
    expect(document.getElementById("years")?.classList.contains("jsa-needs-attention")).toBe(true);
    expect(navClicks).toBe(0);
  });
});
