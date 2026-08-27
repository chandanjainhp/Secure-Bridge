// OLD WAY: CommonJS syntax for loading environment variables (commented out)
// require ('dotenv').config({path: './env'})

// NEW WAY: ES6 module syntax for importing dotenv package
// dotenv allows us to load environment variables from a .env file
import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url) });

// Import our Express app configuration from app.js
// This contains all the middleware setup and route configurations
import { app } from "./app.js";

// COMMENTED OUT: These imports were moved to the db/index.js file for better organization
// import mongoose from "mongoose";
// import { DB_NAME } from "./src/constants";

// Import our custom database connection function from the db folder
// This function handles MongoDB connection with proper error handling
import connectDB from "./db/index.js";
// Import Redis connection function
import { connectRedis } from "./config/redis.js";
import { validateEnvironment } from "./config/env.js";

try {
  validateEnvironment();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Call the database connection function and handle the Promise it returns
// This establishes connection to MongoDB before starting the application
connectDB()
  .then(() => {
    // Connect to Redis
    return connectRedis();
  })
  .then(() => {
    // Add error handling for the Express app
    app.on('error', (error) => {
        console.log("Express app error: ", error);
        throw error;
    });
    
    // Start the Express server only AFTER the database connection is established
    // This ensures we don't accept requests before the database is ready
    app.listen(process.env.PORT || 8000, () => {
        // This callback runs when the server successfully starts listening
        // Template literal to display which port the server is running on
        // Uses environment variable PORT if available, otherwise defaults to 8000
        console.log(`🚀 Server is running at port: ${process.env.PORT || 8000}`);
    })
  }) 
  // .catch() executes if the database connection fails
  // This prevents the server from starting if there's no database connection
  .catch((err) => {
    // Log the error message with details about the MongoDB connection failure
    console.log("MONGO DB connection failed !!! ", err);
    // Exit the process since we can't run without database
    process.exit(1);
  });