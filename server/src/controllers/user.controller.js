import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOTPEmail,
} from "../email/emails.js";
import crypto from "crypto";
import redisService from "../services/redis.service.js";
import { upload } from "../middlewares/multer.middleware.js";

// ============================================================
// REGISTER USER
// ============================================================
const registerUser = asyncHandler(async (req, res) => {
  // Body is already validated + transformed by Zod middleware
  const { fullName, email, username, password } = req.body;

  // Check if user already exists with same username or email
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    if (existedUser.email === email && existedUser.username === username) {
      throw new ApiError(
        409,
        "A user with this email and username already exists. Please use different email and username.",
      );
    } else if (existedUser.email === email) {
      throw new ApiError(
        409,
        "A user with this email already exists. Please use a different email address or try logging in.",
      );
    } else if (existedUser.username === username) {
      throw new ApiError(
        409,
        "This username is already taken. Please choose a different username.",
      );
    } else {
      throw new ApiError(409, "User with email or username already exists");
    }
  }

  // Create user object and save to database
  const user = await User.create({
    fullName,
    email,
    password,
    username: username.toLowerCase(),
    isVerified: false,
  });

  // Generate verification token and send email
  const verificationCode = user.generateVerificationToken();
  await user.save({ validateBeforeSave: false });

  await redisService.setVerificationCode(email, verificationCode, 900, "verification");

  try {
    await sendVerificationEmail(email, verificationCode);
    console.log(`Verification email sent to ${email}`);
  } catch (emailError) {
    console.error("Failed to send verification email:", emailError);
  }

  // Remove password and refresh token from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken -verificationToken -verificationTokenExpires",
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        createdUser,
        "User registered successfully. Please check your email for verification code.",
      ),
    );
});

// ============================================================
// TOKEN GENERATION HELPER
// ============================================================
async function generateAccessAndRefreshTokens(userId, extendedSession = false) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User not found while generating tokens");
    }

    const accessToken = user.generateAccessToken(extendedSession);
    const refreshToken = user.generateRefreshToken(extendedSession);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token",
    );
  }
}

// ============================================================
// LOGIN
// ============================================================
const login = asyncHandler(async (req, res) => {
  const { email, username, password, rememberMe } = req.body;

  // Rate limiting check (10 login attempts per minute per IP)
  const ipAddress = req.ip || req.socket?.remoteAddress;
  const rateLimit = await redisService.incrementRateLimit(
    `login:${ipAddress}`,
    60,
  );
  if (rateLimit.count > 10) {
    throw new ApiError(
      429,
      "Too many login attempts. Please try again in a minute.",
    );
  }

  // Find the user by username or email
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    const identifier = email ? `email "${email}"` : `username "${username}"`;
    throw new ApiError(
      404,
      `No account found with ${identifier}. Please check your credentials or register a new account.`,
    );
  }

  // Check if user's email is verified (skip in development mode)
  if (!user.isVerified && process.env.NODE_ENV !== "development") {
    throw new ApiError(
      403,
      `Your email (${user.email}) is not verified yet. Please check your email for the verification code and verify your account before logging in.`,
    );
  }
  if (!user.isVerified && process.env.NODE_ENV === "development") {
    console.log(
      "⚠️ Development Mode: Allowing login for unverified user:",
      user.email,
    );
  }

  // Validate the provided password
  const passwordValid = await user.isPasswordCorrect(password);
  if (!passwordValid) {
    throw new ApiError(
      401,
      "Incorrect password. Please check your password and try again.",
    );
  }

  // Generate access and refresh tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id,
    rememberMe,
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  await redisService.setSession(
    user._id.toString(),
    {
      userId: user._id,
      email: user.email,
      username: user.username,
      lastLogin: new Date().toISOString(),
    },
    3600,
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser },
        "User logged in successfully",
      ),
    );
});

// ============================================================
// LOGOUT
// ============================================================
const logoutUser = asyncHandler(async (req, res) => {
  // Use $unset to actually remove the refresh token (not $set: undefined)
  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { refreshToken: 1 } },
    { new: true },
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

// ============================================================
// REFRESH ACCESS TOKEN
// ============================================================
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    let decodedToken;
    try {
      decodedToken = jwt.verify(
        incomingRefreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET,
      );
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw new ApiError(
          401,
          "Refresh token has expired. Please log in again.",
        );
      }
      throw new ApiError(401, "Invalid refresh token");
    }

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {},
          "Access token refreshed successfully",
        ),
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Invalid refresh token");
  }
});

