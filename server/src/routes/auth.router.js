import crypto from "crypto";
import { Router } from "express";
import {
  login,
  registerUser,
  refreshAccessToken,
  logoutUser,
  getCurrentUser,
} from "../controllers/user.controller.js";
import { validate } from "../middlewares/validate.js";
import { verifyJWT } from "../middlewares/auth.middle.js";
import {
  loginSchema,
  registerUserSchema,
  otpRegisterSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resendOtpSchema,
} from "../validation/user.validation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import redisService from "../services/redis.service.js";
import { sendOTPEmail, sendVerificationEmail, sendPasswordResetEmail } from "../email/emails.js";

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

    console.log('🔍 [send-otp] Request:', { email, mode });

    if (mode === 'reset_password') {
      const user = await User.findOne({ email });
      if (!user) {
        throw new ApiError(404, 'No account found with this email');
      }
    } else {
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.isVerified) {
        throw new ApiError(400, "Email is already registered and verified");
      }
    }

    await checkRateLimit(`otp:send:${req.ip}`, 5, 60);
    const otp = generateOtp();
    const purpose = mode === 'reset_password' ? 'reset' : mode === 'register' ? 'register' : 'login';
    await redisService.setVerificationCode(email, otp, 900, purpose);

    console.log('🔍 [send-otp] Stored OTP for:', { email, purpose });

    if (mode === 'reset_password') {
      await sendPasswordResetEmail(email, otp);
    } else {
      await sendOTPEmail(email, otp);
    }

    return res.status(200).json(
      new ApiResponse(200, { email, otpSent: true }, mode === 'reset_password' ? 'Password reset code sent successfully' : 'OTP sent successfully')
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
     const stored = await redisService.getVerificationCode(email, purpose);
     if (!stored || stored !== otp) {
       throw new ApiError(400, "Invalid or expired OTP");
     }

    let user = await User.findOne({ email });

    if (!user) {
      if (mode === 'reset_password') {
        throw new ApiError(404, 'No account found with this email');
      }
      if (!name) {
        throw new ApiError(404, 'No account found with this email. Please register first.');
      }
      if (mode === 'register' && !password) {
        throw new ApiError(400, 'Password is required for registration');
      }
      const { fullName, username } = normalizeName(name);
      user = await User.create({
        fullName,
        email,
        username,
        password: mode === 'register' ? password : crypto.randomInt(100000000, 999999999).toString(),
        isVerified: true,
      });
    } else if (!user.isVerified && mode === 'register') {
      if (!password) {
        throw new ApiError(400, 'Password is required for registration');
      }
      user.password = password;
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save({ validateBeforeSave: true });
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

    // For reset_password mode, user must exist
    if (mode === 'reset_password') {
      const existingUser = await User.findOne({ email });
      if (!existingUser) {
        throw new ApiError(404, 'No account found with this email');
      }
    } else {
      // For login/register modes, user may or may not exist
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.isVerified) {
        throw new ApiError(400, "Email is already registered and verified");
      }
    }

    await checkRateLimit(`otp:resend:${req.ip}`, 5, 60);
    const otp = generateOtp();
    const purpose = mode === 'reset_password' ? 'reset' : mode === 'register' ? 'register' : 'login';
    await redisService.setVerificationCode(email, otp, 900, purpose);

    if (mode === 'reset_password') {
      await sendPasswordResetEmail(email, otp);
    } else {
      await sendOTPEmail(email, otp);
    }

    return res.status(200).json(
      new ApiResponse(200, { email, otpSent: true }, mode === 'reset_password' ? 'Password reset code resent successfully' : 'OTP resent successfully')
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

    const existedUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existedUser) {
      if (existedUser.email === email) {
        throw new ApiError(409, "A user with this email already exists");
      }
      throw new ApiError(409, "User with email or username already exists");
    }

    const user = await User.create({
      fullName,
      email,
      password,
      username,
      isVerified: false,
    });

    const verificationCode = user.generateVerificationToken();
    await user.save({ validateBeforeSave: false });

    await redisService.setVerificationCode(email, verificationCode, 900, "verification");

    try {
      await sendVerificationEmail(email, verificationCode);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
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

// ============================================================
// POST /auth/logout
// ============================================================
router.post("/logout", verifyJWT, logoutUser);

// ============================================================
// POST /auth/refresh
// ============================================================
router.post("/refresh", refreshAccessToken);

export default router;
