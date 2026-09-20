require('dotenv').config();
const { Telegraf } = require('telegraf');
const aiController = require('./controllers/aiController');
// 1. إنشاء نسخة من البوت باستخدام التوكن
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 2. أمر البداية /start
bot.start((ctx) => {
    ctx.reply(`أهلاً بك يا ${ctx.from.first_name}! أنا حلا سكرتيرتك الذكية. كيف يمكنني مساعدتك اليوم؟`);
});

bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const chatId = ctx.chat.id;

    try {
        // إظهار حالة "typing..." بالتلغرام ليعرف المستخدم أن البوت يفكر
        await ctx.sendChatAction('typing');

        // هنا بننادي رفيقك! 
        // بنمرر له رسالة المستخدم، وهو بيرجع لنا رد Gemini
        // (الدالة دي رح نجهزها بالخطوة الجاية)
        const aiResponse = await aiController.handleUserChat(userMessage, chatId);

        // إرسال رد الذكاء الاصطناعي للمريض
        await ctx.reply(aiResponse);

    } catch (error) {
        console.error("Error in Bot Chat:", error);
        ctx.reply("عذراً، واجهت مشكلة صغيرة في معالجة طلبك. حاول مرة أخرى.");
    }
});

// 4. تشغيل البوت
bot.launch();

console.log("🚀 Telegram Bot is running...");

// للتوقف الآمن
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;