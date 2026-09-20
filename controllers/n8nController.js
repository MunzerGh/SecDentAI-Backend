const db = require('../db');

// 1. جلب الساعات المحجوزة
const getBookedSlots = async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({
            success: false,
            message: "الرجاء تحديد Date المطلوب لفحص المواعيد."
        });
    }

    try {
        const query = `
            SELECT appointment_date 
            FROM appointments 
            WHERE DATE(appointment_date) = ? AND status != 'Cancelled'
        `;
        const [rows] = await db.query(query, [date]);

        const bookedSlots = rows.map(row => {
            const dt = new Date(row.appointment_date);
            return dt.toTimeString().split(' ')[0].substring(0, 5);
        });

        return res.status(200).json({
            success: true,
            date: date,
            bookedSlots: bookedSlots
        });

    } catch (error) {
        console.error("Error fetching booked slots:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء جلب المواعيد.",
            error: error.message
        });
    }
};

// 2. تسجيل التنبيهات الطارئة
const createUrgentAlert = async (req, res) => {
    const { patient_name, message } = req.body;

    if (!patient_name || !message) {
        return res.status(400).json({
            success: false,
            message: "الرجاء إرسال اسم المريض ونص الرسالة التنبيهية الطارئة."
        });
    }

    try {
        const query = `
            INSERT INTO urgent_alerts (patient_name, message) 
            VALUES (?, ?)
        `;

        const [result] = await db.query(query, [patient_name, message]);

        return res.status(201).json({
            success: true,
            message: "Urgent alert logged successfully",
            alertId: result.insertId
        });

    } catch (error) {
        console.error("Error creating urgent alert:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء تسجيل التنبيه الطارئ.",
            error: error.message
        });
    }
};

