import mongoose from 'mongoose';

async function cleanup() {
  try {
    const uri = 'mongodb+srv://tms00002025:TMS77713@cluster0.puos7qa.mongodb.net/BACKEND';
    console.log('🔌 Connecting to MongoDB...');
    
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
    
    console.log('🧹 Removing duplicate/test API keys...');
    const result = await mongoose.connection.db.collection('apikeys').deleteMany({
      $or: [
        { keyPrefix: { $regex: 'AIzaSy' } },
        { key: { $regex: 'AIzaSy' } },
        { externalKeyEncrypted: { $exists: true } }
      ]
    });
    
    console.log(`🗑️ Deleted ${result.deletedCount} duplicate/test keys`);
    
    await mongoose.disconnect();
    console.log('🔚 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

cleanup();
