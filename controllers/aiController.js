// controllers/aiController.js

// دالة لمعالجة المحادثة كمساعد داخلي (تستدعى من البوت أو n8n)
const handleUserChat = async (message, chatId) => {
    console.log(`Message from ${chatId}: ${message}`);
    return "أهلاً بك! أنا ليان. رسالتك وصلت لسيرفر Node.js وهي بانتظار ربطها بعقل Gemini الذكي.";
};

// دالة معالجة الـ HTTP Request القادمة من الـ API (Flutter / Web)
const chatWithAI = async (req, res) => {
    try {
        const { message, chatId } = req.body;
        if (!message) {
            return res.status(400).json({ success: false, message: "يرجى إرسال الرسالة message" });
        }

        const reply = await handleUserChat(message, chatId || 'default');
        
        return res.status(200).json({
            success: true,
            reply: reply
        });
    } catch (error) {
        console.error("AI Controller Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { 
    handleUserChat,
    chatWithAI 
};