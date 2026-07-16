"use client";

import { Plus, Trash2, AlertTriangle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type {
  ParsedResume,
  Experience,
  Education,
  Certification,
  SkillGroup,
  ParseWarning,
} from "@/modules/resumes/schema/resume-schema";
import { newEntityId } from "@/lib/entity-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ParsedResumeReviewProps = {
  value: ParsedResume;
  onChange: Dispatch<SetStateAction<ParsedResume | null>>;
  normalizedText?: string;
  sourcePreviewUrl?: string | null;
  fileName?: string | null;
};

function getExperienceHeading(experience: Experience): string {
  if (experience.title && experience.company) {
    return `${experience.title} at ${experience.company}`;
  }

  return experience.title || experience.company || "Untitled experience";
}

function getExperienceDateLabel(experience: Experience): string | null {
  if (experience.startDateText && experience.endDateText) {
    return `${experience.startDateText} – ${experience.endDateText}`;
  }
  if (experience.startDateText) {
    return experience.isCurrent
      ? `${experience.startDateText} – Present`
      : experience.startDateText;
  }
  return null;
}

function FieldWarnings({
  warnings,
  fieldPath,
}: {
  warnings: ParseWarning[];
  fieldPath: string;
}) {
  const relevant = warnings.filter(
    (w) => w.fieldPath === fieldPath || w.fieldPath?.startsWith(fieldPath)
  );
  if (relevant.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1">
      {relevant.map((w, i) => (
        <li key={i} className="flex items-start gap-1 text-xs text-amber-600">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {w.message}
        </li>
      ))}
    </ul>
  );
}

