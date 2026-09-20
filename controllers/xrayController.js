const db = require('../db'); 
const fs = require('fs'); 

// 1. رفع صورة الأشعة وإرسالها للتنبؤ في سيرفر Python (معالجة خلفية)
const uploadAndAnalyzeXray = async (req, res) => {
    console.log("============== استقبال طلب صورة أشعة جديدة ==============");
    console.log("الحقول النصية (Body):", req.body);
    console.log("الملف المرفوع (File):", req.file);
    console.log("=========================================");

    // التحقق الأولي من وجود الملف
    if (!req.file) {
        return res.status(400).json({ success: false, message: "يرجى رفع صورة الأشعة أولاً" });
    }

    // 🔥 الاستجابة الفورية للعميل (أو البوت/n8n) لتجنب المهلة (Timeout)
    res.status(200).json({ 
        success: true, 
        message: "Received",
        detail: "تم استلام الملف بنجاح، وجاري المعالجة والحفظ في الخلفية."
    });

    // تنفيذ عمليات الذكاء الاصطناعي والداتا بيز في الخلفية بشكل غير متزامن
    (async () => {
        let { 
            appointment_id, 
            agent_id, 
            patient_id, 
            telegram_id, 
            type, 
            finding, 
            confidence, 
            recommendation,
            ai_result 
        } = req.body;
        
        // استخراج تفاصيل الـ AI إذا كانت مرسلة كـ JSON النصي
        if (ai_result) {
            try {
                if (typeof ai_result === 'string' && ai_result.trim().startsWith('{')) {
                    const parsedResult = JSON.parse(ai_result);
                    finding = finding || parsedResult.finding;
                    confidence = confidence || parsedResult.confidence;
                    recommendation = recommendation || parsedResult.recommendation;
                } else {
                    finding = finding || ai_result;
                }
            } catch (e) {
                finding = finding || ai_result;
            }
        }

        const imageType = type || 'original'; 
        let finalPatientId = patient_id;

        try {
            // العثور على patient_id من telegram_id إذا لم يُرسل صراحة
            if (!finalPatientId && telegram_id) {
                const findPatientSql = `SELECT patient_id FROM patients WHERE telegram_id = ?`;
                const [patientRows] = await db.execute(findPatientSql, [telegram_id]);

                if (patientRows.length > 0) {
                    finalPatientId = patientRows[0].patient_id;
                } else {
                    console.error("🔴 خطأ خلفي: حساب التليغرام هذا غير مرتبط بأي مريض");
                    return; 
                }
            }

            if (!finalPatientId) {
                console.error("🔴 خطأ خلفي: معرف المريض مطلوب للحفظ");
                return;
            }

            const imagePath = `uploads/xrays/${req.file.filename}`;
            
            let analysisResult = { 
                finding: "صورة أصلية بانتظار التحليل", 
                confidence: "-", 
                recommendation: "-" 
            };

            if (imageType === 'analyzed') {
                analysisResult = {
                    finding: finding || "تمت المعالجة بنجاح",
                    confidence: confidence || "100%",
                    recommendation: recommendation || "مراجعة الطبيب المختص"
                };
            } else {
                try {
                    const fileBuffer = await fs.promises.readFile(req.file.path);
                    const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
                    
                    const pythonFormData = new FormData();
                    pythonFormData.append('image', fileBlob, req.file.originalname);
                    pythonFormData.append('chat_id', telegram_id || '');

                    // يقرأ الرابط من ملف الـ .env أولاً مع رابط محلي احترازي
                    const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'https://knickers-obscurity-going.ngrok-free.dev/predict';

                    const pythonResponse = await fetch(PYTHON_SERVER_URL, {
                        method: 'POST',
                        body: pythonFormData
                    });

                    if (pythonResponse.ok) {
                        const pythonData = await pythonResponse.json();
                        analysisResult = {
                            finding: pythonData.finding || "تمت المعالجة بنجاح",
                            confidence: pythonData.confidence || "100%",
                            recommendation: pythonData.recommendation || "مراجعة الطبيب المختص"
                        };
                    }
                } catch (fetchErr) {
                    console.log("⚠️ سيرفر البايثون لم يرد، سيتم الحفظ كصورة أصلية فقط:", fetchErr.message);
                }
            }

            // تخزين بيانات الأشعة في MySQL
            const sql = `INSERT INTO xray_images (appointment_id, patient_id, file_path, ai_result, analyzed_by_agent_id, type) 
                         VALUES (?, ?, ?, ?, ?, ?)`;
            
            await db.execute(sql, [
                appointment_id || null, 
                finalPatientId, 
                imagePath, 
                JSON.stringify(analysisResult), 
                agent_id || 1,
                imageType 
            ]);

            console.log(`✅ [خلفية السيرفر]: تم حفظ الصورة بنجاح للمريض رقم (${finalPatientId})`);

        } catch (bgError) {
            console.error("🔴 خطأ أثناء المعالجة في الخلفية:", bgError.message);
        }
    })();
};

