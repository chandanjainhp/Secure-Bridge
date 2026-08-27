import { Router } from "express";
import ApiKeyController from "../controllers/apiKey.controller.js";
import { validate } from "../../../middlewares/validate.js";
import { verifyJWT } from "../../../middlewares/auth.middle.js";
import {
  getAllApiKeysSchema,
  createApiKeySchema,
  updateApiKeySchema,
  testApiKeySchema,
  getUsageAnalyticsSchema,
  validateExternalKeyFormatSchema,
  testExternalKeyConnectivitySchema,
  bulkUpdateApiKeysSchema,
  exportApiKeysSchema,
  keyIdParam,
} from "../../../validation/apikey.validation.js";

const router = Router();

// --- Public routes (no auth) ---
router.post(
  "/validate-key-format",
  validate(validateExternalKeyFormatSchema),
  ApiKeyController.validateExternalKeyFormat,
);

// --- Protected routes (require auth) ---
router.get(
  "/",
  verifyJWT,
  validate(getAllApiKeysSchema),
  ApiKeyController.getAllApiKeys,
);
router.get(
  "/export",
  verifyJWT,
  validate(exportApiKeysSchema),
  ApiKeyController.exportApiKeys,
);
router.get("/usage-summary", verifyJWT, ApiKeyController.getUsageSummary);
router.post(
  "/bulk-update",
  verifyJWT,
  validate(bulkUpdateApiKeysSchema),
  ApiKeyController.bulkUpdateApiKeys,
);
router.post(
  "/test-connectivity",
  verifyJWT,
  validate(testExternalKeyConnectivitySchema),
  ApiKeyController.testExternalKeyConnectivity,
);

router.post(
  "/",
  verifyJWT,
  validate(createApiKeySchema),
  ApiKeyController.createApiKey,
);

router.get(
  "/:keyId",
  verifyJWT,
  validate(keyIdParam),
  ApiKeyController.getApiKeyDetails,
);
router.delete(
  "/:keyId",
  verifyJWT,
  validate(keyIdParam),
  ApiKeyController.deleteApiKey,
);
router.patch(
  "/:keyId",
  verifyJWT,
  validate(updateApiKeySchema),
  ApiKeyController.updateApiKey,
);
router.post(
  "/:keyId/regenerate",
  verifyJWT,
  validate(keyIdParam),
  ApiKeyController.regenerateApiKey,
);
router.post(
  "/:keyId/revoke",
  verifyJWT,
  validate(keyIdParam),
  ApiKeyController.revokeApiKey,
);
router.post(
  "/:keyId/test",
  verifyJWT,
  validate(testApiKeySchema),
  ApiKeyController.testApiKey,
);
router.get(
  "/:keyId/analytics",
  verifyJWT,
  validate(getUsageAnalyticsSchema),
  ApiKeyController.getUsageAnalytics,
);


export default router;
