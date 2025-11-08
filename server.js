// =============================
// نظام الحضور باستخدام JSON DB
// =============================
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد المجلدات
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = {
  teachers: path.join(dataDir, "teachers.json"),
  students: path.join(dataDir, "students.json"),
  sessions: path.join(dataDir, "sessions.json"),
  attendance: path.join(dataDir, "attendance.json"),
};

// دالة مساعدة لتحميل أو حفظ البيانات
function loadJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// إنشاء حساب المدير تلقائيًا
let teachers = loadJSON(db.teachers);
if (!teachers.find((t) => t.username === "admin")) {
  teachers.push({
    id: 1,
    username: "admin",
    password: "102030",
    name: "أ. المدير",
    created_at: new Date().toISOString(),
  });
  saveJSON(db.teachers, teachers);
  console.log("✅ تم إنشاء حساب المدير (admin)");
}

// ========================
// تسجيل دخول المعلم
// ========================
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const teachers = loadJSON(db.teachers);
  const user = teachers.find(
    (t) => t.username === username && t.password === password
  );
  if (!user)
    return res.status(401).json({ success: false, message: "بيانات غير صحيحة" });
  res.json({ success: true, teacher: { id: user.id, name: user.name } });
});

// ========================
// إنشاء جلسة حضور
// ========================
app.post("/api/sessions/create", (req, res) => {
  const { subject, room, duration } = req.body;
  if (!subject || !room || !duration)
    return res.status(400).json({ error: "الرجاء إدخال جميع البيانات" });

  const sessions = loadJSON(db.sessions);
  const code = "S" + Date.now().toString(36).toUpperCase();
  sessions.push({
    code,
    subject,
    room,
    duration,
    created_at: new Date().toISOString(),
  });
  saveJSON(db.sessions, sessions);

  res.json({ message: "✅ تم إنشاء الجلسة", code });
});

// ========================
// تسجيل حضور طالب
// ========================
app.post("/api/attendance/register", (req, res) => {
  const { studentId, name, sessionCode } = req.body;
  if (!studentId || !name || !sessionCode)
    return res.status(400).json({ error: "بيانات ناقصة" });

  const attendance = loadJSON(db.attendance);
  const already = attendance.find(
    (a) => a.studentId === studentId && a.sessionCode === sessionCode
  );
  if (already)
    return res
      .status(400)
      .json({ error: "تم تسجيل الحضور مسبقًا لهذه الجلسة" });

  attendance.push({
    studentId,
    name,
    sessionCode,
    time: new Date().toISOString(),
  });
  saveJSON(db.attendance, attendance);

  res.json({ message: "✅ تم تسجيل الحضور بنجاح" });
});

// ========================
// حساب نسبة الحضور
// ========================
app.get("/api/attendance/percentages", (req, res) => {
  const students = loadJSON(db.students);
  const sessions = loadJSON(db.sessions);
  const attendance = loadJSON(db.attendance);

  const total = sessions.length || 1;

  const result = students.map((stu) => {
    const attended = attendance.filter((a) => a.studentId === stu.studentId).length;
    return {
      name: stu.name,
      studentId: stu.studentId,
      attended,
      total,
      percentage: ((attended / total) * 100).toFixed(1),
    };
  });

  res.json(result);
});

// ========================
// تشغيل السيرفر
// ========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("🚀 السيرفر يعمل على المنفذ:", PORT);
});
