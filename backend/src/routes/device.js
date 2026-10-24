const express = require('express');
const Device = require('../models/Device');
const User = require('../models/User');
const { protect, protectDevice, restrictTo } = require('../middleware/auth');

const router = express.Router();

// POST /api/device/heartbeat — ESP32 sends health data and receives exact server time sync
router.post('/heartbeat', protectDevice, async (req, res) => {
  try {
    const { deviceId, wifiStrength, firmwareVersion, uptimeSeconds, freeHeapBytes } = req.body;
    const now = new Date();

    let updateData = {
      isOnline: true,
      lastHeartbeat: {
        receivedAt: now,
        wifiStrength,
        firmwareVersion,
        uptimeSeconds,
        freeHeapBytes,
      },
    };

    // Auto-link to latest patient if not yet linked so user doesn't get stuck
    let existing = await Device.findOne({ deviceId });
    if (!existing || !existing.patient) {
      let fallbackPatient = await User.findOne({ role: 'patient' }).sort({ createdAt: 1 });
      if (!fallbackPatient) {
        fallbackPatient = await User.create({
          name: 'Patient',
          email: 'patient@dosetrack.local',
          password: 'password123',
          role: 'patient',
        });
      }
      if (fallbackPatient) {
        updateData.patient = fallbackPatient._id;
      }
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      updateData,
      { new: true, upsert: true }
    );

    if (device.patient) {
      await User.findByIdAndUpdate(device.patient, { device: device._id });
    }

    res.json({
      message: 'Heartbeat received.',
      serverTimeEpochMs: now.getTime(),
      serverTimeISO: now.toISOString(),
      serverTimeIST: now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
      device,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/device/link — link device to logged-in user
router.post('/link', protect, async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ message: 'deviceId is required.' });
    }

    let device = await Device.findOne({ deviceId });
    if (!device) {
      // If device hasn't sent heartbeat yet, pre-register it
      device = await Device.create({ deviceId, patient: req.user._id, isOnline: true });
    } else {
      // Re-assign device to the currently logged-in user so linking DISPENSER_01 always succeeds
      device.patient = req.user._id;
      await device.save();
    }

    // Link device in User model
    await User.findByIdAndUpdate(req.user._id, { device: device._id });

    res.json({ message: 'Device linked successfully.', device });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// POST /api/device/register — register a new device (admin/dashboard)
router.post('/register', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { deviceId, patientId } = req.body;

    const existing = await Device.findOne({ deviceId });
    if (existing) {
      return res.status(400).json({ message: 'Device already registered.' });
    }

    const device = await Device.create({ deviceId, patient: patientId });

    // Link device to patient
    await User.findByIdAndUpdate(patientId, { device: device._id });

    res.status(201).json({ message: 'Device registered.', device });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/device/:deviceId — get device status
router.get('/:deviceId', protect, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId }).populate(
      'patient',
      'name email'
    );

    if (!device) return res.status(404).json({ message: 'Device not found.' });

    res.json({ device });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/device — get all devices (admin)
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const devices = await Device.find().populate('patient', 'name email');
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
