// controllers/dashboardController.js
const db = require('../db'); 

const getDashboardStats = async (req, res) => {
    try {
        // 1. جلب إجمالي عدد المرضى
        const [patientsCount] = await db.query('SELECT COUNT(*) AS total FROM patients');
        
        // 2. جلب إجمالي عدد المواعيد
        const [appointmentsCount] = await db.query('SELECT COUNT(*) AS total FROM appointments');
        
        // 3. جلب عدد حالات حشو العصب بالبحث داخل حقل الوصف
        const [rootCanalsCount] = await db.query(
            "SELECT COUNT(*) AS total FROM appointments WHERE description LIKE ?", 
            ['%حشو%']
        );

        return res.status(200).json({
            success: true,
            message: "Dashboard stats fetched successfully",
            data: {
                total_patients: patientsCount[0]?.total || 0,
                root_canals: rootCanalsCount[0]?.total || 0,
                total_appointments: appointmentsCount[0]?.total || 0,
                ai_accuracy: "98%"
            }
        });

    } catch (error) {
        console.error("Database Error in Dashboard Controller:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};

module.exports = {
    getDashboardStats
};