export function ParsedResumeReview({
  value,
  onChange,
  normalizedText,
  sourcePreviewUrl,
  fileName,
}: ParsedResumeReviewProps) {
  function patchResume(update: (prev: ParsedResume) => ParsedResume) {
    onChange((prev) => (prev ? update(prev) : prev));
  }

  function updateContact(patch: Partial<ParsedResume["contact"]>) {
    patchResume((prev) => ({
      ...prev,
      contact: { ...prev.contact, ...patch },
    }));
  }

  function updateExperience(index: number, patch: Partial<Experience>) {
    patchResume((prev) => ({
      ...prev,
      experience: prev.experience.map((exp, i) =>
        i === index ? { ...exp, ...patch } : exp
      ),
    }));
  }

  function updateAchievement(expIndex: number, achIndex: number, text: string) {
    const exp = value.experience[expIndex];
    const achievements = [...exp.achievements];
    achievements[achIndex] = text;
    updateExperience(expIndex, { achievements });
  }

  return (
    <div className="space-y-4">
      {value.warnings.some((w) => !w.fieldPath) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 text-sm">
            <p className="mb-2 font-medium text-amber-800">Parser warnings</p>
            <ul className="space-y-1 text-amber-700">
              {value.warnings
                .filter((w) => !w.fieldPath)
                .map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personal information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input
              value={value.contact.fullName ?? ""}
              onChange={(e) => updateContact({ fullName: e.target.value || null })}
            />
            <FieldWarnings warnings={value.warnings} fieldPath="contact.fullName" />
          </div>
          <div>
            <Label>Headline</Label>
            <Input
              value={value.contact.headline ?? ""}
              onChange={(e) => updateContact({ headline: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={value.contact.email ?? ""}
              onChange={(e) => updateContact({ email: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={value.contact.phone ?? ""}
              onChange={(e) => updateContact({ phone: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={value.contact.location ?? ""}
              onChange={(e) => updateContact({ location: e.target.value || null })}
            />
          </div>
          <div>
            <Label>LinkedIn</Label>
            <Input
              value={value.contact.linkedInUrl ?? ""}
              onChange={(e) => updateContact({ linkedInUrl: e.target.value || null })}
            />
          </div>
          <div>
            <Label>GitHub</Label>
            <Input
              value={value.contact.githubUrl ?? ""}
              onChange={(e) => updateContact({ githubUrl: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Portfolio</Label>
            <Input
              value={value.contact.portfolioUrl ?? ""}
              onChange={(e) => updateContact({ portfolioUrl: e.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Professional summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={value.professionalSummary ?? ""}
            onChange={(e) =>
              patchResume((prev) => ({
                ...prev,
                professionalSummary: e.target.value || null,
              }))
            }
          />
          <FieldWarnings warnings={value.warnings} fieldPath="professionalSummary" />
        </CardContent>
      </Card>

      <SkillGroupsSection
        groups={value.skillGroups}
        warnings={value.warnings}
        onChange={(skillGroups) =>
          patchResume((prev) => ({ ...prev, skillGroups }))
        }
      />

      <ExperienceSection
        experience={value.experience}
        warnings={value.warnings}
        onChange={(experience) =>
          patchResume((prev) => ({ ...prev, experience }))
        }
        updateAchievement={updateAchievement}
        updateExperience={updateExperience}
      />

      <EducationSection
        education={value.education ?? []}
        onChange={(education) =>
          patchResume((prev) => ({ ...prev, education }))
        }
      />

      <CertificationsSection
        certifications={value.certifications ?? []}
        onChange={(certifications) =>
          patchResume((prev) => ({ ...prev, certifications }))
        }
      />

      {value.unclassified.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Unclassified content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              The parser could not confidently place this text. Assign or remove before approving.
            </p>
            {value.unclassified.map((line, i) => (
              <Textarea
                key={line.id}
                rows={2}
                value={line.text}
                onChange={(e) => {
                  patchResume((prev) => ({
                    ...prev,
                    unclassified: prev.unclassified.map((u, j) =>
                      j === i ? { ...u, text: e.target.value } : u
                    ),
                  }));
                }}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {(normalizedText || sourcePreviewUrl) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Source preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fileName && (
              <p className="text-sm text-muted-foreground">File: {fileName}</p>
            )}
            {sourcePreviewUrl && (
              <a
                href={sourcePreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Open original resume PDF
              </a>
            )}
            {normalizedText && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Normalized extracted text
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                  {normalizedText}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SkillGroupsSection({
  groups,
  warnings,
  onChange,
}: {
  groups: SkillGroup[];
  warnings: ParseWarning[];
  onChange: (groups: SkillGroup[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Skills</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...groups, { category: null, skills: [""] }])
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          Add category
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">No skill groups extracted.</p>
        )}
        {groups.map((group, gi) => (
          <div key={gi} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Category (e.g. Frontend)"
                value={group.category ?? ""}
                onChange={(e) => {
                  const next = [...groups];
                  next[gi] = { ...group, category: e.target.value || null };
                  onChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(groups.filter((_, i) => i !== gi))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <FieldWarnings warnings={warnings} fieldPath={`skillGroups.${gi}`} />
            {group.skills.map((skill, si) => (
              <div key={si} className="flex gap-2">
                <Input
                  value={skill}
                  onChange={(e) => {
                    const skills = [...group.skills];
                    skills[si] = e.target.value;
                    const next = [...groups];
                    next[gi] = { ...group, skills };
                    onChange(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const skills = group.skills.filter((_, i) => i !== si);
                    const next = [...groups];
                    next[gi] = { ...group, skills };
                    onChange(next);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = [...groups];
                next[gi] = { ...group, skills: [...group.skills, ""] };
                onChange(next);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add skill
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ExperienceSection({
  experience,
  warnings,
  onChange,
  updateExperience,
  updateAchievement,
}: {
  experience: Experience[];
  warnings: ParseWarning[];
  onChange: (experience: Experience[]) => void;
  updateExperience: (index: number, patch: Partial<Experience>) => void;
  updateAchievement: (expIndex: number, achIndex: number, text: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Work experience</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...experience,
              {
                id: newEntityId(),
                company: null,
                title: null,
                location: null,
                employmentType: null,
                startDateText: null,
                endDateText: null,
                startDate: null,
                endDate: null,
                isCurrent: false,
                achievements: [""],
                technologies: [],
                sourceEvidence: [],
              },
            ])
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          Add role
        </Button>
      </div>
      {experience.map((exp, expIndex) => (
        <Card key={exp.id}>
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <div>
              <CardTitle className="text-base">{getExperienceHeading(exp)}</CardTitle>
              {getExperienceDateLabel(exp) && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {getExperienceDateLabel(exp)}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(experience.filter((_, i) => i !== expIndex))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Company</Label>
                <Input
                  value={exp.company ?? ""}
                  onChange={(e) =>
                    updateExperience(expIndex, { company: e.target.value || null })
                  }
                />
              </div>
              <div>
                <Label>Job title</Label>
                <Input
                  value={exp.title ?? ""}
                  onChange={(e) =>
                    updateExperience(expIndex, { title: e.target.value || null })
                  }
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={exp.location ?? ""}
                  onChange={(e) =>
                    updateExperience(expIndex, { location: e.target.value || null })
                  }
                />
              </div>
              <div>
                <Label>Start date</Label>
                <Input
                  value={exp.startDateText ?? ""}
                  onChange={(e) =>
                    updateExperience(expIndex, { startDateText: e.target.value || null })
                  }
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  value={exp.endDateText ?? ""}
                  onChange={(e) =>
                    updateExperience(expIndex, { endDateText: e.target.value || null })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm pt-6">
                <input
                  type="checkbox"
                  checked={exp.isCurrent}
                  onChange={(e) =>
                    updateExperience(expIndex, { isCurrent: e.target.checked })
                  }
                />
                Current role
              </label>
            </div>
            <FieldWarnings
              warnings={warnings}
              fieldPath={`experience.${expIndex}`}
            />
            <div className="space-y-2">
              <Label>Achievements</Label>
              {exp.achievements.map((ach, achIndex) => (
                <div key={achIndex} className="flex gap-2">
                  <Textarea
                    rows={2}
                    value={ach}
                    onChange={(e) =>
                      updateAchievement(expIndex, achIndex, e.target.value)
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      updateExperience(expIndex, {
                        achievements: exp.achievements.filter((_, i) => i !== achIndex),
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateExperience(expIndex, {
                    achievements: [...exp.achievements, ""],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add achievement
              </Button>
            </div>
            <div>
              <Label>Technologies (comma-separated)</Label>
              <Input
                value={exp.technologies.join(", ")}
                onChange={(e) =>
                  updateExperience(expIndex, {
                    technologies: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EducationSection({
  education,
  onChange,
}: {
  education: Education[];
  onChange: (education: Education[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Education</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onChange([
              ...education,
              {
                id: newEntityId(),
                institution: null,
                qualification: null,
                fieldOfStudy: null,
                startDateText: null,
                endDateText: null,
                location: null,
              },
            ]);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {education.map((edu, i) => (
          <div key={edu.id} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(education.filter((_, index) => index !== i))}
                aria-label="Remove education entry"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Institution"
              value={edu.institution ?? ""}
              onChange={(e) => {
                const next = [...education];
                next[i] = { ...edu, institution: e.target.value || null };
                onChange(next);
              }}
            />
            <Input
              placeholder="Degree / qualification"
              value={edu.qualification ?? ""}
              onChange={(e) => {
                const next = [...education];
                next[i] = { ...edu, qualification: e.target.value || null };
                onChange(next);
              }}
            />
            <Input
              placeholder="Field of study"
              value={edu.fieldOfStudy ?? ""}
              onChange={(e) => {
                const next = [...education];
                next[i] = { ...edu, fieldOfStudy: e.target.value || null };
                onChange(next);
              }}
            />
            <Input
              placeholder="End date"
              value={edu.endDateText ?? ""}
              onChange={(e) => {
                const next = [...education];
                next[i] = { ...edu, endDateText: e.target.value || null };
                onChange(next);
              }}
            />
            </div>
          </div>
        ))}
        {education.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No education entries yet. Use Add to create one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CertificationsSection({
  certifications,
  onChange,
}: {
  certifications: Certification[];
  onChange: (certifications: Certification[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Certifications</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onChange([
              ...certifications,
              {
                id: newEntityId(),
                name: "",
                issuer: null,
                issuedDateText: null,
                expirationDateText: null,
                credentialId: null,
                credentialUrl: null,
                sourceEvidence: [],
              },
            ]);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {certifications.map((cert, i) => (
          <div key={cert.id} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(certifications.filter((_, index) => index !== i))}
                aria-label="Remove certification entry"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Certification name"
              value={cert.name}
              onChange={(e) => {
                const next = [...certifications];
                next[i] = { ...cert, name: e.target.value };
                onChange(next);
              }}
            />
            <Input
              placeholder="Issuer"
              value={cert.issuer ?? ""}
              onChange={(e) => {
                const next = [...certifications];
                next[i] = { ...cert, issuer: e.target.value || null };
                onChange(next);
              }}
            />
            <Input
              placeholder="Credential ID"
              value={cert.credentialId ?? ""}
              onChange={(e) => {
                const next = [...certifications];
                next[i] = { ...cert, credentialId: e.target.value || null };
                onChange(next);
              }}
            />
            <Input
              placeholder="Credential URL"
              value={cert.credentialUrl ?? ""}
              onChange={(e) => {
                const next = [...certifications];
                next[i] = { ...cert, credentialUrl: e.target.value || null };
                onChange(next);
              }}
            />
            </div>
          </div>
        ))}
        {certifications.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No certifications yet. Use Add to create one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
