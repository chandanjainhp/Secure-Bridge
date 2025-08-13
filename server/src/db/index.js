// Import mongoose library for MongoDB operations
import mongoose from "mongoose";
// Import the database name constant from constants file
import { DB_NAME } from "../constants.js";

// Asynchronous function to establish connection with MongoDB database
const connectDB = async () => {
    try {
        // Attempt to connect to MongoDB using connection string from environment variables
        // The connection string combines MONGODB_URI from .env file with DB_NAME constant
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        
        // Log successful connection with the host information
        console.log(`\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        // If connection fails, log the error details
        console.log("MONGODB connection FAILED ", error);
        
        // Exit the application with error code 1 (indicates failure)
        // This prevents the app from running without a database connection
        process.exit(1)
    }
}

// Export the connectDB function as default export so it can be imported in other files
export default connectDB