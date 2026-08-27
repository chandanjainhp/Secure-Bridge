import { describe, expect, it } from "@jest/globals";
import { loginSchema, verifyOtpSchema } from "../validation/user.validation.js";
import { createProjectSchema, updateConversationSchema, sendMessageSchema } from "../validation/project.validation.js";
import { createApiKeySchema } from "../validation/apikey.validation.js";

describe("request validation", () => {
  it("requires an email or username for login", () => {
    expect(loginSchema.safeParse({ body: { password: "password123" } }).success).toBe(false);
  });

  it("rejects invalid OTPs", () => {
    expect(verifyOtpSchema.safeParse({ body: { email: "user@example.com", otp: "12", mode: "login" } }).success).toBe(false);
  });

  it("requires project name when creating a project", () => {
    expect(createProjectSchema.safeParse({ body: {} }).success).toBe(false);
  });

  it("requires conversation title on conversation updates", () => {
    expect(updateConversationSchema.safeParse({ params: { projectId: "p", conversationId: "c" }, body: {} }).success).toBe(false);
  });

  it("rejects oversized chat messages", () => {
    expect(sendMessageSchema.safeParse({ params: { projectId: "p", conversationId: "c" }, body: { content: "x".repeat(32769) } }).success).toBe(false);
  });

  it("restricts API key permissions to supported values", () => {
    expect(createApiKeySchema.safeParse({ body: { name: "test-key", permissions: ["admin.root"] } }).success).toBe(false);
  });
});
