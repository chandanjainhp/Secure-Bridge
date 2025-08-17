import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";

// Generate access and refresh tokens for admin users
const generateAdminTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user.isAdmin) {
            throw new ApiError(403, "User is not an administrator");
        }
        
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating tokens");
    }
};

// Admin login controller
const adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email) {
        throw new ApiError(400, "Admin email is required");
    }
    if (!password) {
        throw new ApiError(400, "Password is required");
    }

    // Find admin user
    const user = await User.findOne({ 
        email: email.toLowerCase(),
        isAdmin: true  // Only allow admin users
    });

    if (!user) {
        throw new ApiError(404, "Admin account not found with this email");
    }

    // Check if email is verified
    if (!user.isVerified) {
        throw new ApiError(403, "Admin email is not verified. Please verify your email first.");
    }

    // Validate password
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid admin credentials");
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateAdminTokens(user._id);

    // Get admin user without sensitive data
    const loggedInAdmin = await User.findById(user._id)
        .select("-password -refreshToken");

    // Cookie options
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    admin: loggedInAdmin,
                    accessToken,
                    refreshToken
                },
                "Admin logged in successfully"
            )
        );
});

// Create admin user (only super admin can create other admins)
const createAdminUser = asyncHandler(async (req, res) => {
    const { email, password, fullName, username, adminLevel = 'moderator' } = req.body;

    // Check if current user is super admin
    if (req.user.adminLevel !== 'super') {
        throw new ApiError(403, "Only super administrators can create admin users");
    }

    // Validate required fields
    if (!email || !password || !fullName || !username) {
        throw new ApiError(400, "All fields are required");
    }

    // Check if user already exists
    const existingUser = await User.findOne({
        $or: [{ username }, { email }]
    });

    if (existingUser) {
        throw new ApiError(409, "Admin user with email or username already exists");
    }

    // Create admin user
    const adminUser = await User.create({
        fullName,
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        password,
        isAdmin: true,
        adminLevel,
        isVerified: true, // Auto-verify admin accounts
        createdBy: req.user._id
    });

    // Return created admin (without sensitive data)
    const createdAdmin = await User.findById(adminUser._id)
        .select("-password -refreshToken");

    return res.status(201).json(
        new ApiResponse(201, createdAdmin, "Admin user created successfully")
    );
});

// Get admin profile
const getAdminProfile = asyncHandler(async (req, res) => {
    // req.user comes from JWT middleware
    if (!req.user.isAdmin) {
        throw new ApiError(403, "Admin access required");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Admin profile retrieved successfully"));
});

// Change admin password
const changeAdminPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Both old and new passwords are required");
    }

    if (!req.user.isAdmin) {
        throw new ApiError(403, "Admin access required");
    }

    const user = await User.findById(req.user._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Admin password changed successfully"));
});

// Admin logout
const adminLogout = asyncHandler(async (req, res) => {
    if (!req.user.isAdmin) {
        throw new ApiError(403, "Admin access required");
    }

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true
        }
    );

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "Admin logged out successfully"));
});

// Setup initial super admin (should be used only once)
const setupSuperAdmin = asyncHandler(async (req, res) => {
    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ 
        isAdmin: true, 
        adminLevel: 'super' 
    });

    if (existingSuperAdmin) {
        throw new ApiError(400, "Super admin already exists");
    }

    const { email, password, fullName, username } = req.body;

    if (!email || !password || !fullName || !username) {
        throw new ApiError(400, "All fields are required for super admin setup");
    }

    // Create super admin
    const superAdmin = await User.create({
        fullName,
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        password,
        isAdmin: true,
        adminLevel: 'super',
        isVerified: true
    });

    // Generate tokens
    const { accessToken, refreshToken } = await generateAdminTokens(superAdmin._id);

    // Get created super admin without sensitive data
    const createdSuperAdmin = await User.findById(superAdmin._id)
        .select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    };

    return res
        .status(201)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                201,
                {
                    admin: createdSuperAdmin,
                    accessToken,
                    refreshToken
                },
                "Super admin created and logged in successfully"
            )
        );
});

export {
    adminLogin,
    createAdminUser,
    getAdminProfile,
    changeAdminPassword,
    adminLogout,
    setupSuperAdmin
};
