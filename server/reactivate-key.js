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

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const fullUri = `${mongoUri}/${DB_NAME}`;
console.log('🔗 Connecting to MongoDB Atlas...');
console.log('📊 Database:', DB_NAME);

await mongoose.connect(fullUri);
console.log('✅ Connected to MongoDB');

// Get collections
const db = mongoose.connection.db;
const apiKeysCollection = db.collection('apikeys');

// Find the revoked API key for the user
const userId = '6890bc025f44f5ac5c348507';

console.log(`\n🔍 Looking for revoked API keys for user: ${userId}\n`);

const revokedKeys = await apiKeysCollection.find({
  userId: new mongoose.Types.ObjectId(userId),
  status: 'revoked'
}).toArray();

console.log(`Found ${revokedKeys.length} revoked API key(s)\n`);

if (revokedKeys.length > 0) {
  for (const key of revokedKeys) {
    console.log(`📋 Key Details:`);
    console.log(`  ID: ${key._id}`);
    console.log(`  Name: ${key.name}`);
    console.log(`  Provider: ${key.provider || key.externalProvider}`);
    console.log(`  Masked Key: ${key.key}`);
    console.log(`  Status: ${key.status}`);
    console.log(`  Created: ${key.createdAt}`);
    console.log('');
  }

  console.log('🔄 Reactivating all revoked keys...\n');

  const result = await apiKeysCollection.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      status: 'revoked'
    },
    {
      $set: {
        status: 'active',
        updatedAt: new Date()
      }
    }
  );

  console.log(`✅ Updated ${result.modifiedCount} API key(s) to active status\n`);

  // Verify the update
  const activatedKeys = await apiKeysCollection.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: 'active'
  }).toArray();

  console.log('📊 Active API keys after reactivation:');
  activatedKeys.forEach(key => {
    console.log(`  ✅ ${key.name} (${key.provider || key.externalProvider}) - Status: ${key.status}`);
  });
} else {
  console.log('ℹ️  No revoked API keys found for this user.');
  
  // Check if there are any active keys
  const activeKeys = await apiKeysCollection.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: 'active'
  }).toArray();

  if (activeKeys.length > 0) {
    console.log(`\n✅ User already has ${activeKeys.length} active API key(s):`);
    activeKeys.forEach(key => {
      console.log(`  - ${key.name} (${key.provider || key.externalProvider})`);
    });
  } else {
    console.log('\n⚠️  User has no API keys at all. You can add a new one through the UI.');
  }
}

await mongoose.disconnect();
console.log('\n✅ Disconnected from MongoDB\n');
