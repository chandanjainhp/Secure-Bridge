import crypto from "crypto";
import { Router } from "express";
import {
  login,

  registerUser,
  refreshAccessToken,
  logoutUser,
  getCurrentUser,
  uploadAvatar,
  resetPassword,
  resendVerificationEmail,
  verifyResetCode,
  verifyEmail,
  updateAccountDetails,
  changeCurrentPassword,
} from "../controllers/auth.controller.js";
import { validate } from "../../../middlewares/validate.js";
import { verifyJWT } from "../../../middlewares/auth.middle.js";
import {
  loginSchema,
  otpRegisterSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resendOtpSchema,
  resetPasswordSchema,
  resendVerificationEmailSchema,
  verifyEmailSchema,
  updateAccountDetailsSchema,
  changeCurrentPasswordSchema,
} from "../../../validation/user.validation.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { ApiError } from "../../../utils/ApiError.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { User } from "../../../models/user.model.js";
import jwt from "jsonwebtoken";
import redisService from "../../../services/redis.service.js";
import { sendOTPEmail, sendVerificationEmail, sendPasswordResetEmail } from "../../../email/emails.js";
import { setAuthCookies } from "../../../utils/authCookies.js";
import { upload } from "../../../middlewares/multer.middleware.js";

const router = Router();

// ============================================================
// Helper: normalize frontend name into backend fields
// ============================================================
const normalizeName = (name = "") => {
  const trimmed = name.trim();
  const [first = "", ...rest] = trimmed.split(" ");
  const fullName = trimmed || "User";
  const username = `${first.toLowerCase()}${Date.now().toString().slice(-6)}`;
  return { fullName, username };
};

const generateOtp = () => crypto.randomInt(100000, 999999).toString().padStart(6, "0");

const checkRateLimit = async (key, limit = 5, windowSeconds = 60) => {
  const result = await redisService.incrementRateLimit(key, windowSeconds);
  if (result.count > limit) {
    throw new ApiError(429, "Too many requests. Please try again later.");
  }
};

// ============================================================
// Helper: generate tokens
// ============================================================
async function generateAccessAndRefreshTokens(userId, extendedSession = false) {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found while generating tokens");
  }

  const accessToken = user.generateAccessToken(extendedSession);
  const refreshToken = user.generateRefreshToken(extendedSession);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
}

// ============================================================
// POST /auth/send-otp
// ============================================================
router.post(
  "/send-otp",
  validate(sendOtpSchema),
  asyncHandler(async (req, res) => {
    const { email, mode } = req.body;
    
    // Normalize email for consistent Redis key
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (mode === 'reset_password') {
      if (!existingUser) throw new ApiError(404, 'No account found with this email');
      if (!existingUser.isVerified) throw new ApiError(403, 'Please verify your email before resetting your password');
    } else if (mode === 'login') {
      if (!existingUser) throw new ApiError(404, 'No account found with this email');
      if (!existingUser.isVerified) throw new ApiError(403, 'Please verify your email before logging in');
    } else if (existingUser && existingUser.isVerified) {
      throw new ApiError(400, 'Email is already registered and verified');
    }

    await checkRateLimit(`otp:send:${req.ip}`, 5, 60);
    const otp = generateOtp();
    const purpose = mode === 'reset_password' ? 'reset' : mode === 'register' ? 'register' : 'login';
    await redisService.setVerificationCode(normalizedEmail, otp, 900, purpose);

    if (mode === 'reset_password') {
      await sendPasswordResetEmail(normalizedEmail, otp);
    } else {
      await sendOTPEmail(normalizedEmail, otp);
    }

    return res.status(200).json(
      new ApiResponse(200, { email: normalizedEmail, otpSent: true }, mode === 'reset_password' ? 'Password reset code sent successfully' : 'OTP sent successfully')
    );
  })
);

