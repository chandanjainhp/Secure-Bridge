import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function fixFullNameIndex() {
    try {
        console.log('🔧 Connecting to MongoDB to fix fullName index...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.DB_NAME || 'BACKEND'
        });
        
        console.log('✅ Connected to MongoDB successfully');
        
        // Get the users collection
        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');
        
        // List all indexes
        console.log('📋 Current indexes on users collection:');
        const indexes = await usersCollection.indexes();
        indexes.forEach(index => {
            console.log(`  - ${JSON.stringify(index.key)} (${index.name})`);
        });
        
        // Check if fullName_1 index exists and if it's unique
        const fullNameIndex = indexes.find(index => index.name === 'fullName_1');
        
        if (fullNameIndex) {
            console.log('🔍 Found fullName_1 index:', fullNameIndex);
            
            if (fullNameIndex.unique) {
                console.log('⚠️  fullName_1 index is unique - dropping it...');
                await usersCollection.dropIndex('fullName_1');
                console.log('✅ Dropped unique fullName_1 index');
                
                // Recreate as non-unique index
                console.log('🔄 Creating non-unique fullName index...');
                await usersCollection.createIndex({ fullName: 1 }, { name: 'fullName_1' });
                console.log('✅ Created non-unique fullName_1 index');
            } else {
                console.log('✅ fullName_1 index is already non-unique');
            }
        } else {
            console.log('ℹ️  No fullName_1 index found');
        }
        
        // List indexes again to confirm
        console.log('📋 Updated indexes on users collection:');
        const updatedIndexes = await usersCollection.indexes();
        updatedIndexes.forEach(index => {
            console.log(`  - ${JSON.stringify(index.key)} (${index.name}) ${index.unique ? '[UNIQUE]' : '[NON-UNIQUE]'}`);
        });
        
        console.log('🎉 fullName index fix completed successfully!');
        
    } catch (error) {
        console.error('❌ Error fixing fullName index:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the fix
fixFullNameIndex();
