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

// Get comprehensive system health (Admin only)
router.get('/health', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const healthChecks = [];
        const services = {};
        
        // Check MongoDB health
        try {
            const dbHealthResponse = await fetch('http://localhost:8000/health/mongodb');
            const dbHealth = await dbHealthResponse.json();
            services.mongodb = {
                status: dbHealth.connected ? 'healthy' : 'unhealthy',
                connected: dbHealth.connected,
                details: dbHealth,
                lastChecked: new Date().toISOString()
            };
            healthChecks.push(dbHealth.connected);
        } catch (error) {
            services.mongodb = {
                status: 'error',
                connected: false,
                error: error.message,
                lastChecked: new Date().toISOString()
            };
            healthChecks.push(false);
        }
        
        // Check LLM Server health
        try {
            const llmHealthResponse = await fetch('http://localhost:8000/health/llm');
            const llmHealth = await llmHealthResponse.json();
            services.llm_server = {
                status: llmHealth.connected ? 'healthy' : 'unhealthy',
                connected: llmHealth.connected,
                url: llmHealth.url,
                details: llmHealth,
                lastChecked: new Date().toISOString()
            };
            healthChecks.push(llmHealth.connected);
        } catch (error) {
            services.llm_server = {
                status: 'error',
                connected: false,
                error: error.message,
                lastChecked: new Date().toISOString()
            };
            healthChecks.push(false);
        }
        
        // Check FHE Service health
        try {
            const fheHealthResponse = await fetch('http://localhost:8000/api/v1/fhe/status');
            const fheHealth = await fheHealthResponse.json();
            services.fhe_service = {
                status: fheHealth.data?.fhe?.initialized ? 'healthy' : 'initializing',
                initialized: fheHealth.data?.fhe?.initialized || false,
                service: fheHealth.data?.fhe?.service || 'OpenFHE',
                details: fheHealth,
                lastChecked: new Date().toISOString()
            };
            healthChecks.push(fheHealth.data?.fhe?.initialized || false);
        } catch (error) {
            services.fhe_service = {
                status: 'error',
                initialized: false,
                error: error.message,
                lastChecked: new Date().toISOString()
            };
            healthChecks.push(false);
        }
        
        // Check API Server health (self)
        services.api_server = {
            status: 'healthy',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
            lastChecked: new Date().toISOString()
        };
        healthChecks.push(true);
        
        // Overall system health
        const healthyServices = healthChecks.filter(check => check === true).length;
        const totalServices = healthChecks.length;
        const overallStatus = healthyServices === totalServices ? 'healthy' : 
                             healthyServices > totalServices / 2 ? 'degraded' : 'unhealthy';
        
        const systemHealth = {
            overall: {
                status: overallStatus,
                healthy_services: healthyServices,
                total_services: totalServices,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            },
            services: services,
            system: {
                platform: process.platform,
                architecture: process.arch,
                nodeVersion: process.version,
                memoryUsage: {
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
                    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    external: Math.round(process.memoryUsage().external / 1024 / 1024)
                },
                cpuUsage: process.cpuUsage()
            }
        };
        
        res.json({
            success: true,
            data: systemHealth,
            message: "System health retrieved successfully"
        });
        
    } catch (error) {
        console.error('Error fetching system health:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch system health",
            error: error.message,
            data: {
                overall: {
                    status: 'error',
                    healthy_services: 0,
                    total_services: 0,
                    timestamp: new Date().toISOString()
                },
                services: {},
                system: {
                    platform: process.platform,
                    architecture: process.arch,
                    nodeVersion: process.version
                }
            }
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

// SETTINGS MANAGEMENT ROUTES
// ===========================

// Get system settings (Admin only)
router.get('/settings', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { Settings } = await import("../models/settings.model.js");
        
        const settings = await Settings.getSettings();
        const publicSettings = settings.getPublicSettings();
        
        res.json({
            success: true,
            data: publicSettings,
            message: "Settings retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch settings",
            error: error.message
        });
    }
});

