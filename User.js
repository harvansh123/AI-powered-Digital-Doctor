const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: [true, 'First name required'], trim: true, maxlength: 50 },
  lastName:  { type: String, required: [true, 'Last name required'],  trim: true, maxlength: 50 },
  email:     { type: String, required: [true, 'Email required'], unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  phone:     { type: String, trim: true },
  password:  { type: String, required: [true, 'Password required'], minlength: 8, select: false },
  role:      { type: String, enum: ['user', 'admin', 'doctor'], default: 'user' },
  status:    { type: String, enum: ['pending', 'approved', 'rejected', 'active'], default: 'active' }, // Doctors start as 'pending'
  bloodGroup:{ type: String },
  isActive:  { type: Boolean, default: true },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
