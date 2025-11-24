import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Constants
const DB_NAME = "BACKEND";

// Connect to MongoDB (same pattern as the server)
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const fullUri = `${mongoUri}/${DB_NAME}`;
console.log('🔗 Connecting to:', mongoUri.includes('mongodb+srv') ? 'MongoDB Atlas' : 'Local MongoDB');
console.log('📊 Database:', DB_NAME);
await mongoose.connect(fullUri);

console.log('✅ Connected to MongoDB');
console.log('📊 Database name:', mongoose.connection.name || mongoose.connection.db.databaseName);

// Get ApiKey model
const ApiKeySchema = new mongoose.Schema({}, { strict: false, collection: 'apikeys' });
const ApiKey = mongoose.model('ApiKey', ApiKeySchema);

// Also check alternative collection names
const collections = await mongoose.connection.db.listCollections().toArray();
console.log('📦 Available collections:', collections.map(c => c.name).join(', '));

// Get User model to check authentication
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', UserSchema);

// Find all users
const users = await User.find({});
console.log('\n👥 Users in database:');
users.forEach(user => {
  console.log(`  - ${user.username || user.email} (ID: ${user._id})`);
});

// Find all API keys
const apiKeys = await ApiKey.find({});

console.log(`\n🔑 Found ${apiKeys.length} API keys in database:\n`);

apiKeys.forEach((key, index) => {
  console.log(`\n[${index + 1}] API Key Details:`);
  console.log(`  ID: ${key._id}`);
  console.log(`  Name: ${key.name || 'N/A'}`);
  console.log(`  User ID: ${key.userId}`);
  console.log(`  Provider: ${key.provider || 'N/A'}`);
  console.log(`  External Provider: ${key.externalProvider || 'N/A'}`);
  console.log(`  Status: ${key.status || 'N/A'}`);
  console.log(`  Permissions: ${JSON.stringify(key.permissions || [])}`);
  console.log(`  Has Key: ${!!(key.key || key.apiKey || key.externalKeyEncrypted)}`);
  console.log(`  Key Length: ${(key.key || key.apiKey || '').length || 'encrypted'}`);
  console.log(`  Encrypted: ${!!key.externalKeyEncrypted}`);
  console.log(`  Created: ${key.createdAt || 'N/A'}`);
});

// Check for chat-capable keys
console.log('\n\n📊 Chat-Capable API Keys:');
const chatKeys = apiKeys.filter(key => 
  key.status === 'active' && 
  (key.permissions?.includes('chat.access') || key.permissions?.includes('chat.completions'))
);

if (chatKeys.length === 0) {
  console.log('  ❌ NO CHAT-CAPABLE API KEYS FOUND!');
  console.log('  This is why you\'re getting "No available chat providers" error.');
  console.log('\n  To fix this, make sure your API key has:');
  console.log('    - status: "active"');
  console.log('    - permissions: ["chat.access"] or ["chat.completions"]');
  console.log('    - provider: "google", "openai", or "anthropic"');
} else {
  chatKeys.forEach(key => {
    const provider = key.provider || key.externalProvider;
    console.log(`  ✅ ${key.name} (Provider: ${provider})`);
  });
}

// Group by provider
console.log('\n\n🏷️  API Keys by Provider:');
const byProvider = {};
chatKeys.forEach(key => {
  const provider = key.provider || key.externalProvider || 'unknown';
  if (!byProvider[provider]) {
    byProvider[provider] = [];
  }
  byProvider[provider].push(key.name);
});

Object.entries(byProvider).forEach(([provider, names]) => {
  console.log(`  ${provider}: ${names.join(', ')}`);
});

await mongoose.disconnect();
console.log('\n✅ Disconnected from MongoDB\n');
