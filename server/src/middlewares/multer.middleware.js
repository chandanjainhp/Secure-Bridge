// Import the multer library for handling file uploads
// Multer is a Node.js middleware for handling multipart/form-data (file uploads)
// It's commonly used for uploading images, documents, videos, etc.
import multer from "multer"

// Configure the storage engine for multer
// This defines WHERE and HOW uploaded files will be stored on the server
const storage = multer.diskStorage({
    // destination: Defines the folder where uploaded files will be saved
    // Parameters: req (request object), file (uploaded file info), cb (callback function)
    destination: function(req, file, cb) {
        // Save all uploaded files to the './public/temp' directory
        // The first parameter (null) means no error occurred
        // The second parameter is the destination path
        cb(null, "./public/temp")
    },
    
    // filename: Defines what name the uploaded file will have when saved
    // Parameters: req (request object), file (uploaded file info), cb (callback function)
    filename: function(req, file, cb) {
        // Keep the original filename of the uploaded file
        // Example: If user uploads "profile.jpg", it will be saved as "profile.jpg"
        // The first parameter (null) means no error occurred
        // The second parameter is the filename to use
        cb(null, file.originalname)
    }
})

// Create and export the multer instance with our custom storage configuration
// This 'upload' object will be used as middleware in routes to handle file uploads
export const upload = multer({
    storage, // Use the storage configuration defined above
    // Additional options can be added here:
    // limits: { fileSize: 1024 * 1024 * 5 }, // Limit file size to 5MB
    // fileFilter: function to filter which files are accepted
})