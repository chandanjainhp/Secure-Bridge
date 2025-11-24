import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/secure-bridge');

console.log('✅ Connected to MongoDB');
console.log('📊 Database:', mongoose.connection.db.databaseName);

const ApiKeySchema = new mongoose.Schema({}, { strict: false, collection: 'apikeys' });
const ApiKey = mongoose.model('ApiKey', ApiKeySchema);

// Find all API keys for your user (regardless of status)
const userId = '6890bc025f44f5ac5c348507';
const apiKeys = await ApiKey.find({ userId });

console.log(`\n🔍 Found ${apiKeys.length} API keys total\n`);

for (const key of apiKeys) {
  console.log(`Fixing key: ${key.name} (ID: ${key._id})`);
  console.log(`  Before: status=${key.status}, provider=${key.provider || 'N/A'}, externalProvider=${key.externalProvider}`);
  
  // Update the key directly in database
  await ApiKey.updateOne(
    { _id: key._id },
    { 
      $set: {
        status: 'active',
        provider: key.externalProvider || 'google_ai_studio'
      }
    }
  );
  
  console.log(`  After: status=active, provider=${key.externalProvider || 'google_ai_studio'}`);
  console.log(`  ✅ Fixed!\n`);
}

// Now check if there are any active keys
const activeKeys = await ApiKey.find({ 
  userId, 
  status: 'active',
  permissions: { $in: ['chat.access', 'chat.completions'] }
});

console.log(`\n✅ Total active chat-capable keys: ${activeKeys.length}\n`);

if (activeKeys.length > 0) {
  console.log('Active keys:');
  activeKeys.forEach(key => {
    console.log(`  - ${key.name} (Provider: ${key.provider || key.externalProvider})`);
  });
} else {
  console.log('⚠️  No active keys found after fix!');
}

// Delete old revoked duplicate keys (keep only the most recent active one)
if (activeKeys.length > 1) {
  console.log(`\n🗑️  You have ${activeKeys.length} active keys. Keeping the most recent one...`);
  
  // Sort by creation date
  const sorted = activeKeys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const toKeep = sorted[0];
  const toDelete = sorted.slice(1);
  
  console.log(`\n✅ Keeping: ${toKeep.name} (${toKeep._id})`);
  console.log(`\n🗑️  Deleting ${toDelete.length} older keys...`);
  
  for (const key of toDelete) {
    console.log(`  Deleting: ${key.name} (${key._id})`);
    await ApiKey.deleteOne({ _id: key._id });
  }
  
  console.log('\n✅ Cleanup complete!');
}

await mongoose.disconnect();
console.log('\n✅ Done!\n');