// 3. الحجز عبر التلغرام
const createTelegramBooking = async (req, res) => {
    let {
        patient_name,
        telegram_id,
        appointment_date,
        appointment_time,
        description,
        phone,          
        date_of_birth,  
        gender,         
        medical_history, 
        agent_id,
        duration_minutes
    } = req.body;

    if (date_of_birth && date_of_birth.includes('/')) {
        const parts = date_of_birth.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            date_of_birth = `${year}-${month}-${day}`;
        }
    }

    let formattedGender = null;
    if (gender) {
        const trimmedGender = gender.trim();
        if (trimmedGender === 'ذكر' || trimmedGender.toLowerCase() === 'male') {
            formattedGender = 'male';
        } else if (trimmedGender === 'أنثى' || trimmedGender.toLowerCase() === 'female') {
            formattedGender = 'female';
        }
    }

    if (telegram_id && isNaN(telegram_id)) {
        if (!description) description = telegram_id;
        telegram_id = null;
    }

    if (!patient_name || !appointment_date || !appointment_time) {
        return res.status(400).json({
            success: false,
            message: "الحقول الأساسية (الاسم، التاريخ، الوقت) مطلوبة لإتمام الحجز."
        });
    }

    try {
        let patient_id = null;

        if (telegram_id) {
            const [existingPatient] = await db.query(
                `SELECT patient_id FROM patients WHERE telegram_id = ? AND full_name = ?`,
                [telegram_id, patient_name]
            );
            if (existingPatient && existingPatient.length > 0) {
                patient_id = existingPatient[0].patient_id;
            }
        }

        if (!patient_id) {
            const [existingByName] = await db.query(
                `SELECT patient_id, telegram_id, gender FROM patients WHERE full_name = ?`,
                [patient_name]
            );

            if (existingByName && existingByName.length > 0) {
                patient_id = existingByName[0].patient_id;
                
                if (telegram_id && existingByName[0].telegram_id !== telegram_id) {
                    await db.query(`UPDATE patients SET telegram_id = ? WHERE patient_id = ?`, [telegram_id, patient_id]);
                }
                
                if (formattedGender && !existingByName[0].gender) {
                    await db.query(`UPDATE patients SET gender = ? WHERE patient_id = ?`, [formattedGender, patient_id]);
                }
            } else {
                const [newPatientResult] = await db.query(
                    `INSERT INTO patients (full_name, telegram_id, phone, date_of_birth, gender, medical_history) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        patient_name,
                        telegram_id || null,
                        phone || null,
                        date_of_birth || null,
                        formattedGender || null,
                        medical_history || null
                    ]
                );
                patient_id = newPatientResult.insertId;
            }
        }

        const convertTo24Hour = (timeStr) => {
            if (!timeStr) return "00:00:00";
            timeStr = timeStr.trim();

            if (!timeStr.includes(':') || timeStr.match(/[а-яА-Яa-zA-Zأ-ي]/)) {
                return "00:00:00";
            }

            if (!timeStr.includes(' ')) {
                if (timeStr.length === 5) return `${timeStr}:00`;
                return timeStr;
            }

            const [time, modifier] = timeStr.split(' ');
            let [hours, minutes] = time.split(':');

            let hrs = parseInt(hours, 10);
            if (modifier.toUpperCase() === 'PM' && hrs < 12) hrs += 12;
            if (modifier.toUpperCase() === 'AM' && hrs === 12) hrs = 0;

            return `${hrs.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
        };

        const finalTime = convertTo24Hour(appointment_time);
        const formattedDateTime = `${appointment_date} ${finalTime}`;

        if (finalTime === "00:00:00" || isNaN(Date.parse(formattedDateTime)) || appointment_date.includes('0000')) {
            return res.status(400).json({
                success: false,
                message: "فشل الـ AI في صياغة التاريخ والوقت بشكل مفهوم، يرجى إعادة تحديد الوقت بالأرقام."
            });
        }

        const query = `
            INSERT INTO appointments (patient_id, doctor_id, created_by_agent_id, appointment_date, duration_minutes, status, description) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const finalDuration = duration_minutes ? parseInt(duration_minutes, 10) : 15;

        const [result] = await db.query(query, [
            patient_id,
            1,
            agent_id || 1, 
            formattedDateTime,
            finalDuration, 
            'Confirmed',
            description || null
        ]);

        return res.status(201).json({
            success: true,
            message: "Appointment booked successfully",
            appointmentId: result.insertId
        });

    } catch (error) {
        console.error("🔴 حدث خطأ دقيق أثناء تنفيذ الحجز في السيرفر:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء تثبيت الحجز.",
            error: error.message
        });
    }
};

// 4. الاستعلام عن موعد مريض
const getPatientAppointment = async (req, res) => {
    const { telegram_id } = req.body;

    if (!telegram_id) {
        return res.status(400).json({ success: false, message: "يجب إرسال telegram_id للاستعلام." });
    }

    try {
        const query = `
            SELECT a.appointment_id, a.appointment_date, a.description, p.full_name 
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            WHERE p.telegram_id = ? AND a.status = 'Confirmed' AND a.appointment_date >= NOW()
            ORDER BY a.appointment_date ASC LIMIT 1
        `;
        const [rows] = await db.query(query, [telegram_id]);

        if (rows.length === 0) {
            return res.status(200).json({ success: true, has_appointment: false });
        }

        return res.status(200).json({ success: true, has_appointment: true, appointment: rows[0] });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 5. إلغاء موعد
const cancelAppointment = async (req, res) => {
    const { appointment_id } = req.body;

    if (!appointment_id) {
        return res.status(400).json({ success: false, message: "يرجى إرسال appointment_id." });
    }

    try {
        const query = `UPDATE appointments SET status = 'Cancelled' WHERE appointment_id = ?`;
        const [result] = await db.query(query, [appointment_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "لم يتم العثور على الموعد المطلوب إلغاؤه." });
        }

        return res.status(200).json({ success: true, message: "تم إلغاء الموعد بنجاح." });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 6. تحديث موعد
const updateAppointment = async (req, res) => {
    const { appointment_id, new_date, new_time } = req.body;

    if (!appointment_id || !new_date || !new_time) {
        return res.status(400).json({ success: false, message: "الحقول مطلوبة للتعديل." });
    }

    try {
        const formattedDateTime = `${new_date} ${new_time}:00`;
        const query = `UPDATE appointments SET appointment_date = ?, status = 'Confirmed' WHERE appointment_id = ?`;
        const [result] = await db.query(query, [formattedDateTime, appointment_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "الموعد غير موجود بالداتابيز لتعديله." });
        }

        return res.status(200).json({ success: true, message: "تم تحديث الموعد بنجاح." });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 7. حفظ التقييم / الشكوى
const savePatientFeedback = async (req, res) => {
    const { telegram_id, feedback_text } = req.body;

    if (!telegram_id || !feedback_text) {
        return res.status(400).json({ success: false, message: "الحقول telegram_id و feedback_text مطلوبة." });
    }

    try {
        const [patient] = await db.query(`SELECT patient_id FROM patients WHERE telegram_id = ?`, [telegram_id]);
        
        if (patient.length === 0) {
            return res.status(404).json({ success: false, message: "المريض غير مسجل بالنظام لإضافة تقييم أو شكوى." });
        }

        const patient_id = patient[0].patient_id;

        const insertQuery = `
            INSERT INTO patient_feedback (patient_id, feedback_text) 
            VALUES (?, ?)
        `;
        await db.query(insertQuery, [patient_id, feedback_text]);

        return res.status(200).json({ success: true, message: "تم تسجيل التقييم/الشكوى الطبية بنجاح." });

    } catch (error) {
        console.error("🔴 خطأ في أداة الـ Documenter / Feedback:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 8. حجز مراجعة
const scheduleReviewAppointment = async (req, res) => {
    const { telegram_id, patient_name, review_date, review_time, duration_minutes } = req.body;

    if (!telegram_id || !review_date || !review_time) {
        return res.status(400).json({ success: false, message: "الحقول telegram_id, review_date, review_time مطلوبة." });
    }

    try {
        const [patient] = await db.query(`SELECT patient_id FROM patients WHERE telegram_id = ?`, [telegram_id]);
        
        if (patient.length === 0) {
            return res.status(404).json({ success: false, message: "المريض غير مسجل بالنظام لحجز مراجعة." });
        }

        const patient_id = patient[0].patient_id;
        const formattedDateTime = `${review_date} ${review_time}:00`;
        const finalDuration = duration_minutes ? parseInt(duration_minutes, 10) : 15;

        const query = `
            INSERT INTO appointments (patient_id, doctor_id, appointment_date, duration_minutes, status, description, created_by_agent_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(query, [
            patient_id, 
            1, 
            formattedDateTime, 
            finalDuration, 
            'Confirmed', 
            'مراجعة - موعد روتيني مؤكد عبر البوت', 
            1
        ]);

        return res.status(201).json({ 
            success: true, 
            appointment_id: result.insertId, 
            message: "تم تسجيل موعد المراجعة وتأكيده بنجاح." 
        });

    } catch (error) {
        console.error("🔴 خطأ في أداة الـ Scheduler:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 9. حسم قرار الطبيب للمراجعة
const decideReviewAppointment = async (req, res) => {
    const { appointment_id, action } = req.body;

    if (!appointment_id || !action) {
        return res.status(400).json({ success: false, message: "الحقول appointment_id و action مطلوبة." });
    }

    try {
        const finalStatus = (action === 'approve') ? 'Confirmed' : 'Rejected';

        const query = `UPDATE appointments SET status = ? WHERE appointment_id = ?`;
        await db.query(query, [finalStatus, appointment_id]);

        return res.status(200).json({ 
            success: true, 
            status: finalStatus,
            message: `تم تحديث حالة الموعد بنجاح إلى: ${finalStatus}` 
        });

    } catch (error) {
        console.error("🔴 خطأ في دالة قرار الطبيب:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getBookedSlots,
    createUrgentAlert,
    createTelegramBooking,
    getPatientAppointment,
    cancelAppointment,
    updateAppointment,
    scheduleReviewAppointment,
    savePatientFeedback,
    decideReviewAppointment
};