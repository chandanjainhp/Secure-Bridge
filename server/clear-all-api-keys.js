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
console.log('✅ Connected to MongoDB\n');

// Get collections
const db = mongoose.connection.db;
const apiKeysCollection = db.collection('apikeys');

// Count existing API keys
const count = await apiKeysCollection.countDocuments();
console.log(`📊 Found ${count} API key(s) in database\n`);

if (count > 0) {
  // Show all keys before deletion
  const allKeys = await apiKeysCollection.find({}).toArray();
  
  console.log('📋 API Keys to be deleted:\n');
  allKeys.forEach((key, index) => {
    console.log(`[${index + 1}] ${key.name || 'Unnamed'}`);
    console.log(`    ID: ${key._id}`);
    console.log(`    User ID: ${key.userId}`);
    console.log(`    Provider: ${key.provider || key.externalProvider || 'N/A'}`);
    console.log(`    Status: ${key.status}`);
    console.log(`    Created: ${key.createdAt}`);
    console.log('');
  });

  console.log('⚠️  WARNING: This will delete ALL API keys from the database!');
  console.log('🗑️  Deleting all API keys...\n');

  // Delete all API keys
  const result = await apiKeysCollection.deleteMany({});

  console.log(`✅ Successfully deleted ${result.deletedCount} API key(s)\n`);

  // Verify deletion
  const remainingCount = await apiKeysCollection.countDocuments();
  console.log(`📊 Remaining API keys: ${remainingCount}\n`);

  if (remainingCount === 0) {
    console.log('✅ All API keys have been cleared from the database');
    console.log('ℹ️  You can now add new API keys without duplicate errors');
  }
} else {
  console.log('ℹ️  No API keys found in database. Nothing to delete.');
}

await mongoose.disconnect();
console.log('\n✅ Disconnected from MongoDB\n');
