// ========================
// إعدادات السيرفر الأساسي
// ========================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// قاعدة البيانات
// ========================

const db = new sqlite3.Database('./attendance.db', (err) => {
  if (err) console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
  else console.log('✅ تم الاتصال بقاعدة البيانات بنجاح.');
});

// إنشاء الجداول
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    room TEXT NOT NULL,
    duration INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    session_code TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ========================
// ✅ إضافة أو تحديث حساب المدير تلقائيًا
// ========================

db.get(`SELECT * FROM teachers WHERE username = ?`, ['admin'], (err, row) => {
  if (err) {
    console.error('❌ خطأ أثناء فحص حساب المدير:', err.message);
    return;
  }

  if (!row) {
    // إذا ما فيه مدير، نضيفه
    db.run(
      `INSERT INTO teachers (username, password, name) VALUES (?, ?, ?)`,
      ['admin', '102030', 'أ. المدير'],
      (err) => {
        if (err) console.error('⚠️ فشل إضافة حساب المدير:', err.message);
        else console.log('✅ تم إنشاء حساب المدير (admin) بنجاح');
      }
    );
  } else {
    // إذا موجود، نحدث كلمة السر والاسم
    db.run(
      `UPDATE teachers SET password = ?, name = ? WHERE username = ?`,
      ['102030', 'أ. المدير', 'admin'],
      (err) => {
        if (err) console.error('⚠️ فشل تحديث حساب المدير:', err.message);
        else console.log('✅ تم تحديث حساب المدير (admin)');
      }
    );
  }
});

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
// تسجيل الدخول للمعلمين
// ========================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ success: false, message: 'أدخل اسم المستخدم وكلمة المرور' });

  db.get(`SELECT * FROM teachers WHERE username = ? AND password = ?`, [username, password], (err, row) => {
    if (err) {
      console.error('DB error:', err.message);
      return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }

    if (!row)
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

    res.json({ success: true, message: 'تم الدخول بنجاح', teacher: { id: row.id, name: row.name } });
  });
});

// ========================
// إنشاء جلسة جديدة
// ========================

app.post('/api/sessions/create', (req, res) => {
  const { subject, room, duration } = req.body;

  if (!subject || !room || !duration)
    return res.status(400).json({ error: 'الرجاء إدخال جميع الحقول المطلوبة' });

  const code = 'S' + Date.now().toString(36).toUpperCase();

  db.run(
    `INSERT INTO sessions (code, subject, room, duration) VALUES (?, ?, ?, ?)`,
    [code, subject, room, duration],
    function (err) {
      if (err) {
        console.error('❌ خطأ في إنشاء الجلسة:', err.message);
        return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الجلسة' });
      }
      res.json({ message: '✅ تم إنشاء الجلسة بنجاح', code });
    }
  );
});

// ========================
// تسجيل الحضور للطلاب
// ========================

app.post('/api/attendance', (req, res) => {
  const { student_id, session_code } = req.body;

  if (!student_id || !session_code)
    return res.status(400).json({ error: 'بيانات ناقصة' });

  db.run(
    `INSERT INTO attendance (student_id, session_code) VALUES (?, ?)`,
    [student_id, session_code],
    function (err) {
      if (err) {
        console.error('❌ خطأ أثناء تسجيل الحضور:', err.message);
        return res.status(500).json({ error: 'فشل تسجيل الحضور' });
      }
      res.json({ message: '✅ تم تسجيل الحضور بنجاح' });
    }
  );
});

// ========================
// تشغيل السيرفر
// ========================

app.listen(PORT, () => {
  console.log('===============================');
  console.log(`✅ السيرفر يعمل على المنفذ ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('===============================');
});

// التعامل مع إيقاف السيرفر
process.on('SIGINT', () => {
  console.log('\\n🔴 إيقاف السيرفر...');
  db.close((err) => {
    if (err) console.error(err.message);
    console.log('🟢 تم إغلاق قاعدة البيانات بنجاح');
    process.exit(0);
  });
});
