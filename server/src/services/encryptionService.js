/**
 * Encryption Service - Handles encrypted communication envelopes
 * Supports mock, AEAD (AES-256-GCM), and FHE proxy modes
 */

import crypto from 'crypto';
import axios from 'axios';

export class EncryptionService {
  constructor() {
    this.mode = process.env.ENCRYPTION_MODE || 'aead';
    this.encryptionKey = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'base64') : null;
    this.fheServiceUrl = process.env.FHE_SERVICE_URL || 'http://localhost:3001';
    
    // Validate configuration
    if (this.mode === 'aead' && (!this.encryptionKey || this.encryptionKey.length !== 32)) {
      throw new Error('AEAD mode requires a 32-byte base64-encoded ENCRYPTION_KEY');
    }
  }

  /**
   * Encrypt data into an envelope
   * @param {string} plaintext - The data to encrypt
   * @returns {Object} Encrypted envelope
   */
  async encrypt(plaintext) {
    const envelope = {
      mode: this.mode,
      version: 1,
      timestamp: new Date().toISOString()
    };

    switch (this.mode) {
      case 'mock':
        return this._encryptMock(plaintext, envelope);
      case 'aead':
        return this._encryptAEAD(plaintext, envelope);
      case 'fhe':
        return await this._encryptFHE(plaintext, envelope);
      default:
        throw new Error(`Unsupported encryption mode: ${this.mode}`);
    }
  }

  /**
   * Decrypt data from an envelope
   * @param {Object} envelope - The encrypted envelope
   * @returns {string} Decrypted plaintext
   */
  async decrypt(envelope) {
    if (!envelope || !envelope.mode || !envelope.version) {
      throw new Error('Invalid encryption envelope format');
    }

    if (envelope.version !== 1) {
      throw new Error(`Unsupported envelope version: ${envelope.version}`);
    }

    switch (envelope.mode) {
      case 'mock':
        return this._decryptMock(envelope);
      case 'aead':
        return this._decryptAEAD(envelope);
      case 'fhe':
        return await this._decryptFHE(envelope);
      default:
        throw new Error(`Unsupported encryption mode: ${envelope.mode}`);
    }
  }

  /**
   * Mock encryption - Base64 encoding for development
   */
  _encryptMock(plaintext, envelope) {
    const encoded = Buffer.from(plaintext, 'utf-8').toString('base64');
    return {
      ...envelope,
      payload: {
        ciphertext: encoded,
        method: 'base64'
      }
    };
  }

  _decryptMock(envelope) {
    if (!envelope.payload || !envelope.payload.ciphertext) {
      throw new Error('Invalid mock envelope: missing ciphertext');
    }
    
    try {
      return Buffer.from(envelope.payload.ciphertext, 'base64').toString('utf-8');
    } catch (error) {
      throw new Error('Mock decryption failed: invalid base64');
    }
  }

  /**
   * AEAD encryption - AES-256-GCM
   */
  _encryptAEAD(plaintext, envelope) {
    const nonce = crypto.randomBytes(12); // 96-bit nonce for GCM
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    cipher.setAAD(Buffer.from(JSON.stringify({ mode: envelope.mode, version: envelope.version })));

    let ciphertext = cipher.update(plaintext, 'utf-8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ...envelope,
      payload: {
        ciphertext: ciphertext.toString('base64'),
        nonce: nonce.toString('base64'),
        tag: tag.toString('base64'),
        algorithm: 'aes-256-gcm'
      }
    };
  }

  _decryptAEAD(envelope) {
    if (!envelope.payload || !envelope.payload.ciphertext || !envelope.payload.nonce || !envelope.payload.tag) {
      throw new Error('Invalid AEAD envelope: missing required fields');
    }

    try {
      const ciphertext = Buffer.from(envelope.payload.ciphertext, 'base64');
      const nonce = Buffer.from(envelope.payload.nonce, 'base64');
      const tag = Buffer.from(envelope.payload.tag, 'base64');
      
      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAAD(Buffer.from(JSON.stringify({ mode: envelope.mode, version: envelope.version })));
      decipher.setAuthTag(tag);

      let plaintext = decipher.update(ciphertext, null, 'utf-8');
      plaintext += decipher.final('utf-8');

      return plaintext;
    } catch (error) {
      throw new Error(`AEAD decryption failed: ${error.message}`);
    }
  }

  /**
   * FHE Proxy encryption - Delegate to external service
   */
  async _encryptFHE(plaintext, envelope) {
    try {
      const response = await axios.post(`${this.fheServiceUrl}/encrypt`, {
        plaintext,
        metadata: { mode: envelope.mode, version: envelope.version }
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      return {
        ...envelope,
        payload: response.data.payload || response.data
      };
    } catch (error) {
      throw new Error(`FHE encryption failed: ${error.message}`);
    }
  }

  async _decryptFHE(envelope) {
    try {
      const response = await axios.post(`${this.fheServiceUrl}/decrypt`, {
        envelope: envelope.payload
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      return response.data.plaintext || response.data;
    } catch (error) {
      throw new Error(`FHE decryption failed: ${error.message}`);
    }
  }

  /**
   * Validate envelope structure
   */
  isValidEnvelope(envelope) {
    return envelope &&
           typeof envelope === 'object' &&
           envelope.mode &&
           envelope.version === 1 &&
           envelope.payload;
  }
}

// Export singleton instance
export default new EncryptionService();
