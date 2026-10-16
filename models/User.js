const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {type:String, required:true, unique:true, trim:true, lowercase:true},
  password: {type:String, required:true},
  role: {type:String, enum:['admin','user'], default:'admin'},
  isLeadAdmin: {type:Boolean, default:false},
  allowedGrades: {type:[String], default:[]},
  createdBy: {type:mongoose.Schema.Types.ObjectId, ref:'User'},
}, {timestamps:true});

userSchema.pre('save', async function(next){
  if(!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(candidate){
  return await bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);