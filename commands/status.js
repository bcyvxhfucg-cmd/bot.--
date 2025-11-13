module.exports = async (sock, msg) => {
  const status = sock?.user ? "✅ واتساب متصل" : "❌ واتساب غير متصل";
  await sock.sendMessage(msg.key.remoteJid, { text: status });
};