// ============================================================
// CHANGE CURRENT PASSWORD
// ============================================================
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);

  // Defensive: check if user exists (prevents TypeError on null)
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

user.password = newPassword;
user.refreshToken = null; // Invalidate existing refresh tokens for security
await user.save({ validateBeforeSave: false });

return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

// ============================================================
// GET CURRENT USER
// ============================================================
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

// ============================================================
// UPDATE ACCOUNT DETAILS
// ============================================================
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { fullName, email } },
    { new: true },
  ).select("-password");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

// ============================================================
// VERIFY EMAIL
// ============================================================
const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isVerified) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Email is already verified"));
  }

  if (user.verificationToken !== otp) {
    throw new ApiError(400, "Invalid verification code");
  }

  if (user.verificationTokenExpires < new Date()) {
    throw new ApiError(400, "Verification code has expired");
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save({ validateBeforeSave: false });

  try {
    await sendWelcomeEmail(user.email, user.fullName);
    console.log(`Welcome email sent to ${user.email}`);
  } catch (emailError) {
    console.error("Failed to send welcome email:", emailError);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Email verified successfully"));
});

// ============================================================
// RESEND VERIFICATION EMAIL
// ============================================================
const resendVerificationEmail = asyncHandler(async (req, res) => {
  const { email, purpose } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (purpose !== "reset" && user.isVerified) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Email is already verified"));
  }

  // Generate new verification token with 15-minute expiration
  const verificationCode = user.generateVerificationToken();
  await user.save({ validateBeforeSave: false });

  await redisService.setVerificationCode(email, verificationCode, 900, purpose === "reset" ? "reset" : "verification");

  try {
    if (purpose === "reset") {
      await sendPasswordResetEmail(email, verificationCode);
      console.log(`Password reset email sent to ${email}`);
    } else {
      await sendVerificationEmail(email, verificationCode);
      console.log(`New verification email sent to ${email}`);
    }
  } catch (emailError) {
    console.error("Failed to send email:", emailError);
    throw new ApiError(500, "Failed to send email");
  }

  const message =
    purpose === "reset"
      ? "Password reset code sent successfully. Check your email."
      : "Verification email sent successfully";

  return res.status(200).json(new ApiResponse(200, {}, message));
});

// ============================================================
// VERIFY PASSWORD RESET CODE
// ============================================================
const verifyResetCode = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const stored = await redisService.getVerificationCode(email, "reset");
  if (!stored || stored !== otp) {
    throw new ApiError(400, "Invalid or expired reset code");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Reset code verified successfully"));
});

// ============================================================
// RESET PASSWORD (forgot-password flow)
// ============================================================
const resetPassword = asyncHandler(async (req, res) => {
  console.log('🔍 [resetPassword] Request received:', {
    body: req.body,
    ip: req.ip
  });

  const { email, otp, newPassword } = req.body;

  console.log('🔍 [resetPassword] Parsed body:', { email, otp, newPassword });

  const user = await User.findOne({ email: email.toLowerCase() });
  console.log('🔍 [resetPassword] User found:', !!user);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.isVerified) {
    throw new ApiError(
      403,
      "Please verify your email first before resetting password",
    );
  }

  const stored = await redisService.getVerificationCode(email, "reset");
  console.log('🔍 [resetPassword] Redis check result:', {
    email,
    otp,
    stored,
    match: stored === otp,
    typeOfStored: typeof stored,
    typeOfOtp: typeof otp
  });

  if (!stored || stored !== otp) {
    console.error('❌ [resetPassword] OTP mismatch or not found');
    throw new ApiError(400, "Invalid or expired reset code");
  }

user.password = newPassword;
user.refreshToken = null; // Invalidate existing refresh tokens for security
await user.save({ validateBeforeSave: false });

await redisService.deleteVerificationCode(email, "reset");

console.log('✅ [resetPassword] Password reset successful for:', email);

return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        "Password reset successfully. You can now login with your new password.",
      ),
    );
});

// ============================================================
// UPLOAD AVATAR
// ============================================================
const uploadAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user?._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const avatarUrl = `/temp/${req.file.filename}`;
  user.avatarUrl = avatarUrl;
  await user.save({ validateBeforeSave: false });

  const updatedUser = await User.findById(user._id).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Avatar uploaded successfully"));
});

export {
  registerUser,
  login,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  verifyEmail,
  resendVerificationEmail,
  verifyResetCode,
  resetPassword,
  uploadAvatar,
};
