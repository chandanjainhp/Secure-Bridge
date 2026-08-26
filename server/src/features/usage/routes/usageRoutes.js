const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usageController');
const { verifyJWT } = require('../../../middlewares/auth.middle.js');

router.use(verifyJWT);

router.get('/', usageController.getUsage);

module.exports = router;