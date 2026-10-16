import type { PageProvider } from "@/modules/extension/urls";

export type PageField = {
  key: string;
  name: string;
  id: string;
  tag: "input" | "textarea" | "select";
  type: string;
  label: string;
  required: boolean;
  options: Array<{ value: string; text: string }>;
  currentValue: string;
};

export type PageSnapshot = {
  fields: PageField[];
  headings: string[];
  buttons: string[];
};

export type FillMode = "value" | "select" | "choice" | "file";

export type FillInstruction = {
  key: string;
  name: string;
  label: string;
  value: string;
  mode: FillMode;
  fileRole?: "resume" | "coverLetter";
};

export type AttentionItem = {
  key: string;
  label: string;
  reason: string;
};

export type PageFillPlan = {
  provider: PageProvider;
  reviewStep: boolean;
  reviewNote: string | null;
  fills: FillInstruction[];
  attention: AttentionItem[];
  ignoredControls: string[];
};

export type PreparedFillAnswer = {
  label: string;
  answer: string;
};

export type ExtensionDocuments = {
  resume: boolean;
  coverLetter: boolean;
  coverLetterBody: string | null;
};
