/**
 * FHE Stub Service — Honest simulation for development and testing.
 *
 * This is NOT real Fully Homomorphic Encryption. It is a transparent stub
 * that simulates the API surface of an FHE service for development purposes.
 * It uses AES-256-GCM for envelope encryption (not base64 pretending to be FHE)
 * and is explicit about the fact that it decrypts data to compute on it.
 *
 * For production FHE, replace this with a real FHE backend (e.g. a Python
 * sidecar running openfhe-python, or a dedicated FHE service) that performs
 * computation on ciphertexts without decryption.
 */

import crypto from "crypto";

// ============================================================
// CONSTANTS
// ============================================================

const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;

// Simple keyword sets for simulated operations
const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "amazing", "wonderful", "love", "like", "happy",
  "fantastic", "brilliant", "awesome", "perfect", "delighted", "pleased",
]);
const NEGATIVE_WORDS = new Set([
  "bad", "terrible", "awful", "hate", "dislike", "sad", "angry", "frustrated",
  "horrible", "poor", "disappointing", "annoying", "worst", "broken",
]);
const BLOCKED_WORDS = new Set([
  "spam", "scam", "virus", "malware", "phishing", "fraud",
]);

// ============================================================
// SERVICE
// ============================================================

class FHEStub {
  constructor() {
    this.initialized = false;
    this.simulationMode = true; // Always true — this IS a simulation

    // Derive a stable key from env or generate an ephemeral one
    const rawKey = process.env.FHE_STUB_KEY;
    if (rawKey) {
      this._key = crypto.createHash("sha256").update(rawKey).digest();
    } else {
      this._key = crypto.randomBytes(KEY_LENGTH);
      console.warn(
        "⚠️  FHE_STUB_KEY not set — using an ephemeral key. Encrypted data will not survive a restart."
      );
    }
  }

  /**
   * Initialize the service. In the stub, this is a no-op with a small delay
   * to simulate startup.
   */
  async initialize() {
    console.log("🔐 Initializing FHE Stub (simulation mode)...");
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.initialized = true;
    console.log("✅ FHE Stub initialized (simulation mode)");
    return true;
  }

  isInitialized() {
    return this.initialized;
  }

  /**
   * Generate a unique message ID
   */
  _generateId() {
    return `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * Generate a unique operation ID
   */
  _generateOpId() {
    return `op_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  // ============================================================
  // ENCRYPT / DECRYPT (AES-256-GCM, not base64)
  // ============================================================

  async encryptMessage(message) {
    if (!this.initialized) throw new Error("FHE Stub not initialized");
    if (typeof message !== "string") throw new Error("Message must be a string");

    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this._key, nonce);

    const ciphertext = Buffer.concat([
      cipher.update(message, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const messageId = this._generateId();

    return {
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: tag.toString("base64"),
      algorithm: "AES-256-GCM (stub — not real FHE)",
      metadata: {
        messageId,
        timestamp: new Date().toISOString(),
        originalLength: Buffer.byteLength(message, "utf8"),
        simulationMode: true,
        // Note: homomorphicCapable is false — this stub cannot compute on ciphertexts
        homomorphicCapable: false,
      },
    };
  }

  async decryptMessage(encryptedData) {
    if (!this.initialized) throw new Error("FHE Stub not initialized");

    // Accept either a string (raw ciphertext) or the full envelope object
    let ciphertextBase64, nonceBase64, tagBase64;

    if (typeof encryptedData === "string") {
      // Legacy format: raw base64 string (from the old mock)
      // Try to decode as base64
      try {
        const decoded = Buffer.from(encryptedData, "base64").toString("utf8");
        const match = decoded.match(/^ENCRYPTED_\d+_(.+)$/);
        return match ? match[1] : decoded;
      } catch {
        return encryptedData; // passthrough
      }
    }

    if (!encryptedData || !encryptedData.ciphertext) {
      throw new Error("Invalid encrypted data: missing ciphertext");
    }

    ciphertextBase64 = encryptedData.ciphertext;
    nonceBase64 = encryptedData.nonce;
    tagBase64 = encryptedData.tag;

    // If no nonce/tag, this might be old-format base64 data
    if (!nonceBase64 || !tagBase64) {
      try {
        return Buffer.from(ciphertextBase64, "base64").toString("utf8");
      } catch {
        throw new Error("Decryption failed: data is not valid base64 and has no nonce/tag");
      }
    }

    try {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this._key,
        Buffer.from(nonceBase64, "base64")
      );
      decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextBase64, "base64")),
        decipher.final(),
      ]);

      return plaintext.toString("utf8");
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  // ============================================================
  // HOMOMORPHIC OPERATIONS (simulated — decrypts to compute)
  // ============================================================

