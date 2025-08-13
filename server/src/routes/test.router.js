import express from 'express';

console.log('🧪 Test router loaded');
const router = express.Router();

router.get('/hello', (req, res) => {
    console.log('🧪 Hello endpoint called');
    res.json({ message: 'Hello from test router!' });
});

export default router;
