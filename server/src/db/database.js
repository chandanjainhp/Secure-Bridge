import mongoose from 'mongoose';
import LoggingService from '../services/loggingService.js';

class DatabaseService {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  async connect(uri = process.env.MONGODB_URI) {
    if (this.isConnected && mongoose.connection.readyState === 1) {
      LoggingService.info('MongoDB already connected');
      return this.connection;
    }

    try {
      // Configure mongoose settings for production
      mongoose.set('strictQuery', false);
      
      const options = {
        // Connection settings
        useNewUrlParser: true,
        useUnifiedTopology: true,
        
        // Connection pool settings
        maxPoolSize: process.env.NODE_ENV === 'production' ? 10 : 5,
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        
        // Timeout settings
        serverSelectionTimeoutMS: 10000, // 10 seconds
        socketTimeoutMS: 45000, // 45 seconds
        connectTimeoutMS: 10000, // 10 seconds
        
        // Retry settings
        retryWrites: true,
        retryReads: true,
        
        // Buffer settings
        bufferMaxEntries: 0,
        bufferCommands: false,
        
        // Heartbeat settings
        heartbeatFrequencyMS: 10000,
        
        // SSL/TLS settings (for production)
        ...(process.env.NODE_ENV === 'production' && {
          ssl: true,
          sslValidate: true,
        }),
      };

      LoggingService.info('Attempting to connect to MongoDB...', {
        uri: uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'), // Hide credentials in logs
        options: { ...options, uri: undefined }
      });

      this.connection = await mongoose.connect(uri, options);
      this.isConnected = true;
      this.connectionAttempts = 0;

      // Log successful connection
      LoggingService.info('MongoDB connected successfully', {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name,
        readyState: mongoose.connection.readyState
      });

      // Set up connection event handlers
      this.setupEventHandlers();

      return this.connection;
    } catch (error) {
      this.connectionAttempts++;
      LoggingService.error('MongoDB connection failed', {
        attempt: this.connectionAttempts,
        error: error.message,
        stack: error.stack
      });

      if (this.connectionAttempts < this.maxRetries) {
        LoggingService.info(`Retrying connection in ${this.retryDelay / 1000} seconds...`);
        await this.delay(this.retryDelay);
        return this.connect(uri);
      } else {
        LoggingService.error('Max connection attempts reached. Unable to connect to MongoDB');
        throw error;
      }
    }
  }

