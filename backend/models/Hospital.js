const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  address:    { type: String, required: true },
  type:       { type: String, enum: ['Government', 'Private', 'Emergency', 'Specialty'], default: 'Private' },
  phone:      { type: String },
  beds:       { type: Number, default: 0 },
  emergency:  { type: Boolean, default: false },
  rating:     { type: Number, default: 4.0, min: 1, max: 5 },
  specialties: [{ type: String }],
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: [Number], // [longitude, latitude]
  },
  distance:   { type: String },
}, { timestamps: true });

hospitalSchema.index({ location: '2dsphere' });

const bloodDonorSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  age:         { type: Number, required: true, min: 18, max: 65 },
  blood:       { type: String, required: true, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  phone:       { type: String, required: true },
  city:        { type: String, required: true },
  lastDonated: { type: Date },
  available:   { type: Boolean, default: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const bloodRequestSchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  bloodGroup:  { type: String, required: true, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  units:       { type: Number, required: true, min: 1 },
  hospital:    { type: String, required: true },
  contact:     { type: String, required: true },
  urgency:     { type: String, enum: ['critical','urgent','moderate','planned'] },
  notes:       { type: String },
  status:      { type: String, enum: ['pending','fulfilled','cancelled'], default: 'pending' },
  referenceId: { type: String, unique: true },
}, { timestamps: true });

bloodRequestSchema.pre('save', function (next) {
  if (!this.referenceId) {
    this.referenceId = 'BLD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

const medicineRecSchema = new mongoose.Schema({
  symptoms:    { type: String, required: true },
  disease:     { type: String },
  medicines:   [{ name: String, note: String }],
  precautions: [String],
  specialist:  String,
  confidence:  String,
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = {
  Hospital:               mongoose.model('Hospital', hospitalSchema),
  BloodDonor:             mongoose.model('BloodDonor', bloodDonorSchema),
  BloodRequest:           mongoose.model('BloodRequest', bloodRequestSchema),
  MedicineRecommendation: mongoose.model('MedicineRecommendation', medicineRecSchema),
};
