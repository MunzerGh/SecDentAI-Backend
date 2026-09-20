const jwt = require('jsonwebtoken');
require('dotenv').config();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            message: 'مصادقة مطلوبة. التوكين مفقود أو بتنسيق غير صالح.' 
        });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'مصادقة مطلوبة. التوكين مفقود.' 
        });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'sec_dent_ai_secret_key', (err, user) => {
        if (err) {
            console.error("JWT Verification Failed:", err.message);
            return res.status(403).json({ 
                success: false, 
                message: 'الوصول محظور. التوكين منتهي الصلاحية أو غير صالح.' 
            });
        }
        
        req.user = user; 
        next(); 
    });
};

module.exports = authenticateToken;
module.exports.authenticataToken = authenticateToken; // تصحيح الخطأ الإملائي مع حماية الملفات القديمة