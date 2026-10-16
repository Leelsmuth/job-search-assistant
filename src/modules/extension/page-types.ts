import type { PageProvider } from "@/modules/extension/urls";

export type PageField = {
  key: string;
  name: string;
  id: string;
  tag: "input" | "textarea" | "select" | "button";
  type: string;
  label: string;
  required: boolean;
  options: Array<{ value: string; text: string }>;
  currentValue: string;
  /** react-select, intl-tel-input, or another listbox combobox. */
  control?: "combobox";
  /** Fieldset legend or group label, such as Phone around a country picker. */
  groupLabel?: string;
  /** Helper text, such as Greenhouse's city/province description. */
  description?: string;
};

export type PageSnapshot = {
  fields: PageField[];
  headings: string[];
  buttons: string[];
};

export type FillMode = "value" | "select" | "choice" | "file" | "combobox";

export type ComboboxMatch = "phoneCountry" | "workIntent" | "yesNo" | "place" | "text";

export type FillInstruction = {
  key: string;
  name: string;
  label: string;
  value: string;
  mode: FillMode;
  fileRole?: "resume" | "coverLetter";
  /** Typed into a combobox, in order, until an option matches. */
  queries?: string[];
  match?: ComboboxMatch;
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