// ============================================================
// POST /auth/verify-otp
// ============================================================
router.post(
  "/verify-otp",
  validate(verifyOtpSchema),
asyncHandler(async (req, res) => {
     const { email, otp, name, mode, password } = req.body;
     const purpose = mode === 'reset_password' ? 'reset' : mode === 'register' ? 'register' : 'login';
     
     // Normalize email for consistent Redis key lookup
     const normalizedEmail = email.trim().toLowerCase();
     const normalizedOtp = String(otp).trim();
     
     const stored = await redisService.getVerificationCode(normalizedEmail, purpose);
     const storedOtp = stored ? String(stored).trim() : null;
     
     if (!storedOtp || normalizedOtp !== storedOtp) {
       throw new ApiError(400, "Invalid or expired OTP");
     }

    // Delete the OTP after successful verification to prevent replay attacks
    await redisService.deleteVerificationCode(normalizedEmail, purpose);

    let user = await User.findOne({ email: normalizedEmail });

    if (mode === 'register') {
      if (!user) {
        throw new ApiError(404, 'Registration session not found. Please start registration again.');
      }
      if (user.isVerified) {
        throw new ApiError(400, 'Email is already verified. Please log in.');
      }
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save({ validateBeforeSave: false });
    } else if (!user) {
      throw new ApiError(404, 'No account found with this email');
    } else if (!user.isVerified && mode !== 'reset_password') {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save({ validateBeforeSave: false });
    }

    if (mode === 'reset_password') {
      return res.status(200).json(
        new ApiResponse(200, {}, 'Reset code verified successfully')
      );
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
    setAuthCookies(res, { accessToken, refreshToken });

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    return res
      .status(200)
      .json(
        new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "OTP verified successfully")
      );
  })
);

// ============================================================
// POST /auth/resend-otp
// ============================================================
router.post(
  "/resend-otp",
  validate(resendOtpSchema),
  asyncHandler(async (req, res) => {
    const { email, mode } = req.body;
    
    // Normalize email for consistent Redis key
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (mode === 'reset_password') {
      if (!existingUser) throw new ApiError(404, 'No account found with this email');
      if (!existingUser.isVerified) throw new ApiError(403, 'Please verify your email before resetting your password');
    } else if (mode === 'login') {
      if (!existingUser) throw new ApiError(404, 'No account found with this email');
      if (!existingUser.isVerified) throw new ApiError(403, 'Please verify your email before logging in');
    } else if (existingUser && existingUser.isVerified) {
      throw new ApiError(400, 'Email is already registered and verified');
    }

    await checkRateLimit(`otp:resend:${req.ip}`, 5, 60);
    const otp = generateOtp();
    const purpose = mode === 'reset_password' ? 'reset' : mode === 'register' ? 'register' : 'login';
    await redisService.setVerificationCode(normalizedEmail, otp, 900, purpose);

    if (mode === 'reset_password') {
      await sendPasswordResetEmail(normalizedEmail, otp);
    } else {
      await sendOTPEmail(normalizedEmail, otp);
    }

    return res.status(200).json(
      new ApiResponse(200, { email: normalizedEmail, otpSent: true }, mode === 'reset_password' ? 'Password reset code resent successfully' : 'OTP resent successfully')
    );
  })
);

// ============================================================
// POST /auth/register
// ============================================================
router.post(
  "/register",
  validate(otpRegisterSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const { fullName, username } = normalizeName(name);

    // Normalize email to ensure consistent Redis key
    const normalizedEmail = email.trim().toLowerCase();

    const existedUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username }],
    });

    if (existedUser) {
      if (existedUser.email === normalizedEmail) {
        throw new ApiError(409, "A user with this email already exists");
      }
      throw new ApiError(409, "User with email or username already exists");
    }

    const user = await User.create({
      fullName,
      email: normalizedEmail,
      password,
      username,
      isVerified: false,
    });

    const verificationCode = generateOtp();
    await redisService.setVerificationCode(normalizedEmail, verificationCode, 900, 'register');

    try {
      await sendOTPEmail(email, verificationCode);
    } catch (emailError) {
      // Do not expose SMTP details to the client. The account remains pending verification.
      console.error('Registration OTP delivery failed:', emailError.message);
    }

    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken -verificationToken -verificationTokenExpires"
    );

    return res.status(201).json(
      new ApiResponse(201, createdUser, "User registered successfully. Please verify your email.")
    );
  })
);

// ============================================================
// POST /auth/login
// ============================================================
router.post("/login", validate(loginSchema), login);

// ============================================================
// GET /auth/me
// ============================================================
router.get("/me", verifyJWT, getCurrentUser);
router.patch("/change-password", verifyJWT, validate(changeCurrentPasswordSchema), changeCurrentPassword);
router.patch("/account", verifyJWT, validate(updateAccountDetailsSchema), updateAccountDetails);
router.post("/avatar", verifyJWT, upload.single("avatar"), uploadAvatar);
router.post("/verify-email", validate(verifyEmailSchema), verifyEmail);
router.post("/verify-reset-code", validate(verifyEmailSchema), verifyResetCode);
router.post("/resend-verification", validate(resendVerificationEmailSchema), resendVerificationEmail);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);


// ============================================================
// POST /auth/logout
// ============================================================
router.post("/logout", logoutUser);

// ============================================================
// POST /auth/refresh
// ============================================================
router.post("/refresh", refreshAccessToken);

export default router;
