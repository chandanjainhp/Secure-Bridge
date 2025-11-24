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
const USER_ID = "6890bc025f44f5ac5c348507";

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const fullUri = `${mongoUri}/${DB_NAME}`;
console.log('🔗 Connecting to MongoDB Atlas...');
console.log('📊 Database:', DB_NAME);

await mongoose.connect(fullUri);
console.log('✅ Connected to MongoDB\n');

const db = mongoose.connection.db;
const apiKeysCollection = db.collection('apikeys');

console.log('🔍 Finding API keys missing the provider field...\n');

// Find all external keys that don't have provider field
const keysWithoutProvider = await apiKeysCollection.find({
  userId: new mongoose.Types.ObjectId(USER_ID),
  isExternal: true,
  provider: { $exists: false }
}).toArray();

console.log(`Found ${keysWithoutProvider.length} API key(s) without provider field\n`);

if (keysWithoutProvider.length > 0) {
  for (const key of keysWithoutProvider) {
    console.log(`📋 Fixing key: ${key.name}`);
    console.log(`   ID: ${key._id}`);
    console.log(`   External Provider: ${key.externalProvider}`);
    
    // Set provider = externalProvider
    await apiKeysCollection.updateOne(
      { _id: key._id },
      {
        $set: {
          provider: key.externalProvider,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`   ✅ Set provider: ${key.externalProvider}\n`);
  }
  
  console.log('✅ All API keys updated!\n');
}

// Verify the fix
console.log('📊 Final verification:\n');

const chatCapableKeys = await apiKeysCollection.find({
  userId: new mongoose.Types.ObjectId(USER_ID),
  status: 'active',
  permissions: { $in: ['chat.access', 'chat.completions'] },
  $or: [
    { provider: 'google_ai_studio' },
    { provider: 'google' },
    { provider: 'openai' },
    { provider: 'anthropic' }
  ]
}).toArray();

console.log(`Found ${chatCapableKeys.length} chat-capable API key(s):`);

chatCapableKeys.forEach(key => {
  console.log(`\n✅ ${key.name}`);
  console.log(`   Provider: ${key.provider}`);
  console.log(`   External Provider: ${key.externalProvider}`);
  console.log(`   Status: ${key.status}`);
  console.log(`   Permissions: ${key.permissions.join(', ')}`);
});

if (chatCapableKeys.length === 0) {
  console.log('\n⚠️  No chat-capable API keys found!');
  console.log('   The chat will not work until you have an active API key with:');
  console.log('   - status: "active"');
  console.log('   - provider: "google_ai_studio" (or other provider)');
  console.log('   - permissions: ["chat.access"] or ["chat.completions"]');
} else {
  console.log('\n🎉 SUCCESS! You have chat-capable API keys ready!');
}

await mongoose.disconnect();
console.log('\n✅ Disconnected from MongoDB\n');
