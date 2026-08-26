const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKeyController');
const { verifyJWT } = require('../../../middlewares/auth.middle.js');

router.use(verifyJWT);

router.post('/', apiKeyController.saveApiKey);
router.get('/', apiKeyController.getApiKey);
router.delete('/', apiKeyController.deleteApiKey);

module.exports = router;