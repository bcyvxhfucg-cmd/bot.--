// ==============================
//  إعداد المكتبات والتهيئة
// ==============================
require('dotenv').config(); // تحميل متغيرات البيئة من ملف .env
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, proto } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const TelegramBot = require('node-telegram-bot-api');

// ==============================
//  الإعدادات
// ==============================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID, 10);
const USE_PAIR_CODE = process.env.USE_PAIR_CODE === 'true';

// التأكد من تهيئة البوت بشكل صحيح
if (!TELEGRAM_TOKEN || isNaN(ADMIN_ID)) {
    console.error("⚠️ خطأ في الإعدادات: يرجى التأكد من تعيين TELEGRAM_TOKEN و ADMIN_ID في ملف .env");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ==============================
//  مجلد الجلسات
// ==============================
const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

let sock;
let isPairing = false; // لمتابعة حالة محاولة الاقتران

// ==============================
//  بدء اتصال واتساب
// ==============================
/**
 * تبدأ اتصال WhatsApp. يمكن تمرير رقم هاتف لإجراء الاقتران برمز.
 * @param {string | null} pairingNumber - رقم الهاتف للاستخدام مع رمز الاقتران.
 */
async function startSock(pairingNumber = null) {
    if (sock && sock.user) {
        console.log("ℹ️ اتصال واتساب موجود بالفعل، لن يتم البدء مجدداً.");
        return;
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }), // استخدام pino لإدارة log
            browser: Browsers.macOS('Chrome'), // محاكاة متصفح Chrome على macOS
            // لا نمرر pairingCode هنا. يتم طلب الرمز لاحقاً عبر API
        });

        // حفظ بيانات الجلسة عند أي تحديث
        sock.ev.on('creds.update', saveCreds);

        // متابعة حالة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const reason = lastDisconnect.error?.output?.statusCode;
                console.log("⚠️ تم فصل الاتصال، السبب:", reason);

                if (reason === DisconnectReason.loggedOut) {
                    // إذا تم تسجيل الخروج، يجب حذف ملف الجلسة
                    console.log("🗑️ تم تسجيل الخروج! يرجى إعادة الربط.");
                    await bot.sendMessage(ADMIN_ID, "⚠️ تم تسجيل الخروج من واتساب. يرجى إعادة استخدام أمر `/pair` للربط مجدداً.");
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                } else {
                    console.log("🔄 إعادة محاولة الاتصال...");
                    setTimeout(() => startSock(), 5000); // إعادة المحاولة بعد 5 ثواني
                }

            } else if (connection === 'open') {
                console.log(`✅ واتساب متصل بالهاتف: ${sock.user.id.split(':')[0]}!`);
                if (isPairing) {
                    await bot.sendMessage(ADMIN_ID, `
🎉 *تم الاتصال بنجاح*!

> البوت الآن متصل بحساب الواتساب: \`${sock.user.id.split(':')[0]}\`
> يمكنك الآن استخدام أوامر البوت.
                    `, { parse_mode: 'Markdown' });
                    isPairing = false;
                }
            }
        });

        // طلب رمز الاقتران إذا كان مُفعلاً ولم يتم تسجيل الدخول
        if (USE_PAIR_CODE && !sock.user && pairingNumber && !isPairing) {
            isPairing = true;
            try {
                // إزالة أي رموز غير رقمية من الرقم
                const cleanNumber = pairingNumber.replace(/[^0-9]/g, '');

                await bot.sendMessage(ADMIN_ID, `⏳ جاري توليد رمز اقتران لرقم: *${cleanNumber}*...`, { parse_mode: 'Markdown' });

                // التأكد من أن الرقم يبدأ بكود الدولة بدون علامة +
                const formattedNumber = cleanNumber.startsWith('9') ? cleanNumber : cleanNumber;

                // طلب رمز الاقتران
                const code = await sock.requestPairingCode(formattedNumber);

                await bot.sendMessage(ADMIN_ID, `
✅ *رمز الاقتران (Pairing Code)*: \`${code}\`

> *الخطوات للربط:*
1. افتح واتساب على هاتفك.
2. انتقل إلى *الإعدادات* > *الأجهزة المرتبطة* > *ربط جهاز جديد*.
3. اضغط على *"الربط باستخدام رقم الهاتف"* وأدخل الرمز المكون من 8 أرقام أعلاه.

> *ملاحظة*: هذا الرمز صالح لفترة قصيرة.
                `, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error("❌ خطأ أثناء توليد رمز الاقتران:", error);
                isPairing = false;
                await bot.sendMessage(ADMIN_ID, "❌ حدث خطأ أثناء توليد رمز الاقتران. تأكد من أن رقم الهاتف بصيغة دولية صحيحة (بدون 0 في البداية وكود الدولة).");
            }
        }


        // متابعة الرسائل الواردة
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

            const sender = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

            const isGroup = sender.endsWith('@g.us');
            const senderJid = msg.key.participant || sender; // إذا كانت مجموعة، خذ معرف المرسل

            // تنسيق الرسالة لإعادة التوجيه إلى تيليجرام
            let messageText = `*رسالة جديدة من واتساب*\n\n`;
            messageText += `*المرسل:* ${isGroup ? `[${senderJid.split('@')[0]} في المجموعة]` : sender.split('@')[0]}\n`;
            messageText += `*المحتوى:*\n${text}`;

            // إرسال الرسالة إلى المشرف عبر تيليجرام
            bot.sendMessage(ADMIN_ID, messageText, { parse_mode: 'Markdown' });

            // مثال: أوامر داخل واتساب
            if (text === "!help") {
                await sock.sendMessage(sender, { text: generateCommandList() });
            }
        });

    } catch (e) {
        console.error("⚠️ خطأ رئيسي أثناء الاتصال:", e.message);
        // لا داعي لإعادة المحاولة هنا، لأن connection.update سيتكفل بها
    }
}