  /**
   * NOTE: These operations decrypt the data first, compute in plaintext,
   * then re-encrypt the result. This is NOT real homomorphic computation.
   * The metadata.simulatedComputation flag is set to true to be honest about this.
   */

  async performHomomorphicOperation(operation, ...inputs) {
    if (!this.initialized) throw new Error("FHE Stub not initialized");

    const opId = this._generateOpId();

    console.log(
      `🧮 [STUB] Simulated homomorphic operation: ${operation} on ${inputs.length} inputs`
    );

    let result;

    switch (operation) {
      case "sentiment_analysis":
        result = await this._simSentimentAnalysis(inputs[0]);
        break;
      case "keyword_search":
        result = await this._simKeywordSearch(inputs[0], inputs[1]);
        break;
      case "word_count":
        result = await this._simWordCount(inputs[0]);
        break;
      case "similarity_check":
        result = await this._simSimilarityCheck(inputs[0], inputs[1]);
        break;
      case "content_filter":
        result = await this._simContentFilter(inputs[0]);
        break;
      case "encrypted_chat":
        result = {
          operation: "encrypted_chat",
          passthrough: true,
          message: "No homomorphic computation required for chat",
        };
        break;
      default:
        result = {
          operation,
          result: `simulated_${operation}_result`,
          note: "Unknown operation — returning generic stub result",
        };
    }

    return {
      operation,
      operationId: opId,
      result,
      metadata: {
        timestamp: new Date().toISOString(),
        simulationMode: true,
        simulatedComputation: true, // Honest: we decrypted to compute
        inputCount: inputs.length,
      },
    };
  }

  // ============================================================
  // SIMULATED OPERATIONS
  // ============================================================

  async _simSentimentAnalysis(encryptedMessage) {
    const text = await this.decryptMessage(encryptedMessage);
    const words = text.toLowerCase().split(/\s+/);

    let positive = 0;
    let negative = 0;

    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) positive++;
      if (NEGATIVE_WORDS.has(word)) negative++;
    }

    const sentiment =
      positive > negative ? "positive" : negative > positive ? "negative" : "neutral";
    const confidence =
      words.length > 0 ? Math.abs(positive - negative) / words.length : 0;

    return {
      sentiment,
      confidence: Math.round(confidence * 100) / 100,
      positiveCount: positive,
      negativeCount: negative,
    };
  }

  async _simKeywordSearch(encryptedMessage, keywordInput) {
    const text = await this.decryptMessage(encryptedMessage);

    // keywordInput can be a string or an encrypted message containing keywords
    let keywords;
    if (typeof keywordInput === "string") {
      keywords = keywordInput.split(",").map((k) => k.trim());
    } else if (keywordInput && keywordInput.ciphertext) {
      const kwText = await this.decryptMessage(keywordInput);
      keywords = kwText.split(",").map((k) => k.trim());
    } else {
      keywords = [];
    }

    const lowerText = text.toLowerCase();
    const found = keywords.filter((kw) =>
      lowerText.includes(kw.toLowerCase())
    );

    return {
      found,
      count: found.length,
      searchedFor: keywords.length,
    };
  }

  async _simWordCount(encryptedMessage) {
    const text = await this.decryptMessage(encryptedMessage);
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    const charCount = text.length;

    return {
      wordCount,
      characterCount: charCount,
    };
  }

  async _simSimilarityCheck(encryptedMessage1, encryptedMessage2) {
    const text1 = await this.decryptMessage(encryptedMessage1);
    const text2 = await this.decryptMessage(encryptedMessage2);

    // Jaccard similarity on word sets
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const similarity = union.size > 0 ? intersection.size / union.size : 0;

    return {
      similarity: Math.round(similarity * 100) / 100,
      commonWords: intersection.size,
      totalUniqueWords: union.size,
    };
  }

  async _simContentFilter(encryptedMessage) {
    const text = await this.decryptMessage(encryptedMessage);
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/);

    const blocked = words.filter((w) => BLOCKED_WORDS.has(w));

    return {
      isSafe: blocked.length === 0,
      riskLevel: blocked.length === 0 ? "low" : blocked.length > 2 ? "high" : "medium",
      flaggedWords: [...new Set(blocked)],
    };
  }

  // ============================================================
  // SERVICE INFO
  // ============================================================

  getInfo() {
    return {
      name: "FHE Stub",
      version: "1.0.0",
      mode: "simulation",
      realFHE: false,
      encryptionAlgorithm: ALGORITHM,
      initialized: this.initialized,
      capabilities: {
        encryption: true,
        decryption: true,
        homomorphicOperations: "simulated (decrypts to compute)",
        supportedOperations: [
          "sentiment_analysis",
          "keyword_search",
          "word_count",
          "similarity_check",
          "content_filter",
          "encrypted_chat",
        ],
      },
    };
  }
}

export default FHEStub;
