const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');

// استدعاء ميدل وير المصادقة (مع تحسين التسمية لتطابق القياسات)
const authenticateToken = require('../middleware/authMiddleWare'); 

// روابط الـ GET العامة (Google OAuth)
router.get('/google/auth-url', integrationController.getGoogleAuthUrl);
router.get('/google/callback', integrationController.googleCallback);

// الروابط المحمية - تم تطبيق authenticateToken كـ Middleware فعلي
router.get('/google/check-availability', authenticateToken, integrationController.checkAvailability);
router.post('/google/book-appointment', authenticateToken, integrationController.bookAppointment);
router.post('/google/cancel-appointment', authenticateToken, integrationController.cancelAppointment);
router.get('/doctor/appointments/:doctor_id', authenticateToken, integrationController.getDoctorAppointments);
router.get('/doctor/stats/:doctor_id', authenticateToken, integrationController.getDashboardStats);

module.exports = router;