import { asyncHandler } from "../../../utils/asyncHandler.js";
import { ApiError } from "../../../utils/ApiError.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { User } from "../../../models/user.model.js";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOTPEmail,
} from "../../../email/emails.js";
import crypto from "crypto";
import redisService from "../../../services/redis.service.js";
import { upload } from "../../../middlewares/multer.middleware.js";
import jwt from "jsonwebtoken";
import { setAuthCookies, clearAuthCookies, REFRESH_TOKEN_COOKIE } from "../../../utils/authCookies.js";

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
  } catch (emailError) {
    console.error("Failed to send verification email");
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
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to generate authentication tokens");
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
    throw new ApiError(401, "Invalid email/username or password");
  }

  if (!user.isVerified) {
    throw new ApiError(403, "Please verify your email before logging in");
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

  setAuthCookies(res, { accessToken, refreshToken }, rememberMe);

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

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in successfully",
      ),
    );
});

// ============================================================
// LOGOUT
// ============================================================
const logoutUser = asyncHandler(async (req, res) => {
  let userId = req.user?._id;
  if (!userId) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        userId = decoded?._id;
      } catch { /* Clear cookies even when the token is expired. */ }
    }
  }
  if (userId) await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
  clearAuthCookies(res);
  return res.status(200).json(new ApiResponse(200, {}, "User logged out successfully"));
});

// ============================================================
// REFRESH ACCESS TOKEN
// ============================================================
const refreshAccessToken = asyncHandler(async (req, res) => {
  // Token can come from Authorization header or request body
  const incomingRefreshToken =
    req.cookies?.[REFRESH_TOKEN_COOKIE] ||
    req.body?.refreshToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    let decodedToken;
    try {
      decodedToken = jwt.verify(
        incomingRefreshToken,
        process.env.JWT_REFRESH_SECRET,
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
      await generateAccessAndRefreshTokens(user._id, Boolean(decodedToken?.extendedSession));

    setAuthCookies(res, { accessToken, refreshToken: newRefreshToken });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
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
await user.save({ validateBeforeSave: false });

const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
setAuthCookies(res, { accessToken, refreshToken });

return res
    .status(200)
    .json(new ApiResponse(200, { accessToken, refreshToken }, "Password changed successfully"));
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

  const currentUser = await User.findById(req.user?._id);
  if (!currentUser) throw new ApiError(404, "User not found");

  if (email !== currentUser.email) {
    const existing = await User.findOne({ email, _id: { $ne: currentUser._id } }).select("_id");
    if (existing) throw new ApiError(409, "A user with this email already exists");
  }

  currentUser.fullName = fullName;
  currentUser.email = email;
  const user = await currentUser.save();
  user.password = undefined;
  user.refreshToken = undefined;

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
  } catch (emailError) {
    console.error("Failed to send welcome email");
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
    } else {
      await sendVerificationEmail(email, verificationCode);
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
  const { email, otp, newPassword } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.isVerified) {
    throw new ApiError(403, "Please verify your email first before resetting password");
  }

  const stored = await redisService.getVerificationCode(email, "reset");
  if (!stored || stored !== otp) {
    throw new ApiError(400, "Invalid or expired reset code");
  }

  user.password = newPassword;
  user.refreshToken = undefined;
  await user.save({ validateBeforeSave: false });
  await redisService.deleteVerificationCode(email, "reset");
  clearAuthCookies(res);

  return res.status(200).json(
    new ApiResponse(200, {}, "Password reset successfully. You can now login with your new password."),
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
  generateAccessAndRefreshTokens,
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
