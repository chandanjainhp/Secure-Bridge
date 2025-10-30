/**
 * Web Scraper Service - Secure website content extraction
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import securityService from './securityService.js';

export class WebScraper {
  constructor() {
    this.timeout = parseInt(process.env.WEB_TIMEOUT_MS) || 20000;
    this.maxPageSize = parseInt(process.env.MAX_PAGE_SIZE) || 10 * 1024 * 1024; // 10MB
    this.maxRedirects = 5;
    this.userAgent = process.env.USER_AGENT || 'SecureBridge-WebScraper/1.0';
    this.respectRobots = process.env.RESPECT_ROBOTS !== 'false';
  }

  /**
   * Scrape website content
   * @param {Object} params - Scraping parameters
   * @returns {Object} Extracted content and metadata
   */
  async scrape(params) {
    const {
      url,
      mode = 'text',
      selector,
      owner,
      datasetId
    } = params;

    if (!url) {
      throw new Error('URL is required');
    }

    // Validate URL against allowlist
    const validation = securityService.validateUrl(url);
    if (!validation.allowed) {
      throw new Error(`Request blocked: ${validation.reason}`);
    }

    // Check robots.txt if enabled
    if (this.respectRobots) {
      const robotsAllowed = await this._checkRobots(url);
      if (!robotsAllowed) {
        throw new Error('Scraping blocked by robots.txt');
      }
    }

    try {
      console.log(`Scraping ${mode} content from ${url}`);
      const startTime = Date.now();

      // Fetch page content
      const response = await this._fetchPage(url);
      const duration = Date.now() - startTime;

      // Process content based on mode
      const result = await this._processContent(response, mode, selector, {
        url,
        duration,
        owner,
        datasetId
      });

      console.log(`Web scraping completed: ${mode} mode (${duration}ms)`);
      return result;

    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('DNS resolution failed - check URL');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Connection refused - service unavailable');
      } else {
        throw new Error(`Web scraping failed: ${error.message}`);
      }
    }
  }

  /**
   * Fetch page content
   */
  async _fetchPage(url) {
    const config = {
      method: 'GET',
      url,
      timeout: this.timeout,
      maxRedirects: this.maxRedirects,
      maxContentLength: this.maxPageSize,
      maxBodyLength: this.maxPageSize,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache'
      },
      validateStatus: (status) => status >= 200 && status < 400,
      responseType: 'text'
    };

    const response = await axios(config);

    // Validate content type
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xml')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    return response;
  }

  /**
   * Process content based on extraction mode
   */
  async _processContent(response, mode, selector, metadata) {
    const { data: html, status, statusText, headers } = response;
    
    let processedData;
    let mimeType;
    let name;

    switch (mode) {
      case 'html':
        processedData = await this._extractHtml(html, selector);
        mimeType = 'text/html';
        name = `HTML Content from ${new URL(metadata.url).hostname}`;
        break;
        
      case 'text':
        processedData = await this._extractText(html, selector);
        mimeType = 'text/plain';
        name = `Text Content from ${new URL(metadata.url).hostname}`;
        break;
        
      case 'links':
        processedData = await this._extractLinks(html, metadata.url, selector);
        mimeType = 'application/json';
        name = `Links from ${new URL(metadata.url).hostname}`;
        break;
        
      default:
        throw new Error(`Unsupported extraction mode: ${mode}`);
    }

    const resultMetadata = {
      source: {
        type: 'web',
        url: metadata.url,
        mode,
        selector: selector || null
      },
      response: {
        status,
        statusText,
        headers: this._filterResponseHeaders(headers),
        size: Buffer.byteLength(html, 'utf8'),
        contentType: headers['content-type']
      },
      fetch: {
        timestamp: new Date().toISOString(),
        duration: metadata.duration,
        userAgent: this.userAgent
      },
      extraction: {
        mode,
        selector,
        resultSize: typeof processedData === 'string' ? 
                   Buffer.byteLength(processedData, 'utf8') : 
                   Buffer.byteLength(JSON.stringify(processedData), 'utf8')
      }
    };

    return {
      data: processedData,
      mimeType,
      metadata: resultMetadata,
      name,
      success: true
    };
  }

  /**
   * Extract HTML content
   */
  async _extractHtml(html, selector) {
    if (!selector) {
      return html;
    }

    const $ = cheerio.load(html);
    const selected = $(selector);
    
    if (selected.length === 0) {
      return html; // Return full HTML if selector doesn't match
    }

    return selected.html();
  }

  /**
   * Extract text content
   */
  async _extractText(html, selector) {
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    let element = $;
    if (selector) {
      element = $(selector);
      if (element.length === 0) {
        element = $; // Fall back to full document
      }
    }

    // Extract text and clean up
    let text = element.text();
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Remove excessive newlines
    text = text.replace(/\n\s*\n/g, '\n\n');
    
    return text;
  }

  /**
   * Extract links from page
   */
  async _extractLinks(html, baseUrl, selector) {
    const $ = cheerio.load(html);
    const links = [];
    const baseURL = new URL(baseUrl);

    let linkElements = $('a[href]');
    if (selector) {
      const selected = $(selector);
      if (selected.length > 0) {
        linkElements = selected.find('a[href]');
      }
    }

    linkElements.each((i, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      const text = $link.text().trim();

      if (href) {
        try {
          // Resolve relative URLs
          const absoluteUrl = new URL(href, baseURL).toString();
          
          links.push({
            url: absoluteUrl,
            text: text || null,
            title: $link.attr('title') || null,
            rel: $link.attr('rel') || null,
            target: $link.attr('target') || null
          });
        } catch (error) {
          // Skip invalid URLs
          console.warn(`Skipping invalid URL: ${href}`);
        }
      }
    });

    // Remove duplicates based on URL
    const uniqueLinks = links.filter((link, index, self) => 
      index === self.findIndex(l => l.url === link.url)
    );

    return {
      links: uniqueLinks,
      count: uniqueLinks.length,
      baseUrl: baseUrl,
      extractedAt: new Date().toISOString()
    };
  }

  /**
   * Check robots.txt for permission (simplified)
   */
  async _checkRobots(url) {
    try {
      const robotsUrl = new URL('/robots.txt', url).toString();
      
      const response = await axios.get(robotsUrl, {
        timeout: 5000,
        validateStatus: (status) => status === 200
      });

      const robotsTxt = response.data;
      
      // Simple check for global disallow
      // In production, you'd want a more sophisticated robots.txt parser
      if (robotsTxt.includes('Disallow: /')) {
        const userAgentSection = this._parseUserAgentSection(robotsTxt, this.userAgent);
        return !userAgentSection.includes('Disallow: /');
      }

      return true;
    } catch (error) {
      // If robots.txt is not accessible, allow by default
      return true;
    }
  }

  /**
   * Parse robots.txt user agent section (simplified)
   */
  _parseUserAgentSection(robotsTxt, userAgent) {
    const lines = robotsTxt.split('\n').map(line => line.trim());
    let inUserAgentSection = false;
    let rules = [];

    for (const line of lines) {
      if (line.startsWith('User-agent:')) {
        const agent = line.split(':')[1].trim();
        inUserAgentSection = agent === '*' || agent === userAgent;
        if (!inUserAgentSection) {
          rules = []; // Reset rules for different user agent
        }
      } else if (inUserAgentSection && (line.startsWith('Disallow:') || line.startsWith('Allow:'))) {
        rules.push(line);
      }
    }

    return rules.join('\n');
  }

  /**
   * Filter response headers
   */
  _filterResponseHeaders(headers) {
    const filtered = {};
    const excludeHeaders = [
      'set-cookie',
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
   * Validate extraction mode
   */
  isValidMode(mode) {
    const allowedModes = ['html', 'text', 'links'];
    return allowedModes.includes(mode);
  }

  /**
   * Get service info
   */
  getInfo() {
    return {
      name: 'Web Scraper',
      version: '1.0.0',
      timeout: this.timeout,
      maxPageSize: this.maxPageSize,
      maxRedirects: this.maxRedirects,
      respectRobots: this.respectRobots,
      userAgent: this.userAgent
    };
  }

  /**
   * Test URL accessibility
   */
  async testUrl(url) {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        headers: {
          'User-Agent': this.userAgent
        },
        validateStatus: (status) => status >= 200 && status < 400
      });

      return {
        accessible: true,
        status: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length'],
        lastModified: response.headers['last-modified']
      };
    } catch (error) {
      return {
        accessible: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export default new WebScraper();
