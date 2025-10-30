/**
 * Dataset Management Service - In-memory storage with TTL-based cleanup
 */

import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

export class DatasetService {
  constructor() {
    this.datasets = new Map(); // Key: {owner}/{id}, Value: DatasetRecord
    this.ttlHours = parseInt(process.env.DATASET_TTL_HOURS) || 24;
    this.maxDatasets = parseInt(process.env.MAX_DATASETS) || 1000;
    this.maxDatasetSize = parseInt(process.env.MAX_DATASET_SIZE) || 50 * 1024 * 1024; // 50MB
    
    // Start cleanup job - runs every 5 minutes
    this.startCleanupJob();
    
    console.log(`Dataset service initialized: TTL=${this.ttlHours}h, Max=${this.maxDatasets}, MaxSize=${this.maxDatasetSize / 1024 / 1024}MB`);
  }

  /**
   * Store a dataset
   * @param {Object} params - { owner, datasetId?, name?, mimeType, data, metadata? }
   * @returns {Object} { id, uri, size }
   */
  store({ owner, datasetId, name, mimeType, data, metadata = {} }) {
    if (!owner || !mimeType || data === undefined) {
      throw new Error('Missing required parameters: owner, mimeType, data');
    }

    // Generate ID if not provided
    const id = datasetId || uuidv4();
    const key = `${owner}/${id}`;

    // Check if dataset already exists
    if (this.datasets.has(key)) {
      throw new Error(`Dataset ${key} already exists`);
    }

    // Calculate size
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const size = Buffer.byteLength(dataString, 'utf8');

    // Check size limits
    if (size > this.maxDatasetSize) {
      throw new Error(`Dataset size ${size} exceeds maximum ${this.maxDatasetSize}`);
    }

    // Check dataset count limits
    if (this.datasets.size >= this.maxDatasets) {
      this.performCleanup(); // Try cleanup first
      if (this.datasets.size >= this.maxDatasets) {
        throw new Error(`Maximum number of datasets (${this.maxDatasets}) reached`);
      }
    }

    // Create dataset record
    const now = new Date().toISOString();
    const record = {
      id,
      owner,
      name: name || `Dataset ${id}`,
      mimeType,
      data: dataString,
      metadata: {
        ...metadata,
        size,
        dataType: typeof data
      },
      createdAt: now,
      lastAccessed: now,
      version: 1
    };

    // Store dataset
    this.datasets.set(key, record);
    
    const uri = `sb://dataset/${owner}/${id}`;
    console.log(`Stored dataset ${key} (${size} bytes, ${this.datasets.size} total)`);

    return { id, uri, size };
  }

  /**
   * Retrieve a dataset
   * @param {string} owner - Dataset owner
   * @param {string} id - Dataset ID
   * @returns {Object|null} Dataset record or null if not found
   */
  get(owner, id) {
    if (!owner || !id) {
      throw new Error('Missing required parameters: owner, id');
    }

    const key = `${owner}/${id}`;
    const record = this.datasets.get(key);

    if (!record) {
      return null;
    }

    // Update last accessed time
    record.lastAccessed = new Date().toISOString();
    
    return record;
  }

  /**
   * Retrieve dataset by URI
   * @param {string} uri - Dataset URI (sb://dataset/{owner}/{id})
   * @returns {Object|null} Dataset record or null if not found
   */
  getByUri(uri) {
    const parsed = this.parseUri(uri);
    if (!parsed) {
      throw new Error('Invalid dataset URI format');
    }

    return this.get(parsed.owner, parsed.id);
  }

  /**
   * Parse dataset URI
   * @param {string} uri - Dataset URI
   * @returns {Object|null} { owner, id } or null if invalid
   */
  parseUri(uri) {
    const uriRegex = /^sb:\/\/dataset\/([^\/]+)\/([^\/]+)$/;
    const match = uri.match(uriRegex);
    
    if (!match) {
      return null;
    }

    return {
      owner: decodeURIComponent(match[1]),
      id: decodeURIComponent(match[2])
    };
  }

