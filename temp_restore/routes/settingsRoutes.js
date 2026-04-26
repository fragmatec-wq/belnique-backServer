const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
  .get(settingsController.getSettings)
  .put(protect, admin, settingsController.updateSettings);

module.exports = router;
