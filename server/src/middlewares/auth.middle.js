import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ACCESS_TOKEN_COOKIE } from "../utils/authCookies.js";

const extractAccessToken = req => req.cookies?.[ACCESS_TOKEN_COOKIE] || (req.header("Authorization")?.startsWith("Bearer ") ? req.header("Authorization").slice(7).trim() : null);

export const verifyJWT = asyncHandler(async (req, _res, next) => {
  const token = extractAccessToken(req);
  if (!token) throw new ApiError(401, "Unauthorized request");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded?._id).select("-password -refreshToken");
    if (!user) throw new ApiError(401, "Invalid access token");
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, error?.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token');
  }
});
