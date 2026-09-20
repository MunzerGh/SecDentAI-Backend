const db = require('../db'); 

// 1. إنشاء طلب مختبر جديد
exports.createLabRequest = async (req, res) => {
    try {
        const { 
            patient_id, 
            patient_name, 
            job_type, 
            tooth_number, 
            doctor_instructions,
            appointment_id = null, 
            doctor_id = 1, 
            technician_id = 2 
        } = req.body;

        if (!patient_id || !job_type) {
            return res.status(400).json({ success: false, message: "بيانات المريض أو نوع التركيبة مفقودة" });
        }

        const fullInstructions = `المريض: ${patient_name || 'غير محدد'} | سن رقم: ${tooth_number || 'غير محدد'} | الملاحظات: ${doctor_instructions || 'لا يوجد'}`;

        const [result] = await db.execute(
            `INSERT INTO lab_requests (patient_id, appointment_id, doctor_id, technician_id, job_type, doctor_instructions) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [patient_id, appointment_id, doctor_id, technician_id, job_type, fullInstructions]
        );

        let lab_phone = "+963954876001";

        if (technician_id) {
            const [techUser] = await db.execute(
                `SELECT phone FROM users WHERE user_id = ? AND role = 'lab_technician'`,
                [technician_id]
            );
            if (techUser.length > 0 && techUser[0].phone) {
                lab_phone = techUser[0].phone;
            }
        }

        return res.status(201).json({
            success: true,
            message: "تم حفظ طلب المختبر بنجاح وتوجيهه",
            data: {
                lab_id: result.insertId,
                patient_id: patient_id,
                lab_phone_number: lab_phone
            }
        });

    } catch (error) {
        console.error("Error in createLabRequest:", error);
        return res.status(500).json({ success: false, message: "حدث خطأ في السيرفر أثناء معالجة الطلب" });
    }
};

// 2. جلب الطلبات المعلقة (التي لم تتلق رداً)
exports.getPendingLabRequests = async (req, res) => {
    try {
        const query = `
            SELECT lr.*, p.full_name AS patient_name, p.phone AS patient_phone
            FROM lab_requests lr
            LEFT JOIN patients p ON lr.patient_id = p.patient_id
            ORDER BY lr.created_at DESC
        `;
        const [rows] = await db.query(query);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error("Error in getPendingLabRequests:", error);
        return res.status(500).json({ success: false, message: "حدث خطأ أثناء جلب طلبات المختبر المعلقة" });
    }
};

// 3. جلب جميع طلبات المختبر
exports.getLabRequests = async (req, res) => {
    try {
        const query = `
            SELECT lr.*, p.full_name AS patient_name 
            FROM lab_requests lr
            LEFT JOIN patients p ON lr.patient_id = p.patient_id
            ORDER BY lr.created_at DESC
        `;
        const [rows] = await db.query(query);

        return res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("Error in getLabRequests:", error);
        return res.status(500).json({ success: false, message: "حدث خطأ أثناء جلب الطلبات" });
    }
};