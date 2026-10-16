import { z } from "zod";

const citedStringSchema = z.object({
  value: z.string().nullable(),
  sourceLines: z.array(z.number()),
});

const citedListItemSchema = z.object({
  text: z.string(),
  sourceLines: z.array(z.number()),
});

const citedSkillSchema = z.object({
  name: z.string(),
  sourceLines: z.array(z.number()),
});

export const llmParsedResumeSchema = z.object({
  contact: z.object({
    fullName: citedStringSchema,
    headline: citedStringSchema,
    email: citedStringSchema,
    phone: citedStringSchema,
    location: citedStringSchema,
    linkedInUrl: citedStringSchema,
    githubUrl: citedStringSchema,
    portfolioUrl: citedStringSchema,
    otherLinks: z.array(
      z.object({
        label: z.string().nullable(),
        url: z.string(),
        sourceLines: z.array(z.number()),
      })
    ),
  }),
  professionalSummary: citedStringSchema,
  skillGroups: z.array(
    z.object({
      category: citedStringSchema,
      skills: z.array(citedSkillSchema),
    })
  ),
  experience: z.array(
    z.object({
      company: citedStringSchema,
      title: citedStringSchema,
      location: citedStringSchema,
      employmentType: citedStringSchema,
      startDateText: citedStringSchema,
      endDateText: citedStringSchema,
      isCurrent: z.boolean(),
      achievements: z.array(citedListItemSchema),
      technologies: z.array(citedSkillSchema),
    })
  ),
  education: z.array(
    z.object({
      institution: citedStringSchema,
      qualification: citedStringSchema,
      fieldOfStudy: citedStringSchema,
      startDateText: citedStringSchema,
      endDateText: citedStringSchema,
      location: citedStringSchema,
    })
  ),
  certifications: z.array(
    z.object({
      name: citedStringSchema,
      issuer: citedStringSchema,
      issuedDateText: citedStringSchema,
      expirationDateText: citedStringSchema,
      credentialId: citedStringSchema,
      credentialUrl: citedStringSchema,
    })
  ),
  projects: z.array(
    z.object({
      name: citedStringSchema,
      description: citedStringSchema,
      url: citedStringSchema,
      achievements: z.array(citedListItemSchema),
      technologies: z.array(citedSkillSchema),
    })
  ),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      fieldPath: z.string().nullable(),
    })
  ),
});

export type LlmParsedResume = z.infer<typeof llmParsedResumeSchema>;

type JsonSchema = Record<string, unknown>;

function zodToStrictJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToStrictJsonSchema(value);
      required.push(key);
    }
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }

  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToStrictJsonSchema(schema.element) };
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToStrictJsonSchema(schema.unwrap());
    if (typeof inner.type === "string") {
      return { type: [inner.type, "null"] };
    }
    return { anyOf: [inner, { type: "null" }] };
  }

  if (schema instanceof z.ZodOptional) return zodToStrictJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return zodToStrictJsonSchema(schema.removeDefault());
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodLiteral) {
    const value = schema.value;
    return { type: typeof value, enum: [value] };
  }

  throw new Error("Unsupported Zod type in strict resume schema");
}

export function buildStrictParsedResumeJsonSchema(): JsonSchema {
  return zodToStrictJsonSchema(llmParsedResumeSchema);
}
