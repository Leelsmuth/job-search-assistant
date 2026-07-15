export type JobWithRelations = {
  id: string;
  title: string;
  location: string | null;
  workplaceType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  jobUrl: string | null;
  description: string | null;
  technologies: unknown;
  isSaved: boolean;
  company: { name: string } | null;
  requirements: Array<{
    id: string;
    text: string;
    requirementType: string;
    normalizedSkill: string | null;
    importance: string | null;
  }>;
  matchAnalyses: Array<{
    id: string;
    overallScore: number;
    classification: string;
    summary: string | null;
    createdAt: Date;
    hardFilterResult: unknown;
    categoryScores: Array<{
      id: string;
      category: string;
      score: number;
      maxScore: number;
      explanation: string | null;
    }>;
    requirementMatches: Array<{
      id: string;
      matchStatus: string;
      explanation: string | null;
      confidence: number | null;
      evidenceId: string | null;
      requirement: {
        id: string;
        text: string;
        requirementType: string;
        importance: string | null;
      } | null;
      evidence: {
        id: string;
        evidenceText: string;
        sourceType: string;
      } | null;
    }>;
  }>;
};
