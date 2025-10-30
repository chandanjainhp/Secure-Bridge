import mongoose, { Schema } from "mongoose";

const settingsSchema = new Schema(
    {
        // Singleton identifier - there should only be one settings document
        _id: {
            type: String,
            default: "system_settings"
        },
        
        // System Configuration
        maintenance_mode: {
            type: Boolean,
            default: false
        },
        registration_enabled: {
            type: Boolean,
            default: true
        },
        fhe_encryption: {
            type: Boolean,
            default: true
        },
        session_timeout: {
            type: Number,
            default: 24, // hours
            min: 1,
            max: 168
        },
        max_file_size: {
            type: Number,
            default: 10, // MB
            min: 1,
            max: 100
        },
        
        // Security & Rate Limiting
        rate_limit_requests: {
            type: Number,
            default: 100,
            min: 10,
            max: 1000
        },
        rate_limit_window: {
            type: Number,
            default: 15, // minutes
            min: 1,
            max: 60
        },
        log_level: {
            type: String,
            enum: ['debug', 'info', 'warn', 'error'],
            default: 'info'
        },
        
        // Backup Configuration
        auto_backup: {
            type: Boolean,
            default: true
        },
        backup_frequency: {
            type: Number,
            default: 24, // hours
            min: 1,
            max: 168
        },
        backup_retention: {
            type: Number,
            default: 30, // number of backups to keep
            min: 1,
            max: 100
        },
        
        // Email Configuration
        email_enabled: {
            type: Boolean,
            default: false
        },
        smtp_host: {
            type: String,
            default: ""
        },
        smtp_port: {
            type: Number,
            default: 587
        },
        smtp_username: {
            type: String,
            default: ""
        },
        smtp_password: {
            type: String,
            default: ""
        },
        
        // API Configuration
        api_rate_limit: {
            type: Number,
            default: 1000,
            min: 100,
            max: 10000
        },
        api_timeout: {
            type: Number,
            default: 30, // seconds
            min: 5,
            max: 300
        },
        
        // Theme and UI
        default_theme: {
            type: String,
            enum: ['light', 'dark', 'auto'],
            default: 'dark'
        },
        company_name: {
            type: String,
            default: "Secure Bridge"
        },
        company_logo: {
            type: String,
            default: ""
        },
        
        // Feature Flags
        features: {
            chat_enabled: {
                type: Boolean,
                default: true
            },
            file_upload_enabled: {
                type: Boolean,
                default: true
            },
            encryption_required: {
                type: Boolean,
                default: false
            },
            user_analytics: {
                type: Boolean,
                default: true
            }
        },
        
        // Last updated info
        lastUpdatedBy: {
            type: String,
            ref: "User"
        },
        
        // Version tracking
        version: {
            type: String,
            default: "1.0.0"
        }
    },
    {
        timestamps: true,
        // Disable _id auto-generation since we're using a custom _id
        _id: false
    }
);

// Static method to get or create settings
settingsSchema.statics.getSettings = async function() {
    let settings = await this.findById("system_settings");
    
    if (!settings) {
        // Create default settings if none exist
        settings = new this({ _id: "system_settings" });
        await settings.save();
    }
    
    return settings;
};

// Static method to update settings
settingsSchema.statics.updateSettings = async function(updates, updatedBy = null) {
    const settings = await this.getSettings();
    
    // Apply updates
    Object.keys(updates).forEach(key => {
        if (key !== '_id' && key !== '__v') {
            // Handle nested objects like features
            if (typeof updates[key] === 'object' && !Array.isArray(updates[key]) && updates[key] !== null) {
                if (!settings[key]) {
                    settings[key] = {};
                }
                Object.assign(settings[key], updates[key]);
            } else {
                settings[key] = updates[key];
            }
        }
    });
    
    if (updatedBy) {
        settings.lastUpdatedBy = updatedBy;
    }
    
    await settings.save();
    return settings;
};

// Method to get public settings (without sensitive data)
settingsSchema.methods.getPublicSettings = function() {
    const publicSettings = this.toObject();
    
    // Remove sensitive fields
    delete publicSettings.smtp_password;
    delete publicSettings.__v;
    delete publicSettings.createdAt;
    delete publicSettings.updatedAt;
    
    return publicSettings;
};

// Method to validate rate limit settings
settingsSchema.methods.validateRateLimit = function() {
    if (this.rate_limit_requests <= 0 || this.rate_limit_window <= 0) {
        throw new Error('Rate limit settings must be positive numbers');
    }
    
    if (this.rate_limit_requests > 10000) {
        throw new Error('Rate limit requests cannot exceed 10,000');
    }
    
    if (this.rate_limit_window > 1440) { // 24 hours in minutes
        throw new Error('Rate limit window cannot exceed 24 hours');
    }
};

// Pre-save middleware to validate settings
settingsSchema.pre('save', function(next) {
    try {
        // Validate rate limiting
        this.validateRateLimit();
        
        // Ensure session timeout is reasonable
        if (this.session_timeout < 1 || this.session_timeout > 168) {
            throw new Error('Session timeout must be between 1 and 168 hours');
        }
        
        // Ensure file size limits are reasonable
        if (this.max_file_size < 1 || this.max_file_size > 100) {
            throw new Error('Max file size must be between 1 and 100 MB');
        }
        
        next();
    } catch (error) {
        next(error);
    }
});

export const Settings = mongoose.model("Settings", settingsSchema);
