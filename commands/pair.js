module.exports = async (sock, msg, args) => {
  await sock.sendMessage(msg.key.remoteJid, { text: "⌛ جاري توليد رمز الاقتران..." });
  // رمز الاقتران يُولّد داخل index.js عند الاتصال
};
