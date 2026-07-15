import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const skillCategoryEnum = pgEnum("skill_category", [
  "language",
  "framework",
  "library",
  "testing",
  "platform",
  "architecture",
  "accessibility",
  "performance",
  "process",
  "domain",
]);

export const evidenceSourceTypeEnum = pgEnum("evidence_source_type", [
  "resume_bullet",
  "experience",
  "project",
  "education",
  "manual_profile_fact",
]);

export const jobSourceProviderEnum = pgEnum("job_source_provider", [
  "manual",
  "pasted_description",
  "greenhouse",
  "lever",
  "ashby",
  "generic_web",
]);

export const requirementTypeEnum = pgEnum("requirement_type", [
  "skill",
  "experience",
  "location",
  "authorization",
  "seniority",
  "education",
  "language",
  "clearance",
  "responsibility",
  "domain",
]);

export const matchClassificationEnum = pgEnum("match_classification", [
  "excellent",
  "strong",
  "possible",
  "stretch",
  "poor",
]);

export const matchCategoryEnum = pgEnum("match_category", [
  "core_skills",
  "frameworks_tools",
  "relevant_experience",
  "responsibility_alignment",
  "seniority_leadership",
  "location_work_arrangement",
  "education_domain",
]);

export const requirementMatchStatusEnum = pgEnum("requirement_match_status", [
  "confirmed",
  "transferable",
  "missing_evidence",
  "gap",
  "blocked",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "discovered",
  "reviewing",
  "saved",
  "preparing",
  "ready_to_apply",
  "applied",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
]);

export const tailoringDecisionEnum = pgEnum("tailoring_decision", [
  "pending",
  "accepted",
  "rejected",
]);

