const express = require('express');
const Dose = require('../models/Dose');
const Medication = require('../models/Medication');
const User = require('../models/User');
const { protect, protectDevice } = require('../middleware/auth');
const {
  sendDoseTakenAlert,
  sendDoseMissedAlert,
} = require('../services/telegram');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// HARDWARE ROUTES (called by ESP32)
// Auth: Bearer DEVICE_SECRET
// ─────────────────────────────────────────────────────────────────

// Helper: find or create a patient + medication + pending dose for a hardware device
async function resolvePatientAndMed(deviceId, slotIndex = 1) {
  const Device = require('../models/Device');
  let device = deviceId ? await Device.findOne({ deviceId }) : null;
  let patientId = device?.patient;

  if (!patientId) {
    const fallbackPatient = await User.findOne({ role: 'patient' }).sort({ createdAt: -1 });
    if (!fallbackPatient) return { patientId: null, medication: null };
    patientId = fallbackPatient._id;
    if (deviceId) {
      device = await Device.findOneAndUpdate(
        { deviceId },
        { patient: patientId, isOnline: true },
        { new: true, upsert: true }
      );
      await User.findByIdAndUpdate(patientId, { device: device._id });
    }
  }

  let medication = await Medication.findOne({
    patient: patientId,
    isActive: true,
    ...(slotIndex ? { slotIndex } : {}),
  });

  if (!medication) {
    medication = await Medication.findOne({ patient: patientId, isActive: true });
  }

  if (!medication) {
    medication = await Medication.create({
      patient: patientId,
      addedBy: patientId,
      name: 'Scheduled Medicine',
      slotIndex: slotIndex || 1,
      slotColor: 'red',
      dosageAmount: 1,
      dosageUnit: 'tablet',
      times: ['09:00'],
      stockCount: 30,
      stockAlertThreshold: 5,
    });
  }

  return { patientId, medication };
}

async function resolveDoseForHardware({ doseId, deviceId, slotIndex }) {
  if (doseId) {
    const existing = await Dose.findById(doseId).populate('medication patient');
    if (existing) return existing;
  }

  const { patientId, medication } = await resolvePatientAndMed(deviceId, slotIndex);
  if (!patientId || !medication) return null;

  let dose = await Dose.findOne({
    patient: patientId,
    status: 'pending',
  })
    .sort({ scheduledAt: 1 })
    .populate('medication patient');

  if (!dose) {
    const created = await Dose.create({
      patient: patientId,
      medication: medication._id,
      scheduledAt: new Date(),
      slotIndex: medication.slotIndex || 1,
      status: 'pending',
    });
    dose = await Dose.findById(created._id).populate('medication patient');
  }

  return dose;
}

