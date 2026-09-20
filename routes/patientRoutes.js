const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

// مسارات الجلب العامة
router.get('/get_all_patient', patientController.getAllPatients);
router.get('/count', patientController.getTotalPatientsCount);
router.get('/feedbacks', patientController.getAllFeedbacksForDashboard);

// مسارات البحث والبروفايل (دعم POST القديم مع إضافة دعم GET المرن)
router.post('/search', patientController.searchPatients);
router.get('/search', patientController.searchPatients);

router.post('/profile', patientController.getPatientProfile);
router.get('/profile/:id', patientController.getPatientProfile);

// إضافة مريض جديد
router.post('/add', patientController.addPatient);

// مسارات مخطط الأسنان التفاعلي (Dental Chart)
router.post('/dental-chart/save', patientController.saveDentalChart);
router.post('/dental-chart', patientController.getDentalChart);
router.get('/dental-chart/:id', patientController.getDentalChart);

module.exports = router;