  /**
   * List datasets for an owner
   * @param {string} owner - Dataset owner
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of dataset records
   */
  list(owner, limit = 50) {
    if (!owner) {
      throw new Error('Missing required parameter: owner');
    }

    const results = [];
    for (const [key, record] of this.datasets.entries()) {
      if (record.owner === owner) {
        results.push(record);
        if (results.length >= limit) break;
      }
    }

    // Sort by creation date (newest first)
    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Delete a dataset
   * @param {string} owner - Dataset owner
   * @param {string} id - Dataset ID
   * @returns {boolean} True if deleted, false if not found
   */
  delete(owner, id) {
    if (!owner || !id) {
      throw new Error('Missing required parameters: owner, id');
    }

    const key = `${owner}/${id}`;
    const existed = this.datasets.has(key);
    
    if (existed) {
      this.datasets.delete(key);
      console.log(`Deleted dataset ${key}`);
    }

    return existed;
  }

  /**
   * Get statistics about stored datasets
   * @returns {Object} Statistics
   */
  getStats() {
    let totalSize = 0;
    const ownerStats = {};
    const mimeTypeStats = {};

    for (const record of this.datasets.values()) {
      const size = record.metadata.size || 0;
      totalSize += size;

      // Owner stats
      if (!ownerStats[record.owner]) {
        ownerStats[record.owner] = { count: 0, size: 0 };
      }
      ownerStats[record.owner].count++;
      ownerStats[record.owner].size += size;

      // MIME type stats
      if (!mimeTypeStats[record.mimeType]) {
        mimeTypeStats[record.mimeType] = { count: 0, size: 0 };
      }
      mimeTypeStats[record.mimeType].count++;
      mimeTypeStats[record.mimeType].size += size;
    }

    return {
      totalCount: this.datasets.size,
      totalSize,
      maxDatasets: this.maxDatasets,
      maxDatasetSize: this.maxDatasetSize,
      ttlHours: this.ttlHours,
      ownerStats,
      mimeTypeStats
    };
  }

  /**
   * Start automatic cleanup job
   */
  startCleanupJob() {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      this.performCleanup();
    });

    console.log('Dataset cleanup job scheduled (every 5 minutes)');
  }

  /**
   * Perform cleanup of expired datasets
   */
  performCleanup() {
    const now = new Date();
    const ttlMs = this.ttlHours * 60 * 60 * 1000;
    const cutoffTime = new Date(now.getTime() - ttlMs);

    let removedCount = 0;
    let freedSize = 0;

    for (const [key, record] of this.datasets.entries()) {
      const lastAccessed = new Date(record.lastAccessed);
      
      if (lastAccessed < cutoffTime) {
        const size = record.metadata.size || 0;
        this.datasets.delete(key);
        removedCount++;
        freedSize += size;
      }
    }

    if (removedCount > 0) {
      console.log(`Cleanup: removed ${removedCount} datasets, freed ${Math.round(freedSize / 1024 / 1024 * 100) / 100}MB`);
    }

    return { removedCount, freedSize };
  }

  /**
   * Force cleanup of least recently used datasets if over capacity
   */
  performLRUCleanup(targetCount) {
    if (this.datasets.size <= targetCount) {
      return { removedCount: 0, freedSize: 0 };
    }

    // Sort by last accessed time (oldest first)
    const sortedEntries = Array.from(this.datasets.entries())
      .sort(([, a], [, b]) => new Date(a.lastAccessed) - new Date(b.lastAccessed));

    let removedCount = 0;
    let freedSize = 0;
    const toRemove = this.datasets.size - targetCount;

    for (let i = 0; i < toRemove && i < sortedEntries.length; i++) {
      const [key, record] = sortedEntries[i];
      const size = record.metadata.size || 0;
      
      this.datasets.delete(key);
      removedCount++;
      freedSize += size;
    }

    if (removedCount > 0) {
      console.log(`LRU cleanup: removed ${removedCount} datasets, freed ${Math.round(freedSize / 1024 / 1024 * 100) / 100}MB`);
    }

    return { removedCount, freedSize };
  }

  /**
   * Check if dataset exists
   * @param {string} owner - Dataset owner
   * @param {string} id - Dataset ID
   * @returns {boolean} True if exists
   */
  exists(owner, id) {
    if (!owner || !id) {
      return false;
    }

    const key = `${owner}/${id}`;
    return this.datasets.has(key);
  }

  /**
   * Update dataset metadata
   * @param {string} owner - Dataset owner
   * @param {string} id - Dataset ID
   * @param {Object} metadata - Metadata to merge
   * @returns {boolean} True if updated, false if not found
   */
  updateMetadata(owner, id, metadata) {
    if (!owner || !id || !metadata) {
      throw new Error('Missing required parameters');
    }

    const key = `${owner}/${id}`;
    const record = this.datasets.get(key);

    if (!record) {
      return false;
    }

    record.metadata = { ...record.metadata, ...metadata };
    record.lastAccessed = new Date().toISOString();

    return true;
  }
}

// Export singleton instance
export default new DatasetService();
