const db = require('../db');

// 1. إضافة مريض جديد
const addPatient = async (req, res) => {
    const { full_name, phone, gender, birth_date, medical_history } = req.body;

    // التحقق من الإدخالات الأساسية
    if (!full_name || !phone) {
        return res.status(400).json({
            success: false,
            message: "يرجى تقديم اسم المريض ورقم الهاتف على الأقل."
        });
    }

    try {
        const query = "INSERT INTO patients (full_name, phone, gender, date_of_birth, medical_history) VALUES (?, ?, ?, ?, ?)";
        const [result] = await db.execute(query, [full_name, phone, gender || null, birth_date || null, medical_history || null]);

        return res.status(201).json({
            success: true,
            message: "تم إضافة المريض بنجاح",
            patient_id: result.insertId
        });
    } catch (error) {
        console.error("🔴 خطأ أثناء إضافة المريض:", error);
        return res.status(500).json({
            success: false,
            message: "فشل في إضافة المريض",
            error: error.message
        });
    }
};

// 2. جلب قائمة جميع المرضى
const getAllPatients = async (req, res) => {
    try {
        const query = "SELECT * FROM patients ORDER BY created_at DESC";
        const [rows] = await db.execute(query);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error("🔴 خطأ أثناء جلب المرضى:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب قائمة المرضى",
            error: error.message
        });
    }
};

// 3. البحث عن المريض بالاسم أو رقم الهاتف (يدعم Body و Query)
const searchPatients = async (req, res) => {
    const queryTerm = req.body.query || req.query.query; 

    try {
        if (!queryTerm) {
            return res.status(400).json({ 
                success: false, 
                message: "يرجى إدخال نص للبحث في الـ Body أو الـ Query" 
            });
        }

        const sql = `SELECT * FROM patients WHERE full_name LIKE ? OR phone LIKE ? ORDER BY created_at DESC`;
        const searchTerm = `%${queryTerm}%`;
        
        const [rows] = await db.query(sql, [searchTerm, searchTerm]);
        
        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error("🔴 خطأ أثناء البحث عن المريض:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 4. جلب ملف المريض الشخصي (يدعم Body و Params و Query)
const getPatientProfile = async (req, res) => {
    const patient_id = req.body.patient_id || req.params.id || req.query.patient_id; 

    if (!patient_id) {
        return res.status(400).json({
            success: false,
            message: "الرجاء إرسال patient_id للجلب."
        });
    }

    try {
        const query = `
            SELECT patient_id, full_name, phone, date_of_birth, gender, medical_history, created_at 
            FROM patients 
            WHERE patient_id = ?
        `;
        const [rows] = await db.query(query, [patient_id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "المريض غير موجود في قاعدة البيانات."
            });
        }

        return res.status(200).json({
            success: true,
            patient: rows[0]
        });

    } catch (error) {
        console.error("🔴 خطأ أثناء جلب ملف المريض:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء جلب البيانات.",
            error: error.message
        });
    }
};

// 5. حفظ/تحديث المخطط السني بالكامل (Bulk Upsert مع معالجة المصفوفة الفارغة)
const saveDentalChart = async (req, res) => {
    const { patient_id, teeth } = req.body; 

    if (!patient_id || !teeth || !Array.isArray(teeth)) {
        return res.status(400).json({
            success: false,
            message: "البيانات المرسلة غير مكتملة أو صيغتها خاطئة."
        });
    }

    // 💡 حماية من انهيار السيرفر إذا أرسل الفرونت مصفوفة أسنان فارغة
    if (teeth.length === 0) {
        return res.status(200).json({
            success: true,
            message: "لم يتم إرسال أي أسنان للتحديث."
        });
    }

    try {
        const values = teeth.map(t => [patient_id, t.tooth_number, t.status]);

        const query = `
            INSERT INTO patient_teeth (patient_id, tooth_number, status) 
            VALUES ? 
            ON DUPLICATE KEY UPDATE status = VALUES(status)
        `;

        await db.query(query, [values]);

        return res.status(200).json({
            success: true,
            message: "تم حفظ وتحديث مخطط الأسنان بنجاح."
        });

    } catch (error) {
        console.error("🔴 خطأ أثناء حفظ مخطط الأسنان:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء الحفظ.",
            error: error.message
        });
    }
};

// 6. جلب خارطة الأسنان الخاصة بمريض محدد (يدعم Body و Params و Query)
const getDentalChart = async (req, res) => {
    const patient_id = req.body.patient_id || req.params.id || req.query.patient_id;

    if (!patient_id) {
        return res.status(400).json({ success: false, message: "يرجى إرسال patient_id" });
    }

    try {
        const query = `SELECT tooth_number, status FROM patient_teeth WHERE patient_id = ?`;
        const [rows] = await db.query(query, [patient_id]);

        return res.status(200).json({
            success: true,
            teeth: rows 
        });

    } catch (error) {
        console.error("🔴 خطأ أثناء جلب مخطط الأسنان:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 7. جلب عدد المرضى الكلي
const getTotalPatientsCount = async (req, res) => {
    try {
        const sql = `SELECT COUNT(*) AS total FROM patients`;
        const [rows] = await db.query(sql);
        
        return res.status(200).json({
            success: true,
            total_patients: rows[0].total
        });
    } catch (error) {
        console.error("🔴 خطأ أثناء جلب عدد المرضى:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 8. جلب شكاوى وآراء المرضى لـ Dashboard
const getAllFeedbacksForDashboard = async (req, res) => {
    try {
        const queryText = `
            SELECT 
                pf.id, 
                pf.patient_id, 
                p.full_name AS patient_name,
                pf.feedback_text, 
                pf.created_at 
            FROM patient_feedback pf
            JOIN patients p ON pf.patient_id = p.patient_id
            ORDER BY pf.created_at DESC
        `;
        
        const [feedbacks] = await db.query(queryText);

        return res.status(200).json({ 
            success: true, 
            count: feedbacks.length,
            data: feedbacks 
        });

    } catch (error) {
        console.error("🔴 خطأ في جلب شكاوى الـ Dashboard:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { 
    addPatient,
    searchPatients,
    getAllPatients,
    getPatientProfile,
    saveDentalChart,
    getDentalChart,
    getTotalPatientsCount,
    getAllFeedbacksForDashboard
};