const db = require('../db');
const moment = require('moment');
const { deleteFromGoogleCalendar } = require('../services/googleCalendarService');

// 1. جلب كافة المواعيد المستقبلية
const getAppointments = async (req, res) => {
    try {
        const query = `
            SELECT 
                a.appointment_id, 
                p.full_name AS patient_name, 
                a.appointment_date, 
                a.duration_minutes, 
                a.status,
                a.description,
                a.google_event_id
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            WHERE a.appointment_date >= CURDATE()
            ORDER BY a.appointment_date ASC
        `;

        const [rows] = await db.query(query);

        return res.status(200).json({
            success: true,
            results: rows.length,
            data: rows
        });
    } catch (error) {
        console.error("🔴 خطأ في جلب المواعيد:", error);
        return res.status(500).json({
            success: false,
            message: "خطأ في جلب المواعيد",
            error: error.message
        });
    }
};

// 2. إحصائيات الطبيب (لوحة التحكم)
const getDoctorStats = async (req, res) => {
    const { doctor_id } = req.params;

    try {
        const [totalRows] = await db.execute(
            "SELECT COUNT(*) as total FROM appointments WHERE doctor_id = ?",
            [doctor_id]
        );

        const [todayRows] = await db.execute(
            "SELECT COUNT(*) as today FROM appointments WHERE doctor_id = ? AND DATE(appointment_date) = CURDATE()",
            [doctor_id]
        );

        const queryNext = "SELECT a.*, p.full_name as patient_name FROM appointments a JOIN patients p ON a.patient_id = p.patient_id WHERE a.doctor_id = ? AND a.appointment_date >= NOW() ORDER BY appointment_date ASC LIMIT 1";
        
        const [nextPatient] = await db.execute(queryNext, [doctor_id]);

        return res.status(200).json({
            success: true,
            data: {
                totalAppointments: totalRows[0].total,
                todayAppointments: todayRows[0].today,
                nextAppointment: nextPatient.length > 0 ? nextPatient[0] : null
            }
        });

    } catch (error) {
        console.error("🔴 خطأ الإحصائيات:", error);
        return res.status(500).json({ success: false, message: "خطأ في جلب الإحصائيات", error: error.message });
    }
};

