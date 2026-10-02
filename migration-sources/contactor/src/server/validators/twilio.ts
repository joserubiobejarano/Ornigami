import { z } from "zod";

const twilioAddressSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) =>
      value.toLowerCase().startsWith("whatsapp:+") || /^\+?[0-9]{7,20}$/.test(value),
    "Invalid Twilio address format.",
  );

export const twilioInboundSchema = z.object({
  MessageSid: z.string().min(1).optional(),
  AccountSid: z.string().min(1).optional(),
  From: twilioAddressSchema,
  To: twilioAddressSchema,
  Body: z.string().max(4000).default(""),
  ProfileName: z.string().optional(),
  WaId: z.string().optional(),
}).passthrough();

export const twilioStatusSchema = z.object({
  MessageSid: z.string().min(1),
  MessageStatus: z.string().min(1),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
  To: z.string().optional(),
  From: z.string().optional(),
}).passthrough();

export type TwilioInboundInput = z.infer<typeof twilioInboundSchema>;
export type TwilioStatusInput = z.infer<typeof twilioStatusSchema>;
