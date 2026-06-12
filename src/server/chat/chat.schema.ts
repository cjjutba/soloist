import { z } from "zod";

/** A single chat message body cap — plain text, trimmed, non-empty (v1: no attachments/markdown). */
export const MESSAGE_MAX = 4000;

export const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Type a message first.")
    .max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX.toLocaleString()} characters.`),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
