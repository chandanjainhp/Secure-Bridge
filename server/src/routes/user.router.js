import { Router } from "express";
import {
  registerUser,
  login,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  verifyEmail,
  verifyResetCode,
  resendVerificationEmail,
  resetPassword,
  uploadAvatar,
} from "../controllers/user.controller.js";
import { validate } from "../middlewares/validate.js";
import {
  registerUserSchema,
  loginSchema,
  changeCurrentPasswordSchema,
  updateAccountDetailsSchema,
  verifyEmailSchema,
  resendVerificationEmailSchema,
  resetPasswordSchema,
} from "../validation/user.validation.js";
import { verifyJWT } from "../middlewares/auth.middle.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// --- Public routes (no auth) ---
router.post("/register", validate(registerUserSchema), registerUser);
router.post("/login", validate(loginSchema), login);
router.post("/refresh-token", refreshAccessToken);
router.post("/verify-email", validate(verifyEmailSchema), verifyEmail);
router.post("/verify-reset-code", validate(verifyEmailSchema), verifyResetCode);
router.post(
  "/resend-verification",
  validate(resendVerificationEmailSchema),
  resendVerificationEmail,
);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// --- Protected routes (require auth) ---
router.post("/logout", verifyJWT, logoutUser);
router.get("/me", verifyJWT, getCurrentUser);
router.patch(
  "/change-password",
  verifyJWT,
  validate(changeCurrentPasswordSchema),
  changeCurrentPassword,
);
router.patch(
  "/account",
  verifyJWT,
  validate(updateAccountDetailsSchema),
  updateAccountDetails,
);

// Aliases for frontend API compatibility
router.patch("/profile", verifyJWT, validate(updateAccountDetailsSchema), updateAccountDetails);
router.patch(
  "/password",
  verifyJWT,
  validate(changeCurrentPasswordSchema),
  changeCurrentPassword,
);
router.post("/avatar", verifyJWT, upload.single("avatar"), uploadAvatar);

export default router;
