const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper: generate JWT token
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// GET /api/auth/default-session — auto-login default patient so dashboard opens directly without login wall
router.get('/default-session', async (req, res) => {
  try {
    let user = await User.findOne({ role: 'patient' }).sort({ createdAt: 1 });
    if (!user) {
      user = await User.create({
        name: 'Patient',
        email: 'patient@dosetrack.local',
        password: 'password123',
        role: 'patient',
      });
    }

    const Device = require('../models/Device');
    const device = await Device.findOneAndUpdate(
      { deviceId: 'DISPENSER_01' },
      { patient: user._id },
      { new: true, upsert: true }
    );
    await User.findByIdAndUpdate(user._id, { device: device._id });

    const lastSeen = device.lastHeartbeat?.receivedAt
      ? new Date(device.lastHeartbeat.receivedAt).getTime()
      : 0;
    const isLiveOnline = Boolean(lastSeen && Date.now() - lastSeen <= 45 * 1000);

    const token = signToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        telegramChatId: user.telegramChatId,
        device: { deviceId: 'DISPENSER_01', isOnline: isLiveOnline },
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    // Only allow patient and caretaker to self-register
    const allowedRoles = ['patient', 'caretaker'];
    const userRole = allowedRoles.includes(role) ? role : 'patient';

    const user = await User.create({ name, email, password, role: userRole });

    const token = signToken(user._id);

    res.status(201).json({
      message: 'Registration successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user._id);

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        telegramChatId: user.telegramChatId,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me — get current logged in user
router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/telegram — save Telegram Chat ID
router.patch('/telegram', protect, async (req, res) => {
  try {
    const { telegramChatId } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { telegramChatId },
      { new: true }
    );

    res.json({
      message: 'Telegram Chat ID saved.',
      telegramChatId: user.telegramChatId,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/link-patient — caretaker/doctor links a patient
router.patch('/link-patient', protect, async (req, res) => {
  try {
    const { patientEmail } = req.body;

    const patient = await User.findOne({ email: patientEmail, role: 'patient' });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    const alreadyLinked = req.user.linkedPatients.includes(patient._id);
    if (alreadyLinked) {
      return res.status(400).json({ message: 'Patient already linked.' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $push: { linkedPatients: patient._id },
    });

    res.json({ message: `Patient ${patient.name} linked successfully.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
