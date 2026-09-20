const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authenticateToken = require('../middleware/authMiddleWare');

// جلب إحصائيات لوحة التحكم (دعم /stats و / لمرونة التوجيه من server.js)
router.get('/stats', dashboardController.getDashboardStats);
router.get('/', dashboardController.getDashboardStats);

module.exports = router;