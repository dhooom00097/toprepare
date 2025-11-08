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
  db.run(`CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_code TEXT UNIQUE NOT NULL,
      subject TEXT NOT NULL,
      room TEXT NOT NULL,
      duration INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      session_code TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ✅ تسجيل دخول المعلم
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '102030') {
    return res.json({ success: true, name: 'الأستاذ الإداري' });
  }
  return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
});

// ✅ إنشاء جلسة جديدة
app.post('/api/session', (req, res) => {
  const { subject, room, duration } = req.body;
  const sessionCode = uuidv4().slice(0, 8).toUpperCase();
  const createdAt = new Date().toISOString(); // وقت موحد UTC

  db.run(
    `INSERT INTO sessions (session_code, subject, room, duration, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionCode, subject, room, duration, createdAt],
    (err) => {
      if (err) {
        console.error('خطأ أثناء إنشاء الجلسة:', err);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء الجلسة' });
      }
      res.json({ success: true, sessionCode });
    }
  );
});

// ✅ التحقق من الجلسة وتسجيل الحضور
app.post('/api/attendance', (req, res) => {
  const { studentName, studentId, sessionCode } = req.body;

  db.get(`SELECT * FROM sessions WHERE session_code = ?`, [sessionCode], (err, session) => {
    if (err) {
      console.error('خطأ أثناء البحث عن الجلسة:', err);
      return res.status(500).json({ success: false, message: 'حدث خطأ داخلي' });
    }

    if (!session) {
      return res.status(400).json({ success: false, message: '⚠️ الجلسة غير موجودة' });
    }

    const createdAt = new Date(session.created_at);
    const now = new Date();

    // نحسب مدة الجلسة ونقارن بالتوقيت العالمي UTC
    const endTime = new Date(createdAt.getTime() + session.duration * 60 * 1000);
    if (now.getTime() > endTime.getTime()) {
      return res.status(400).json({ success: false, message: '⚠️ الجلسة غير موجودة أو منتهية' });
    }

    // التحقق إذا الطالب سجل مسبقًا
    db.get(
      `SELECT * FROM attendance WHERE student_id = ? AND session_code = ?`,
      [studentId, sessionCode],
      (err, existing) => {
        if (existing) {
          return res.status(400).json({ success: false, message: '✅ تم تسجيل حضورك مسبقًا' });
        }

        // تسجيل الحضور
        db.run(
          `INSERT INTO attendance (student_name, student_id, session_code)
           VALUES (?, ?, ?)`,
          [studentName, studentId, sessionCode],
          (err) => {
            if (err) {
              console.error('خطأ أثناء تسجيل الحضور:', err);
              return res.status(500).json({ success: false, message: 'حدث خطأ أثناء التسجيل' });
            }

            res.json({
              success: true,
              subject: session.subject,
              room: session.room,
              time: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }),
            });
          }
        );
      }
    );
  });
});

// ✅ عرض نسب الحضور الإجمالية
app.get('/api/attendance-summary', (req, res) => {
  const query = `
    SELECT student_name,
           student_id,
           COUNT(DISTINCT session_code) AS attendance_count
    FROM attendance
    GROUP BY student_id
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('خطأ أثناء جلب التقرير:', err);
      return res.status(500).json({ success: false });
    }
    res.json(rows);
  });
});

// ✅ بدء السيرفر
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
