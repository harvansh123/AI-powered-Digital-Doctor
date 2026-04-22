const express = require('express');
const router  = express.Router();
const User = require('../models/User');
const { Doctor, Appointment } = require('../models/Doctor');

// Middleware to ensure Doctor access
const requireDoctor = async (req, res, next) => {
  if (!req.user || req.user.role !== 'doctor') {
    return res.status(403).json({ success: false, message: 'Doctor access required.' });
  }
  if (req.user.status !== 'approved' && req.user.status !== 'active') {
    return res.status(403).json({ success: false, message: 'Doctor account pending or restricted.' });
  }
  next();
};

// Apply middlewares
router.use(require('../middleware/authMiddleware'), requireDoctor);

// Helper to get Doctor profile id
const getDoctorProfile = async (userId) => {
  return await Doctor.findOne({ userId });
};

// GET /api/doctor/appointments
router.get('/appointments', async (req, res) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    if (!profile) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });

    const { status, date } = req.query;
    const query = { doctorId: profile._id };
    if (status) query.status = status;
    if (date)   query.date   = { $gte: new Date(date) };

    const appointments = await Appointment.find(query).sort({ date: 1, timeSlot: 1 });
    res.json({ success: true, appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/doctor/appointment/:id  — update status, prescription, notes
router.put('/appointment/:id', async (req, res) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const appointment = await Appointment.findOne({ _id: req.params.id, doctorId: profile._id });
    
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    const { status, prescription, consultationNotes, newDate, newTimeSlot } = req.body;
    
    if (status)            appointment.status = status;
    if (prescription)      appointment.prescription = prescription;
    if (consultationNotes) appointment.consultationNotes = consultationNotes;
    if (newDate)           appointment.date = new Date(newDate);
    if (newTimeSlot)       appointment.timeSlot = newTimeSlot;

    await appointment.save();

    // Emit socket event to all clients
    if (req.app.get('io') && status) {
      req.app.get('io').emit('appointment_update', { 
        appointmentId: appointment.referenceId,
        patientEmail:  appointment.patientEmail,
        status:        appointment.status
      });
    }

    res.json({ success: true, message: 'Appointment updated successfully', appointment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/doctor/profile
router.get('/profile', async (req, res) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/doctor/profile — update doctor profile
router.put('/profile', async (req, res) => {
  try {
    const { specialization, experience, consultationFee, hospital, bio, avatar } = req.body;
    const profile = await Doctor.findOneAndUpdate(
      { userId: req.user._id },
      { specialization, experience, consultationFee, hospital, bio, avatar },
      { new: true, runValidators: false }
    );
    if (!profile) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
    res.json({ success: true, message: 'Profile updated successfully', profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/doctor/slots — get available time slots
router.get('/slots', async (req, res) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    if (!profile) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
    res.json({ success: true, slots: profile.availableSlots || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/doctor/slots — update available time slots
router.put('/slots', async (req, res) => {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ success: false, message: 'Slots must be an array.' });

    const profile = await Doctor.findOneAndUpdate(
      { userId: req.user._id },
      { availableSlots: slots },
      { new: true }
    );
    if (!profile) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });
    
    // Emit slot update so booking page can refresh
    if (req.app.get('io')) {
      req.app.get('io').emit('doctor_slots_updated', { doctorId: profile._id, slots });
    }

    res.json({ success: true, message: 'Time slots updated successfully', slots: profile.availableSlots });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/doctor/stats — dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    if (!profile) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });

    const total     = await Appointment.countDocuments({ doctorId: profile._id });
    const pending   = await Appointment.countDocuments({ doctorId: profile._id, status: 'pending' });
    const confirmed = await Appointment.countDocuments({ doctorId: profile._id, status: 'confirmed' });
    const completed = await Appointment.countDocuments({ doctorId: profile._id, status: 'completed' });

    const today = new Date().toISOString().split('T')[0];
    const todayCount = await Appointment.countDocuments({ 
      doctorId: profile._id, 
      date: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59') }
    });

    res.json({ success: true, stats: { total, pending, confirmed, completed, today: todayCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
