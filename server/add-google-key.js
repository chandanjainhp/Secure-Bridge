import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Constants
const DB_NAME = "BACKEND";
const USER_ID = "6890bc025f44f5ac5c348507"; // Your user ID

// Encryption configuration (same as in the model)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'MDEyMzQ1Njc4OUFCQ0RFRjAxMjM0NTY3ODlBQkNERUY=';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Encrypt external API key
function encryptExternalKey(apiKey) {
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
}

// Mask API key for display
function maskExternalKey(apiKey, provider) {
  if (!apiKey || apiKey.length < 8) {
    return '••••••••';
  }
  
  if (provider === 'google_ai_studio' || provider === 'google') {
    return `${apiKey.substring(0, 6)}${'•'.repeat(Math.max(0, apiKey.length - 10))}${apiKey.slice(-4)}`;
  }
  
  const visibleLength = Math.min(4, Math.floor(apiKey.length / 3));
  const maskedLength = Math.max(0, apiKey.length - (visibleLength * 2));
  return `${apiKey.substring(0, visibleLength)}${'•'.repeat(maskedLength)}${apiKey.slice(-visibleLength)}`;
}

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const fullUri = `${mongoUri}/${DB_NAME}`;
console.log('🔗 Connecting to MongoDB Atlas...');
console.log('📊 Database:', DB_NAME);

await mongoose.connect(fullUri);
console.log('✅ Connected to MongoDB\n');

const db = mongoose.connection.db;
const apiKeysCollection = db.collection('apikeys');

// Your Google AI Studio API key
const externalKey = 'AIzaSyCcG6EYzYIBN0-Dv_d0Eg89KKNMJpzCxE4';
const provider = 'google_ai_studio';

console.log('🔑 Adding Google AI Studio API Key...\n');
console.log(`Provider: ${provider}`);
console.log(`User ID: ${USER_ID}\n`);

// Encrypt the key
const encryptionResult = encryptExternalKey(externalKey);
const maskedKey = maskExternalKey(externalKey, provider);

console.log(`Masked Key: ${maskedKey}`);
console.log(`Encrypted: ✅\n`);

// Create the API key document
const apiKeyDoc = {
  name: 'Google AI Studio - Chat',
  description: 'Google AI Studio API key for Gemini models',
  userId: new mongoose.Types.ObjectId(USER_ID),
  
  // Key fields
  key: maskedKey,
  keyPrefix: `${provider.substring(0, 4)}-****${externalKey.slice(-4)}`,
  hashedKey: crypto.createHash('sha256').update(encryptionResult.encrypted).digest('hex'),
  
  // External key fields
  isExternal: true,
  provider: 'google_ai_studio',  // CRITICAL: Both fields must be set
  externalProvider: 'google_ai_studio',
  externalKeyEncrypted: encryptionResult.encrypted,
  encryptionIV: encryptionResult.iv,
  encryptionTag: encryptionResult.tag,
  
  // Permissions - MUST include chat permissions
  permissions: [
    'chat.access',
    'chat.completions',
    'fhe.encrypt',
    'fhe.decrypt',
    'fhe.compute',
    'fhe.ai_chat',
    'mcp.connect',
    'mcp.tools'
  ],
  
  // Rate limits
  rateLimit: {
    requestsPerMinute: 100,
    requestsPerHour: 1000,
    requestsPerDay: 10000
  },
  
  // Status - MUST be active
  status: 'active',
  
  // Usage tracking
  usage: {
    totalRequests: 0,
    firstUsed: null,
    lastUsed: null,
    dailyUsage: [],
    monthlyUsage: []
  },
  
  // Audit trail
  auditLog: [{
    action: 'created',
    timestamp: new Date(),
    userId: new mongoose.Types.ObjectId(USER_ID),
    metadata: {
      source: 'manual_script',
      reason: 'Initial setup'
    }
  }],
  
  // Security
  ipWhitelist: [],
  domainWhitelist: [],
  
  // Timestamps
  createdAt: new Date(),
  updatedAt: new Date()
};

// Check for existing key
const existing = await apiKeysCollection.findOne({ key: maskedKey });

if (existing) {
  console.log('⚠️  API key already exists in database');
  console.log(`   ID: ${existing._id}`);
  console.log(`   Status: ${existing.status}`);
  
  if (existing.status === 'revoked') {
    console.log('\n🔄 Reactivating existing key...');
    
    await apiKeysCollection.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: 'active',
          provider: 'google_ai_studio',
          permissions: apiKeyDoc.permissions,
          rateLimit: apiKeyDoc.rateLimit,
          updatedAt: new Date()
        }
      }
    );
    
    console.log('✅ Key reactivated successfully!');
  } else {
    console.log('\n✅ Key is already active. No action needed.');
  }
} else {
  console.log('💾 Inserting API key into database...\n');
  
  const result = await apiKeysCollection.insertOne(apiKeyDoc);
  
  console.log('✅ API key added successfully!');
  console.log(`   ID: ${result.insertedId}\n`);
}

// Verify the key is chat-capable
const verifyKey = await apiKeysCollection.findOne({
  userId: new mongoose.Types.ObjectId(USER_ID),
  status: 'active',
  $or: [
    { provider: 'google_ai_studio' },
    { externalProvider: 'google_ai_studio' }
  ]
});

console.log('📊 Verification:');
if (verifyKey) {
  console.log('   ✅ API key found in database');
  console.log(`   ✅ Status: ${verifyKey.status}`);
  console.log(`   ✅ Provider: ${verifyKey.provider}`);
  console.log(`   ✅ External Provider: ${verifyKey.externalProvider}`);
  console.log(`   ✅ Permissions: ${verifyKey.permissions.join(', ')}`);
  
  const hasChatPermission = verifyKey.permissions.includes('chat.access') || 
                           verifyKey.permissions.includes('chat.completions');
  console.log(`   ${hasChatPermission ? '✅' : '❌'} Chat permissions: ${hasChatPermission}`);
  
  if (hasChatPermission && verifyKey.status === 'active') {
    console.log('\n🎉 SUCCESS! API key is ready for chat!');
  } else {
    console.log('\n⚠️  API key exists but may not work for chat');
  }
} else {
  console.log('   ❌ API key NOT found - something went wrong!');
}

await mongoose.disconnect();
console.log('\n✅ Disconnected from MongoDB\n');
