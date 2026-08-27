// Import mongoose library for MongoDB operations
import mongoose from "mongoose";
// Import the database name constant from constants file
import { DB_NAME } from "../constants.js";

// Asynchronous function to establish connection with MongoDB database
const connectDB = async () => {
    try {
        let uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI is required");
        if (DB_NAME && !uri.includes(`/${DB_NAME}`)) {
            const [base, ...queryParts] = uri.split('?');
            uri = `${base}/${DB_NAME}${queryParts.length ? '?' + queryParts.join('?') : ''}`;
        }
        const connectionInstance = await mongoose.connect(uri);
        console.log(`\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("MONGODB connection FAILED ", error);
        process.exit(1)
    }
}

// Export the connectDB function as default export so it can be imported in other files
export default connectDB