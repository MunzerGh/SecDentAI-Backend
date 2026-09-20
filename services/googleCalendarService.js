require('dotenv').config(); // تفعيل قراءة ملف الـ .env
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
// دالة لإضافة الموعد إلى تقويم جوجل
const addToGoogleCalendar = async (appointmentData) => {
    try {
        const event = {
            summary: `🦷 موعد عيادة: ${appointmentData.patientName}`,
            description: `السبب: ${appointmentData.reason}`,
            start: {
                dateTime: new Date(appointmentData.startTime).toISOString(),
                timeZone: 'Asia/Damascus',
            },
            end: {
                // الموعد ينتهي بعد 30 دقيقة تلقائياً
                dateTime: new Date(new Date(appointmentData.startTime).getTime() + 30 * 60000).toISOString(),
                timeZone: 'Asia/Damascus',
            },
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

return {
    eventId: response.data.id,
    htmlLink: response.data.htmlLink
    };
    } 
    catch (error) {
        console.error('Google Calendar Error:', error);
        return null;
    }
};
const deleteFromGoogleCalendar = async (eventId) => {
    try {
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId,
        });
        return true;
    } catch (error) {
        console.error('Google Calendar Delete Error:', error);
        return false;
    }
};

// لا تنسَ إضافتها في module.exports
module.exports = { 
    addToGoogleCalendar,
     deleteFromGoogleCalendar 
    };
