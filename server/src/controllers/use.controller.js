// Import the asyncHandler utility function from the utils folder
// asyncHandler is a higher-order function that wraps async functions
// It automatically catches any errors that occur in async operations
// Without this, you'd need to write try-catch blocks in every async controller
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
// import { uploadOnCloudinary } from "../utils/cloudinary.js";
// import { request } from "express";
import jwt from "jsonwebtoken";
import { sendVerificationEmail, sendWelcomeEmail } from "../email/emails.js";
import crypto from "crypto";

// Define the registerUser controller function
// This function handles complete user registration without file uploads
const registerUser = asyncHandler(async (req, res) => {
    
    // Debug: Log the request body to see what we're receiving
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    
    // STEP 1: Get user details from frontend (request body)
    // Extract user data from the request body using destructuring
    const { fullName, email, username, password } = req.body;

    // STEP 2: Validation - Check if all required fields are provided
    // Use the some() method to check if any field is empty after trimming whitespace
    if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
        // Check which specific fields are missing for better error messages
        const missingFields = [];
        if (!fullName?.trim()) missingFields.push("Full Name");
        if (!email?.trim()) missingFields.push("Email");
        if (!username?.trim()) missingFields.push("Username");
        if (!password?.trim()) missingFields.push("Password");
        
        if (missingFields.length === 1) {
            throw new ApiError(400, `${missingFields[0]} is required. Please provide your ${missingFields[0].toLowerCase()}.`);
        } else {
            throw new ApiError(400, `The following fields are required: ${missingFields.join(", ")}. Please fill in all required information.`);
        }
    }

    // Additional validation for email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new ApiError(400, "Please provide a valid email address (e.g., user@example.com).");
    }

    // Additional validation for username format
    if (username.length < 3) {
        throw new ApiError(400, "Username must be at least 3 characters long.");
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        throw new ApiError(400, "Username can only contain letters, numbers, and underscores.");
    }

    // Additional validation for password strength
    if (password.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters long for security.");
    }

    // STEP 3: Check if user already exists with same username or email
    // Use MongoDB's $or operator to check both username and email
    // FIXED: Added 'await' keyword since User.findOne() returns a Promise
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    });

    // If user already exists, provide specific error message
    if (existedUser) {
        // Check which field is conflicting for better error messages
        if (existedUser.email === email && existedUser.username === username) {
            throw new ApiError(409, "A user with this email and username already exists. Please use different email and username.");
        } else if (existedUser.email === email) {
            throw new ApiError(409, "A user with this email already exists. Please use a different email address or try logging in.");
        } else if (existedUser.username === username) {
            throw new ApiError(409, "This username is already taken. Please choose a different username.");
        } else {
            throw new ApiError(409, "User with email or username already exists");
        }
    }

    // STEP 4: Create user object and save to database
    // Create new user with all the provided data (no file uploads needed)
    const user = await User.create({
        fullName,
        email,
        password, // Note: Password should be hashed in the User model (using pre-save middleware)
        username: username.toLowerCase(),
        isVerified: false // User starts as unverified
    });

    // STEP 5: Generate verification token and send email
    const verificationCode = user.generateVerificationToken();
    await user.save({ validateBeforeSave: false });
    
    try {
        // Send verification email
        await sendVerificationEmail(email, verificationCode);
        console.log(`Verification email sent to ${email}`);
    } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Don't throw error here - user is still created, just email failed
    }

    // STEP 6: Remove password and refresh token from response
    // Fetch the created user but exclude sensitive fields using select()
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken -verificationToken -verificationTokenExpires"
    );

    // STEP 7: Check for user creation and return response
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user");
    }

    // STEP 8: Return success response
    // Send success response with created user data and verification message
    return res.status(201).json(
        new ApiResponse(
            200, 
            createdUser, 
            "User registered successfully. Please check your email for verification code."
        )
    );
});

