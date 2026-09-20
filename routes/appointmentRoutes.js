const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const settingsController = require('../controllers/settingsController');

// --- طلبات الاستعلام (GET) ---
router.get('/', appointmentController.getAppointments);
router.get('/today', appointmentController.getTodayAppointments);
router.get('/next', appointmentController.getNextAppointment);
router.get('/treatments', appointmentController.getTreatmentTypes);
router.get('/available-slots', appointmentController.getAvailableSlots);
router.get('/smart-search', appointmentController.smartSearch);
router.get('/stats/:doctor_id', appointmentController.getDoctorStats);

// --- طلبات الإنشاء والتعديل (POST) ---
router.post('/create', appointmentController.createAppointment);
router.post('/by-date', appointmentController.getAppointmentsByDate);
router.post('/booked-slots', appointmentController.getBookedSlots);
router.post('/stats', appointmentController.getAppointmentStats);
router.post('/update-status', appointmentController.updateAppointmentStatus);
router.post('/complete-visit', appointmentController.completeVisit);

// --- طلبات الحذف (DELETE) ---
router.delete('/delete/:appointment_id', appointmentController.deleteAppointment);

// --- إعدادات النظام (Settings) ---
router.get('/settings', settingsController.getSettings);
router.post('/settings/update', settingsController.updateSettings);

module.exports = router;