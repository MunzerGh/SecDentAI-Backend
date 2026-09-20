const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleWare');

// مسارات تسجيل الدخول والتسجيل (عامة)
router.post('/login', authController.login);
router.post('/register', authController.register);

// مسارات محمية تتطلب التوكن
router.get('/profile/:user_id', authenticateToken, authController.getUserProfile);
router.post('/logout', authenticateToken, authController.logoutDoctor);

module.exports = router;