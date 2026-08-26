import { Router } from "express";
import { verifyJWTOrApiKey } from "../middlewares/apikey.middleware.js";
import ChatController from "../controllers/chat.controller.js";

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

router.get(
  "/providers",
  verifyJWTOrApiKey("chat.access"),
  ChatController.getProviders,
);

router.get(
  "/models",
  verifyJWTOrApiKey("chat.access"),
  // validate(getModelsSchema), // We don't have the validation schema imported, but we'll keep it if needed
  ChatController.getModels,
);

// Development-only routes
if (process.env.NODE_ENV === "development") {
  router.post("/create-demo-key", ChatController.createDemoKey);
  router.get("/get-demo-key", ChatController.getDemoKey);
}

export default router;
