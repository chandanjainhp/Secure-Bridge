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
  
  // Update ALL API keys for this user
  const result = await collection.updateMany(
    { userId: userId },
    { 
      $set: { 
        status: 'active',
        provider: 'google_ai_studio'
      } 
    }
  );
  
  console.log(`✅ Updated ${result.modifiedCount} API keys`);
  
  // Verify
  const keys = await collection.find({ userId }).toArray();
  console.log(`\n📊 API Keys after update:`);
  keys.forEach((key, index) => {
    console.log(`\n[${index + 1}] ${key.name}`);
    console.log(`  Status: ${key.status}`);
    console.log(`  Provider: ${key.provider || 'N/A'}`);
    console.log(`  External Provider: ${key.externalProvider}`);
    console.log(`  Permissions: ${JSON.stringify(key.permissions)}`);
  });
  
} finally {
  await client.close();
  console.log('\n✅ Done!\n');
}
