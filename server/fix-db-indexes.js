// Script to fix MongoDB avatar index issue
import mongoose from 'mongoose';
import { DB_NAME } from './src/constants.js';

// Connect to MongoDB
const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        console.log(`\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
        
        // Drop the problematic avatar index
        try {
            await mongoose.connection.db.collection('users').dropIndex('avatar_1');
            console.log('✅ Dropped avatar_1 index successfully');
        } catch (error) {
            if (error.code === 27) {
                console.log('ℹ️  avatar_1 index does not exist (already dropped)');
            } else {
                console.log('⚠️  Error dropping avatar_1 index:', error.message);
            }
        }
        
        // List all remaining indexes
        const indexes = await mongoose.connection.db.collection('users').indexes();
        console.log('📋 Current indexes on users collection:');
        indexes.forEach(index => {
            console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.log("MONGODB connection FAILED ", error);
        process.exit(1);
    }
}

connectDB();
