/**
 * Security Service - Domain allowlisting and request validation
 */

import { URL } from 'url';

export class SecurityService {
  constructor() {
    this.allowlist = this._parseAllowlist();
    this.privateCIDRs = [
      '10.0.0.0/8',
      '172.16.0.0/12', 
      '192.168.0.0/16',
      '169.254.0.0/16', // Link-local
      '127.0.0.0/8'     // Loopback
    ];
  }

  /**
   * Parse domain allowlist from environment
   */
  _parseAllowlist() {
    const allowlistEnv = process.env.OUTBOUND_ALLOWLIST;
    if (!allowlistEnv) {
      console.warn('No OUTBOUND_ALLOWLIST configured - all external requests will be blocked');
      return [];
    }

    try {
      const list = JSON.parse(allowlistEnv);
      if (!Array.isArray(list)) {
        throw new Error('OUTBOUND_ALLOWLIST must be a JSON array');
      }
      return list.map(entry => ({
        pattern: entry,
        isRegex: this._isRegexPattern(entry),
        compiled: this._isRegexPattern(entry) ? new RegExp(entry, 'i') : entry.toLowerCase()
      }));
    } catch (error) {
      console.error('Failed to parse OUTBOUND_ALLOWLIST:', error.message);
      return [];
    }
  }

  /**
   * Check if pattern is a regex
   */
  _isRegexPattern(pattern) {
    return pattern.includes('*') || pattern.includes('^') || pattern.includes('$') || pattern.includes('\\.');
  }

  /**
   * Validate URL against allowlist
   * @param {string} url - URL to validate
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  validateUrl(url) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const port = parsedUrl.port;

      // Check for private IP ranges (unless explicitly allowed)
      if (this._isPrivateIP(hostname) && !this._isExplicitlyAllowed(hostname)) {
        return { allowed: false, reason: 'Private IP address not allowed' };
      }

      // Check against allowlist
      const matchResult = this._checkAllowlist(hostname);
      if (!matchResult.allowed) {
        return { allowed: false, reason: `Domain '${hostname}' not in allowlist` };
      }

      // Validate port if non-standard
      if (port && !this._isStandardPort(parsedUrl.protocol, port)) {
        const portAllowed = this._isPortAllowed(hostname, port);
        if (!portAllowed) {
          return { allowed: false, reason: `Non-standard port ${port} not allowed` };
        }
      }

      return { allowed: true };
    } catch (error) {
      return { allowed: false, reason: `Invalid URL format: ${error.message}` };
    }
  }

  /**
   * Check hostname against allowlist patterns
   */
  _checkAllowlist(hostname) {
    if (this.allowlist.length === 0) {
      return { allowed: false, reason: 'No allowlist configured' };
    }

    for (const entry of this.allowlist) {
      if (entry.isRegex) {
        if (entry.compiled.test(hostname)) {
          return { allowed: true, matchedPattern: entry.pattern };
        }
      } else {
        if (entry.compiled === hostname) {
          return { allowed: true, matchedPattern: entry.pattern };
        }
      }
    }

    return { allowed: false };
  }

  /**
   * Check if IP is in private range
   */
  _isPrivateIP(hostname) {
    // Simple IP check - more sophisticated validation could use a proper IP library
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    
    if (!match) return false; // Not an IPv4 address

    const octets = match.slice(1, 5).map(Number);
    
    // Check private ranges
    if (octets[0] === 10) return true;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    if (octets[0] === 169 && octets[1] === 254) return true;
    if (octets[0] === 127) return true;

    return false;
  }

  /**
   * Check if hostname is explicitly allowed (for localhost development)
   */
  _isExplicitlyAllowed(hostname) {
    const localhostVariants = ['localhost', '127.0.0.1', '::1'];
    return localhostVariants.some(variant => 
      this.allowlist.some(entry => 
        !entry.isRegex && entry.compiled === variant.toLowerCase()
      )
    );
  }

  /**
   * Check if port is standard for protocol
   */
  _isStandardPort(protocol, port) {
    const standardPorts = {
      'http:': ['80'],
      'https:': ['443'],
      'ftp:': ['21'],
      'ssh:': ['22']
    };
    
    return standardPorts[protocol]?.includes(port) || false;
  }

  /**
   * Check if non-standard port is allowed for hostname
   */
  _isPortAllowed(hostname, port) {
    // For development, allow common development ports on localhost
    const devPorts = ['3000', '3001', '8000', '8080', '9000'];
    const localhostVariants = ['localhost', '127.0.0.1'];
    
    if (localhostVariants.includes(hostname) && devPorts.includes(port)) {
      return this._isExplicitlyAllowed(hostname);
    }

    return false;
  }

  /**
   * Sanitize MongoDB query to prevent injection
   * @param {Object} query - MongoDB query object
   * @returns {Object} Sanitized query
   */
  sanitizeMongoQuery(query) {
    if (!query || typeof query !== 'object') {
      return {};
    }

    const bannedOperators = [
      '$where', '$function', '$accumulator', '$expr'
    ];

    return this._recursiveSanitize(query, bannedOperators);
  }

  /**
   * Recursively sanitize object
   */
  _recursiveSanitize(obj, bannedOperators) {
    if (Array.isArray(obj)) {
      return obj.map(item => this._recursiveSanitize(item, bannedOperators));
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Block banned operators
        if (bannedOperators.includes(key)) {
          console.warn(`Blocked dangerous MongoDB operator: ${key}`);
          continue;
        }
        
        // Recursively sanitize nested objects
        sanitized[key] = this._recursiveSanitize(value, bannedOperators);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Validate request headers
   */
  validateHeaders(headers) {
    const sanitized = {};
    const blockedHeaders = ['authorization', 'cookie', 'x-forwarded-for'];
    
    for (const [key, value] of Object.entries(headers || {})) {
      const lowerKey = key.toLowerCase();
      
      // Block sensitive headers
      if (blockedHeaders.includes(lowerKey)) {
        continue;
      }
      
      // Limit header value length
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

// Export singleton instance
export default new SecurityService();
