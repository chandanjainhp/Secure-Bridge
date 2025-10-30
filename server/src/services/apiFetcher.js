/**
 * API Fetcher Service - Secure REST API data fetching
 */

import axios from 'axios';
import securityService from './securityService.js';

export class ApiFetcher {
  constructor() {
    this.timeout = parseInt(process.env.API_TIMEOUT_MS) || 30000;
    this.maxResponseSize = parseInt(process.env.MAX_RESPONSE_SIZE) || 50 * 1024 * 1024;
    this.maxRedirects = 5;
    this.userAgent = process.env.USER_AGENT || 'SecureBridge-DataFetcher/1.0';
  }

  /**
   * Fetch data from REST API
   * @param {Object} params - Request parameters
   * @returns {Object} Response data and metadata
   */
  async fetch(params) {
    const {
      endpoint,
      method = 'GET',
      headers = {},
      queryParams = {},
      body,
      owner,
      datasetId
    } = params;

    if (!endpoint) {
      throw new Error('Endpoint is required');
    }

    // Validate URL against allowlist
    const validation = securityService.validateUrl(endpoint);
    if (!validation.allowed) {
      throw new Error(`Request blocked: ${validation.reason}`);
    }

    // Build URL with query parameters
    const url = this._buildUrl(endpoint, queryParams);
    
    // Prepare request configuration
    const config = {
      method: method.toUpperCase(),
      url,
      timeout: this.timeout,
      maxRedirects: this.maxRedirects,
      maxContentLength: this.maxResponseSize,
      maxBodyLength: this.maxResponseSize,
      headers: {
        'User-Agent': this.userAgent,
        ...securityService.validateHeaders(headers)
      },
      validateStatus: () => true, // Handle all status codes manually
      responseType: 'text' // Get raw response for processing
    };

    // Add request body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(config.method) && body !== undefined) {
      if (typeof body === 'object') {
        config.data = JSON.stringify(body);
        config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
      } else {
        config.data = body;
      }
    }

    try {
      console.log(`Fetching ${method} ${url}`);
      const startTime = Date.now();
      
      const response = await axios(config);
      const duration = Date.now() - startTime;

      // Process response
      const result = this._processResponse(response, {
        url,
        method: config.method,
        duration,
        owner,
        datasetId
      });

      console.log(`API fetch completed: ${response.status} ${response.statusText} (${duration}ms)`);
      return result;

    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('DNS resolution failed - check URL');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Connection refused - service unavailable');
      } else {
        throw new Error(`API request failed: ${error.message}`);
      }
    }
  }

  /**
   * Build URL with query parameters
   */
  _buildUrl(endpoint, queryParams) {
    const url = new URL(endpoint);
    
    // Add query parameters
    for (const [key, value] of Object.entries(queryParams || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }

    return url.toString();
  }

  /**
   * Process API response
   */
  _processResponse(response, metadata) {
    const { status, statusText, headers, data } = response;
    
    // Determine content type
    const contentType = headers['content-type'] || 'text/plain';
    let mimeType = 'text/plain';
    let processedData = data;

    // Process based on content type
    if (contentType.includes('application/json')) {
      mimeType = 'application/json';
      try {
        processedData = JSON.parse(data);
      } catch (error) {
        console.warn('Failed to parse JSON response, treating as text');
        processedData = data;
      }
    } else if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
      mimeType = 'application/xml';
      processedData = data;
    } else if (contentType.includes('text/html')) {
      mimeType = 'text/html';
      processedData = data;
    } else {
      mimeType = 'text/plain';
      processedData = data;
    }

    // Build response metadata
    const responseMetadata = {
      source: {
        type: 'api',
        url: metadata.url,
        method: metadata.method
      },
      response: {
        status,
        statusText,
        headers: this._filterResponseHeaders(headers),
        size: Buffer.byteLength(data, 'utf8'),
        contentType
      },
      fetch: {
        timestamp: new Date().toISOString(),
        duration: metadata.duration,
        userAgent: this.userAgent
      }
    };

    return {
      data: processedData,
      mimeType,
      metadata: responseMetadata,
      name: `API Response from ${new URL(metadata.url).hostname}`,
      success: status >= 200 && status < 300
    };
  }

  /**
   * Filter response headers to exclude sensitive information
   */
  _filterResponseHeaders(headers) {
    const filtered = {};
    const excludeHeaders = [
      'set-cookie',
      'authorization',
      'x-api-key',
      'server',
      'x-powered-by'
    ];

    for (const [key, value] of Object.entries(headers || {})) {
      const lowerKey = key.toLowerCase();
      if (!excludeHeaders.includes(lowerKey)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Validate HTTP method
   */
  isValidMethod(method) {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    return allowedMethods.includes(method?.toUpperCase());
  }

  /**
   * Get service info
   */
  getInfo() {
    return {
      name: 'API Fetcher',
      version: '1.0.0',
      timeout: this.timeout,
      maxResponseSize: this.maxResponseSize,
      maxRedirects: this.maxRedirects,
      userAgent: this.userAgent
    };
  }
}

// Export singleton instance
export default new ApiFetcher();
