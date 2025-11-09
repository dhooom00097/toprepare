// 📦 server.js
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // يخدم صفحات HTML مباشرة

// 🧠 تحميل الجلسات من sessions.json
function loadSessions() {
  if (fs.existsSync("sessions.json")) {
    return JSON.parse(fs.readFileSync("sessions.json"));
  }
  return {};
}

// 💾 حفظ الجلسات في الملف
function saveSessions(data) {
  fs.writeFileSync("sessions.json", JSON.stringify(data, null, 2));
}

let sessions = loadSessions();

// 🎯 إنشاء جلسة جديدة
app.post("/api/sessions/create", (req, res) => {
  const { subject, room, duration } = req.body;
  if (!subject || !room) {
    return res.status(400).json({ error: "البيانات ناقصة" });
  }

  const code = "S" + Math.random().toString(36).substr(2, 6).toUpperCase();
  const endTime = Date.now() + (duration || 60) * 60000;

  sessions[code] = {
    code,
    subject,
    room,
    endTime,
    attendance: [],
  };

  saveSessions(sessions);

  res.json({ message: "تم إنشاء الجلسة", session: sessions[code] });
});

// 🔍 التحقق من الجلسة
app.get("/api/sessions/check/:code", (req, res) => {
  const code = req.params.code;
  const session = sessions[code];

  if (!session) {
    return res.status(404).json({ valid: false, message: "الجلسة غير موجودة" });
  }

  if (Date.now() > session.endTime) {
    return res.status(400).json({ valid: false, message: "انتهت الجلسة" });
  }

  res.json({ valid: true, session });
});

// 🧾 تسجيل حضور
app.post("/api/attendance/register", (req, res) => {
  const { name, studentId, sessionCode } = req.body;

  if (!name || !studentId || !sessionCode) {
    return res.status(400).json({ error: "البيانات ناقصة" });
  }

  const session = sessions[sessionCode];
  if (!session) {
    return res.status(404).json({ error: "الجلسة غير موجودة" });
  }

  if (Date.now() > session.endTime) {
    return res.status(400).json({ error: "انتهت الجلسة" });
  }

  const already = session.attendance.find(
    (s) => s.studentId === studentId
  );
  if (already) {
    return res.status(400).json({ error: "تم تسجيل حضورك مسبقاً" });
  }

  session.attendance.push({
    name,
    studentId,
    time: new Date().toISOString(),
  });

  saveSessions(sessions);
  res.json({ message: "✅ تم تسجيل الحضور بنجاح" });
});

// 🔚 إنهاء الجلسة
app.post("/api/sessions/end/:code", (req, res) => {
  const code = req.params.code;
  if (!sessions[code]) {
    return res.status(404).json({ error: "الجلسة غير موجودة" });
  }
  delete sessions[code];
  saveSessions(sessions);
  res.json({ message: "تم إنهاء الجلسة" });
});

// 🌍 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);