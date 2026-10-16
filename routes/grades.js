const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const Grade = require('../models/Grade');
const Student = require('../models/Student');

function auth(req,res,next){if(!req.session.userId) return res.status(401).json({error:'غير مصرح'}); next();}

const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 5*1024*1024}});

router.get('/', auth, async (req,res)=>{
  let grades = await Grade.find().sort({name:1});
  if(!req.session.isLeadAdmin && req.session.allowedGrades && req.session.allowedGrades.length>0){
    grades = grades.filter(g=>req.session.allowedGrades.includes(g.name));
  }
  for(const g of grades){
    g.studentsCount = await Student.countDocuments({grade: g.name});
    await g.save();
  }
  res.json(grades);
});

router.post('/', auth, async (req,res)=>{
  try{
    const {name, arabicName} = req.body;
    let grade = await Grade.findOne({name});
    if(!grade) grade = new Grade({name, arabicName});
    else grade.arabicName = arabicName;
    await grade.save();
    res.json(grade);
  }catch(e){res.status(500).json({error:'خطأ'});}
});

router.post('/upload', auth, upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'لا يوجد ملف'});
    const {grade} = req.body;
    if(!grade) return res.status(400).json({error:'اختر الصف'});
    const workbook = XLSX.read(req.file.buffer, {type:'buffer', cellDates: true});
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true});
    const names = [];
    for(const row of data){
      for(const cell of row){
        if(cell!=null && cell!==''){
          const s = String(cell).trim();
          if(s!=='') names.push(s);
        }
      }
    }
    let added = 0;
    for(const name of names){
      const existing = await Student.findOne({name, grade});
      if(!existing){
        await Student.create({name, grade, attendances:[]});
        added++;
      }
    }
    await Grade.findOneAndUpdate({name:grade}, {studentsCount: await Student.countDocuments({grade})}, {upsert:true});
    res.json({success:true, total: names.length, added});
  }catch(e){console.error(e); res.status(500).json({error:'فشل قراءة الملف: '+e.message});}
});


router.post('/upload-parse', auth, upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'لا يوجد ملف'});
    const {grade} = req.body;
    if(!grade) return res.status(400).json({error:'اختر الصف'});
    if(!req.session.isLeadAdmin && (!req.session.allowedGrades || !req.session.allowedGrades.includes(grade))){
      return res.status(403).json({error:'ليس لديك صلاحية لهذا الصف'});
    }
    const workbook = XLSX.read(req.file.buffer, {type:'buffer', cellDates: true});
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true});
    const names = [];
    for(const row of data){
      for(const cell of row){
        if(cell!=null && cell!=='') {
          const s = String(cell).trim();
          if(s!=='') names.push(s);
        }
      }
    }
    res.json({success:true, names, total: names.length});
  }catch(e){console.error(e); res.status(500).json({error:'فشل قراءة الملف: '+e.message});}
});

router.post('/upload-confirmed', auth, upload.single('file'), async (req,res)=>{
  try{
    const {grade} = req.body;
    const names = Array.isArray(req.body.names) ? req.body.names : (req.body.names ? [req.body.names] : []);
    if(!grade) return res.status(400).json({error:'اختر الصف'});
    if(!Array.isArray(names) || names.length===0) return res.status(400).json({error:'لا يوجد طلاب'});
    if(!req.session.isLeadAdmin && (!req.session.allowedGrades || !req.session.allowedGrades.includes(grade))){
      return res.status(403).json({error:'ليس لديك صلاحية لهذا الصف'});
    }
    let added = 0;
    for(const name of names){
      const n = String(name).trim();
      if(!n) continue;
      const existing = await Student.findOne({name: n, grade});
      if(!existing){
        await Student.create({name: n, grade, attendances:[]});
        added++;
      }
    }
    await Grade.findOneAndUpdate({name:grade}, {studentsCount: await Student.countDocuments({grade})}, {upsert:true});
    res.json({success:true, total: names.length, added});
  }catch(e){console.error(e); res.status(500).json({error:'فشل إضافة الطلاب: '+e.message});}
});
router.delete('/:id', auth, async (req,res)=>{
  try{
    await Grade.findByIdAndDelete(req.params.id);
    await Student.deleteMany({grade: req.params.id});
    res.json({success:true});
  }catch(e){res.status(500).json({error:'خطأ'});}
});

module.exports = router;