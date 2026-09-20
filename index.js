require('dotenv').config();
require('./bot'); // استدعاء ملف البوت ليبدأ العمل فور تشغيل السيرفر
const express = require('express');
const cors = require('cors');
const path = require('path');

// استيراد المسارات
const appointmentRoutes = require('./routes/appointmentRoutes');
const patientRoutes = require('./routes/patientRoutes');
const labRoutes = require('./routes/labRoutes');
const authRoutes = require('./routes/authRoutes');
const xrayRoutes = require('./routes/xrayRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const n8nRouter = require('./routes/n8nRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const profileRoutes = require('./routes/profileRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');

const app = express();

app.use(cors());
app.use(express.json()); // لفك تشفير بيانات الـ JSON القادمة من Flutter أو Postman

// تفعيل المسارات
app.use('/api/appointments', appointmentRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/xrays', xrayRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/integrations', integrationRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/n8n', n8nRouter);
app.use('/api/settings', settingsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/emergency', emergencyRoutes);

// معالج الأخطاء العام (Global Error Handler) لمنع انهيار السيرفر
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// 💡 إعطاء السيرفر مهلة 10 دقائق لرفع الملفات الكبيرة دون أن يفصل الاتصال
server.timeout = 600000;