// ==============================
//  قائمة الأوامر (منسقة فخمة)
// ==============================
function generateCommandList() {
    return `
┏━━━💎 قائمة الأوامر 💎━━━┓
┃ /pair <رقم> - توليد رمز الاقتران (للمشرف فقط)
┃ /status - حالة اتصال واتساب
┃ /ping - اختبار سرعة الاستجابة
┃ /restart - إعادة تشغيل البوت
┃ /help - عرض هذه القائمة
┗━━━━━━━━━━━━━━━━━━━━┛
`;
}

// ==============================
//  أوامر تيليجرام
// ==============================

// التحقق من صلاحية المشرف
function checkAdmin(msg) {
    if (msg.from.id !== ADMIN_ID) {
        bot.sendMessage(msg.chat.id, "🚫 هذا الأمر مخصص للمشرف فقط.");
        return false;
    }
    return true;
}

// توليد رمز الاقتران
bot.onText(/\/pair (\d+)/, async (msg, match) => {
    if (!checkAdmin(msg)) return;
    const number = match[1];

    if (sock?.user) {
        const waNumber = sock.user.id.split(':')[0];
        return bot.sendMessage(msg.chat.id, `❌ البوت متصل بالفعل برقم: \`${waNumber}\`! لا حاجة للاقتران مجدداً. استخدم /restart أولاً إذا كنت تريد تغيير الرقم.`, { parse_mode: 'Markdown' });
    }

    // هنا يتم تمرير الرقم إلى startSock لتوليد الرمز
    await startSock(number);
});

// حالة الاتصال
bot.onText(/\/status/, (msg) => {
    if (!checkAdmin(msg)) return;
    const waStatus = sock?.user ? `✅ متصل برقم: ${sock.user.id.split(':')[0]}` : "❌ غير متصل";
    const tgStatus = "✅ تيليجرام متصل (Polling)";
    bot.sendMessage(msg.chat.id, `*حالة البوت:*\n\n> واتساب: ${waStatus}\n> تيليجرام: ${tgStatus}`, { parse_mode: 'Markdown' });
});

// اختبار سرعة الاستجابة
bot.onText(/\/ping/, (msg) => {
    if (!checkAdmin(msg)) return;
    const start = Date.now();
    bot.sendMessage(msg.chat.id, "🏓 Ping...").then(() => {
        const end = Date.now();
        bot.sendMessage(msg.chat.id, `🏓 Pong! الوقت: ${end - start}ms`);
    });
});

// إعادة تشغيل البوت (لإعادة الربط أو تحديث الاتصال)
bot.onText(/\/restart/, async (msg) => {
    if (!checkAdmin(msg)) return;
    await bot.sendMessage(msg.chat.id, "🔄 جاري إعادة تشغيل اتصال واتساب...");
    
    // إغلاق الاتصال الحالي
    if (sock) {
        await sock.end('Restart requested by admin');
        sock = null;
    }
    
    // البدء مجدداً
    setTimeout(() => startSock(), 1000);
});

// عرض قائمة الأوامر
bot.onText(/\/help/, (msg) => {
    if (!checkAdmin(msg)) return;
    bot.sendMessage(msg.chat.id, generateCommandList(), { parse_mode: 'Markdown' });
});

// ==============================
//  بدء البوت
// ==============================
console.log("🤖 بوت واتساب و تيليجرام جاهز للعمل!");
bot.sendMessage(ADMIN_ID, "🚀 بوت واتساب-تيليجرام جاهز. استخدم أمر `/pair <رقم_الهاتف_الدولي>` للبدء بالاقتران.");
startSock();