// Helper function to generate access and refresh tokens for a user
async function generateAccessAndRefreshTokens(userId, extendedSession = false) {
    try {
        // Find the user by their ID
        const user = await User.findById(userId);

        // Defensive: Check if user exists
        if (!user) {
            throw new ApiError(404, "User not found while generating tokens");
        }

        // Generate access and refresh tokens using user instance methods
        const accessToken = user.generateAccessToken(extendedSession);
        const refreshToken = user.generateRefreshToken(extendedSession);

        // Store the refresh token in the user document
        user.refreshToken = refreshToken;

        // Save the updated user document
        // FIXED: Changed 'ValiditeBeforSave' to 'validateBeforeSave' (correct spelling)
        await user.save({ validateBeforeSave: false });

        // Return both tokens
        return { accessToken, refreshToken };
    } catch (error) {
        // Wrap and rethrow errors as ApiError for consistent error handling
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

// Controller function to handle user login
const login = asyncHandler(async (req, res) => {
    // Extract credentials from request body
    const { email, username, password, rememberMe } = req.body;

    // Ensure either email or username is provided
    if (!(email || username)) {
        throw new ApiError(400, "Please provide either email or username to login.");
    }

    // Find the user by username or email
    const user = await User.findOne({
        $or: [{ username }, { email }]
    });

    // If user not found, throw error with helpful message
    if (!user) {
        const identifier = email ? `email "${email}"` : `username "${username}"`;
        throw new ApiError(404, `No account found with ${identifier}. Please check your credentials or register a new account.`);
    }

    // Check if user's email is verified (skip in development mode)
    if (!user.isVerified && process.env.NODE_ENV !== 'development') {
        throw new ApiError(403, `Your email (${user.email}) is not verified yet. Please check your email for the verification code and verify your account before logging in.`);
    }
    
    // In development mode, show a warning if user is not verified
    if (!user.isVerified && process.env.NODE_ENV === 'development') {
        console.log('⚠️  Development Mode: Allowing login for unverified user:', user.email);
    }

    // Check if password is provided
    if (!password) {
        throw new ApiError(400, "Password is required to login.");
    }

    // Validate the provided password
    const passwordValid = await user.isPasswordCorrect(password);

    // If password is incorrect, throw error
    if (!passwordValid) {
        throw new ApiError(401, "Incorrect password. Please check your password and try again.");
    }

    // Generate access and refresh tokens (with extended session if rememberMe is true)
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id, rememberMe);

    // Fetch user data without sensitive fields
    const loggedInUser = await User.findById(user._id)
        .select("-password -refreshToken");

    // Cookie options for security
    const options = {
        httpOnly: true, // Prevents client-side JS from accessing the cookie
        secure: true,   // Ensures cookie is sent over HTTPS only
        maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30 days if remember me, otherwise 1 day
    };

    // Send response with cookies and user data
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken
                },
                "User logged in successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    // Update user document to remove refresh token
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    );

    // Cookie options for security
    const options = {
        httpOnly: true, // Prevents client-side JS from accessing the cookie
        secure: true,   // Ensures cookie is sent over HTTPS only
    };

    // Clear cookies and send success response
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});



// Controller function to refresh access token using refresh token
// This function allows users to get a new access token when the current one expires
// without requiring them to log in again
const refreshAccessToken = asyncHandler(async (req, res) => {
    // STEP 1: Extract refresh token from cookies or request body
    // Check both cookies and body to support different client implementations
    // Web browsers typically send cookies, mobile apps might send in body
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    // STEP 2: Validate that refresh token exists
    // If no refresh token is provided, user needs to login again
    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        // STEP 3: Verify and decode the refresh token
        // This checks if the token is valid and not expired
        // FIXED: Added missing variable declaration and correct secret
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET // Use refresh token secret, not access token secret
        );

        // STEP 4: Find user from decoded token
        // Extract user ID from the decoded token and fetch user from database
        const user = await User.findById(decodedToken?._id);

        // STEP 5: Check if user exists
        // If user is not found, the token might be invalid or user was deleted
        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        // STEP 6: Verify refresh token matches stored token
        // Compare the incoming token with the one stored in database
        // This prevents token reuse attacks and ensures token validity
        // FIXED: Corrected property name from refreshAccessToken to refreshToken
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        // STEP 7: Generate new tokens
        // Create fresh access and refresh tokens for the user
        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user._id);

        // STEP 8: Set cookie options for security
        // Configure secure cookie settings
        const options = {
            httpOnly: true, // Prevents client-side JS from accessing cookies
            secure: true,   // Ensures cookies are sent over HTTPS only
        };

        // STEP 9: Send response with new tokens
        // Return new tokens both in cookies and response body
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        accessToken,
                        refreshToken: newRefreshToken
                    },
                    "Access token refreshed successfully"
                )
            );

    } catch (error) {
        // STEP 10: Handle any errors during token refresh
        // This could be due to invalid token, expired token, or database errors
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});


