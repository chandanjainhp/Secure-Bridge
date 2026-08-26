import { Router } from "express";
import FHEController, {
  ensureFHEInitialized,
  ensureAIInitialized,
} from "../controllers/fhe.controller.js";
import { validate } from "../middlewares/validate.js";
import {
  verifyJWTOrApiKey,
  trackApiUsage,
} from "../middlewares/apikey.middleware.js";
import {
  encryptSchema,
  decryptSchema,
  computeSchema,
  aiChatSchema,
  computeWithAiSchema,
} from "../validation/fhe.validation.js";

const router = Router();

// Apply API usage tracking to all routes
router.use(trackApiUsage);

// ============================================================
// Public routes (no auth — status check only)
// ============================================================

router.get("/status", FHEController.getStatus);

// ============================================================
// Protected routes — FHE only (require fhe.* permissions)
// ============================================================

router.post(
  "/encrypt",
  verifyJWTOrApiKey("fhe.encrypt"),
  ensureFHEInitialized,
  validate(encryptSchema),
  FHEController.encrypt,
);

router.post(
  "/decrypt",
  verifyJWTOrApiKey("fhe.decrypt"),
  ensureFHEInitialized,
  validate(decryptSchema),
  FHEController.decrypt,
);

router.post(
  "/compute",
  verifyJWTOrApiKey("fhe.compute"),
  ensureFHEInitialized,
  validate(computeSchema),
  FHEController.compute,
);

router.get(
  "/capabilities",
  ensureFHEInitialized,
  FHEController.getCapabilities,
);

// ============================================================
// Protected routes — FHE + AI (require both fhe + ai permissions)
// ============================================================

router.post(
  "/ai-chat",
  verifyJWTOrApiKey("fhe.ai_chat"),
  ensureFHEInitialized,
  ensureAIInitialized,
  validate(aiChatSchema),
  FHEController.aiChat,
);

router.post(
  "/compute-with-ai",
  verifyJWTOrApiKey("fhe.compute", "fhe.ai_chat"),
  ensureFHEInitialized,
  ensureAIInitialized,
  validate(computeWithAiSchema),
  FHEController.computeWithAi,
);

export default router;
