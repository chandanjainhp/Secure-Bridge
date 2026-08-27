import { Router } from "express";
import { verifyJWTOrApiKey } from "../../../middlewares/apikey.middleware.js";
import ChatController from "../controllers/chat.controller.js";
import { validate } from "../../../middlewares/validate.js";
import { completionsSchema, getModelsSchema } from "../../../validation/chat.validation.js";

const router = Router();

// We'll remove the trackApiUsage middleware because we handle usage in the service
// router.use(trackApiUsage);

// ============================================================
// Protected routes (JWT or API key required)
// ============================================================

router.get("/test", ChatController.test);
router.get("/test-unauth", ChatController.testUnauth);
router.get("/health", ChatController.health);
router.post("/test-local", ChatController.testLocal);
router.post("/completions", verifyJWTOrApiKey("chat.access"), validate(completionsSchema), ChatController.completions);
router.post("/stream", verifyJWTOrApiKey("chat.access"), validate(completionsSchema), ChatController.completions);

router.get(
  "/providers",
  verifyJWTOrApiKey("chat.access"),
  ChatController.getProviders,
);

router.get(
  "/models",
  verifyJWTOrApiKey("chat.access"),
  validate(getModelsSchema),
  ChatController.getModels,
);


export default router;
