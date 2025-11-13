const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

// ---- تيليجرام ----
const TELEGRAM_TOKEN = "8258339661:AAHSIeEzkDZ5xMEXdnwPfk9xGfchyBwAJ7Q";
const ADMIN_ID = 7210057243;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ---- جلسة واتساب ----
const { state, saveState } = useSingleFileAuthState(path.join(__dirname, "sessions/auth_info.json"));
let sock;

// ---- تشغيل البوت ----
async function startSock() {
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveState);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      console.log("QR code generated!");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const reason = lastDisconnect.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        startSock();
      }
    } else if (connection === "open") {
      console.log("WhatsApp connected!");
    }
  });

  // ---- استقبال رسائل واتساب ----
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;
    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    
    if (text === "!help") {
      await sock.sendMessage(sender, { 
        text: generateCommandList()
      });
    }
  });
}

// ---- قائمة الأوامر النصية الفخمة ----
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

// ---- أوامر تيليجرام ----
bot.onText(/\/pair (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const number = match[1];
  bot.sendMessage(msg.chat.id, "⌛ جاري توليد رمز الاقتران...");
  
  try {
    // إعادة تشغيل socket لتوليد رمز الاقتران
    await startSock();
    bot.sendMessage(msg.chat.id, "✅ تم توليد الرمز! افتح واتساب لمسح رمز QR.");
  } catch (e) {
    console.log(e);
    bot.sendMessage(msg.chat.id, "❌ حدث خطأ أثناء توليد رمز الاقتران.");
  }
});

bot.onText(/\/status/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const status = sock?.user ? "✅ واتساب متصل" : "❌ واتساب غير متصل";
  bot.sendMessage(msg.chat.id, status);
});

bot.onText(/\/ping/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const start = Date.now();
  bot.sendMessage(msg.chat.id, "🏓 Ping...").then(() => {
    const end = Date.now();
    bot.sendMessage(msg.chat.id, `🏓 Pong! الوقت: ${end - start}ms`);
  });
});

bot.onText(/\/help/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  bot.sendMessage(msg.chat.id, generateCommandList());
});

// ---- بدء البوت ----
startSock();
console.log("🤖 بوت واتساب و تيليجرام جاهز!");
