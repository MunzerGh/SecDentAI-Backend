const express = require('express');
const router = express.Router();
const n8nController = require('../controllers/n8nController');

// 🎯 فحص الساعات المحجوزة (دعم GET و POST لمرونة n8n)
router.get('/booked-slots', n8nController.getBookedSlots);
router.post('/booked-slots', n8nController.getBookedSlots);

// 📝 مسارات المواعيد والأوتوماتيكية (Documenter & Scheduler)
router.post('/appointments/review/decide', n8nController.decideReviewAppointment);
router.post('/feedback', n8nController.savePatientFeedback);
router.post('/appointments/review', n8nController.scheduleReviewAppointment);
router.post('/urgent-alert', n8nController.createUrgentAlert);
router.post('/telegram-book', n8nController.createTelegramBooking);
router.post('/appointments/get', n8nController.getPatientAppointment);
router.post('/appointments/cancel', n8nController.cancelAppointment);
router.post('/appointments/update', n8nController.updateAppointment);

module.exports = router;