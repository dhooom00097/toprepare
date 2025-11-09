// 📦 server.js
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const session = require("express-session");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 🧠 إعداد جلسات تسجيل الدخول
app.use(
  session({
    secret: "attendance-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 }, // ساعة واحدة
  })
);

// تحميل الجلسات من sessions.json
function loadSessions() {
  if (fs.existsSync("sessions.json")) {
    return JSON.parse(fs.readFileSync("sessions.json"));
  }
  return {};
}

// حفظ الجلسات
function saveSessions(data) {
  fs.writeFileSync("sessions.json", JSON.stringify(data, null, 2));
}

let sessionsData = loadSessions();

// 🔑 تسجيل الدخول
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "1234") {
    req.session.user = { username };
    return res.json({ success: true, message: "تم تسجيل الدخول" });
  }

  res.status(401).json({ success: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
});

// 🔒 التحقق من تسجيل الدخول
app.get("/api/check-login", (req, res) => {
  if (req.session.user) return res.json({ loggedIn: true });
  res.json({ loggedIn: false });
});

// 🚪 تسجيل الخروج
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "تم تسجيل الخروج" });
  });
});

// 🎯 إنشاء جلسة جديدة
app.post("/api/sessions/create", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "غير مصرح لك" });

  const { subject, room, duration } = req.body;
  if (!subject || !room) return res.status(400).json({ error: "البيانات ناقصة" });

  const code = "S" + Math.random().toString(36).substr(2, 6).toUpperCase();
  const endTime = Date.now() + (duration || 60) * 60000;

  sessionsData[code] = {
    code,
    subject,
    room,
    endTime,
    attendance: [],
  };

  saveSessions(sessionsData);
  res.json({ message: "تم إنشاء الجلسة", session: sessionsData[code] });
});

// 🔍 التحقق من الجلسة
app.get("/api/sessions/check/:code", (req, res) => {
  const code = req.params.code;
  const session = sessionsData[code];

  if (!session) return res.status(404).json({ valid: false, message: "الجلسة غير موجودة" });
  if (Date.now() > session.endTime)
    return res.status(400).json({ valid: false, message: "انتهت الجلسة" });

  res.json({ valid: true, session });
});

// 🧾 تسجيل حضور
app.post("/api/attendance/register", (req, res) => {
  const { name, studentId, sessionCode } = req.body;
  if (!name || !studentId || !sessionCode)
    return res.status(400).json({ error: "البيانات ناقصة" });

  const session = sessionsData[sessionCode];
  if (!session) return res.status(404).json({ error: "الجلسة غير موجودة" });
  if (Date.now() > session.endTime)
    return res.status(400).json({ error: "انتهت الجلسة" });

  const already = session.attendance.find((s) => s.studentId === studentId);
  if (already) return res.status(400).json({ error: "تم تسجيل حضورك مسبقاً" });

  session.attendance.push({ name, studentId, time: new Date().toISOString() });

  saveSessions(sessionsData);
  res.json({ message: "✅ تم تسجيل الحضور بنجاح" });
});

// 🔚 إنهاء الجلسة
app.post("/api/sessions/end/:code", (req, res) => {
  const code = req.params.code;
  if (!sessionsData[code]) return res.status(404).json({ error: "الجلسة غير موجودة" });

  delete sessionsData[code];
  saveSessions(sessionsData);
  res.json({ message: "تم إنهاء الجلسة" });
});

// 🌍 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