// 2. جلب كافة صور الأشعة لمريض محدد
const getPatientXrays = async (req, res) => {
    try {
        const patient_id = req.body.patient_id || req.params.patient_id || req.query.patient_id;

        if (!patient_id) {
            return res.status(400).json({
                success: false,
                message: "معرف المريض مطلوب (patient_id is required)"
            });
        }

        const query = `
            SELECT 
                x.xray_id, 
                x.file_path, 
                x.ai_result, 
                x.uploaded_at,
                x.type, 
                p.full_name as patient_name
            FROM xray_images x
            LEFT JOIN appointments a ON x.appointment_id = a.appointment_id
            JOIN patients p ON p.patient_id = COALESCE(x.patient_id, a.patient_id)
            WHERE x.patient_id = ? OR a.patient_id = ?
            ORDER BY x.uploaded_at DESC
        `;

        const [rows] = await db.execute(query, [patient_id, patient_id]);

        if (rows.length === 0) {
            return res.status(200).json({
                success: true,
                message: "لا يوجد سجل صور أشعة لهذا المريض",
                data: []
            });
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const processedRows = rows.map(row => {
            let aiResultParsed = null;
            if (row.ai_result) {
                try {
                    aiResultParsed = typeof row.ai_result === 'string' ? JSON.parse(row.ai_result) : row.ai_result;
                } catch (e) {
                    aiResultParsed = row.ai_result;
                }
            }

            return {
                xray_id: row.xray_id,
                image_url: `${baseUrl}/${row.file_path}`, 
                file_path: row.file_path,
                type: row.type || 'original', 
                ai_result: aiResultParsed,
                ai_score: aiResultParsed && aiResultParsed.confidence ? aiResultParsed.confidence : null,
                uploaded_at: row.uploaded_at
            };
        });

        return res.status(200).json({
            success: true,
            patient: rows[0].patient_name,
            count: rows.length,
            data: processedRows 
        });

    } catch (error) {
        console.error("🔴 خطأ أثناء جلب أرشيف الأشعة:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب أرشيف الأشعة",
            error: error.message
        });
    }
};

// 3. جلب تفاصيل تحليل صورة أشعة واحدة
const getXrayAnalysis = async (req, res) => {
    try {
        const { xray_id } = req.params;

        const query = `
            SELECT 
                x.xray_id, 
                x.file_path, 
                x.ai_result, 
                x.uploaded_at,
                x.type,
                p.full_name as patient_name,
                p.patient_id
            FROM xray_images x
            LEFT JOIN appointments a ON x.appointment_id = a.appointment_id
            JOIN patients p ON p.patient_id = COALESCE(x.patient_id, a.patient_id)
            WHERE x.xray_id = ?
        `;

        const [rows] = await db.execute(query, [xray_id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "صورة الأشعة غير موجودة"
            });
        }

        let aiResultParsed = null;
        if (rows[0].ai_result) {
            try {
                aiResultParsed = typeof rows[0].ai_result === 'string' ? JSON.parse(rows[0].ai_result) : rows[0].ai_result;
            } catch (e) {
                aiResultParsed = rows[0].ai_result;
            }
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const xrayData = {
            ...rows[0],
            image_url: `${baseUrl}/${rows[0].file_path}`,
            ai_result: aiResultParsed
        };

        return res.status(200).json({
            success: true,
            data: xrayData
        });

    } catch (error) {
        console.error("🔴 خطأ أثناء جلب تحليل الأشعة:", error);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب نتيجة التحليل",
            error: error.message
        });
    }
};

module.exports = { 
    uploadAndAnalyzeXray,
    getPatientXrays,
    getXrayAnalysis
};