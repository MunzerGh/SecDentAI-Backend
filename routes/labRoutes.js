const express = require('express');
const router = express.Router();
const labController = require('../controllers/labController');

// 1. إنشاء طلب مختبر جديد
router.post('/create', labController.createLabRequest);
router.post('/', labController.createLabRequest);

// 2. جلب كافة طلبات المعمل / الطلبات المعلقة (المشار إليها بالتعليق)
if (labController.getPendingLabRequests) {
    router.get('/pending', labController.getPendingLabRequests);
}
if (labController.getLabRequests) {
    router.get('/', labController.getLabRequests);
}

module.exports = router;