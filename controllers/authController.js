const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secdentai_secret_key_2026';

// دالة تسجيل الدخول
const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "يرجى التأكد من إرسال اسم المستخدم وكلمة المرور"
        });
    }

    try {
        // البحث عن المستخدم في جدول users (أو جدول doctors كخيار ثاني)
        const [rows] = await db.execute("SELECT * FROM users WHERE username = ? OR email = ?", [username, username]);

        if (rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "اسم المستخدم أو كلمة المرور غير صحيحة"
            });
        }

        const user = rows[0];
        const dbPassword = user.password_hash || user.password;

        // التحقق من كلمة المرور (دعم التشفير بـ bcrypt مع خيار النص العادي للتجربة)
        let isMatch = false;
        if (dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, dbPassword);
        } else {
            isMatch = (dbPassword === password);
        }

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "اسم المستخدم أو كلمة المرور غير صحيحة"
            });
        }

        // إنشاء JWT Token لتأمين باقي الطلبات
        const token = jwt.sign(
            { user_id: user.user_id, role: user.role, username: user.username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.status(200).json({
            success: true,
            message: "تم تسجيل الدخول بنجاح",
            data: {
                token: token,
                user_id: user.user_id,
                full_name: user.full_name || user.username,
                role: user.role || 'doctor'
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في الخادم",
            error: error.message
        });
    }
};

// دالة إنشاء حساب جديد
const register = async (req, res) => {
    const { full_name, username, email, password, specialty, phone } = req.body;

    try {
        const userEmail = email || `${username}@secdent.com`;
        const userNameInput = username || email;

        // 1. التأكد أن المستخدم غير مسجل مسبقاً
        const [existing] = await db.query('SELECT * FROM users WHERE username = ? OR email = ?', [userNameInput, userEmail]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: "اسم المستخدم أو البريد الإلكتروني مسجل بالفعل" });
        }

        // 2. تشفير كلمة المرور
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. حفظ الحساب في جدول users
        const [result] = await db.query(
            'INSERT INTO users (full_name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [full_name, userNameInput, userEmail, hashedPassword, 'doctor']
        );

        return res.status(201).json({ 
            success: true, 
            message: "تم إنشاء حساب الطبيب بنجاح",
            user_id: result.insertId 
        });

    } catch (error) {
        console.error("Register Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// جلب بيانات الملف الشخصي
const getUserProfile = async (req, res) => {
    try {
        const { user_id } = req.params;

        const query = "SELECT user_id, full_name, username, email, role, created_at FROM users WHERE user_id = ?";
        const [rows] = await db.execute(query, [user_id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "هذا المستخدم غير موجود في النظام"
            });
        }

        return res.status(200).json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error("Profile Fetch Error:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ في جلب البيانات من قاعدة البيانات",
            error: error.message
        });
    }
};

// تسجيل الخروج
const logoutDoctor = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            message: "تم تسجيل الخروج بنجاح وتطهير الجلسة"
        });
    } catch (error) {
        console.error("🔴 Error during logout:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    login,
    register,
    getUserProfile,
    logoutDoctor
};