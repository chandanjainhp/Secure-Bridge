import { z } from "zod";

const objectIdLike = z.string().trim().min(1, "ID is required").max(100);

const projectFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(""),
  model: z.string().trim().min(1).max(100).optional().default("local"),
  systemPrompt: z.string().trim().max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
};

export const createProjectSchema = z.object({
  body: z.object(projectFields).strict(),
});

export const updateProjectSchema = z.object({
  params: z.object({ projectId: objectIdLike }).strict(),
  body: z.object(projectFields).partial().strict().refine((value) => Object.keys(value).length > 0, {
    message: "At least one project field must be provided",
  }),
});

export const projectIdSchema = z.object({
  params: z.object({ projectId: objectIdLike }).strict(),
});

export const conversationIdSchema = z.object({
  params: z.object({ projectId: objectIdLike, conversationId: objectIdLike }).strict(),
});

export const createConversationSchema = z.object({
  params: z.object({ projectId: objectIdLike }).strict(),
  body: z.object({
    title: z.string().trim().min(1).max(200).optional().default("New Conversation"),
  }).strict(),
});

export const updateConversationSchema = z.object({
  params: z.object({ projectId: objectIdLike, conversationId: objectIdLike }).strict(),
  body: z.object({
    title: z.string().trim().min(1).max(200),
  }).strict(),
});

export const sendMessageSchema = z.object({
  params: z.object({ projectId: objectIdLike, conversationId: objectIdLike }).strict(),
  body: z.object({
    content: z.string().trim().min(1).max(32768),
    role: z.enum(["user", "assistant", "system"]).optional().default("user"),
  }).strict(),
});

export const fileIdSchema = z.object({
  params: z.object({ projectId: objectIdLike, fileId: objectIdLike }).strict(),
});
