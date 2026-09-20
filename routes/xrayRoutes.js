const express = require('express');
const router = express.Router();
const xrayController = require('../controllers/xrayController');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// التأكد من وجود مجلد رفع صور الأشعة تلقائياً لتجنب أخطاء Multer
const uploadDir = path.join(__dirname, '../uploads/xrays');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// إعداد التخزين باستعمال diskStorage للحفاظ على اللاحقة
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/xrays/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `xray-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 } // حد أقصى 15 ميغابايت للصورة
});

// مسار رفع وتحليل صورة الأشعة
router.post('/upload', upload.single('image'), xrayController.uploadAndAnalyzeXray);

// مسارات جلب أرشيف أشعة مريض معين (دعم POST و GET)
router.post('/patient/xrays', xrayController.getPatientXrays);
router.get('/patient/:patient_id/xrays', xrayController.getPatientXrays);

// جلب نتيجة تحليل صورة أشعة واحدة محددة
router.get('/analysis/:xray_id', xrayController.getXrayAnalysis);

module.exports = router;