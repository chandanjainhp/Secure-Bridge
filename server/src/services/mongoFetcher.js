/**
 * MongoDB Fetcher Service - Secure database querying
 */

import { MongoClient } from 'mongodb';
import securityService from './securityService.js';

export class MongoFetcher {
  constructor() {
    this.defaultUri = process.env.MONGODB_URI;
    this.timeout = parseInt(process.env.MONGO_TIMEOUT_MS) || 15000;
    this.maxDocuments = parseInt(process.env.MONGO_MAX_DOCUMENTS) || 1000;
    this.connectionPool = new Map(); // URI -> client connection
    this.maxConnections = 5;
  }

  /**
   * Fetch data from MongoDB
   * @param {Object} params - Query parameters
   * @returns {Object} Query results and metadata
   */
  async fetch(params) {
    const {
      uri = this.defaultUri,
      database,
      collection,
      query = {},
      projection = {},
      limit = 20,
      sort = {},
      owner,
      datasetId
    } = params;

    if (!uri) {
      throw new Error('MongoDB URI is required');
    }

    if (!collection) {
      throw new Error('Collection name is required');
    }

    // Validate and sanitize query
    const sanitizedQuery = securityService.sanitizeMongoQuery(query);
    const sanitizedProjection = securityService.sanitizeMongoQuery(projection);
    const sanitizedSort = securityService.sanitizeMongoQuery(sort);

    // Validate limits
    const safeLimit = Math.min(Math.max(1, limit), this.maxDocuments);

    try {
      const startTime = Date.now();
      
      // Get database connection
      const client = await this._getConnection(uri);
      const db = client.db(database);
      const coll = db.collection(collection);

      // Execute query with timeout
      const queryPromise = this._executeQuery(coll, {
        query: sanitizedQuery,
        projection: sanitizedProjection,
        limit: safeLimit,
        sort: sanitizedSort
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('MongoDB query timeout')), this.timeout);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      console.log(`MongoDB query completed: ${result.documents.length} documents (${duration}ms)`);

      return this._processResult(result, {
        uri: this._sanitizeUri(uri),
        database,
        collection,
        query: sanitizedQuery,
        limit: safeLimit,
        duration,
        owner,
        datasetId
      });

    } catch (error) {
      throw new Error(`MongoDB query failed: ${error.message}`);
    }
  }

