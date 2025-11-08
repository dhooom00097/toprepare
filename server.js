// ========================
// إعدادات السيرفر الأساسي
// ========================

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './attendance.db';

// ========================
// إعداد القاعدة
// ========================
let db;
try {
  db = new Database(DB_PATH);
  console.log(`✅ تم الاتصال بقاعدة البيانات: ${DB_PATH}`);
} catch (error) {
  console.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
  process.exit(1);
}

// ========================
// إنشاء الجداول (إذا لم توجد)
// ========================
db.prepare(`
  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    room TEXT NOT NULL,
    duration INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    session_code TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// ========================
// إعداد الـ Middleware
// ========================
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// إنشاء أو تحديث حساب المدير
// ========================
try {
  const admin = db.prepare('SELECT * FROM teachers WHERE username = ?').get('admin');
  if (!admin) {
    db.prepare('INSERT INTO teachers (username, password, name) VALUES (?, ?, ?)').run('admin', '102030', 'أ. المدير');
    console.log('✅ تم إنشاء حساب المدير (admin)');
  } else {
    db.prepare('UPDATE teachers SET password = ?, name = ? WHERE username = ?').run('102030', 'أ. المدير', 'admin');
    console.log('✅ تم تحديث حساب المدير (admin)');
  }
} catch (error) {
  console.error('⚠️ خطأ أثناء إعداد حساب المدير:', error.message);
}

// ========================
// المسارات الرئيسية
// ========================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

// ========================
// تسجيل دخول المعلمين
// ========================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'أدخل اسم المستخدم وكلمة المرور' });

  const teacher = db.prepare('SELECT * FROM teachers WHERE username = ? AND password = ?').get(username, password);
  if (!teacher) return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

  res.json({ success: true, teacher: { id: teacher.id, name: teacher.name } });
});

// ========================
// إنشاء جلسة جديدة
// ========================
app.post('/api/sessions/create', (req, res) => {
  const { subject, room, duration } = req.body;
  if (!subject || !room || !duration)
    return res.status(400).json({ error: 'الرجاء إدخال جميع الحقول المطلوبة' });

  const code = 'S' + Date.now().toString(36).toUpperCase();

  try {
    db.prepare('INSERT INTO sessions (code, subject, room, duration) VALUES (?, ?, ?, ?)').run(code, subject, room, duration);
    res.json({ message: '✅ تم إنشاء الجلسة بنجاح', code });
  } catch (error) {
    console.error('❌ خطأ أثناء إنشاء الجلسة:', error.message);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الجلسة' });
  }
});

// ========================
// عرض نسب الحضور
// ========================
app.get('/api/attendance/percentages', (req, res) => {
  try {
    const totalSessions = db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total;

    const students = db.prepare(`
      SELECT s.name, s.student_id, COUNT(a.session_code) AS attended
      FROM students s
      LEFT JOIN attendance a ON s.student_id = a.student_id
      GROUP BY s.student_id
    `).all();

    const results = students.map(stu => ({
      name: stu.name,
      student_id: stu.student_id,
      attended: stu.attended,
      total: totalSessions,
      percentage: totalSessions > 0 ? ((stu.attended / totalSessions) * 100).toFixed(1) : 0
    }));

    res.json(results);
  } catch (error) {
    console.error('⚠️ خطأ في حساب النسب:', error.message);
    res.status(500).json({ error: 'حدث خطأ أثناء حساب النسب' });
  }
});

// ========================
// تشغيل السيرفر
// ========================
app.listen(PORT, () => {
  console.log('===============================');
  console.log(`✅ السيرفر يعمل على المنفذ ${PORT}`);
  console.log(`🌐 افتح: http://localhost:${PORT}`);
  console.log('===============================');
});
