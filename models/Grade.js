const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
  name: {type:String, required:true, unique:true, enum:['prep1','prep2','prep3','sec1','sec2','sec3']},
  arabicName: {type:String, required:true},
  studentsCount: {type:Number, default:0}
}, {timestamps:true});

module.exports = mongoose.model('Grade', gradeSchema);