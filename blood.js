const express = require('express');
const router  = express.Router();
const { BloodDonor, BloodRequest } = require('../models/Hospital');
const { body, validationResult } = require('express-validator');

// GET /api/blood-donors
router.get('/blood-donors', async (req, res) => {
  try {
    const { blood, city } = req.query;
    const filter = {};
    if (blood) filter.blood = blood;
    if (city)  filter.city = { $regex: city, $options: 'i' };

    const donors = await BloodDonor.find(filter).sort({ createdAt: -1 });
    res.json(donors);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/blood-donor
router.post('/blood-donor', [
  body('name').notEmpty().withMessage('Name required'),
  body('blood').notEmpty().withMessage('Blood group required'),
  body('phone').notEmpty().withMessage('Phone required'),
  body('city').notEmpty().withMessage('City required'),
  body('age').isInt({ min: 18, max: 65 }).withMessage('Age must be 18–65'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const { name, age, blood, phone, city, lastDonated } = req.body;
    const donor = await BloodDonor.create({ name, age, blood, phone, city, lastDonated, available: true });
    res.status(201).json({ success: true, message: 'Donor registered successfully', donor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/blood-request
router.post('/blood-request', [
  body('patientName').notEmpty().withMessage('Patient name required'),
  body('bloodGroup').notEmpty().withMessage('Blood group required'),
  body('units').isInt({ min: 1 }).withMessage('Units must be at least 1'),
  body('hospital').notEmpty().withMessage('Hospital required'),
  body('contact').notEmpty().withMessage('Contact required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const request = await BloodRequest.create(req.body);
    res.status(201).json({ success: true, message: 'Blood request submitted', referenceId: request.referenceId, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