export const candidateProfiles = pgTable("candidate_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  displayName: text("display_name"),
  location: text("location"),
  workAuthorization: text("work_authorization"),
  targetTitles: jsonb("target_titles").$type<string[]>().default([]),
  preferredSeniority: text("preferred_seniority"),
  remotePreference: text("remote_preference"),
  preferredLocations: jsonb("preferred_locations").$type<string[]>().default([]),
  minimumSalary: integer("minimum_salary"),
  yearsExperience: integer("years_experience"),
  summary: text("summary"),
  dealBreakers: jsonb("deal_breakers").$type<string[]>().default([]),
  rawResumeText: text("raw_resume_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const candidateSkills = pgTable("candidate_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => candidateProfiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: skillCategoryEnum("category").notNull(),
  proficiency: text("proficiency"),
  yearsExperience: integer("years_experience"),
  evidenceLevel: text("evidence_level"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const candidateExperiences = pgTable("candidate_experiences", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => candidateProfiles.id, { onDelete: "cascade" }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  location: text("location"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const candidateExperienceBullets = pgTable("candidate_experience_bullets", {
  id: uuid("id").primaryKey().defaultRandom(),
  experienceId: uuid("experience_id")
    .notNull()
    .references(() => candidateExperiences.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  impact: text("impact"),
  skills: jsonb("skills").$type<string[]>().default([]),
  sourceResumeId: uuid("source_resume_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const candidateProjects = pgTable("candidate_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => candidateProfiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  skills: jsonb("skills").$type<string[]>().default([]),
  evidence: text("evidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const candidateEducation = pgTable("candidate_education", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => candidateProfiles.id, { onDelete: "cascade" }),
  institution: text("institution").notNull(),
  degree: text("degree"),
  field: text("field"),
  endDate: text("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const resumeDocuments = pgTable("resume_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  storagePath: text("storage_path"),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size"),
  extractedText: text("extracted_text"),
  parserVersion: text("parser_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const resumeVersions = pgTable("resume_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  resumeDocumentId: uuid("resume_document_id").references(() => resumeDocuments.id),
  name: text("name").notNull(),
  versionType: text("version_type").notNull().default("master"),
  contentText: text("content_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const profileEvidence = pgTable("profile_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => candidateProfiles.id, { onDelete: "cascade" }),
  sourceType: evidenceSourceTypeEnum("source_type").notNull(),
  sourceId: uuid("source_id"),
  evidenceText: text("evidence_text").notNull(),
  normalizedSkills: jsonb("normalized_skills").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website"),
  atsProvider: text("ats_provider"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const savedBoards = pgTable("saved_boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  companyName: text("company_name").notNull(),
  boardUrl: text("board_url").notNull(),
  provider: jobSourceProviderEnum("provider").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastPolledAt: timestamp("last_polled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobSources = pgTable("job_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: jobSourceProviderEnum("provider").notNull(),
  sourceUrl: text("source_url"),
  sourceJobId: text("source_job_id"),
  rawPayload: jsonb("raw_payload"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  sourceId: uuid("source_id").references(() => jobSources.id),
  title: text("title").notNull(),
  location: text("location"),
  workplaceType: text("workplace_type"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency").default("CAD"),
  jobUrl: text("job_url"),
  sourceJobId: text("source_job_id"),
  datePosted: timestamp("date_posted"),
  dateDiscovered: timestamp("date_discovered").defaultNow().notNull(),
  employmentType: text("employment_type"),
  description: text("description"),
  responsibilities: jsonb("responsibilities").$type<string[]>().default([]),
  requiredQualifications: jsonb("required_qualifications").$type<string[]>().default([]),
  preferredQualifications: jsonb("preferred_qualifications").$type<string[]>().default([]),
  technologies: jsonb("technologies").$type<string[]>().default([]),
  experienceRequirements: text("experience_requirements"),
  educationRequirements: text("education_requirements"),
  status: text("status").default("active"),
  isSaved: boolean("is_saved").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobRequirements = pgTable("job_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  requirementType: requirementTypeEnum("requirement_type").notNull(),
  text: text("text").notNull(),
  normalizedSkill: text("normalized_skill"),
  importance: text("importance").default("required"),
  isHardRequirement: boolean("is_hard_requirement").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const matchAnalyses = pgTable("match_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => candidateProfiles.id, { onDelete: "cascade" }),
  analysisVersion: text("analysis_version").notNull().default("v1"),
  overallScore: real("overall_score").notNull(),
  classification: matchClassificationEnum("classification").notNull(),
  hardFilterResult: jsonb("hard_filter_result").$type<{
    result: string;
    warnings: string[];
    blocks: string[];
  }>(),
  summary: text("summary"),
  topMatchingSkills: jsonb("top_matching_skills").$type<string[]>().default([]),
  topConcern: text("top_concern"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const matchCategoryScores = pgTable("match_category_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchAnalysisId: uuid("match_analysis_id")
    .notNull()
    .references(() => matchAnalyses.id, { onDelete: "cascade" }),
  category: matchCategoryEnum("category").notNull(),
  score: real("score").notNull(),
  maxScore: real("max_score").notNull(),
  explanation: text("explanation"),
});

export const requirementMatches = pgTable("requirement_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchAnalysisId: uuid("match_analysis_id")
    .notNull()
    .references(() => matchAnalyses.id, { onDelete: "cascade" }),
  jobRequirementId: uuid("job_requirement_id")
    .notNull()
    .references(() => jobRequirements.id, { onDelete: "cascade" }),
  matchStatus: requirementMatchStatusEnum("match_status").notNull(),
  confidence: real("confidence"),
  evidenceId: uuid("evidence_id").references(() => profileEvidence.id),
  explanation: text("explanation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  status: applicationStatusEnum("status").notNull().default("discovered"),
  dateSaved: timestamp("date_saved"),
  dateApplied: timestamp("date_applied"),
  resumeVersionId: uuid("resume_version_id").references(() => resumeVersions.id),
  notes: text("notes"),
  recruiterName: text("recruiter_name"),
  recruiterEmail: text("recruiter_email"),
  salary: integer("salary"),
  followUpDate: timestamp("follow_up_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const applicationEvents = pgTable("application_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  eventDate: timestamp("event_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const applicationAnswers = pgTable("application_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  draftAnswer: text("draft_answer"),
  finalAnswer: text("final_answer"),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().default([]),
  unsupportedClaims: jsonb("unsupported_claims").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tailoringSuggestions = pgTable("tailoring_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => candidateProfiles.id, { onDelete: "cascade" }),
  suggestionType: text("suggestion_type").notNull(),
  originalText: text("original_text"),
  suggestedText: text("suggested_text").notNull(),
  evidenceId: uuid("evidence_id").references(() => profileEvidence.id),
  bulletId: uuid("bullet_id"),
  confidence: real("confidence"),
  decision: tailoringDecisionEnum("decision").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  taskType: text("task_type").notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model"),
  inputHash: text("input_hash"),
  inputSummary: text("input_summary"),
  output: jsonb("output"),
  status: text("status").notNull().default("completed"),
  error: text("error"),
  tokenInputCount: integer("token_input_count"),
  tokenOutputCount: integer("token_output_count"),
  costEstimate: real("cost_estimate"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const candidateProfilesRelations = relations(candidateProfiles, ({ many }) => ({
  skills: many(candidateSkills),
  experiences: many(candidateExperiences),
  projects: many(candidateProjects),
  education: many(candidateEducation),
  evidence: many(profileEvidence),
}));

export const candidateSkillsRelations = relations(candidateSkills, ({ one }) => ({
  profile: one(candidateProfiles, {
    fields: [candidateSkills.profileId],
    references: [candidateProfiles.id],
  }),
}));

export const candidateExperiencesRelations = relations(candidateExperiences, ({ many, one }) => ({
  profile: one(candidateProfiles, {
    fields: [candidateExperiences.profileId],
    references: [candidateProfiles.id],
  }),
  bullets: many(candidateExperienceBullets),
}));

export const candidateExperienceBulletsRelations = relations(
  candidateExperienceBullets,
  ({ one }) => ({
    experience: one(candidateExperiences, {
      fields: [candidateExperienceBullets.experienceId],
      references: [candidateExperiences.id],
    }),
  })
);

export const candidateProjectsRelations = relations(candidateProjects, ({ one }) => ({
  profile: one(candidateProfiles, {
    fields: [candidateProjects.profileId],
    references: [candidateProfiles.id],
  }),
}));

export const candidateEducationRelations = relations(candidateEducation, ({ one }) => ({
  profile: one(candidateProfiles, {
    fields: [candidateEducation.profileId],
    references: [candidateProfiles.id],
  }),
}));

export const profileEvidenceRelations = relations(profileEvidence, ({ one }) => ({
  profile: one(candidateProfiles, {
    fields: [profileEvidence.profileId],
    references: [candidateProfiles.id],
  }),
}));

export const jobRequirementsRelations = relations(jobRequirements, ({ one }) => ({
  job: one(jobs, {
    fields: [jobRequirements.jobId],
    references: [jobs.id],
  }),
}));

export const matchCategoryScoresRelations = relations(matchCategoryScores, ({ one }) => ({
  analysis: one(matchAnalyses, {
    fields: [matchCategoryScores.matchAnalysisId],
    references: [matchAnalyses.id],
  }),
}));

export const applicationEventsRelations = relations(applicationEvents, ({ one }) => ({
  application: one(applications, {
    fields: [applicationEvents.applicationId],
    references: [applications.id],
  }),
}));

export const applicationAnswersRelations = relations(applicationAnswers, ({ one }) => ({
  application: one(applications, {
    fields: [applicationAnswers.applicationId],
    references: [applications.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, { fields: [jobs.companyId], references: [companies.id] }),
  source: one(jobSources, { fields: [jobs.sourceId], references: [jobSources.id] }),
  requirements: many(jobRequirements),
  matchAnalyses: many(matchAnalyses),
  applications: many(applications),
}));

export const requirementMatchesRelations = relations(requirementMatches, ({ one }) => ({
  analysis: one(matchAnalyses, {
    fields: [requirementMatches.matchAnalysisId],
    references: [matchAnalyses.id],
  }),
  requirement: one(jobRequirements, {
    fields: [requirementMatches.jobRequirementId],
    references: [jobRequirements.id],
  }),
  evidence: one(profileEvidence, {
    fields: [requirementMatches.evidenceId],
    references: [profileEvidence.id],
  }),
}));

export const matchAnalysesRelations = relations(matchAnalyses, ({ one, many }) => ({
  job: one(jobs, { fields: [matchAnalyses.jobId], references: [jobs.id] }),
  profile: one(candidateProfiles, {
    fields: [matchAnalyses.profileId],
    references: [candidateProfiles.id],
  }),
  categoryScores: many(matchCategoryScores),
  requirementMatches: many(requirementMatches),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
  events: many(applicationEvents),
  answers: many(applicationAnswers),
}));

export const tailoringSuggestionsRelations = relations(tailoringSuggestions, ({ one }) => ({
  evidence: one(profileEvidence, {
    fields: [tailoringSuggestions.evidenceId],
    references: [profileEvidence.id],
  }),
  job: one(jobs, {
    fields: [tailoringSuggestions.jobId],
    references: [jobs.id],
  }),
  profile: one(candidateProfiles, {
    fields: [tailoringSuggestions.profileId],
    references: [candidateProfiles.id],
  }),
}));
