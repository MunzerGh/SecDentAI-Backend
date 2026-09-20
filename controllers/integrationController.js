const { google } = require('googleapis');
const db = require('../db');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const getGoogleAuthUrl = (req, res) => {
    const { doctor_id } = req.query;

    if (!doctor_id) {
        return res.status(400).json({ message: "يجب إرسال doctor_id لتحديد الطبيب" });
    }

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar.events'],
        state: doctor_id, 
        prompt: 'consent'
    });
    
    res.json({ url });
};

const googleCallback = async (req, res) => {
    const { code, state } = req.query; 
    const doctor_id = state;

    try {
        const { tokens } = await oauth2Client.getToken(code);
        
        const query = `
            INSERT INTO doctor_integrations (doctor_id, provider_name, refresh_token) 
            VALUES (?, 'google', ?) 
            ON DUPLICATE KEY UPDATE refresh_token = ?
        `;
        
        await db.query(query, [doctor_id, tokens.refresh_token, tokens.refresh_token]);

        res.send(`
            <div style="text-align: center; margin-top: 50px; font-family: Arial;">
                <h1 style="color: #28a745;">✅ تم ربط تقويم جوجل بنجاح!</h1>
                <p>يمكنك الآن إغلاق هذه الصفحة والعودة للتطبيق.</p>
            </div>
        `);
    } catch (error) {
        console.error("Google Auth Error:", error);
        res.status(500).json({ error: "فشل في عملية المصادقة مع جوجل", details: error.message });
    }
};

const checkAvailability = async (req, res) => {
    const { doctor_id, start_time, end_time } = req.query;

    try {
        const [rows] = await db.query('SELECT refresh_token FROM doctor_integrations WHERE doctor_id = ?', [doctor_id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "الطبيب غير مرتبط بتقويم جوجل" });
        }

        oauth2Client.setCredentials({ refresh_token: rows[0].refresh_token });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date(start_time).toISOString(),
            timeMax: new Date(end_time).toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items;
        
        if (events.length > 0) {
            res.json({ available: false, message: "هذا الوقت محجوز مسبقاً", events });
        } else {
            res.json({ available: true, message: "الطبيب متاح في هذا الوقت" });
        }

    } catch (error) {
        console.error("Availability Error:", error);
        res.status(500).json({ error: "فشل في فحص التوافر" });
    }
};

const bookAppointment = async (req, res) => {
    const { doctor_id, patient_name, patient_phone, start_time, end_time } = req.body;

    try {
        const [rows] = await db.query('SELECT refresh_token FROM doctor_integrations WHERE doctor_id = ?', [doctor_id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "الطبيب غير مرتبط بتقويم جوجل" });
        }

        oauth2Client.setCredentials({ refresh_token: rows[0].refresh_token });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const event = {
            summary: `موعد عيادة: ${patient_name}`,
            description: `رقم الهاتف: ${patient_phone} | تم الحجز عبر SecDentAI`,
            start: {
                dateTime: new Date(start_time).toISOString(),
                timeZone: 'UTC', 
            },
            end: {
                dateTime: new Date(end_time).toISOString(),
                timeZone: 'UTC',
            },
        };

        const googleResponse = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

        const query = `
            INSERT INTO appointments (doctor_id, appointment_date, status, google_event_id, description) 
            VALUES (?, ?, 'Confirmed', ?, ?)
        `;
        
        await db.query(query, [
            doctor_id || 1, 
            start_time, 
            googleResponse.data.id,
            `اسم المريض: ${patient_name} - هاتف: ${patient_phone}`
        ]);

        res.json({ 
            success: true, 
            message: "تم الحجز في جوجل وقاعدة البيانات بنجاح!",
            google_event_id: googleResponse.data.id 
        });

    } catch (error) {
        console.error("Booking Error:", error);
        res.status(500).json({ error: "فشل في عملية الحجز", details: error.message });
    }
};

const cancelAppointment = async (req, res) => {
    const { appointment_id } = req.body; 

    try {
        const [apptRows] = await db.query(
            'SELECT google_event_id, doctor_id FROM appointments WHERE appointment_id = ?', 
            [appointment_id]
        );

        if (apptRows.length === 0) {
            return res.status(404).json({ error: "الموعد غير موجود في قاعدة البيانات" });
        }

        const { google_event_id, doctor_id } = apptRows[0];

        const [docRows] = await db.query(
            'SELECT refresh_token FROM doctor_integrations WHERE doctor_id = ?', 
            [doctor_id]
        );

        if (docRows.length > 0 && google_event_id) {
            oauth2Client.setCredentials({ refresh_token: docRows[0].refresh_token });
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            try {
                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: google_event_id
                });
            } catch (gError) {
                console.log("الموعد محذوف فعلياً من جوجل");
            }
        }

        await db.query(
            "UPDATE appointments SET status = 'Cancelled' WHERE appointment_id = ?", 
            [appointment_id]
        );

        res.json({ success: true, message: "تم الإلغاء بنجاح من جوجل ومن جدول المواعيد" });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "فشل الإلغاء", details: error.message });
    }
};

const getDoctorAppointments = async (req, res) => {
    const { doctor_id } = req.params;

    try {
        const query = `
            SELECT a.appointment_id, p.full_name AS patient_name, p.phone AS patient_phone, a.appointment_date, a.status 
            FROM appointments a
            LEFT JOIN patients p ON a.patient_id = p.patient_id
            WHERE a.doctor_id = ? AND a.status != 'Cancelled'
            ORDER BY a.appointment_date ASC
        `;
        
        const [rows] = await db.query(query, [doctor_id]);
        
        res.json({ success: true, count: rows.length, appointments: rows });
    } catch (error) {
        res.status(500).json({ error: "فشل في جلب المواعيد" });
    }
};

const getDashboardStats = async (req, res) => {
    const { doctor_id } = req.params;

    try {
        const [todayCount] = await db.query(
            "SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND DATE(appointment_date) = CURDATE() AND status != 'Cancelled'", 
            [doctor_id]
        );

        const [totalCount] = await db.query(
            "SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND status != 'Cancelled'", 
            [doctor_id]
        );

        const [nextAppointment] = await db.query(
            "SELECT a.appointment_date, p.full_name AS patient_name FROM appointments a LEFT JOIN patients p ON a.patient_id = p.patient_id WHERE a.doctor_id = ? AND a.appointment_date > NOW() AND a.status != 'Cancelled' ORDER BY a.appointment_date ASC LIMIT 1",
            [doctor_id]
        );

        res.json({
            success: true,
            stats: {
                today_appointments: todayCount[0].count,
                total_appointments: totalCount[0].count,
                next_patient: nextAppointment.length > 0 ? nextAppointment[0] : null
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "فشل في جلب الإحصائيات" });
    }
};

module.exports = { 
    getGoogleAuthUrl, 
    googleCallback,
    checkAvailability,
    bookAppointment,
    cancelAppointment,
    getDoctorAppointments,
    getDashboardStats
};