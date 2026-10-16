const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: {type:String, required:true, trim:true},
  grade: {type:String, required:true, enum:['prep1','prep2','prep3','sec1','sec2','sec3']},
  attendances: [{type:Date}]
}, {timestamps:true});

studentSchema.index({name:1, grade:1}, {unique:true});

module.exports = mongoose.model('Student', studentSchema);