const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

// مسارات جلب الإعدادات (دعم / و /get)
router.get('/', settingsController.getSettings);
router.get('/get', settingsController.getSettings);

// مسارات تحديث الإعدادات (دعم PUT و POST)
router.put('/update', settingsController.updateSettings);
router.post('/update', settingsController.updateSettings);

module.exports = router;