// Controller function to change user's current password
// This function allows authenticated users to update their password
// Requires both old password (for verification) and new password
const changeCurrentPassword = asyncHandler(async (req, res) => {
    // STEP 1: Extract old and new passwords from request body
    const { oldPassword, newPassword } = req.body;

    // STEP 2: Validate that both passwords are provided
    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Both old and new passwords are required");
    }

    // STEP 3: Find the current user from the database
    // req.user._id comes from the JWT middleware (verifyJWT)
    // FIXED: Changed req.user?.id to req.user?._id (correct property name)
    const user = await User.findById(req.user?._id);

    // STEP 4: Verify the old password is correct
    // Use the user model's method to check password
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    // STEP 5: If old password is incorrect, throw error
    if (!isPasswordCorrect) {
        // FIXED: Changed throw new Error to throw new ApiError for consistency
        throw new ApiError(400, "Invalid old password");
    }

    // STEP 6: Update the user's password
    // The new password will be automatically hashed by the User model's pre-save middleware
    user.password = newPassword;
    
    // STEP 7: Save the updated user to database
    // validateBeforeSave: false prevents running validation on other fields
    await user.save({ validateBeforeSave: false });

    // STEP 8: Return success response
    // Don't include any sensitive data in response
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

// Controller function to get current authenticated user's information
// This function returns the current user's data (excluding sensitive information)
const getCurrentUser = asyncHandler(async (req, res) => {
    // STEP 1: Return current user data
    // req.user comes from JWT middleware and already excludes password and refreshToken
    // FIXED: Corrected ApiResponse constructor parameters
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

// Controller function to update user's account details (non-sensitive information)
// This function allows users to update their fullName and email
const updateAccountDetails = asyncHandler(async (req, res) => {
    // STEP 1: Extract account details from request body
    const { fullName, email } = req.body;

    // STEP 2: Validate that required fields are provided
    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required");
    }

    // STEP 3: Update user document in database
    // FIXED: Added missing 'await' and 'const' keywords
    // FIXED: Changed 'user.findByIdAndUpdate' to 'User.findByIdAndUpdate'
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        { new: true } // Returns the updated document
    ).select("-password"); // Exclude password from response

    // STEP 4: Check if user was found and updated
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // STEP 5: Return success response with updated user data
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Account details updated successfully"));
});

// Controller function to verify email with OTP
// This function verifies the user's email using the 6-digit code sent via email
const verifyEmail = asyncHandler(async (req, res) => {
    // STEP 1: Extract email and OTP from request body
    const { email, otp } = req.body;

    // STEP 2: Validate that both email and OTP are provided
    if (!email || !otp) {
        throw new ApiError(400, "Email and verification code are required");
    }

    // STEP 3: Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    // STEP 4: Check if user exists
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // STEP 5: Check if user is already verified
    if (user.isVerified) {
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Email is already verified"));
    }

    // STEP 6: Check if verification token matches and is not expired
    if (user.verificationToken !== otp) {
        throw new ApiError(400, "Invalid verification code");
    }

    if (user.verificationTokenExpires < new Date()) {
        throw new ApiError(400, "Verification code has expired");
    }

    // STEP 7: Update user verification status
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });

    // STEP 8: Send welcome email
    try {
        await sendWelcomeEmail(user.email, user.fullName);
        console.log(`Welcome email sent to ${user.email}`);
    } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't throw error - verification is complete
    }

    // STEP 9: Return success response
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Email verified successfully"));
});

// Controller function to resend verification email
// This function generates a new verification code and sends it via email
const resendVerificationEmail = asyncHandler(async (req, res) => {
    // STEP 1: Extract email from request body
    const { email } = req.body;

    // STEP 2: Validate that email is provided
    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    // STEP 3: Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    // STEP 4: Check if user exists
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // STEP 5: Check if user is already verified
    if (user.isVerified) {
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Email is already verified"));
    }

    // STEP 6: Generate new verification token
    const verificationCode = user.generateVerificationToken();
    await user.save({ validateBeforeSave: false });

    // STEP 7: Send verification email
    try {
        await sendVerificationEmail(email, verificationCode);
        console.log(`New verification email sent to ${email}`);
    } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        throw new ApiError(500, "Failed to send verification email");
    }

    // STEP 8: Return success response
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Verification email sent successfully"));
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
    resendVerificationEmail
};
