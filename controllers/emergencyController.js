const db = require('../db');
const axios = require('axios');

// جلب الحالات غير المقبولة (تعديل إلى LEFT JOIN لعدم خسارة الحالات المضافة من أجهزة أخرى)
exports.getEmergencyCases = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                ec.id AS emergency_id,
                ec.message,
                ec.urgency_level,
                ec.xray_image_url,
                ec.created_at,
                ec.patient_id,
                COALESCE(p.full_name, ec.patient_name, 'غير محدد') AS patient_name,
                COALESCE(p.phone, ec.phone_number, 'غير محدد') AS phone_number,
                p.gender,
                p.date_of_birth,
                p.medical_history
            FROM emergency_cases ec
            LEFT JOIN patients p ON ec.patient_id = p.patient_id
            WHERE ec.is_accepted = 0 
            ORDER BY ec.created_at DESC
        `);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error("Error in getEmergencyCases:", error.message);
        res.status(500).json({ success: false, message: "حدث خطأ أثناء جلب الحالات الطارئة: " + error.message });
    }
};

exports.acceptEmergency = async (req, res) => {
    const { id } = req.body;
    try {
        await db.query("UPDATE emergency_cases SET is_accepted = 1 WHERE id = ?", [id]);
        res.status(200).json({ success: true, message: "تم قبول ومعالجة الحالة" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteEmergency = async (req, res) => {
    const { id } = req.body;
    try {
        await db.query("DELETE FROM emergency_cases WHERE id = ?", [id]);
        res.status(200).json({ success: true, message: "تم حذف الحالة" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.addEmergencyCase = async (req, res) => {
    const { patient_name, message, urgency_level, xray_image_url, phone_number } = req.body;

    try {
        const query = `
            INSERT INTO emergency_cases 
            (patient_name, message, urgency_level, xray_image_url, phone_number, is_accepted, created_at) 
            VALUES (?, ?, ?, ?, ?, 0, NOW())
        `;
        await db.query(query, [patient_name, message, urgency_level, xray_image_url, phone_number]);

        res.status(201).json({ success: true, message: "تم إضافة حالة الطوارئ بنجاح" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// خوارزمية إزاحة المواعيد المتعارضة (استبعاد المواعيد الملغاة)
async function rescheduleNextAppointments(conflictTime, db, processedIds = []) {
    if (!conflictTime) {
        console.error("❌ خطأ: تم استدعاء rescheduleNextAppointments بقيمة conflictTime فارغة!");
        return;
    }

    const date = new Date(conflictTime.replace(' ', 'T') + 'Z'); 
    date.setTime(date.getTime() + (30 * 60 * 1000));
    const formattedNextTime = date.toISOString().slice(0, 19).replace('T', ' ');

    console.log("Searching for conflict at:", conflictTime, " | Next potential slot:", formattedNextTime);

    let query = "SELECT * FROM appointments WHERE appointment_date = ? AND status != 'Cancelled' ";
    let params = [conflictTime];
    
    if (processedIds.length > 0) {
        query += " AND appointment_id NOT IN (?)";
        params.push(processedIds);
    }
    query += " LIMIT 1";

    const [conflicting] = await db.query(query, params);

    if (conflicting.length > 0) {
        const appointmentId = conflicting[0].appointment_id;
        console.log("Found conflict, updating ID:", appointmentId, "to", formattedNextTime);

        await db.query("UPDATE appointments SET appointment_date = ? WHERE appointment_id = ?", 
            [formattedNextTime, appointmentId]
        );

        try {
            const [patients] = await db.query("SELECT full_name, phone, telegram_id FROM patients WHERE patient_id = ?", [conflicting[0].patient_id]);      
            
            if (patients.length > 0) {
                const patient = patients[0];
                await axios.post('https://secdentai.app.n8n.cloud/webhook/emergency-displaced', {
                    patientName: patient.full_name, 
                    patientPhone: patient.phone,
                    telegramId: patient.telegram_id, 
                    oldTime: conflictTime,
                    newTime: formattedNextTime,
                    appointmentId: appointmentId,
                    reason: "تم تأجيل موعدك بسبب حالة طارئة طرأت في العيادة"
                });
                console.log("Sent notification to n8n for patient:", patient.full_name);
            }
        } catch (error) {
            console.error("Error sending to n8n:", error.message);
        }

        processedIds.push(appointmentId);
        await rescheduleNextAppointments(formattedNextTime, db, processedIds);
    } else {
        console.log("No more conflicts found at this time slot.");
    }
}

exports.acceptAndSchedule = async (req, res) => {
    const { emergencyId, conflictTime, patient_id, description } = req.body;

    if (!conflictTime || !patient_id) {
        return res.status(400).json({
            success: false,
            message: "بيانات ناقصة! يجب إرسال conflictTime و patient_id"
        });
    }

    try {
        await db.query("START TRANSACTION");

        await rescheduleNextAppointments(conflictTime, db);

        await db.query(
            "INSERT INTO appointments (patient_id, doctor_id, appointment_date, status, duration_minutes, description) VALUES (?, 1, ?, 'Confirmed', 30, 'موعد طارئ')",
            [patient_id, conflictTime]
        );

        if (emergencyId) {
            await db.query("UPDATE emergency_cases SET is_accepted = 1 WHERE id = ?", [emergencyId]);
        }

        try {
            const [emergencyPatientData] = await db.query(
                "SELECT full_name, phone, telegram_id FROM patients WHERE patient_id = ? LIMIT 1", 
                [patient_id]
            );

            if (emergencyPatientData.length > 0) {
                const emergencyPatient = emergencyPatientData[0];

                await axios.post('https://secdentai.app.n8n.cloud/webhook/emergency-displaced', {
                    action: "emergency_confirmed",
                    patientName: emergencyPatient.full_name,
                    patientPhone: emergencyPatient.phone,
                    telegramId: emergencyPatient.telegram_id,
                    confirmedTime: conflictTime,
                    reason: `تم قبول طلب الحالة الطارئة الخاص بك بنجاح من قبل الطبيب، وتم حجز موعد فوري لك اليوم الساعة: ${conflictTime}`
                });
                console.log("🔥 Sent acceptance notification to n8n for emergency patient:", emergencyPatient.full_name);
            }
        } catch (n8nError) {
            console.error("❌ Error sending emergency acceptance to n8n:", n8nError.message);
        }

        await db.query("COMMIT");
        res.status(200).json({ success: true, message: "تمت الحالة الطارئة، تأجيل المواعيد المتعارضة، وإشعار المريض بنجاح" });
    } catch (error) {
        await db.query("ROLLBACK");
        res.status(500).json({ success: false, message: "حدث خطأ: " + error.message });
    }
};

exports.requestEmergency = async (req, res) => {
    const { 
        patientName, 
        phoneNumber, 
        message, 
        xrayImageUrl, 
        urgencyLevel, 
        telegramId,
        dateOfBirth,      
        gender,           
        medicalHistory    
    } = req.body;
    
    if (!patientName || !phoneNumber) {
        return res.status(400).json({ 
            success: false, 
            message: "بيانات ناقصة! يجب إرسال patientName و phoneNumber" 
        });
    }
    
    try {
        await db.query("START TRANSACTION");

        let patientId;

        const [existingPatient] = await db.query(
            "SELECT patient_id FROM patients WHERE phone = ? LIMIT 1", 
            [phoneNumber]
        );

        if (existingPatient.length > 0) {
            patientId = existingPatient[0].patient_id;
            
            await db.query(
                "UPDATE patients SET telegram_id = COALESCE(?, telegram_id), date_of_birth = COALESCE(?, date_of_birth), gender = COALESCE(?, gender), medical_history = COALESCE(?, medical_history) WHERE patient_id = ?", 
                [telegramId || null, dateOfBirth || null, gender || null, medicalHistory || null, patientId]
            );
        } else {
            const [newPatientResult] = await db.query(
                "INSERT INTO patients (full_name, phone, telegram_id, date_of_birth, gender, medical_history) VALUES (?, ?, ?, ?, ?, ?)", 
                [
                    patientName, 
                    phoneNumber, 
                    telegramId || null, 
                    dateOfBirth || null, 
                    gender || null, 
                    medicalHistory || null
                ]
            );
            patientId = newPatientResult.insertId;
        }

        const [emergencyResult] = await db.query(
            "INSERT INTO emergency_cases (patient_id, message, xray_image_url, urgency_level, is_accepted) VALUES (?, ?, ?, ?, 0)", 
            [
                patientId, 
                message || 'طلب حالة طارئة عبر البوت', 
                xrayImageUrl || null, 
                urgencyLevel || 'critical'
            ]
        );
        
        await db.query("COMMIT");

        res.status(201).json({ 
            success: true, 
            message: "تم تسجيل كافة بيانات المريض الطبية والحالة بنجاح وبانتظار تأكيد الطبيب",
            patientId: patientId,
            emergencyId: emergencyResult.insertId
        });

    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error in requestEmergency:", error.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر: " + error.message });
    }
};

exports.rejectEmergencyCase = async (req, res) => {
    const { emergencyId } = req.body;

    if (!emergencyId) {
        return res.status(400).json({ success: false, message: "بيانات ناقصة! يجب إرسال emergencyId" });
    }

    try {
        await db.query("START TRANSACTION");

        await db.query("UPDATE emergency_cases SET is_accepted = 2 WHERE id = ?", [emergencyId]);

        const [caseData] = await db.query(`
            SELECT p.full_name, p.telegram_id 
            FROM emergency_cases ec 
            JOIN patients p ON ec.patient_id = p.patient_id 
            WHERE ec.id = ? LIMIT 1
        `, [emergencyId]);

        if (caseData.length > 0 && caseData[0].telegram_id) {
            const patient = caseData[0];
            try {
                await axios.post('https://secdentai.app.n8n.cloud/webhook/emergency-displaced', {
                    patientName: patient.full_name,
                    telegramId: patient.telegram_id,
                    emergencyId: emergencyId,
                    reason: "تم مراجعة طلبك من قبل الطبيب، والحالة لا تصنف كطوارئ تستدعي إزاحة المواعيد. يرجى حجز موعد عادي."
                });
            } catch (axiosError) {
                console.error("Error sending rejection to n8n:", axiosError.message);
            }
        }

        await db.query("COMMIT");
        res.status(200).json({ success: true, message: "تم رفض الحالة الطارئة بنجاح وإشعار المريض" });

    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error in rejectEmergencyCase:", error.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر: " + error.message });
    }
};