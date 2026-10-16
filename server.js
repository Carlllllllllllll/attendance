require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const gradeRoutes = require('./routes/grades');

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const dangerous = ['$gt', '$lt', '$ne', '$in', '$nin', '$regex', '$options', '$where', '$exists', '$mod'];
    function clean(obj) {
      if (Array.isArray(obj)) return obj.map(clean);
      if (obj !== null && typeof obj === 'object') {
        const cleaned = {};
        for (const [key, val] of Object.entries(obj)) {
          if (dangerous.includes(key)) continue;
          cleaned[key] = clean(val);
        }
        return cleaned;
      }
      return obj;
    }
    req.body = clean(req.body);
  }
  next();
}

const app = express();

mongoose.connect(process.env.MONGO_URI).then(()=>console.log('mongo connected')).catch(err=>console.error(err));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(sanitizeBody);
app.use(express.static(path.join(__dirname,'public')));
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({mongoUrl: process.env.MONGO_URI}),
  cookie: {httpOnly: true, secure: false, sameSite: 'strict', maxAge: 1000*60*60*24*7}
}));

const apiLimiter = rateLimit({windowMs: 15*60*1000, max: 1000});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({windowMs: 15*60*1000, max: 100});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admins', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/grades', gradeRoutes);

app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('server running on '+PORT));