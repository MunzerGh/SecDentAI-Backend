const db = require('../db');

// 📥 دالة جلب الإعدادات (Get Settings)
exports.getSettings = async (req, res) => {
    try {
        // استخراج doctor_id ديناميكياً من المستخدم المسجل (JWT) أو من Query/Body
        const doctorId = req.user?.doctor_id || req.user?.id || req.query.doctor_id || req.body.doctor_id || 1;

        const [rows] = await db.query(
            'SELECT app_language FROM clinic_settings WHERE doctor_id = ?', 
            [doctorId]
        );
        
        if (rows.length === 0) {
            // إرجاع لغة افتراضية في حال عدم وجود إعدادات مسبقة للطبيب
            return res.status(200).json({ 
                success: true, 
                data: { app_language: 'en' } 
            });
        }

        return res.status(200).json({
            success: true,
            data: rows[0]
        });

    } catch (error) {
        console.error("❌ Error fetching settings:", error);
        return res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء جلب البيانات." });
    }
};

// 📤 دالة تحديث وحفظ الإعدادات (Update Settings)
exports.updateSettings = async (req, res) => {
    try {
        const { app_language } = req.body;
        const doctorId = req.user?.doctor_id || req.user?.id || req.body.doctor_id || 1;

        const languageData = app_language || 'en';

        // إنشاء السجل إن لم يكن موجوداً أو تحديثه إذا كان موجوداً
        const query = `
            INSERT INTO clinic_settings (doctor_id, app_language) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE app_language = VALUES(app_language)
        `;

        await db.query(query, [doctorId, languageData]);

        return res.status(200).json({
            success: true,
            message: "تم حفظ اللغة بنجاح ✅"
        });

    } catch (error) {
        console.error("❌ Error updating settings:", error);
        return res.status(500).json({ success: false, message: "خطأ داخلي في السيرفر أثناء حفظ البيانات." });
    }
};