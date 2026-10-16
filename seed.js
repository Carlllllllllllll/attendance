require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Grade = require('./models/Grade');

const GRADES = [
  {name:'prep1', arabicName:'الصف الأول إعدادي'},
  {name:'prep2', arabicName:'الصف الثاني إعدادي'},
  {name:'prep3', arabicName:'الصف الثالث إعدادي'},
  {name:'sec1', arabicName:'الصف الأول ثانوي'},
  {name:'sec2', arabicName:'الصف الثاني ثانوي'},
  {name:'sec3', arabicName:'الصف الثالث ثانوي'},
];

mongoose.connect(process.env.MONGO_URI).then(async ()=>{
  await User.deleteMany({});
  await User.create({
    username: (process.env.ADMIN_USERNAME || 'admin').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'admin123',
    role: 'admin',
    isLeadAdmin: true,
    allowedGrades: [],
    createdBy: null
  });
  for(const g of GRADES) await Grade.findOneAndUpdate({name:g.name}, g, {upsert:true});
  console.log('Seeded lead admin + grades');
  process.exit(0);
}).catch(err=>{console.error(err); process.exit(1);});