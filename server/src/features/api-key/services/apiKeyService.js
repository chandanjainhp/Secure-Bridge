import crypto from 'crypto';
import UserApiKey from '../models/userApiKey.model.js';
import axios from 'axios';

// Encryption secret (should be in environment variable)
const ENCRYPTION_SECRET = process.env.API_KEY_ENCRYPTION_SECRET;
if (!ENCRYPTION_SECRET) {
  throw new Error('API_KEY_ENCRYPTION_SECRET is not set in environment variables');
}

// Encryption key and IV length for AES-256-GCM
const KEY_LENGTH = 32; // AES-256 uses 32-byte key
const IV_LENGTH = 12; // GCM recommended IV length
const TAG_LENGTH = 16; // GCM tag length

// Derive a fixed key from the secret (in production, use a proper key derivation function like PBKDF2)
const encryptionKey = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

// Function to encrypt a plaintext API key
function encryptApiKey(plaintextKey) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(plaintextKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    tag: tag.toString('hex'),
  };
}

// Function to decrypt an encrypted API key
function decryptApiKey(encryptedData) {
  const { iv, encryptedData: data, tag } = encryptedData;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Function to mask an API key (show only last 4 characters)
function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 4) return key;
  return '•'.repeat(key.length - 4) + key.slice(-4);
}

// Service functions
const apiKeyService = {
  // Save or update the user's API key
  async saveApiKey(userId, provider, plaintextKey) {
    if (process.env.SKIP_API_KEY_VALIDATION !== 'true') {
      await this.validateApiKey(provider, plaintextKey);
    }

    // Encrypt the key
    const { iv, encryptedData, tag } = encryptApiKey(plaintextKey);
    const encryptedKey = JSON.stringify({ iv, encryptedData, tag });

    // Upsert: update if exists, else create
    const apiKey = await UserApiKey.findOneAndUpdate(
      { userId },
      { provider, encryptedKey },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return apiKey;
  },

  // Get the user's API key (returns masked key and boolean hasKey)
  async getApiKey(userId) {
    const apiKey = await UserApiKey.findOne({ userId });
    if (!apiKey) {
      return { hasKey: false, maskedKey: null };
    }

    // We don't decrypt the key here for security; we only return masked version
    // But we need to decrypt to mask? Actually, we can mask the encrypted data? No.
    // We have to decrypt to get the plaintext to mask it? But we don't want to expose the plaintext.
    // However, we are in the server and we are going to return the masked key to the client.
    // We can decrypt it in memory, mask it, and then return the masked key.
    // The plaintext key never leaves the server memory.

    const encrypted = JSON.parse(apiKey.encryptedKey);
    const plaintextKey = decryptApiKey(encrypted);
    const maskedKey = maskApiKey(plaintextKey);

    return { hasKey: true, maskedKey };
  },

  // Delete the user's API key
  async deleteApiKey(userId) {
    await UserApiKey.deleteOne({ userId });
  },

  // Validate the API key by making a test call to the provider
  async validateApiKey(provider, plaintextKey) {
    // For now, we only support OpenAI. We can extend to other providers.
    if (provider !== 'openai') {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Make a test call to OpenAI API to validate the key
    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${plaintextKey}`,
        },
        timeout: 5000, // 5 seconds timeout
      });

      // If we get a successful response, the key is valid
      if (response.status === 200 && response.data && response.data.data) {
        return true;
      } else {
        throw new Error('Invalid response from OpenAI');
      }
    } catch (error) {
      // If the error is due to invalid key, throw a specific error
      if (error.response && error.response.status === 401) {
        throw new Error('Invalid API key');
      }
      throw new Error(`Failed to validate API key: ${error.message}`);
    }
  },
};

// Export individual functions
export { 
  apiKeyService,
  encryptApiKey,
  decryptApiKey,
  maskApiKey
};