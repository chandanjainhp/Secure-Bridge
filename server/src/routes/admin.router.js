import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middle.js";
import { 
    adminLogin, 
    createAdminUser, 
    getAdminProfile, 
    changeAdminPassword, 
    adminLogout, 
    setupSuperAdmin 
} from "../controllers/admin.controller.js";

const router = Router();

// Middleware to check admin privileges
const verifyAdmin = async (req, res, next) => {
    try {
        // Check if user exists and is admin
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Admin privileges required"
            });
        }
        
        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Admin verification failed",
            error: error.message
        });
    }
};

// Middleware to check super admin privileges
const verifySuperAdmin = async (req, res, next) => {
    try {
        if (!req.user || !req.user.isAdmin || req.user.adminLevel !== 'super') {
            return res.status(403).json({
                success: false,
                message: "Super admin privileges required"
            });
        }
        
        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Super admin verification failed",
            error: error.message
        });
    }
};

// PUBLIC ROUTES (no authentication required)
// ==========================================

// Admin login route
router.post('/login', adminLogin);

// Setup initial super admin (only works if no super admin exists)
router.post('/setup-super-admin', setupSuperAdmin);

// AUTHENTICATED ADMIN ROUTES
// ==========================

// Admin profile routes
router.get('/profile', verifyJWT, verifyAdmin, getAdminProfile);
router.post('/change-password', verifyJWT, verifyAdmin, changeAdminPassword);
router.post('/logout', verifyJWT, verifyAdmin, adminLogout);

// Create new admin user (only super admin)
router.post('/create-admin', verifyJWT, verifySuperAdmin, createAdminUser);

// Get all users (Admin only)
router.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { User } = await import("../models/user.model.js");
        
        const users = await User.find({})
            .select("-password -refreshToken")
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            users: users,
            total: users.length,
            message: "Users retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch users",
            error: error.message
        });
    }
});

// Get system metrics (Admin only)
router.get('/metrics', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { User } = await import("../models/user.model.js");
        
        // Calculate real metrics
        const totalUsers = await User.countDocuments();
        const verifiedUsers = await User.countDocuments({ isVerified: true });
        const recentUsers = await User.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
        
        // Mock data for other metrics (you can implement real tracking later)
        const metrics = {
            totalUsers: {
                value: totalUsers,
                growth: recentUsers > 0 ? ((recentUsers / Math.max(totalUsers - recentUsers, 1)) * 100).toFixed(1) : 0
            },
            verifiedUsers: {
                value: verifiedUsers,
                growth: 5.2
            },
            messagesEncrypted: {
                value: Math.floor(Math.random() * 50000) + 10000,
                growth: Math.floor(Math.random() * 20) - 5
            },
            apiRequests: {
                value: Math.floor(Math.random() * 15000) + 5000,
                growth: Math.floor(Math.random() * 30) - 10
            }
        };
        
        res.json({
            success: true,
            data: metrics,
            message: "System metrics retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch metrics",
            error: error.message
        });
    }
});

// Get user registration analytics
router.get('/analytics/registrations', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { User } = await import("../models/user.model.js");
        
        // Get registrations for the last 7 days
        const days = 7;
        const data = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const startOfDay = new Date(date.setHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setHours(23, 59, 59, 999));
            
            const count = await User.countDocuments({
                createdAt: {
                    $gte: startOfDay,
                    $lte: endOfDay
                }
            });
            
            data.push({
                date: startOfDay.toISOString().split('T')[0],
                users: count
            });
        }
        
        res.json({
            success: true,
            data: data,
            message: "Registration analytics retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching registration analytics:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch registration analytics",
            error: error.message
        });
    }
});

// Get message volume analytics (mock data for now)
router.get('/analytics/messages', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        // Generate mock data for last 6 hours
        const data = [];
        const currentHour = new Date().getHours();
        
        for (let i = 5; i >= 0; i--) {
            const hour = (currentHour - i + 24) % 24;
            data.push({
                hour: `${hour.toString().padStart(2, '0')}:00`,
                messages: Math.floor(Math.random() * 200) + 50
            });
        }
        
        res.json({
            success: true,
            data: data,
            message: "Message analytics retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching message analytics:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch message analytics",
            error: error.message
        });
    }
});

// Get recent activity
router.get('/activity', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { User } = await import("../models/user.model.js");
        
        // Get recent users
        const recentUsers = await User.find({})
            .select("email createdAt")
            .sort({ createdAt: -1 })
            .limit(5);
        
        const activities = recentUsers.map((user, index) => ({
            id: index + 1,
            type: 'user_registration',
            user: user.email,
            timestamp: getRelativeTime(user.createdAt)
        }));
        
        // Add some mock activities
        activities.push(
            {
                id: activities.length + 1,
                type: 'encrypted_message',
                user: 'System',
                timestamp: '3 minutes ago'
            },
            {
                id: activities.length + 2,
                type: 'fhe_operation',
                user: 'System',
                timestamp: '7 minutes ago'
            },
            {
                id: activities.length + 3,
                type: 'health_check',
                user: 'System',
                timestamp: '10 minutes ago'
            }
        );
        
        res.json({
            success: true,
            data: activities.slice(0, 10), // Return last 10 activities
            message: "Recent activity retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch recent activity",
            error: error.message
        });
    }
});

// Delete user (Admin only)
router.delete('/users/:userId', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { User } = await import("../models/user.model.js");
        const { userId } = req.params;
        
        const user = await User.findByIdAndDelete(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        
        res.json({
            success: true,
            message: "User deleted successfully",
            deletedUser: {
                id: user._id,
                email: user.email,
                fullName: user.fullName
            }
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: "Failed to delete user",
            error: error.message
        });
    }
});

// Helper function to get relative time
function getRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

export default router;
