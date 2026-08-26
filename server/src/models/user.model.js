// IMPORTS SECTION
// ================

// Import 'watch' from Node.js 'fs' module - used for file system operations
// NOTE: This import seems unused in current code and can be removed
import { watch } from "fs";

// Import Mongoose ODM (Object Document Mapper) for MongoDB
// Schema is imported separately for creating database schemas
import mongoose, {Schema} from "mongoose";

// Import jsonwebtoken library for creating and verifying JWT tokens
// Used for authentication and authorization
import jwt from "jsonwebtoken"

// Import bcrypt library for password hashing
// Provides secure password encryption and comparison
import bcrypt from "bcryptjs";


// USER SCHEMA DEFINITION
// ======================

// Create a new Mongoose schema for User collection
const userSchema = new Schema({
    
    // USERNAME FIELD
    // ==============
    username : {
        type: String,                    // Data type: String
        required: true,                  // Field is mandatory
        unique: true,                    // Must be unique across all users
        lowercase: true,                 // Automatically converts to lowercase
        trim: true,                      // Removes whitespace from beginning/end
        index: true                      // Creates database index for faster queries
    },
    
    // EMAIL FIELD
    // ===========
    email: {
        type: String,                    // Data type: String
        required: true,                  // Field is mandatory
        unique: true,                    // Must be unique across all users
        lowercase: true,                 // Automatically converts to lowercase
        index: true,                     // Creates database index for faster queries
    },
    
    // FULL NAME FIELD
    // ===============
    fullName: {
        type: String,                    // Data type: String
        required: true,                  // Field is mandatory
        trim: true,                      // Removes whitespace from beginning/end
        index: true,                     // Creates database index for faster queries
    },

    
    // PASSWORD FIELD
    // ==============
    password: {
        type: String,                    // Data type: String
        required: [true, 'Password is required'] // Required with custom error message
        // Password will be hashed before saving (see pre-save middleware below)
    },
    
    // EMAIL VERIFICATION FIELDS
    // =========================
    isVerified: {
        type: Boolean,
        default: false                   // User starts as unverified
    },
    
    verificationToken: {
        type: String                     // Stores the verification code/token
    },
    
    verificationTokenExpires: {
        type: Date                       // When the verification token expires
    },
    
    // REFRESH TOKEN FIELD
    // ===================
    refreshToken: {                      // Fixed typo: was 'RefershToken'
        type: String                     // Data type: String
        // Used to store JWT refresh tokens for maintaining user sessions
        // Not required as it's only set when user logs in
    },
    
    // ADMIN ROLE FIELD
    // ================
    isAdmin: {
        type: Boolean,
        default: false                   // Users are not admin by default
    },
    
    // ADMIN LEVEL FIELD (for different admin privileges)
    // ==================================================
    adminLevel: {
        type: String,
        enum: ['super', 'moderator', 'support'],
        default: undefined               // Only set for admin users
    },
    
    // ADMIN CREATED BY
    // ================
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',                     // Reference to admin who created this user
        default: null
    }
    
}, {
    // SCHEMA OPTIONS
    // ==============
    timestamps: true,                    // Automatically adds createdAt and updatedAt fields
})

// MIDDLEWARE SECTION
// ==================

// PRE-SAVE MIDDLEWARE FOR PASSWORD HASHING
// =========================================
// This middleware runs before saving a user document to the database
userSchema.pre("save", async function (next) {
    // Check if password field has been modified
    // If password hasn't changed, skip hashing and proceed to next middleware
    if(!this.isModified("password")) return next();

    // Hash the password using bcrypt with salt rounds of 12
    // Higher salt rounds = more secure but slower processing
    this.password = await bcrypt.hash(this.password, 12);
    
    // Call next() to proceed to the next middleware or save operation
    next();
});


// INSTANCE METHODS SECTION
// ========================

// METHOD TO VERIFY PASSWORD
// =========================
// This method compares a plain text password with the hashed password
userSchema.methods.isPasswordCorrect = async function(password) {
    // Use bcrypt.compare to check if plain password matches hashed password
    // Returns true if passwords match, false otherwise
    return await bcrypt.compare(password, this.password);
}

// METHOD TO GENERATE ACCESS TOKEN
// ===============================
// Creates a JWT access token containing user information
userSchema.methods.generateAccessToken = function(extendedSession = false) {
    const expiryTime = extendedSession ? '30d' : (process.env.JWT_EXPIRES_IN || process.env.ACCESS_TOKEN_EXPIRY || '15m');
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
            fullName: this.fullName,
            isAdmin: this.isAdmin,
            adminLevel: this.adminLevel
        },
        process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: expiryTime
        }
    );
}

// METHOD TO GENERATE REFRESH TOKEN
// ================================
// Creates a JWT refresh token for maintaining user sessions
userSchema.methods.generateRefreshToken = function(extendedSession = false) {
    const expiryTime = extendedSession ? '90d' : (process.env.JWT_REFRESH_EXPIRES_IN || process.env.REFRESH_TOKEN_EXPIRY || '7d');
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: expiryTime
        }
    );
}

// METHOD TO GENERATE EMAIL VERIFICATION TOKEN
// ===========================================
// Creates a 6-digit verification code for email verification
userSchema.methods.generateVerificationToken = function() {
    // Generate a 6-digit random number
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set the verification token and expiration (15 minutes from now)
    this.verificationToken = verificationCode;
    this.verificationTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    
    return verificationCode;
}

// MODEL EXPORT
// ============
// Create and export the User model based on userSchema
export const User = mongoose.model("User", userSchema)