// Update system settings (Admin only)
router.put('/settings', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { Settings } = await import("../models/settings.model.js");
        const updates = req.body;
        
        // Remove sensitive fields that shouldn't be updated via this endpoint
        delete updates._id;
        delete updates.__v;
        delete updates.createdAt;
        delete updates.updatedAt;
        
        // Validate required fields if provided
        if (updates.session_timeout && (updates.session_timeout < 1 || updates.session_timeout > 168)) {
            return res.status(400).json({
                success: false,
                message: "Session timeout must be between 1 and 168 hours"
            });
        }
        
        if (updates.max_file_size && (updates.max_file_size < 1 || updates.max_file_size > 100)) {
            return res.status(400).json({
                success: false,
                message: "Max file size must be between 1 and 100 MB"
            });
        }
        
        if (updates.rate_limit_requests && (updates.rate_limit_requests < 10 || updates.rate_limit_requests > 1000)) {
            return res.status(400).json({
                success: false,
                message: "Rate limit requests must be between 10 and 1000"
            });
        }
        
        if (updates.rate_limit_window && (updates.rate_limit_window < 1 || updates.rate_limit_window > 60)) {
            return res.status(400).json({
                success: false,
                message: "Rate limit window must be between 1 and 60 minutes"
            });
        }
        
        // Update settings
        const updatedSettings = await Settings.updateSettings(updates, req.user._id);
        const publicSettings = updatedSettings.getPublicSettings();
        
        res.json({
            success: true,
            data: publicSettings,
            message: "Settings updated successfully"
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: "Failed to update settings",
            error: error.message
        });
    }
});

// Reset settings to defaults (Super Admin only)
router.post('/settings/reset', verifyJWT, verifySuperAdmin, async (req, res) => {
    try {
        const { Settings } = await import("../models/settings.model.js");
        
        // Delete existing settings and create new defaults
        await Settings.findByIdAndDelete("system_settings");
        const defaultSettings = await Settings.getSettings();
        const publicSettings = defaultSettings.getPublicSettings();
        
        res.json({
            success: true,
            data: publicSettings,
            message: "Settings reset to defaults successfully"
        });
    } catch (error) {
        console.error('Error resetting settings:', error);
        res.status(500).json({
            success: false,
            message: "Failed to reset settings",
            error: error.message
        });
    }
});

// Get specific setting by key (Admin only)
router.get('/settings/:key', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { Settings } = await import("../models/settings.model.js");
        const { key } = req.params;
        
        const settings = await Settings.getSettings();
        const publicSettings = settings.getPublicSettings();
        
        if (!(key in publicSettings)) {
            return res.status(404).json({
                success: false,
                message: "Setting not found"
            });
        }
        
        res.json({
            success: true,
            data: {
                key: key,
                value: publicSettings[key]
            },
            message: "Setting retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch setting",
            error: error.message
        });
    }
});

// Update specific setting (Admin only)
router.patch('/settings/:key', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const { Settings } = await import("../models/settings.model.js");
        const { key } = req.params;
        const { value } = req.body;
        
        if (value === undefined) {
            return res.status(400).json({
                success: false,
                message: "Value is required"
            });
        }
        
        // Create update object
        const updates = { [key]: value };
        
        const updatedSettings = await Settings.updateSettings(updates, req.user._id);
        const publicSettings = updatedSettings.getPublicSettings();
        
        res.json({
            success: true,
            data: {
                key: key,
                value: publicSettings[key]
            },
            message: "Setting updated successfully"
        });
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({
            success: false,
            message: "Failed to update setting",
            error: error.message
        });
    }
});

// Get settings history (Super Admin only - for audit trail)
router.get('/settings/audit/history', verifyJWT, verifySuperAdmin, async (req, res) => {
    try {
        const { Settings } = await import("../models/settings.model.js");
        
        // In a production app, you'd want to track changes in a separate audit log
        // For now, we'll just return the current settings with metadata
        const settings = await Settings.findById("system_settings").populate('lastUpdatedBy', 'email fullName');
        
        if (!settings) {
            return res.status(404).json({
                success: false,
                message: "Settings not found"
            });
        }
        
        res.json({
            success: true,
            data: {
                settings: settings.getPublicSettings(),
                metadata: {
                    lastUpdatedBy: settings.lastUpdatedBy,
                    createdAt: settings.createdAt,
                    updatedAt: settings.updatedAt,
                    version: settings.version
                }
            },
            message: "Settings audit information retrieved successfully"
        });
    } catch (error) {
        console.error('Error fetching settings audit:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch settings audit information",
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
