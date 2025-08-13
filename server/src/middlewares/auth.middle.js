
// Import necessary utilities and dependencies
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js"; // Import User model

// JWT Verification Middleware
// This middleware authenticates users by verifying their JWT tokens
// It runs before protected routes to ensure only authenticated users can access them
export const verifyJWT = asyncHandler(async (req, _res, next) => {
    try {
        // STEP 1: Extract token from cookies or Authorization header
        // Check two possible locations for the JWT token:
        // 1. req.cookies.accessToken - for web browsers that store tokens in cookies
        // 2. req.header("Authorization") - for mobile apps/APIs that send tokens in headers
        
        const token = req.cookies?.accessToken || 
                     req.header("Authorization")?.replace("Bearer ", "");

        // STEP 2: Check if token exists
        // If no token is found in either location, user is not authenticated
        if (!token) {
            throw new ApiError(401, "Unauthorized request");
        }

        // STEP 3: Verify the JWT token
        // Use jwt.verify() to decode and validate the token
        // This checks if the token is valid and not expired
        // FIXED: Store the decoded token result in a variable
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        // STEP 4: Find user from decoded token
        // Extract user ID from the decoded token and fetch user from database
        // Exclude password and refreshToken from the response for security
        // FIXED: Changed "findbyId" to "findById" (method name correction)
        // FIXED: Added "const" declaration for user variable
        // FIXED: Fixed spacing in select string
        const user = await User.findById(decodedToken?._id)
            .select("-password -refreshToken");

        // STEP 5: Check if user exists
        // If user is not found, the token might be invalid or user was deleted
        // FIXED: Changed "throw new Error" to "throw new ApiError" for consistency
        if (!user) {
            throw new ApiError(401, "Invalid Access Token");
        }

        // STEP 6: Attach user to request object
        // Add the authenticated user to the request object
        // This makes user data available in subsequent middleware and route handlers
        req.user = user;
        
        // STEP 7: Continue to next middleware/route handler
        // Call next() to proceed to the protected route
        next();
        
    } catch (error) {
        // STEP 8: Handle any errors during authentication
        // If any step fails, throw an ApiError with appropriate message
        // This could be due to invalid token, expired token, or database errors
        throw new ApiError(401, error?.message || "Invalid access token");
    }
});

