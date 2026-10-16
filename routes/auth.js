const express = require('express');
const router = express.Router();
const User = require('../models/User');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات تسجيل دخول كثيرة، حاول لاحقاً' }
});

const adminWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة، حاول لاحقاً' }
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'غير مصرح' });
  }
  next();
}

async function requireLeadAdmin(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    const u = await User.findById(req.session.userId).select('isLeadAdmin');
    if (!u || !u.isLeadAdmin) {
      return res.status(403).json({ error: 'هذه الصفحة للخادم الرئيسي فقط' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
}

function validateUsername(u) {
  if (typeof u !== 'string') return false;
  const trimmed = u.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 30) return false;
  if (!/^[a-z0-9_-]+$/.test(trimmed)) return false;
  return trimmed;
}

function validatePassword(p) {
  if (typeof p !== 'string') return false;
  return p.length >= 8;
}

const Grade = require('../models/Grade');

async function sanitizeGrades(grades) {
  if (!Array.isArray(grades)) return [];
  const valid = await Grade.find({}).select('name').lean();
  const allowed = valid.map(g => g.name);
  const out = [];
  for (const g of grades) {
    if (typeof g === 'string' && allowed.includes(g) && !out.includes(g)) {
      out.push(g);
    }
  }
  return out;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => err ? reject(err) : resolve());
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save(err => err ? reject(err) : resolve());
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy(err => err ? reject(err) : resolve());
  });
}

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    const cleanUser = validateUsername(username);
    if (!cleanUser) {
      return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    }
    const user = await User.findOne({ username: cleanUser });
    if (!user) {
      return res.status(401).json({ error: 'بيانات دخول غير صحيحة' });
    }
    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ error: 'بيانات دخول غير صحيحة' });
    }
    await regenerateSession(req);
    req.session.userId = user._id.toString();
    req.session.userRole = user.role;
    req.session.isLeadAdmin = !!user.isLeadAdmin;
    req.session.allowedGrades = Array.isArray(user.allowedGrades) ? user.allowedGrades : [];
    req.session.createdAt = Date.now();
    await saveSession(req);
    return res.json({
      success: true,
      role: user.role,
      isLeadAdmin: !!user.isLeadAdmin,
      allowedGrades: user.allowedGrades || []
    });
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await destroySession(req);
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password -__v').lean();
    if (!user) {
      await destroySession(req).catch(() => {});
      return res.status(401).json({ error: 'غير مصرح' });
    }
    return res.json(user);
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.get('/admins', requireLeadAdmin, async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('-password -__v')
      .sort({ createdAt: -1 })
      .lean();
    return res.json(admins);
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.post('/admins', adminWriteLimiter, requireLeadAdmin, async (req, res) => {
  try {
    const { username, password, allowedGrades, isLeadAdmin } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    const cleanUser = validateUsername(username);
    if (!cleanUser) {
      return res.status(400).json({ error: 'اسم المستخدم غير صالح (أحرف إنجليزية صغيرة فقط، لا مسافات، 3-30 حرف)' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    }
    const existing = await User.findOne({ username: cleanUser }).select('_id').lean();
    if (existing) {
      return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    const leadFlag = isLeadAdmin === true;
    const finalGrades = leadFlag ? [] : await sanitizeGrades(allowedGrades);
    const user = new User({
      username: cleanUser,
      password,
      role: 'admin',
      isLeadAdmin: leadFlag,
      allowedGrades: finalGrades,
      createdBy: req.session.userId
    });
    await user.save();
    return res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        allowedGrades: user.allowedGrades,
        isLeadAdmin: user.isLeadAdmin
      }
    });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.put('/admins/:id', adminWriteLimiter, requireLeadAdmin, async (req, res) => {
  try {
    const { username, password, allowedGrades, isLeadAdmin } = req.body || {};
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    if (user.isLeadAdmin && isLeadAdmin === false) {
      return res.status(400).json({ error: 'لا يمكن إزالة صلاحية الخادم الرئيسي' });
    }
    if (username !== undefined) {
      if (typeof username !== 'string') {
        return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
      }
      const cleanUser = validateUsername(username);
      if (!cleanUser) {
        return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
      }
      if (cleanUser !== user.username) {
        const existing = await User.findOne({ username: cleanUser, _id: { $ne: user._id } }).select('_id').lean();
        if (existing) {
          return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }
      }
      user.username = cleanUser;
    }
    if (password !== undefined && password !== '') {
      if (typeof password !== 'string') {
        return res.status(400).json({ error: 'كلمة المرور غير صالحة' });
      }
      if (!validatePassword(password)) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
      }
      user.password = password;
    }
    if (isLeadAdmin !== undefined) {
      user.isLeadAdmin = isLeadAdmin === true;
    }
    if (user.isLeadAdmin === true) {
      user.allowedGrades = [];
    } else if (allowedGrades !== undefined) {
      user.allowedGrades = await sanitizeGrades(allowedGrades);
    }
    await user.save();
    return res.json({ success: true });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

router.delete('/admins/:id', adminWriteLimiter, requireLeadAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    if (user.isLeadAdmin) {
      return res.status(400).json({ error: 'لا يمكن حذف الخادم الرئيسي' });
    }
    if (user._id.toString() === req.session.userId.toString()) {
      return res.status(400).json({ error: 'لا يمكن حذف نفسك' });
    }
    await User.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

module.exports = router;