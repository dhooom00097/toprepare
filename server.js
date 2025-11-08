const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// إنشاء قاعدة البيانات
const db = new sqlite3.Database('./attendance.db');

// إنشاء الجداول
db.serialize(() => {
  // جدول المعلمين
  db.run(`CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // جدول الجلسات
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    room TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // جدول الحضور
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name TEXT NOT NULL,
    student_id TEXT NOT NULL,
    session_code TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// تسجيل الدخول للمعلم (بسيط)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT * FROM teachers WHERE username = ? AND password = ?',
    [username, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      res.json({ success: true, name: row.name });
    }
  );
});

// إنشاء جلسة جديدة
app.post('/api/sessions/create', (req, res) => {
  const { subject, room } = req.body;
  const sessionCode = uuidv4().split('-')[0].toUpperCase();

  db.run(
    `INSERT INTO sessions (code, subject, room) VALUES (?, ?, ?)`,
    [sessionCode, subject, room],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, code: sessionCode });
    }
  );
});

// التحقق من صلاحية الجلسة
app.get('/api/sessions/:code', (req, res) => {
  const { code } = req.params;
  db.get('SELECT * FROM sessions WHERE code = ?', [code], (err, session) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!session) {
      return res.status(400).json({ error: 'الجلسة غير موجودة' });
    }

    // تحقق من مرور أكثر من 24 ساعة على إنشاء الجلسة
    const sessionTime = new Date(session.created_at);
    const now = new Date();
    const diffHours = (now - sessionTime) / (1000 * 60 * 60);

    if (diffHours > 24) {
      return res.status(400).json({ error: 'انتهت صلاحية الجلسة (تعدّت 24 ساعة)' });
    }

    res.json({ success: true, session });
  });
});

// تسجيل حضور الطالب
app.post('/api/attendance', (req, res) => {
  const { student_name, student_id, session_code } = req.body;

  db.get(
    'SELECT * FROM sessions WHERE code = ?',
    [session_code],
    (err, session) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!session)
        return res.status(400).json({ error: 'الجلسة غير موجودة أو منتهية' });

      db.run(
        `INSERT INTO attendance (student_name, student_id, session_code) VALUES (?, ?, ?)`,
        [student_name, student_id, session_code],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            success: true,
            message: 'تم تسجيل الحضور بنجاح!',
            subject: session.subject,
            room: session.room,
            time: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })
          });
        }
      );
    }
  );
});

// عرض نسب الحضور
app.get('/api/attendance/stats', (req, res) => {
  db.all(
    `SELECT student_name, student_id,
      COUNT(*) AS attended,
      (SELECT COUNT(*) FROM sessions) AS total_sessions
      FROM attendance
      GROUP BY student_id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const stats = rows.map((row) => ({
        name: row.student_name,
        id: row.student_id,
        attended: row.attended,
        total: row.total_sessions,
        percentage:
          row.total_sessions > 0
            ? ((row.attended / row.total_sessions) * 100).toFixed(1)
            : 0
      }));
      res.json(stats);
    }
  );
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل على المنفذ ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});

// التعامل مع إيقاف السيرفر
process.on('SIGINT', () => {
  console.log('\n🛑 إيقاف السيرفر...');
  db.close((err) => {
    if (err) console.error(err.message);
    console.log('✅ تم إغلاق قاعدة البيانات.');
    process.exit(0);
  });
});