// POST /api/doses/trigger
// ESP32 can call this when starting its 5-minute test counter so the mobile app
// immediately displays the upcoming dose and live countdown timer
router.post('/trigger', protectDevice, async (req, res) => {
  try {
    const { deviceId = 'DISPENSER_01', alertInSeconds = 275, slotIndex = 1 } = req.body;
    const { patientId, medication } = await resolvePatientAndMed(deviceId, slotIndex);

    if (!patientId || !medication) {
      return res.status(404).json({ message: 'No patient found. Please register in the app first.' });
    }

    const scheduledAt = new Date(Date.now() + Number(alertInSeconds) * 1000);

    // Reuse an existing pending dose or create a fresh one for this cycle
    let dose = await Dose.findOne({
      patient: patientId,
      status: 'pending',
    }).sort({ scheduledAt: -1 });

    if (dose) {
      dose.scheduledAt = scheduledAt;
      dose.medication = medication._id;
      dose.slotIndex = medication.slotIndex;
      await dose.save();
    } else {
      dose = await Dose.create({
        patient: patientId,
        medication: medication._id,
        scheduledAt,
        slotIndex: medication.slotIndex,
        status: 'pending',
      });
    }

    const populated = await Dose.findById(dose._id).populate('medication', 'name slotIndex slotColor dosageAmount dosageUnit');
    res.json({ message: 'Timer dose triggered.', dose: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/doses/pending?deviceId=xxx
// ESP32 calls this every 60 seconds to get upcoming doses
router.get('/pending', protectDevice, async (req, res) => {
  try {
    const { deviceId } = req.query;

    const Device = require('../models/Device');
    const device = await Device.findOne({ deviceId });
    if (!device || !device.patient) {
      return res.status(404).json({ message: 'Device not linked to a patient.' });
    }

    const now = new Date();
    // Look 2 minutes ahead — so ESP32 can prepare
    const windowEnd = new Date(now.getTime() + 2 * 60 * 1000);

    const doses = await Dose.find({
      patient: device.patient,
      status: 'pending',
      scheduledAt: { $gte: now, $lte: windowEnd },
    }).populate('medication', 'name slotIndex slotColor dosageAmount dosageUnit');

    res.json({ doses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/doses/taken
// ESP32 calls this when IR sensor confirms pill pickup (works with doseId OR just deviceId)
router.post('/taken', protectDevice, async (req, res) => {
  try {
    const { doseId, deviceId = 'DISPENSER_01', slotIndex } = req.body;

    const dose = await resolveDoseForHardware({ doseId, deviceId, slotIndex });
    if (!dose) {
      return res.status(404).json({ message: 'Dose or patient not found.' });
    }

    dose.status = 'taken';
    dose.takenAt = new Date();
    dose.verifiedByHardware = true;
    await dose.save();

    // Decrease stock count
    await Medication.findByIdAndUpdate(dose.medication._id, {
      $inc: { stockCount: -1 },
    });

    // Send Telegram alert to caretakers
    const patient = await User.findById(dose.patient._id).populate('linkedPatients');

    // Notify the patient themselves if they have Telegram
    if (patient.telegramChatId) {
      await sendDoseTakenAlert(
        patient.telegramChatId,
        patient.name,
        dose.medication.name,
        new Date(dose.takenAt).toLocaleTimeString('en-IN')
      );
    }

    // Notify all linked caretakers/doctors
    const caretakers = await User.find({
      linkedPatients: patient._id,
      telegramChatId: { $ne: null },
    });

    for (const caretaker of caretakers) {
      await sendDoseTakenAlert(
        caretaker.telegramChatId,
        patient.name,
        dose.medication.name,
        new Date(dose.takenAt).toLocaleTimeString('en-IN')
      );
    }

    res.json({ message: 'Dose marked as taken.', dose });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/doses/missed
// ESP32 calls this when pill was NOT picked up within grace period (works with doseId OR just deviceId)
router.post('/missed', protectDevice, async (req, res) => {
  try {
    const { doseId, deviceId = 'DISPENSER_01', slotIndex } = req.body;

    const dose = await resolveDoseForHardware({ doseId, deviceId, slotIndex });
    if (!dose) {
      return res.status(404).json({ message: 'Dose or patient not found.' });
    }

    dose.status = 'missed';
    await dose.save();

    const patient = await User.findById(dose.patient._id);
    const scheduledTime = new Date(dose.scheduledAt).toLocaleTimeString('en-IN');

    // Notify patient
    if (patient.telegramChatId) {
      await sendDoseMissedAlert(
        patient.telegramChatId,
        patient.name,
        dose.medication.name,
        scheduledTime
      );
    }

    // Notify caretakers
    const caretakers = await User.find({
      linkedPatients: patient._id,
      telegramChatId: { $ne: null },
    });

    for (const caretaker of caretakers) {
      await sendDoseMissedAlert(
        caretaker.telegramChatId,
        patient.name,
        dose.medication.name,
        scheduledTime
      );
    }

    res.json({ message: 'Dose marked as missed.', dose });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DASHBOARD ROUTES (called by web app)
// Auth: JWT Bearer token
// ─────────────────────────────────────────────────────────────────

router.use(protect);

// GET /api/doses — get doses for a patient
router.get('/', async (req, res) => {
  try {
    const { patientId, date, status } = req.query;

    let targetPatient = req.user.role === 'patient' ? req.user._id : patientId;

    const query = { patient: targetPatient };
    if (status) query.status = status;

    // Filter by date (day)
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.scheduledAt = { $gte: start, $lte: end };
    }

    const doses = await Dose.find(query)
      .populate('medication', 'name slotIndex slotColor dosageAmount dosageUnit')
      .sort({ scheduledAt: 1 });

    res.json({ doses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/doses/stats — adherence stats
router.get('/stats', async (req, res) => {
  try {
    const { patientId, days = 7 } = req.query;
    const targetPatient = req.user.role === 'patient' ? req.user._id : patientId;

    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const doses = await Dose.find({
      patient: targetPatient,
      scheduledAt: { $gte: since },
    });

    const total = doses.length;
    const taken = doses.filter((d) => d.status === 'taken').length;
    const missed = doses.filter((d) => d.status === 'missed').length;
    const skipped = doses.filter((d) => d.status === 'skipped').length;
    const pending = doses.filter((d) => d.status === 'pending').length;
    const adherencePercent = total > 0 ? Math.round((taken / (total - pending)) * 100) : 0;

    res.json({ total, taken, missed, skipped, pending, adherencePercent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/doses/:id — manual correction by caretaker/doctor
router.patch('/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;

    const dose = await Dose.findByIdAndUpdate(
      req.params.id,
      { status, notes },
      { new: true }
    ).populate('medication', 'name');

    if (!dose) return res.status(404).json({ message: 'Dose not found.' });

    res.json({ message: 'Dose updated.', dose });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/doses/skip/:id — patient skips a dose
router.post('/skip/:id', async (req, res) => {
  try {
    const dose = await Dose.findByIdAndUpdate(
      req.params.id,
      { status: 'skipped', notes: req.body.reason || 'Skipped by patient' },
      { new: true }
    );

    if (!dose) return res.status(404).json({ message: 'Dose not found.' });

    res.json({ message: 'Dose skipped.', dose });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
