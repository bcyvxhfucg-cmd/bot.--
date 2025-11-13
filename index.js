// ==============================
//  المكتبات المطلوبة
// ==============================
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios'); // لاستخدام API إذا لزم

// ==============================
//  إعدادات بوت تيليجرام
// ==============================
const TELEGRAM_TOKEN = "8258339661:AAHSIeEzkDZ5xMEXdnwPfk9xGfchyBwAJ7Q";
const ADMIN_ID = 7210057243;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ==============================
//  مجلد الجلسات
// ==============================
const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

let sock;

// ==============================
//  بدء اتصال واتساب
// ==============================
async function startSock() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false
        });

        // حفظ بيانات الجلسة عند أي تحديث
        sock.ev.on('creds.update', saveCreds);

        // متابعة حالة الاتصال
        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;

            if (qr) {
                console.log("🔹 QR code generated! امسح الرمز في واتساب");
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const reason = lastDisconnect.error?.output?.statusCode;
                console.log("⚠️ تم فصل الاتصال، السبب:", reason);
                if (reason !== DisconnectReason.loggedOut) {
                    setTimeout(startSock, 5000); // إعادة المحاولة بعد 5 ثواني
                }
            } else if (connection === 'open') {
                console.log("✅ واتساب متصل!");
            }
        });

        // متابعة الرسائل الواردة
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message) return;
            const sender = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

            // مثال: أوامر داخل واتساب
            if (text === "!help") {
                await sock.sendMessage(sender, { text: generateCommandList() });
            }
        });

    } catch (e) {
        console.log("⚠️ خطأ أثناء الاتصال:", e.message);
        setTimeout(startSock, 5000); // إعادة المحاولة بعد 5 ثواني
    }
}

// ==============================
//  قائمة الأوامر (منسقة فخمة)
// ==============================
function generateCommandList() {
    return `
┏━━━💎 قائمة الأوامر 💎━━━┓
┃ /pair <رقم> - توليد رمز الاقتران
┃ /status - حالة اتصال واتساب
┃ /ping - اختبار سرعة الاستجابة
┃ /broadcast - إرسال جماعي
┃ /restart - إعادة تشغيل البوت
┃ /info - معلومات الجلسة
┃ /about - حول البوت
┃ /help - عرض الأوامر
┗━━━━━━━━━━━━━━━━━━━━┛
`;
}

// ==============================
//  أوامر تيليجرام
// ==============================

// توليد رمز الاقتران
bot.onText(/\/pair (.+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const number = match[1];
    bot.sendMessage(msg.chat.id, "⌛ جاري توليد رمز الاقتران...");
    try {
        await startSock();
        bot.sendMessage(msg.chat.id, "✅ تم توليد الرمز! افتح واتساب لمسح رمز QR.");
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ حدث خطأ أثناء توليد رمز الاقتران.");
        console.log(e);
    }
});

// حالة الاتصال
bot.onText(/\/status/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    const status = sock?.user ? "✅ واتساب متصل" : "❌ واتساب غير متصل";
    bot.sendMessage(msg.chat.id, status);
});

// اختبار سرعة الاستجابة
bot.onText(/\/ping/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    const start = Date.now();
    bot.sendMessage(msg.chat.id, "🏓 Ping...").then(() => {
        const end = Date.now();
        bot.sendMessage(msg.chat.id, `🏓 Pong! الوقت: ${end - start}ms`);
    });
});

// عرض قائمة الأوامر
bot.onText(/\/help/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, generateCommandList());
});

// ==============================
//  بدء البوت
// ==============================
startSock();
console.log("🤖 بوت واتساب و تيليجرام جاهز على Render!");
