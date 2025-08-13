
// export {asyncHandler}
// STEP 1: Basic empty function
// This is just a simple arrow function that does nothing
// () => {} means: takes no parameters, returns nothing
// const asyncHandler = () => {}  -----------

// STEP 2: Higher-order function that accepts a function parameter
// (func) => () => {} means: 
// - Takes a function 'func' as parameter
// - Returns another function that takes no parameters
// This is the foundation of a wrapper function
// const asyncHandler = (func) => () => {} ---------------

// STEP 3: Return an async function
// (func) => async () => {} means:
// - Takes a function 'func' as parameter  
// - Returns an ASYNC function that can use await
// - The returned function can handle promises
// const asyncHandler = (func) => async () => {} ----------------

// STEP 4: Complete implementation (what you actually need)
// This is the final, working version that handles Express.js async routes
// const asyncHandler = (fn) => async (req, res, next) => {
//     try {
        // Execute the passed function with Express parameters
        // await ensures we wait for async operations to complete
    //     await fn(req, res, next)
    // } catch (error) {
        // If any error occurs, pass it to Express error handling middleware
        // next(error) triggers Express's error handling system
//         next(error)
//     }
// }
//               -----------------type two ----------------------------

// Higher-order function that takes a request handler function as parameter
// This is a utility to wrap async Express route handlers and automatically catch errors
const asyncHandler = (requestHandler) => {
    // SYNTAX ERROR: Missing 'return' keyword here!
    // This should return the inner function, not just declare it
    return (req, res, next) => {
        // Promise.resolve() ensures that whatever requestHandler returns becomes a Promise
        // This works whether requestHandler is:
        // 1. An async function (already returns a Promise)
        // 2. A regular function that might return a value
        // 3. A function that throws an error synchronously
        Promise.resolve(
            // Execute the original request handler with Express parameters
            // req = request object, res = response object, next = next middleware function
            requestHandler(req, res, next)
        )
        // .catch() handles any errors that occur during Promise execution
        // This includes:
        // 1. Async errors (rejected promises)
        // 2. Synchronous errors (thrown exceptions)
        // 3. Database connection errors
        // 4. Validation errors, etc.
        .catch((err) => {
            // Pass the error to Express's error handling middleware
            // next(err) triggers the error handling chain in Express
            // Express will then call any error handling middleware you've defined
            next(err)
        })
    }
}

export { asyncHandler }