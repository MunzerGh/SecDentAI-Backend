const express = require('express');
const router = express.Router();
const controller = require('../controllers/emergencyController');

// جلب الحالات الطارئة (دعم التسمية القياسية والقديمة)
router.get('/cases', controller.getEmergencyCases);
router.get('/getEmergencyCases', controller.getEmergencyCases);

// طلب وإضافة حالات طارئة جديدة
router.post('/add', controller.addEmergencyCase);
router.post('/request', controller.requestEmergency);

// إدار الحالات (قبول، جدولة، رفض، حذف)
router.post('/accept', controller.acceptEmergency);
router.post('/acceptEmergency', controller.acceptEmergency);

router.post('/accept-and-schedule', controller.acceptAndSchedule);

router.post('/reject', controller.rejectEmergencyCase);

router.post('/delete', controller.deleteEmergency);
router.post('/deleteEmergency', controller.deleteEmergency);

module.exports = router;