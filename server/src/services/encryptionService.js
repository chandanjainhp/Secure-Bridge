/**
 * Encryption Service - Handles encrypted communication envelopes
 * Supports mock, AEAD (AES-256-GCM), and FHE proxy modes
 *
 * FIXED:
 * - Uses createCipheriv/createDecipheriv with explicit nonce (was using deprecated createCipher)
 * - Lazy init so constructor doesn't crash the process on misconfigured ENCRYPTION_KEY
 * - Nonce is now actually used in encryption (was generated but discarded)
 * - Input validation on envelope fields
 */

import crypto from "crypto";
import axios from "axios";

// ============================================================
// CONSTANTS
// ============================================================

const SUPPORTED_MODES = ["mock", "aead", "fhe"];
const NONCE_LENGTH = 12; // 96-bit nonce for AES-GCM
const KEY_LENGTH = 32; // 256-bit key for AES-256
const ENVELOPE_VERSION = 1;

// ============================================================
// HELPERS
// ============================================================

function buildAAD(envelope) {
  return Buffer.from(
    JSON.stringify({ mode: envelope.mode, version: envelope.version })
  );
}

function base64(buf) {
  return buf.toString("base64");
}

function fromBase64(str) {
  return Buffer.from(str, "base64");
}

// ============================================================
// SERVICE
// ============================================================

export class EncryptionService {
  constructor() {
    this.mode = process.env.ENCRYPTION_MODE || "aead";
    this._encryptionKey = null;
    this._initialized = false;
    this.fheServiceUrl =
      process.env.FHE_SERVICE_URL || "http://localhost:3001";

    // Validate mode early (cheap, no I/O)
    if (!SUPPORTED_MODES.includes(this.mode)) {
      throw new Error(
        `Unsupported encryption mode: "${this.mode}". Must be one of: ${SUPPORTED_MODES.join(", ")}`
      );
    }
  }

  /**
   * Lazy initialization — loads the encryption key on first use
   * instead of crashing the process on import if ENCRYPTION_KEY is missing.
   */
  _ensureInitialized() {
    if (this._initialized) return;

    if (this.mode === "aead") {
      const rawKey = process.env.ENCRYPTION_KEY;
      if (!rawKey) {
        throw new Error(
          "AEAD mode requires ENCRYPTION_KEY environment variable (base64-encoded 32-byte key)"
        );
      }

      const key = Buffer.from(rawKey, "base64");
      if (key.length !== KEY_LENGTH) {
        throw new Error(
          `ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`
        );
      }

      this._encryptionKey = key;
    }

    this._initialized = true;
  }

  /**
   * Encrypt data into an envelope
   * @param {string} plaintext - The data to encrypt
   * @returns {Object} Encrypted envelope
   */
  async encrypt(plaintext) {
    if (typeof plaintext !== "string") {
      throw new Error("Plaintext must be a string");
    }

    this._ensureInitialized();

    const envelope = {
      mode: this.mode,
      version: ENVELOPE_VERSION,
      timestamp: new Date().toISOString(),
    };

    switch (this.mode) {
      case "mock":
        return this._encryptMock(plaintext, envelope);
      case "aead":
        return this._encryptAEAD(plaintext, envelope);
      case "fhe":
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
    if (!this._isValidEnvelope(envelope)) {
      throw new Error("Invalid encryption envelope: missing mode, version, or payload");
    }

    if (envelope.version !== ENVELOPE_VERSION) {
      throw new Error(`Unsupported envelope version: ${envelope.version}`);
    }

    this._ensureInitialized();

    switch (envelope.mode) {
      case "mock":
        return this._decryptMock(envelope);
      case "aead":
        return this._decryptAEAD(envelope);
      case "fhe":
        return await this._decryptFHE(envelope);
      default:
        throw new Error(`Unsupported encryption mode: ${envelope.mode}`);
    }
  }

  // ============================================================
  // MOCK MODE — Base64 for development only
  // ============================================================

  _encryptMock(plaintext, envelope) {
    return {
      ...envelope,
      payload: {
        ciphertext: Buffer.from(plaintext, "utf-8").toString("base64"),
        method: "base64",
      },
    };
  }

  _decryptMock(envelope) {
    const { ciphertext } = envelope.payload;
    if (!ciphertext) {
      throw new Error("Invalid mock envelope: missing ciphertext");
    }
    try {
      return Buffer.from(ciphertext, "base64").toString("utf-8");
    } catch {
      throw new Error("Mock decryption failed: invalid base64");
    }
  }

  // ============================================================
  // AEAD MODE — AES-256-GCM (FIXED)
  // ============================================================

  _encryptAEAD(plaintext, envelope) {
    const nonce = crypto.randomBytes(NONCE_LENGTH);

    // FIXED: use createCipheriv with explicit nonce (was createCipher without nonce)
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this._encryptionKey,
      nonce
    );
    cipher.setAAD(buildAAD(envelope));

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf-8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      ...envelope,
      payload: {
        ciphertext: base64(ciphertext),
        nonce: base64(nonce),
        tag: base64(tag),
        algorithm: "aes-256-gcm",
      },
    };
  }

  _decryptAEAD(envelope) {
    const { ciphertext, nonce, tag } = envelope.payload;
    if (!ciphertext || !nonce || !tag) {
      throw new Error(
        "Invalid AEAD envelope: missing ciphertext, nonce, or tag"
      );
    }

    try {
      // FIXED: use createDecipheriv with explicit nonce
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this._encryptionKey,
        fromBase64(nonce)
      );
      decipher.setAAD(buildAAD(envelope));
      decipher.setAuthTag(fromBase64(tag));

      const plaintext = Buffer.concat([
        decipher.update(fromBase64(ciphertext)),
        decipher.final(),
      ]);

      return plaintext.toString("utf-8");
    } catch (error) {
      throw new Error(`AEAD decryption failed: ${error.message}`);
    }
  }

  // ============================================================
  // FHE PROXY MODE — Delegate to external service
  // ============================================================

  async _encryptFHE(plaintext, envelope) {
    try {
      const response = await axios.post(
        `${this.fheServiceUrl}/encrypt`,
        {
          plaintext,
          metadata: { mode: envelope.mode, version: envelope.version },
        },
        {
          timeout: 10000,
          headers: { "Content-Type": "application/json" },
        }
      );

      return {
        ...envelope,
        payload: response.data.payload || response.data,
      };
    } catch (error) {
      throw new Error(`FHE encryption failed: ${error.message}`);
    }
  }

  async _decryptFHE(envelope) {
    try {
      const response = await axios.post(
        `${this.fheServiceUrl}/decrypt`,
        { envelope: envelope.payload },
        {
          timeout: 10000,
          headers: { "Content-Type": "application/json" },
        }
      );

      return response.data.plaintext || response.data;
    } catch (error) {
      throw new Error(`FHE decryption failed: ${error.message}`);
    }
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  _isValidEnvelope(envelope) {
    return (
      envelope &&
      typeof envelope === "object" &&
      typeof envelope.mode === "string" &&
      typeof envelope.version === "number" &&
      envelope.payload &&
      typeof envelope.payload === "object"
    );
  }

  isValidEnvelope(envelope) {
    return this._isValidEnvelope(envelope);
  }

  /**
   * Get service info (safe to expose — no secrets)
   */
  getInfo() {
    return {
      mode: this.mode,
      version: ENVELOPE_VERSION,
      initialized: this._initialized,
      fheServiceUrl: this.mode === "fhe" ? this.fheServiceUrl : undefined,
    };
  }
}

// Export singleton instance
export default new EncryptionService();