// 3. حساب الأوقات الشاغرة الديناميكية (Dynamic Available Slots)
const getAvailableSlots = async (req, res) => {
    const { doctor_id, date, duration } = req.query;

    try {
        const requestedDuration = parseInt(duration) || 30;
        const dayName = moment(date).format('dddd');

        const [rules] = await db.execute(
            'SELECT * FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ?',
            [doctor_id, dayName]
        );

        if (rules.length === 0) {
            return res.status(200).json({ success: true, message: "الطبيب لا يعمل في هذا اليوم", available_slots: [] });
        }

        const { start_time, end_time } = rules[0];

        const [booked] = await db.execute(
            'SELECT appointment_date, duration_minutes FROM appointments WHERE doctor_id = ? AND DATE(appointment_date) = ? AND status != "Cancelled"',
            [doctor_id, date]
        );

        const bookedIntervals = booked.map(b => {
            const start = moment(b.appointment_date);
            const end = moment(b.appointment_date).add(b.duration_minutes, 'minutes');
            return { start, end };
        });

        let availableSlots = [];
        let current = moment(`${date} ${start_time}`);
        let endLimit = moment(`${date} ${end_time}`);

        while (current.clone().add(requestedDuration, 'minutes').isSameOrBefore(endLimit)) {
            let slotStart = current.clone();
            let slotEnd = current.clone().add(requestedDuration, 'minutes');

            const isOverlapping = bookedIntervals.some(bookedApp => {
                return slotStart.isBefore(bookedApp.end) && bookedApp.start.isBefore(slotEnd);
            });

            if (!isOverlapping) {
                availableSlots.push(slotStart.format('HH:mm'));
            }

            current.add(15, 'minutes');
        }

        return res.status(200).json({
            success: true,
            date: date,
            requested_duration_minutes: requestedDuration,
            available_slots: availableSlots
        });

    } catch (error) {
        console.error("🔴 خطأ في الـ Slots الديناميكية:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 4. البحث الذكي المساعد لحديث الطبيب
const smartSearch = async (req, res) => {
    const { doctor_query } = req.query;

    try {
        let sql = "SELECT * FROM appointments WHERE DATE(appointment_date) = CURDATE()";
        let params = [];

        if (doctor_query) {
            if (doctor_query.includes('مستعجلة') || doctor_query.includes('إسعاف')) {
                sql += " AND case_type = 'Emergency'";
            }

            if (doctor_query.includes('ألم') || doctor_query.includes('وجع')) {
                sql += " AND description LIKE ?";
                params.push('%ألم%');
            }
        }

        const [results] = await db.execute(sql, params);

        return res.status(200).json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 5. إنهاء الموعد وحجز زيارة مراجعة
const completeVisit = async (req, res) => {
    const { appointment_id, doctor_notes } = req.body;

    try {
        await db.execute(
            "UPDATE appointments SET status = 'Completed', diagnosis = ? WHERE appointment_id = ?",
            [doctor_notes || '', appointment_id]
        );

        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        const [current] = await db.execute("SELECT * FROM appointments WHERE appointment_id = ?", [appointment_id]);

        if (current.length > 0) {
            const sqlFollowup = `INSERT INTO appointments (doctor_id, patient_id, appointment_date, description, status, case_type) 
                                 VALUES (?, ?, ?, ?, 'Pending', 'Follow-up')`;

            await db.execute(sqlFollowup, [
                current[0].doctor_id,
                current[0].patient_id,
                nextWeek,
                `مراجعة لـ: ${doctor_notes || 'متابعة علاج'}`,
            ]);
        }

        return res.status(200).json({
            success: true,
            message: "تم توثيق الزيارة وحجز موعد مراجعة تلقائياً بعد أسبوع"
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 6. جلب مواعيد تاريخ محدد (يشمل رقم الهاتف للتواصل)
const getAppointmentsByDate = async (req, res) => {
    try {
        const date = req.body.date || req.query.date;

        if (!date) {
            return res.status(400).json({ success: false, message: "يرجى إرسال التاريخ (date)" });
        }

        const query = "SELECT a.appointment_id, a.patient_id, p.full_name AS patient_name, p.phone AS phone, TIME_FORMAT(a.appointment_date, '%h:%i %p') AS appointment_time, COALESCE(t.treatment_name, 'لم يحدد بعد') AS description, a.status FROM appointments a JOIN patients p ON a.patient_id = p.patient_id LEFT JOIN treatment_types t ON a.treatment_id = t.treatment_id WHERE DATE(a.appointment_date) = ? ORDER BY a.appointment_date ASC";

        const [rows] = await db.execute(query, [date]);

        return res.status(200).json({
            success: true,
            count: rows.length,
            appointments: rows
        });

    } catch (error) {
        console.error("🔴 خطأ جلب مواعيد التاريخ المحجوز:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب المواعيد",
            error: error.message
        });
    }
};

// 7. حذف موعد ومزامنته مع Google Calendar
const deleteAppointment = async (req, res) => {
    const { appointment_id } = req.params;

    try {
        const [appointment] = await db.execute(
            "SELECT google_event_id FROM appointments WHERE appointment_id = ?",
            [appointment_id]
        );

        if (appointment.length === 0) {
            return res.status(404).json({ success: false, message: "الموعد غير موجود" });
        }

        const googleEventId = appointment[0].google_event_id;

        // حذف الموعد من تقويم جوجل في حال توفره بدون تعطيل السيرفر عند وجود خطأ شبكة
        if (googleEventId) {
            try {
                await deleteFromGoogleCalendar(googleEventId);
            } catch (gErr) {
                console.error("⚠️ لم يتم الحذف من تقويم جوجل (استمرار الحذف المحلي):", gErr.message);
            }
        }

        await db.execute("DELETE FROM appointments WHERE appointment_id = ?", [appointment_id]);

        return res.json({
            success: true,
            message: "تم حذف الموعد بنجاح"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء الحذف",
            error: error.message
        });
    }
};

// 8. جلب الساعات المحجوزة لتاريخ معين
const getBookedSlots = async (req, res) => {
    const date = req.body.date || req.query.date;

    if (!date) {
        return res.status(400).json({
            success: false,
            message: "الرجاء إرسال حقل date لفحص المواعيد."
        });
    }

    try {
        const query = "SELECT appointment_date FROM appointments WHERE DATE(appointment_date) = ? AND status != 'Cancelled'";
        const [rows] = await db.execute(query, [date]);

        const bookedSlots = rows.map(row => {
            const dt = new Date(row.appointment_date);
            const hours = dt.getHours().toString().padStart(2, '0');
            const minutes = dt.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        });

        return res.status(200).json({
            success: true,
            bookedSlots
        });

    } catch (error) {
        console.error("🔴 خطأ أثناء جلب الساعات المحجوزة:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء جلب المواعيد.",
            error: error.message
        });
    }
};

// 9. إنشاء وتثبيت موعد جديد
const createAppointment = async (req, res) => {
    const {
        patient_id,
        doctor_id,
        treatment_id,     
        appointment_date, 
        appointment_time, 
        duration_minutes,
        description
    } = req.body;

    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
        return res.status(400).json({
            success: false,
            message: "جميع الحقول الأساسية (المريض، الطبيب، التاريخ، الوقت) مطلوبة."
        });
    }

    try {
        const formattedDateTime = `${appointment_date} ${appointment_time}:00`;
        const query = "INSERT INTO appointments (patient_id, doctor_id, treatment_id, appointment_date, duration_minutes, status, description, created_by_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        const [result] = await db.execute(query, [
            patient_id,
            doctor_id,
            treatment_id || null,
            formattedDateTime,
            duration_minutes || 30,
            'Confirmed',
            description || null,
            null
        ]);

        return res.status(201).json({
            success: true,
            message: "تم حجز وتثبيت الموعد بنجاح.",
            appointmentId: result.insertId
        });

    } catch (error) {
        console.error("🔴 خطأ أثناء إنشاء الموعد الجديد:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء حفظ الموعد.",
            error: error.message
        });
    }
};

// 10. جلب مواعيد اليوم
const getTodayAppointments = async (req, res) => {
    try {
        const query = "SELECT a.appointment_id, a.patient_id, p.full_name AS patient_name, TIME_FORMAT(a.appointment_date, '%H:%i') AS appointment_time, a.description, a.status FROM appointments a JOIN patients p ON a.patient_id = p.patient_id WHERE DATE(a.appointment_date) = CURDATE() ORDER BY a.appointment_date ASC";

        const [rows] = await db.query(query);

        return res.status(200).json({
            success: true,
            count: rows.length,
            appointments: rows
        });

    } catch (error) {
        console.error("🔴 خطأ جلب مواعيد اليوم:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 11. جلب الموعد التالي لليوم الحالي
const getNextAppointment = async (req, res) => {
    try {
        const query = "SELECT a.appointment_id, a.patient_id, p.full_name AS patient_name, TIME_FORMAT(a.appointment_date, '%H:%i') AS appointment_time, a.duration_minutes, a.description, a.status FROM appointments a JOIN patients p ON a.patient_id = p.patient_id WHERE a.appointment_date > NOW() AND DATE(a.appointment_date) = CURDATE() AND a.status = 'Confirmed' ORDER BY a.appointment_date ASC LIMIT 1";
        const [rows] = await db.query(query);

        return res.status(200).json({
            success: true,
            has_next: rows.length > 0, 
            appointment: rows.length > 0 ? rows[0] : null
        });

    } catch (error) {
        console.error("🔴 خطأ جلب الموعد التالي:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 12. إحصائيات المواعيد وتوزيع الحالات لتاريخ معين
const getAppointmentStats = async (req, res) => {
    try {
        const date = req.body.date || req.query.date;

        if (!date) {
            return res.status(400).json({ success: false, message: "يرجى إرسال التاريخ (date)" });
        }

        const query = "SELECT SUM(CASE WHEN status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_count, SUM(CASE WHEN status = 'InProgress' THEN 1 ELSE 0 END) as in_progress_count, SUM(CASE WHEN status = 'Requested' THEN 1 ELSE 0 END) as requested_count, SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count, SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_count FROM appointments WHERE DATE(appointment_date) = ?";

        const [rows] = await db.execute(query, [date]);
        
        const confirmed = parseInt(rows[0].confirmed_count) || 0;
        const inProgress = parseInt(rows[0].in_progress_count) || 0;
        const requested = parseInt(rows[0].requested_count) || 0;
        const cancelled = parseInt(rows[0].cancelled_count) || 0;
        const completed = parseInt(rows[0].completed_count) || 0;
        
        const totalSlots = 20; 
        const activeAppointments = confirmed + inProgress + completed;
        const available = Math.max(0, totalSlots - activeAppointments); 

        return res.status(200).json({
            success: true,
            date: date,
            stats: {
                totalSlots: totalSlots,
                available: available,   
                detailed: {
                    confirmed: confirmed,
                    inProgress: inProgress,
                    requested: requested,
                    cancelled: cancelled,
                    completed: completed 
                }
            }
        });

    } catch (error) {
        console.error("🔴 خطأ إحصائيات اليوم:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء حساب الإحصائيات",
            error: error.message
        });
    }
};

// 13. جلب أنواع المعالجات للعيادة
const getTreatmentTypes = async (req, res) => {
    try {
        const query = `SELECT treatment_id, treatment_name, duration_minutes FROM treatment_types ORDER BY treatment_id ASC`;
        const [rows] = await db.execute(query);

        return res.status(200).json({
            success: true,
            treatments: rows
        });
    } catch (error) {
        console.error("🔴 خطأ أنواع المعالجة:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// 14. تحديث حالة الموعد وتوقيت البدء والانتهاء
const updateAppointmentStatus = async (req, res) => {
    try {
        console.log("📥 استلام طلب تحديث الحالة:", req.body);

        const { appointment_id, status } = req.body;

        if (!appointment_id || !status) {
            return res.status(400).json({ success: false, message: "يرجى إرسال appointment_id والحالة الجديدة status" });
        }

        const allowedStatuses = ['Requested', 'Confirmed', 'InProgress', 'Completed', 'Cancelled'];
        
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: `الحالة المرسلة (${status}) غير مدعومة بالسيستم.` 
            });
        }

        let query = "UPDATE appointments SET status = ? WHERE appointment_id = ?";
        let queryParams = [status, appointment_id];

        if (status === 'InProgress') {
            query = "UPDATE appointments SET status = ?, start_time = NOW() WHERE appointment_id = ?";
        } else if (status === 'Completed') {
            query = "UPDATE appointments SET status = ?, end_time = NOW() WHERE appointment_id = ?";
        }

        const [result] = await db.execute(query, queryParams);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "لم يتم العثور على الموعد المطلوب" });
        }

        return res.status(200).json({
            success: true,
            message: `تم تحديث حالة الموعد بنجاح إلى ${status}`
        });

    } catch (error) {
        console.error("🔴 خطأ تحديث الحالة:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحديث حالة الموعد",
            error: error.message
        });
    }
};

module.exports = {
    getAppointments,
    getDoctorStats,
    getAvailableSlots,
    smartSearch,
    completeVisit,
    getAppointmentsByDate,
    deleteAppointment,
    getBookedSlots,
    createAppointment,
    getTodayAppointments,
    getNextAppointment,
    getAppointmentStats,
    getTreatmentTypes,
    updateAppointmentStatus
};