  setupEventHandlers() {
    const connection = mongoose.connection;

    // Connection opened
    connection.on('connected', () => {
      this.isConnected = true;
      LoggingService.info('MongoDB connection established');
    });

    // Connection error
    connection.on('error', (error) => {
      LoggingService.error('MongoDB connection error', {
        error: error.message,
        stack: error.stack
      });
    });

    // Connection disconnected
    connection.on('disconnected', () => {
      this.isConnected = false;
      LoggingService.warn('MongoDB connection lost');
    });

    // Application termination
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });

    // Handle reconnection
    connection.on('reconnected', () => {
      this.isConnected = true;
      LoggingService.info('MongoDB reconnected');
    });

    // Handle full buffer
    connection.on('fullsetup', () => {
      LoggingService.info('MongoDB replica set connection established');
    });
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.connection.close();
        this.isConnected = false;
        LoggingService.info('MongoDB connection closed');
      }
    } catch (error) {
      LoggingService.error('Error closing MongoDB connection', {
        error: error.message
      });
    }
  }

  // Health check
  async healthCheck() {
    try {
      const state = mongoose.connection.readyState;
      const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };

      const health = {
        status: states[state],
        readyState: state,
        connected: state === 1,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name
      };

      if (state === 1) {
        // Test with a simple ping
        const admin = mongoose.connection.db.admin();
        const pingResult = await admin.ping();
        health.ping = pingResult.ok === 1;
        health.latency = Date.now(); // Simple latency check
        
        const startTime = Date.now();
        await admin.ping();
        health.latency = Date.now() - startTime;
      }

      return health;
    } catch (error) {
      LoggingService.error('MongoDB health check failed', {
        error: error.message
      });
      
      return {
        status: 'error',
        connected: false,
        error: error.message
      };
    }
  }

  // Get database statistics
  async getStats() {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const stats = await mongoose.connection.db.stats();
      const collections = await mongoose.connection.db.listCollections().toArray();

      return {
        database: mongoose.connection.name,
        collections: collections.length,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexSize: stats.indexSize,
        documents: stats.objects,
        indexes: stats.indexes,
        avgObjectSize: stats.avgObjSize,
        collections: collections.map(col => ({
          name: col.name,
          type: col.type
        }))
      };
    } catch (error) {
      LoggingService.error('Failed to get database stats', {
        error: error.message
      });
      throw error;
    }
  }

  // Create database indexes
  async createIndexes() {
    try {
      LoggingService.info('Creating database indexes...');

      // API Keys collection indexes
      const ApiKey = mongoose.model('ApiKey');
      await ApiKey.createIndexes();

      // User collection indexes
      const User = mongoose.model('User');
      await User.createIndexes();

      LoggingService.info('Database indexes created successfully');
    } catch (error) {
      LoggingService.error('Failed to create database indexes', {
        error: error.message
      });
      throw error;
    }
  }

  // Database cleanup operations
  async cleanup() {
    try {
      LoggingService.info('Running database cleanup...');

      // Clean up expired API keys
      const ApiKey = mongoose.model('ApiKey');
      const expiredKeys = await ApiKey.updateMany(
        { expiresAt: { $lte: new Date() }, status: 'active' },
        { status: 'expired' }
      );

      if (expiredKeys.modifiedCount > 0) {
        LoggingService.info(`Marked ${expiredKeys.modifiedCount} API keys as expired`);
      }

      // Clean up old audit logs (keep only last 1000 entries per key)
      await ApiKey.updateMany(
        {},
        { $push: { auditLog: { $each: [], $slice: -1000 } } }
      );

      // Clean up old usage data (keep only last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await ApiKey.updateMany(
        {},
        {
          $pull: {
            'usage.dailyUsage': { date: { $lt: thirtyDaysAgo } }
          }
        }
      );

      LoggingService.info('Database cleanup completed');
    } catch (error) {
      LoggingService.error('Database cleanup failed', {
        error: error.message
      });
    }
  }

  // Backup database (simple export)
  async backup(collections = []) {
    try {
      LoggingService.info('Starting database backup...');
      
      const backupData = {};
      const collectionsToBackup = collections.length > 0 
        ? collections 
        : ['users', 'apikeys'];

      for (const collectionName of collectionsToBackup) {
        const collection = mongoose.connection.db.collection(collectionName);
        const documents = await collection.find({}).toArray();
        backupData[collectionName] = documents;
        
        LoggingService.info(`Backed up ${documents.length} documents from ${collectionName}`);
      }

      const backup = {
        timestamp: new Date().toISOString(),
        database: mongoose.connection.name,
        collections: backupData
      };

      return backup;
    } catch (error) {
      LoggingService.error('Database backup failed', {
        error: error.message
      });
      throw error;
    }
  }

  // Monitor database performance
  async getPerformanceMetrics() {
    try {
      const db = mongoose.connection.db;
      
      // Get current operations
      const currentOp = await db.admin().currentOp();
      
      // Get server status
      const serverStatus = await db.admin().serverStatus();
      
      // Get profiling info
      let profileData = null;
      try {
        profileData = await db.admin().profiling();
      } catch (error) {
        // Profiling might not be enabled
        LoggingService.debug('Database profiling not enabled');
      }

      return {
        timestamp: new Date().toISOString(),
        activeConnections: serverStatus.connections,
        operations: {
          active: currentOp.inprog?.length || 0,
          queries: serverStatus.opcounters?.query || 0,
          inserts: serverStatus.opcounters?.insert || 0,
          updates: serverStatus.opcounters?.update || 0,
          deletes: serverStatus.opcounters?.delete || 0
        },
        memory: {
          virtual: serverStatus.mem?.virtual,
          resident: serverStatus.mem?.resident,
          mapped: serverStatus.mem?.mapped
        },
        uptime: serverStatus.uptime,
        profiling: profileData
      };
    } catch (error) {
      LoggingService.error('Failed to get performance metrics', {
        error: error.message
      });
      return null;
    }
  }

  // Utility method for delays
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getters
  get isHealthy() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  get connectionState() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState] || 'unknown';
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

// Export both the service and the connect function for backward compatibility
export default databaseService;
export const connectDB = (uri) => databaseService.connect(uri);
