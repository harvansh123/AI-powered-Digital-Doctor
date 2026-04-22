const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { Doctor } = require('../models/Doctor');
const { body, validationResult } = require('express-validator');
const router  = express.Router();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
});

// POST /api/auth/register (Standard User)
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const { firstName, lastName, email, phone, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });

    const user = await User.create({ firstName, lastName, email, phone, password });
    const token = signToken(user._id);
    res.status(201).json({ success: true, message: 'Account created successfully', token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/register-doctor
router.post('/register-doctor', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('specialization').notEmpty().withMessage('Specialization is required'),
  body('hospital').notEmpty().withMessage('Hospital/Clinic name is required'),
  body('consultationFee').isNumeric().withMessage('Consultation fee is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const { firstName, lastName, email, phone, password, specialization, hospital, consultationFee, experience, bio } = req.body;
    
    // Check user existence
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });

    // Create User as Doctor (pending status)
    const user = await User.create({ 
      firstName, lastName, email, phone, password, 
      role: 'doctor', status: 'pending' 
    });

    // Create linked Doctor profile
    await Doctor.create({
      userId: user._id,
      name: `Dr. ${firstName} ${lastName}`,
      specialization, hospital, consultationFee, experience, bio,
      email, phone,
      available: false // pending doctors cannot be booked yet
    });

    // Notify Admins via socket (optional feature improvement later)
    if (req.app.get('io')) {
      req.app.get('io').emit('doctor_registered', { name: `Dr. ${firstName} ${lastName}` });
    }

    const token = signToken(user._id);
    res.status(201).json({ success: true, message: 'Registration submitted successfully! Please wait for Admin approval.', token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Role-Based Checks
    if (user.role === 'doctor' && user.status === 'pending') {
      return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ success: false, message: 'Your account access has been restricted.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    const token = signToken(user._id);
    res.json({ success: true, message: 'Login successful', token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me — get current user
router.get('/me', require('../middleware/authMiddleware'), async (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
