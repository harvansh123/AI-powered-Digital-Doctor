const express = require('express');
const router  = express.Router();
const User = require('../models/User');
const { Doctor, Appointment } = require('../models/Doctor');

// Middleware to ensure Admin access
const requireAdmin = async (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
};

// Apply auth & admin middlewares
router.use(require('../middleware/authMiddleware'), requireAdmin);

// GET /api/admin/stats — platform analytics
router.get('/stats', async (req, res) => {
  try {
    const totalPatients    = await User.countDocuments({ role: 'user' });
    const totalDoctors     = await Doctor.countDocuments({ available: true });
    const pendingDoctors   = await User.countDocuments({ role: 'doctor', status: 'pending' });
    const totalAppointments = await Appointment.countDocuments();
    const completedAppts   = await Appointment.countDocuments({ status: 'completed' });
    const pendingAppts     = await Appointment.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      stats: { totalPatients, totalDoctors, pendingDoctors, totalAppointments, completedAppts, pendingAppts }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users — all users (non-admin)
router.get('/users', async (req, res) => {
  try {
    const { role, status, search } = req.query;
    const query = { role: { $ne: 'admin' } };
    if (role)   query.role = role;
    if (status) query.status = status;
    if (search) query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
    ];
    const users = await User.find(query).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/doctors — all doctors with profile data
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' }).select('-password').sort({ createdAt: -1 });
    const doctorProfiles = await Doctor.find();
    
    const mergedDoctors = doctors.map(u => {
      const profile = doctorProfiles.find(p => String(p.userId) === String(u._id)) || {};
      return { ...u.toObject(), profile };
    });

    res.json({ success: true, doctors: mergedDoctors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/doctor-approval/:id — approve or reject a doctor
router.put('/doctor-approval/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'doctor') {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    user.status = status;
    await user.save();

    // Update Doctor profile availability
    if (status === 'approved') {
      await Doctor.findOneAndUpdate({ userId: user._id }, { available: true });
    } else {
      await Doctor.findOneAndUpdate({ userId: user._id }, { available: false });
    }

    // Notify via socket
    if (req.app.get('io')) {
      req.app.get('io').emit('doctor_approval', { 
        doctorId:  user._id,
        doctorEmail: user.email,
        status 
      });
    }

    res.json({ success: true, message: `Doctor application ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/appointments — all appointments with patient & doctor info
router.get('/appointments', async (req, res) => {
  try {
    const { status, doctorId, search } = req.query;
    const query = {};
    if (status)   query.status = status;
    if (doctorId) query.doctorId = doctorId;
    if (search)   query.patientName = { $regex: search, $options: 'i' };

    const appointments = await Appointment.find(query)
      .populate('doctorId', 'name specialization hospital')
      .sort({ date: -1 });

    res.json({ success: true, appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/user/:id/block — toggle user active status
router.put('/user/:id/block', async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot block admin accounts.' });

    user.isActive = isActive !== undefined ? isActive : !user.isActive;
    await user.save();

    res.json({ success: true, message: `User ${user.isActive ? 'unblocked' : 'blocked'} successfully.`, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/user/:id — remove a user account
router.delete('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot delete admin accounts.' });

    // Also remove doctor profile if doctor
    if (user.role === 'doctor') {
      await Doctor.findOneAndDelete({ userId: user._id });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User removed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/appointment/:id — admin can update any appointment
router.put('/appointment/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    if (req.app.get('io')) {
      req.app.get('io').emit('appointment_update', { appointmentId: appointment.referenceId, status });
    }

    res.json({ success: true, message: 'Appointment updated.', appointment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
