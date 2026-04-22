const express = require('express');
const router  = express.Router();
const { Doctor, Appointment } = require('../models/Doctor');
const { body, validationResult } = require('express-validator');

// GET /api/doctors
router.get('/doctors', async (req, res) => {
  try {
    const { spec, available } = req.query;
    const filter = {};
    if (spec) filter.specialization = { $regex: spec, $options: 'i' };
    if (available !== undefined) filter.available = available === 'true';

    let doctors = await Doctor.find(filter);

    // Seed if empty
    if (doctors.length === 0) {
      const seed = [
        { name:'Dr. Priya Sharma', specialization:'General Physician', experience:'12 years', rating:4.9, reviews:284, consultationFee:500, hospital:'City Health Clinic', availableSlots:['09:00 AM','10:30 AM','02:00 PM'], avatar:'👩‍⚕️' },
        { name:'Dr. Rajesh Kumar', specialization:'Cardiologist', experience:'18 years', rating:4.8, reviews:412, consultationFee:1200, hospital:'Heart Care Center', availableSlots:['09:30 AM','11:00 AM'], avatar:'👨‍⚕️' },
        { name:'Dr. Ananya Patel', specialization:'Dermatologist', experience:'9 years', rating:4.7, reviews:198, consultationFee:700, hospital:'Skin & Care Clinic', availableSlots:['10:00 AM','05:00 PM'], avatar:'👩‍⚕️' },
      ];
      await Doctor.insertMany(seed);
      doctors = await Doctor.find(filter);
    }

    res.json(doctors);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/book-appointment
router.post('/book-appointment', [
  body('patientName').notEmpty().withMessage('Patient name required'),
  body('patientEmail').isEmail().withMessage('Valid email required'),
  body('patientPhone').notEmpty().withMessage('Phone required'),
  body('date').isISO8601().withMessage('Valid date required'),
  body('time').notEmpty().withMessage('Time slot required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const { doctorId, patientName, patientEmail, patientPhone, date, time, reason } = req.body;
    const appointment = await Appointment.create({
      doctorId, patientName, patientEmail, patientPhone,
      date: new Date(date), timeSlot: time, reason,
    });
    res.status(201).json({ success: true, message: 'Appointment booked!', appointment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/appointments
router.get('/appointments', async (req, res) => {
  try {
    const appts = await Appointment.find().populate('doctorId', 'name specialization').sort({ createdAt: -1 }).limit(50);
    res.json(appts);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
