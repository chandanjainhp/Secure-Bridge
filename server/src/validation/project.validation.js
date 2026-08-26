import { z } from "zod";

const projectFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(""),
  model: z.string().trim().max(100).optional().default("local"),
};

export const createProjectSchema = z.object({
  body: z.object(projectFields),
});

export const updateProjectSchema = z.object({
  params: z.object({ projectId: z.string().trim().min(1) }),
  body: z.object(projectFields).partial().refine((value) => Object.keys(value).length > 0),
});

export const projectIdSchema = z.object({
  params: z.object({ projectId: z.string().trim().min(1) }),
});
