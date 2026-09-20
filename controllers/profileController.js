const db = require('../db');

// 1. جلب بيانات الملف الشخصي (مع الصورة)
const getProfile = async (req, res) => {
    try {
        // دعم استخراج id الطبيب من الـ Token أو Query أو Params أو Body
        const doctor_id = req.user?.doctor_id || req.user?.id || req.query.doctor_id || req.params.doctor_id || req.body.doctor_id || 1;

        const query = `SELECT * FROM doctor_profiles WHERE doctor_id = ? LIMIT 1`;
        const [rows] = await db.execute(query, [doctor_id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "لم يتم العثور على ملف شخصي للطبيب" });
        }

        const profile = rows[0];
        
        // بناء رابط الصورة الكامل ليتم عرضه فوراً بـ Image.network
        const imageUrl = profile.profile_image 
            ? `${req.protocol}://${req.get('host')}/uploads/${profile.profile_image}`
            : null;

        return res.status(200).json({
            success: true,
            profile: {
                doctor_id: profile.doctor_id,
                full_name: profile.bio_name || '',
                specialty: profile.specialty || '',
                email: profile.email || '',
                address: profile.address || '',
                profile_image: imageUrl
            }
        });
    } catch (error) {
        console.error("❌ Error in getProfile:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 2. تحديث بيانات الملف الشخصي (ودعم رفع الصورة عبر Multer)
const updateProfile = async (req, res) => {
    try {
        const doctor_id = req.user?.doctor_id || req.user?.id || req.body.doctor_id || 1;
        const { full_name, specialty, email, address } = req.body;

        let query;
        let params;

        if (req.file) {
            const imageName = req.file.filename;
            query = `
                UPDATE doctor_profiles 
                SET bio_name = COALESCE(?, bio_name), 
                    specialty = COALESCE(?, specialty), 
                    email = COALESCE(?, email), 
                    address = COALESCE(?, address), 
                    profile_image = ? 
                WHERE doctor_id = ?
            `;
            params = [full_name || null, specialty || null, email || null, address || null, imageName, doctor_id];
        } else {
            query = `
                UPDATE doctor_profiles 
                SET bio_name = COALESCE(?, bio_name), 
                    specialty = COALESCE(?, specialty), 
                    email = COALESCE(?, email), 
                    address = COALESCE(?, address) 
                WHERE doctor_id = ?
            `;
            params = [full_name || null, specialty || null, email || null, address || null, doctor_id];
        }

        const [result] = await db.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "لم يتم العثور على ملف شخصي لتحديثه" });
        }

        return res.status(200).json({
            success: true,
            message: "تم تحديث الملف الشخصي بنجاح"
        });
    } catch (error) {
        console.error("❌ Error in updateProfile:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getProfile, updateProfile };