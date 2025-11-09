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
  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration * 60000); // تحويل الدقائق إلى ميلي ثانية
  
  sessions.push({
    code,
    subject,
    room,
    duration,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    is_active: true
  });
  saveJSON(db.sessions, sessions);

  res.json({ message: "✅ تم إنشاء الجلسة", code });
});

// ========================
// التحقق من صلاحية الجلسة
// ========================
app.get("/api/sessions/check/:code", (req, res) => {
  const { code } = req.params;
  const sessions = loadJSON(db.sessions);
  const session = sessions.find(s => s.code === code.toUpperCase());
  
  if (!session) {
    return res.status(404).json({ valid: false, message: "الجلسة غير موجودة" });
  }
  
  const now = new Date();
  let expiresAt;
  
  // التحقق من وجود expires_at أو حسابه من created_at + duration
  if (session.expires_at) {
    expiresAt = new Date(session.expires_at);
  } else if (session.duration) {
    const createdAt = new Date(session.created_at);
    expiresAt = new Date(createdAt.getTime() + session.duration * 60000);
  } else {
    // إذا لم يكن هناك duration، نعتبر الجلسة صالحة لمدة 60 دقيقة افتراضياً
    const createdAt = new Date(session.created_at);
    expiresAt = new Date(createdAt.getTime() + 60 * 60000);
  }
  
  // التحقق من انتهاء الجلسة
  if (session.is_active === false || session.ended_at) {
    return res.json({ valid: false, message: "تم إنهاء الجلسة" });
  }
  
  if (now > expiresAt) {
    return res.json({ valid: false, message: "انتهت صلاحية الجلسة" });
  }
  
  res.json({ 
    valid: true, 
    session: {
      code: session.code,
      subject: session.subject,
      room: session.room,
      expires_at: expiresAt.toISOString(),
      remaining_minutes: Math.floor((expiresAt - now) / 60000)
    }
  });
});

// ========================
// تسجيل حضور طالب
// ========================
app.post("/api/attendance/register", (req, res) => {
  const { studentId, name, sessionCode } = req.body;
  
  // التحقق من البيانات المطلوبة
  if (!studentId || !name || !sessionCode) {
    return res.status(400).json({ error: "بيانات ناقصة" });
  }
  
  // تحويل رمز الجلسة إلى أحرف كبيرة
  const normalizedCode = sessionCode.toUpperCase();
  
  // التحقق من وجود الجلسة
  const sessions = loadJSON(db.sessions);
  const session = sessions.find(s => s.code === normalizedCode);
  
  if (!session) {
    console.log(`Session not found: ${normalizedCode}`);
    console.log('Available sessions:', sessions.map(s => s.code));
    return res.status(404).json({ error: "الجلسة غير موجودة أو منتهية" });
  }
  
  // التحقق من حالة الجلسة
  if (session.is_active === false || session.ended_at) {
    return res.status(400).json({ error: "تم إنهاء الجلسة" });
  }
  
  // التحقق من صلاحية الجلسة
  const now = new Date();
  let expiresAt;
  
  if (session.expires_at) {
    expiresAt = new Date(session.expires_at);
  } else if (session.duration) {
    const createdAt = new Date(session.created_at);
    expiresAt = new Date(createdAt.getTime() + session.duration * 60000);
  } else {
    // افتراضياً 60 دقيقة
    const createdAt = new Date(session.created_at);
    expiresAt = new Date(createdAt.getTime() + 60 * 60000);
  }
  
  if (now > expiresAt) {
    console.log(`Session expired: ${normalizedCode}`);
    console.log(`Now: ${now.toISOString()}, Expires: ${expiresAt.toISOString()}`);
    return res.status(400).json({ error: "الجلسة غير موجودة أو منتهية" });
  }

  // التحقق من عدم تسجيل الحضور مسبقاً
  const attendance = loadJSON(db.attendance);
  const already = attendance.find(
    (a) => a.studentId === studentId && a.sessionCode === normalizedCode
  );
  
  if (already) {
    return res.status(400).json({ error: "تم تسجيل الحضور مسبقًا لهذه الجلسة" });
  }

  // حفظ الطالب إذا لم يكن موجوداً
  const students = loadJSON(db.students);
  if (!students.find(s => s.studentId === studentId)) {
    students.push({
      studentId,
      name,
      created_at: new Date().toISOString()
    });
    saveJSON(db.students, students);
  }

  // تسجيل الحضور
  attendance.push({
    studentId,
    name,
    sessionCode: normalizedCode,
    time: new Date().toISOString(),
  });
  saveJSON(db.attendance, attendance);

  console.log(`Attendance registered: ${name} (${studentId}) for session ${normalizedCode}`);
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
// عرض الجلسات النشطة
// ========================
app.get("/api/sessions/active", (req, res) => {
  const sessions = loadJSON(db.sessions);
  const now = new Date();
  
  const activeSessions = sessions.filter(session => {
    let expiresAt = new Date(session.expires_at || session.created_at);
    
    if (!session.expires_at && session.duration) {
      const createdAt = new Date(session.created_at);
      expiresAt = new Date(createdAt.getTime() + session.duration * 60000);
    }
    
    return now <= expiresAt;
  });
  
  res.json(activeSessions);
});

// ========================
// إنهاء جلسة يدوياً
// ========================
app.post("/api/sessions/end/:code", (req, res) => {
  const { code } = req.params;
  const sessions = loadJSON(db.sessions);
  const sessionIndex = sessions.findIndex(s => s.code === code);
  
  if (sessionIndex === -1) {
    return res.status(404).json({ error: "الجلسة غير موجودة" });
  }
  
  sessions[sessionIndex].is_active = false;
  sessions[sessionIndex].ended_at = new Date().toISOString();
  saveJSON(db.sessions, sessions);
  
  res.json({ message: "✅ تم إنهاء الجلسة" });
});

// ========================
// معلومات التشخيص
// ========================
app.get("/api/debug/info", (req, res) => {
  const sessions = loadJSON(db.sessions);
  const students = loadJSON(db.students);
  const attendance = loadJSON(db.attendance);
  const now = new Date();
  
  const activeSessions = sessions.filter(session => {
    let expiresAt;
    if (session.expires_at) {
      expiresAt = new Date(session.expires_at);
    } else if (session.duration) {
      const createdAt = new Date(session.created_at);
      expiresAt = new Date(createdAt.getTime() + session.duration * 60000);
    } else {
      const createdAt = new Date(session.created_at);
      expiresAt = new Date(createdAt.getTime() + 60 * 60000);
    }
    
    return now <= expiresAt && session.is_active !== false && !session.ended_at;
  });
  
  res.json({
    server_time: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    stats: {
      total_sessions: sessions.length,
      active_sessions: activeSessions.length,
      total_students: students.length,
      total_attendance: attendance.length
    },
    active_sessions: activeSessions.map(s => ({
      code: s.code,
      subject: s.subject,
      room: s.room,
      created_at: s.created_at,
      expires_at: s.expires_at || "calculated from duration",
      duration: s.duration
    })),
    recent_attendance: attendance.slice(-5).map(a => ({
      student: a.name,
      session: a.sessionCode,
      time: a.time
    }))
  });
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