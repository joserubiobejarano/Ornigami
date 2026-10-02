import { z } from "zod";

export const formLeadSourceSchema = z.enum(["hosted_form", "embed_form"]);

const businessSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid business slug format.");

const normalizedPhoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(40)
  .refine(
    (value) => /^\+?[0-9()\-\s.]{7,40}$/.test(value),
    "Invalid phone number format.",
  );

const optionalEmailSchema = z
  .string()
  .trim()
  .max(255)
  .transform((value) => value || undefined)
  .optional()
  .refine((value) => value === undefined || z.email().safeParse(value).success, {
    message: "Invalid email address.",
  });

export const submitFormSchema = z.object({
  businessSlug: businessSlugSchema,
  fullName: z.string().trim().min(2).max(200),
  email: optionalEmailSchema,
  phone: normalizedPhoneSchema,
  message: z.string().trim().min(5).max(4000),
  source: formLeadSourceSchema.default("hosted_form"),
  honeypot: z.string().max(200).optional().default(""),
  metadata: z.record(z.string(), z.unknown()).optional().refine(
    (value) => {
      if (!value) return true;
      return Object.keys(value).length <= 50;
    },
    {
      message: "Metadata cannot contain more than 50 keys.",
    },
  ),
});

export type SubmitFormInput = z.infer<typeof submitFormSchema>;
