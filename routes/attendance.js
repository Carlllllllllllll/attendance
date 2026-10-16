const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const Student = require('../models/Student');

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function gradeFilter(req) {
  let filter = {};
  if (!req.session.isLeadAdmin && req.session.allowedGrades && req.session.allowedGrades.length > 0) {
    filter.grade = { $in: req.session.allowedGrades };
  }
  return filter;
}

function checkGradeAccess(req, grade) {
  if (!req.session.isLeadAdmin && req.session.allowedGrades && req.session.allowedGrades.length > 0) {
    if (!req.session.allowedGrades.includes(grade)) return false;
  }
  return true;
}

router.get('/students', auth, async (req, res) => {
  try {
    const { grade } = req.query;
    let filter = gradeFilter(req);
    if (grade) {
      if (!checkGradeAccess(req, grade)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الصف' });
      }
      filter.grade = grade;
    }
    const students = await Student.find(filter).sort({ name: 1 });
    res.json(students);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.post('/mark', auth, async (req, res) => {
  try {
    const { studentIds, date } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'اختر طلاب' });
    }
    const friday = new Date(date);
    friday.setHours(0, 0, 0, 0);
    for (const id of studentIds) {
      const student = await Student.findById(id);
      if (student) {
        if (!checkGradeAccess(req, student.grade)) {
          return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الطالب' });
        }
        const already = student.attendances.find(
          d => new Date(d).setHours(0, 0, 0, 0) === friday.getTime()
        );
        if (!already) student.attendances.push(friday);
        await student.save();
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'فشل تسجيل الحضور' });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const { grade } = req.query;
    let filter = gradeFilter(req);
    if (grade) {
      if (!checkGradeAccess(req, grade)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الصف' });
      }
      filter.grade = grade;
    }
    const students = await Student.find(filter);
    const total = students.length;
    res.json({ students, total });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.get('/check', auth, async (req, res) => {
  try {
    const { name, grade, date } = req.query;
    const friday = new Date(date);
    friday.setHours(0, 0, 0, 0);
    const student = await Student.findOne({ name, grade });
    if (!student) return res.json({ attended: false });
    if (!checkGradeAccess(req, student.grade)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الطالب' });
    }
    const attended = student.attendances.some(
      d => new Date(d).setHours(0, 0, 0, 0) === friday.getTime()
    );
    res.json({ attended, count: student.attendances.length });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.get('/student/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
    if (!checkGradeAccess(req, student.grade)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الطالب' });
    }
    res.json(student);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

module.exports = router;