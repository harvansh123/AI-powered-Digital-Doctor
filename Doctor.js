const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name:         { type: String, required: true, trim: true },
  specialization: { type: String, required: true },
  experience:   { type: String },
  rating:       { type: Number, default: 4.5, min: 1, max: 5 },
  reviews:      { type: Number, default: 0 },
  consultationFee: { type: Number, required: true },
  hospital:     { type: String, required: true },
  phone:        { type: String },
  email:        { type: String },
  availableSlots: [{ type: String }],
  available:    { type: Boolean, default: true },
  avatar:       { type: String, default: '👨‍⚕️' },
  bio:          { type: String },
}, { timestamps: true });

const appointmentSchema = new mongoose.Schema({
  doctorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  patientName:  { type: String, required: true },
  patientEmail: { type: String, required: true },
  patientPhone: { type: String, required: true },
  date:         { type: Date, required: true },
  timeSlot:     { type: String, required: true },
  reason:       { type: String },
  prescription: { type: String },
  consultationNotes: { type: String },
  status:       { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed', 'rejected'], default: 'pending' },
  referenceId:  { type: String, unique: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-generate reference ID
appointmentSchema.pre('save', function (next) {
  if (!this.referenceId) {
    this.referenceId = 'APT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

module.exports = {
  Doctor: mongoose.model('Doctor', doctorSchema),
  Appointment: mongoose.model('Appointment', appointmentSchema),
};
