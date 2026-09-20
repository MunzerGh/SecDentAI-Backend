const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// إنشاء مجلد الرفع تلقائياً في حال عدم وجوده لمنع انهيار السيرفر
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// إعداد التخزين لصور البروفايل
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `profile-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // حد أقصى 5 ميغابايت للصورة
});

// 1. جلب بيانات الملف الشخصي (دعم POST و GET)
router.get('/', profileController.getProfile);
router.get('/:user_id', profileController.getProfile);
router.post('/', profileController.getProfile);

// 2. تحديث بيانات الملف الشخصي مع رفع الصورة (دعم PUT و POST)
router.put('/update', upload.single('profile_image'), profileController.updateProfile);
router.post('/update', upload.single('profile_image'), profileController.updateProfile);

module.exports = router;