import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();
  console.log('✅ Connected to MongoDB');
  
  const db = client.db();
  const collection = db.collection('apikeys');
  
  const userId = new ObjectId('6890bc025f44f5ac5c348507');
  
  // Get all keys sorted by creation date (newest first)
  const keys = await collection.find({ userId }).sort({ createdAt: -1 }).toArray();
  
  console.log(`\n📊 Found ${keys.length} API keys`);
  
  if (keys.length > 1) {
    const keepKey = keys[0]; // Keep the newest one
    const deleteKeys = keys.slice(1); // Delete the rest
    
    console.log(`\n✅ Keeping newest key: ${keepKey.name} (ID: ${keepKey._id})`);
    console.log(`\n🗑️  Deleting ${deleteKeys.length} older duplicate keys...`);
    
    for (const key of deleteKeys) {
      console.log(`  Deleting: ${key.name} (ID: ${key._id})`);
      await collection.deleteOne({ _id: key._id });
    }
    
    console.log(`\n✅ Deleted ${deleteKeys.length} duplicate keys!`);
  } else {
    console.log(`\n✅ Only one key found, no cleanup needed!`);
  }
  
  // Verify
  const remaining = await collection.countDocuments({ userId });
  console.log(`\n📊 Remaining API keys: ${remaining}`);
  
} finally {
  await client.close();
  console.log('\n✅ Done!\n');
}