  /**
   * Get or create MongoDB connection
   */
  async _getConnection(uri) {
    const sanitizedUri = this._sanitizeUri(uri);
    
    if (this.connectionPool.has(sanitizedUri)) {
      const client = this.connectionPool.get(sanitizedUri);
      
      // Test connection
      try {
        await client.admin().ping();
        return client;
      } catch (error) {
        console.warn('MongoDB connection lost, reconnecting...');
        this.connectionPool.delete(sanitizedUri);
      }
    }

    // Clean up excess connections
    if (this.connectionPool.size >= this.maxConnections) {
      await this._cleanupConnections();
    }

    // Create new connection
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: this.timeout,
      socketTimeoutMS: this.timeout,
      connectTimeoutMS: this.timeout,
      maxIdleTimeMS: 30000,
      tls: uri.includes('mongodb+srv') || uri.includes('ssl=true')
    });

    await client.connect();
    this.connectionPool.set(sanitizedUri, client);
    
    console.log(`Connected to MongoDB: ${sanitizedUri}`);
    return client;
  }

  /**
   * Execute MongoDB query
   */
  async _executeQuery(collection, { query, projection, limit, sort }) {
    // Build cursor
    let cursor = collection.find(query);

    // Apply projection if provided
    if (Object.keys(projection).length > 0) {
      cursor = cursor.project(projection);
    }

    // Apply sort if provided
    if (Object.keys(sort).length > 0) {
      cursor = cursor.sort(sort);
    }

    // Apply limit
    cursor = cursor.limit(limit);

    // Execute query
    const documents = await cursor.toArray();
    
    // Get additional metadata
    const totalCount = await collection.countDocuments(query);

    return {
      documents,
      count: documents.length,
      totalCount: Math.min(totalCount, this.maxDocuments), // Cap reported total
      hasMore: totalCount > limit
    };
  }

  /**
   * Process query result
   */
  _processResult(result, metadata) {
    const resultData = {
      documents: result.documents,
      count: result.count,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
      query: metadata.query,
      collection: metadata.collection,
      database: metadata.database
    };

    const resultMetadata = {
      source: {
        type: 'mongodb',
        uri: metadata.uri,
        database: metadata.database,
        collection: metadata.collection
      },
      query: {
        filter: metadata.query,
        limit: metadata.limit,
        resultCount: result.count,
        totalCount: result.totalCount,
        hasMore: result.hasMore
      },
      fetch: {
        timestamp: new Date().toISOString(),
        duration: metadata.duration
      }
    };

    return {
      data: resultData,
      mimeType: 'application/json',
      metadata: resultMetadata,
      name: `MongoDB Query: ${metadata.collection}`,
      success: true
    };
  }

  /**
   * Sanitize MongoDB URI for logging (remove credentials)
   */
  _sanitizeUri(uri) {
    try {
      const url = new URL(uri);
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return 'mongodb://***:***@hidden';
    }
  }

  /**
   * Clean up old connections
   */
  async _cleanupConnections() {
    console.log('Cleaning up MongoDB connections...');
    const connections = Array.from(this.connectionPool.entries());
    
    // Close oldest connections
    const toClose = connections.slice(0, Math.floor(this.maxConnections / 2));
    
    for (const [uri, client] of toClose) {
      try {
        await client.close();
        this.connectionPool.delete(uri);
        console.log(`Closed MongoDB connection: ${uri}`);
      } catch (error) {
        console.warn(`Error closing MongoDB connection: ${error.message}`);
      }
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    console.log('Closing all MongoDB connections...');
    
    for (const [uri, client] of this.connectionPool.entries()) {
      try {
        await client.close();
        console.log(`Closed MongoDB connection: ${uri}`);
      } catch (error) {
        console.warn(`Error closing MongoDB connection: ${error.message}`);
      }
    }
    
    this.connectionPool.clear();
  }

  /**
   * Test connection
   */
  async testConnection(uri = this.defaultUri) {
    if (!uri) {
      throw new Error('MongoDB URI is required');
    }

    try {
      const client = await this._getConnection(uri);
      await client.admin().ping();
      
      const admin = client.admin();
      const serverStatus = await admin.serverStatus();
      
      return {
        connected: true,
        version: serverStatus.version,
        uptime: serverStatus.uptime,
        uri: this._sanitizeUri(uri)
      };
    } catch (error) {
      throw new Error(`MongoDB connection test failed: ${error.message}`);
    }
  }

  /**
   * Get service info
   */
  getInfo() {
    return {
      name: 'MongoDB Fetcher',
      version: '1.0.0',
      timeout: this.timeout,
      maxDocuments: this.maxDocuments,
      activeConnections: this.connectionPool.size,
      maxConnections: this.maxConnections
    };
  }

  /**
   * Validate MongoDB query for security
   */
  validateQuery(query) {
    const sanitized = securityService.sanitizeMongoQuery(query);
    
    // Check for complex operations that might be expensive
    const expensiveOperators = ['$regex', '$text', '$geoNear'];
    const hasExpensive = JSON.stringify(sanitized).includes('"$regex"') ||
                        JSON.stringify(sanitized).includes('"$text"') ||
                        JSON.stringify(sanitized).includes('"$geoNear"');

    return {
      valid: true,
      sanitized,
      warnings: hasExpensive ? ['Query contains potentially expensive operations'] : []
    };
  }
}

// Export singleton instance
export default new MongoFetcher();
