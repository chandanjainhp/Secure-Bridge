// Import Router from Express to create modular route handlers
import {Router}  from "express";

// Import the registerUser controller function from the user controller
// This controller handles the business logic for user registration
import { 
    logoutUser, 
    registerUser, 
    login, 
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    verifyEmail,
    resendVerificationEmail,
    resetPassword
    
} from "../controllers/use.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middle.js";
// Create a new router instance
// This router will handle all user-related routes
const router = Router();

// Test route to check if the server is working
// GET /test - Simple test endpoint
router.route("/test").get((req, res) => {
    res.json({ message: "User routes are working!" });
});

// GET route for testing register endpoint accessibility
router.route("/register").get((req, res) => {
    res.json({ 
        message: "Register endpoint is working! Use POST method to register users.",
        method: "POST",
        required_fields: ["fullName", "email", "username", "password"],
        content_type: "application/json"
    });
});

// Define the register route
// POST /register - This route handles user registration requests
// File uploads are now optional since we removed avatar requirement from frontend
router.route("/register").post(registerUser);

// Define the login route
// POST /login - This route handles user login requests
// No file upload needed for login, just email/username and password
router.route("/login").post(login);

// EMAIL VERIFICATION ROUTES
// POST /verify-email - Verify email with OTP code
router.route("/verify-email").post(verifyEmail);
// POST /resend-verification - Resend verification email
router.route("/resend-verification").post(resendVerificationEmail);
// POST /reset-password - Reset password without old password (for forgot password flow)
router.route("/reset-password").post(resetPassword);

// SECURED ROUTES - These routes require authentication
// POST /logout - This route handles user logout (requires valid JWT token)
router.route("/logout").post(verifyJWT, logoutUser)
router.route("/refresh-token").post(refreshAccessToken)

// Additional secured routes
router.route("/me").get(verifyJWT, getCurrentUser)
router.route("/change-password").post(verifyJWT, changeCurrentPassword).patch(verifyJWT, changeCurrentPassword)
router.route("/update-account").patch(verifyJWT, updateAccountDetails)

// DEVELOPMENT/TESTING ROUTES (only available in development mode)
if (process.env.NODE_ENV === 'development') {
    // Create a test user that's already verified
    router.route("/create-test-user").post(async (req, res) => {
        try {
            const { User } = await import("../models/user.model.js");
            
            // Check if test user already exists
            const existingUser = await User.findOne({ email: "test@example.com" });
            if (existingUser) {
                return res.status(200).json({
                    message: "Test user already exists",
                    credentials: {
                        email: "test@example.com",
                        password: "password123"
                    }
                });
            }
            
            // Create verified test user
            const testUser = await User.create({
                fullName: "Test User",
                email: "test@example.com",
                username: "testuser",
                password: "password123",
                isVerified: true  // Pre-verified for testing
            });
            
            res.status(201).json({
                message: "Test user created successfully",
                credentials: {
                    email: "test@example.com",
                    password: "password123"
                },
                note: "This user is pre-verified and ready for login testing"
            });
        } catch (error) {
            res.status(500).json({
                error: error.message,
                message: "Failed to create test user"
            });
        }
    });
    
    // Quick verify any user for testing
    router.route("/verify-user/:email").patch(async (req, res) => {
        try {
            const { User } = await import("../models/user.model.js");
            const { email } = req.params;
            
            const user = await User.findOneAndUpdate(
                { email },
                { isVerified: true },
                { new: true }
            ).select("-password -refreshToken");
            
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            
            res.status(200).json({
                message: "User verified successfully",
                user: user
            });
        } catch (error) {
            res.status(500).json({
                error: error.message,
                message: "Failed to verify user"
            });
        }
    });
}

// You can add more user-related routes here, for example:
// router.route("/profile").get(verifyJWT, getUserProfile)
// router.route("/update-profile").patch(verifyJWT, updateUserProfile)

// Export the router as default so it can be imported in app.js
// This allows app.js to use this router with app.use()
export default router