const express = require('express');
const Dose = require('../models/Dose');
const Medication = require('../models/Medication');
const User = require('../models/User');
const Device = require('../models/Device');
const { protect, protectDevice } = require('../middleware/auth');
const {
  sendDoseTakenAlert,
  sendDoseMissedAlert,
} = require('../services/telegram');
const {
  IST_TIMEZONE,
  getISTParts,
  getISTDateForClockTime,
  getISTDayBounds,
  formatISTTime,
} = require('../utils/time');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// HARDWARE ROUTES (called by ESP32)
// Auth: Bearer DEVICE_SECRET
// ─────────────────────────────────────────────────────────────────

// Helper: resolve patient linked to a hardware deviceId
async function resolvePatientForDevice(deviceId) {
  if (!deviceId) return null;
  let device = await Device.findOne({ deviceId });
  if (device?.patient) {
    return device.patient;
  }

  let fallbackPatient = await User.findOne({ role: 'patient' }).sort({ createdAt: 1 });
  if (!fallbackPatient) {
    fallbackPatient = await User.create({
      name: 'Patient',
      email: 'patient@dosetrack.local',
      password: 'password123',
      role: 'patient',
    });
  }

  device = await Device.findOneAndUpdate(
    { deviceId },
    {
      patient: fallbackPatient._id,
      isOnline: true,
      'lastHeartbeat.receivedAt': new Date(),
    },
    { new: true, upsert: true }
  );
  await User.findByIdAndUpdate(fallbackPatient._id, { device: device._id });
  return fallbackPatient._id;
}

/**
 * Strictly resolve a uniquely identified pending Dose for hardware taken/missed reporting.
 * Never fabricates a dose or guesses a dose from a different slot.
 */
async function resolveDoseForHardware({ doseId, deviceId, slotIndex }) {
  const parsedSlot = slotIndex !== undefined && slotIndex !== null ? Number(slotIndex) : null;

  let expectedPatientId = null;
  if (deviceId) {
    const device = await Device.findOne({ deviceId });
    if (device?.patient) {
      expectedPatientId = String(device.patient);
    }
  }

  // 1. If doseId is explicitly provided, it must match an existing pending dose
  if (doseId) {
    const existing = await Dose.findById(doseId).populate('medication patient');
    if (!existing) {
      return { error: 'Scheduled dose not found for provided doseId.', statusCode: 404 };
    }
    if (existing.status !== 'pending') {
      return { error: `Dose ${doseId} is already marked as '${existing.status}'.`, statusCode: 409 };
    }
    const dosePatientId = String(existing.patient?._id || existing.patient);
    if (expectedPatientId && dosePatientId !== expectedPatientId) {
      return { error: 'Dose does not belong to the patient linked to this device.', statusCode: 403 };
    }
    if (parsedSlot !== null && Number(existing.slotIndex) !== parsedSlot) {
      return { error: `Dose slotIndex (${existing.slotIndex}) does not match reported slotIndex (${parsedSlot}).`, statusCode: 409 };
    }
    return { dose: existing };
  }

  // 2. Without doseId, both deviceId and a valid slotIndex are required to identify a due dose
  if (!deviceId || parsedSlot === null || Number.isNaN(parsedSlot)) {
    return {
      error: 'Either doseId or both deviceId and slotIndex are required to uniquely identify a scheduled dose.',
      statusCode: 400,
    };
  }

  if (!expectedPatientId) {
    return { error: `Device '${deviceId}' is not linked to a patient.`, statusCode: 404 };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000); // up to 15 min after scheduled time
  const windowEnd = new Date(now.getTime() + 2 * 60 * 1000);    // up to 2 min before scheduled time

  const matchingDoses = await Dose.find({
    patient: expectedPatientId,
    slotIndex: parsedSlot,
    status: 'pending',
    scheduledAt: { $gte: windowStart, $lte: windowEnd },
  })
    .populate('medication patient')
    .sort({ scheduledAt: 1 });

  if (matchingDoses.length === 0) {
    return {
      error: `No active pending scheduled dose found for compartment ${parsedSlot} within the current due window.`,
      statusCode: 404,
    };
  }

  if (matchingDoses.length > 1) {
    return {
      error: `Multiple pending doses found for compartment ${parsedSlot}. Provide doseId to uniquely identify the dose.`,
      statusCode: 409,
    };
  }

  return { dose: matchingDoses[0] };
}

// POST /api/doses/trigger
// ESP32 or test harness can call this to trigger a countdown dose for an existing medication slot
router.post('/trigger', protectDevice, async (req, res) => {
  try {
    const { deviceId = 'DISPENSER_01', alertInSeconds = 275, slotIndex = 1 } = req.body;
    const patientId = await resolvePatientForDevice(deviceId);

    if (!patientId) {
      return res.status(404).json({ message: 'No patient found. Please register in the app first.' });
    }

    const medication = await Medication.findOne({
      patient: patientId,
      slotIndex: Number(slotIndex),
      isActive: true,
    });

    if (!medication) {
      return res.status(404).json({
        message: `No active medication configured for compartment ${slotIndex}.`,
      });
    }

    const scheduledAt = new Date(Date.now() + Number(alertInSeconds) * 1000);

    const dose = await Dose.create({
      patient: patientId,
      medication: medication._id,
      scheduledAt,
      slotIndex: medication.slotIndex,
      status: 'pending',
    });

    const populated = await Dose.findById(dose._id).populate(
      'medication',
      'name slotIndex slotColor dosageAmount dosageUnit'
    );
    res.json({ message: 'Timer dose triggered.', dose: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/doses/pending?deviceId=xxx
// ESP32 calls this every 5 seconds to sync current time and get ALL daily reminder times per medicine
router.get('/pending', protectDevice, async (req, res) => {
  try {
    const { deviceId = 'DISPENSER_01' } = req.query;
    const patientId = await resolvePatientForDevice(deviceId);

    const now = new Date();
    const { dayOfWeek: todayIST, timeStrWithSeconds: serverTimeIST } = getISTParts(now);

    if (!patientId) {
      return res.json({
        timezone: IST_TIMEZONE,
        serverTimeEpochMs: now.getTime(),
        serverTimeISO: now.toISOString(),
        serverTimeIST,
        slotSchedule: [],
        doses: [],
        nextDose: null,
      });
    }

    // Mark the device online on poll
    await Device.findOneAndUpdate(
      { deviceId },
      {
        patient: patientId,
        isOnline: true,
        'lastHeartbeat.receivedAt': now,
      },
      { upsert: true }
    );

    const activeMeds = await Medication.find({ patient: patientId, isActive: true }).sort({ slotIndex: 1 });

    // Build full schedule across ALL times for each active medication scheduled today in Asia/Kolkata
    const slotSchedule = [];
    const inFiveMinutes = new Date(now.getTime() + 5 * 60 * 1000);

    for (const med of activeMeds) {
      if (
        Array.isArray(med.daysOfWeek) &&
        med.daysOfWeek.length > 0 &&
        !med.daysOfWeek.includes(todayIST)
      ) {
        continue;
      }

      const timesList = Array.isArray(med.times) ? med.times : [];
      for (const timeStr of timesList) {
        const [h, min] = String(timeStr).split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(min)) continue;

        slotSchedule.push({
          slotIndex: med.slotIndex,
          hour: h,
          minute: min,
          time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
          medicationId: med._id,
          name: med.name,
        });

        // Ensure a pending Dose document exists if this reminder time is due within [-1 min, +5 min] in Asia/Kolkata
        const scheduledAt = getISTDateForClockTime(timeStr, now);
        if (scheduledAt >= new Date(now.getTime() - 60 * 1000) && scheduledAt <= inFiveMinutes) {
          const exists = await Dose.findOne({
            medication: med._id,
            scheduledAt,
          });
          if (!exists) {
            await Dose.create({
              patient: patientId,
              medication: med._id,
              scheduledAt,
              slotIndex: med.slotIndex,
              status: 'pending',
            });
          }
        }
      }
    }

    slotSchedule.sort((a, b) => a.slotIndex - b.slotIndex || a.hour - b.hour || a.minute - b.minute);

    const rawDoses = await Dose.find({
      patient: patientId,
      status: 'pending',
      scheduledAt: { $gte: new Date(now.getTime() - 10 * 60 * 1000) },
    })
      .populate('medication', 'name slotIndex slotColor dosageAmount dosageUnit times')
      .sort({ scheduledAt: 1 });

    const doses = rawDoses.map((d) => {
      const secondsRemaining = Math.round((new Date(d.scheduledAt).getTime() - now.getTime()) / 1000);
      return {
        ...d.toObject(),
        scheduledTimeIST: formatISTTime(d.scheduledAt, false),
        secondsRemaining,
        shouldAlertNow: secondsRemaining <= 0 && secondsRemaining >= -600,
      };
    });

    res.json({
      timezone: IST_TIMEZONE,
      serverTimeEpochMs: now.getTime(),
      serverTimeISO: now.toISOString(),
      serverTimeIST,
      slotSchedule,
      doses,
      nextDose: doses[0] || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/doses/taken
// ESP32 calls this when IR sensor confirms pill pickup; requires unique dose identification
router.post('/taken', protectDevice, async (req, res) => {
  try {
    const { doseId, deviceId, slotIndex } = req.body;

    const { dose, error, statusCode } = await resolveDoseForHardware({
      doseId,
      deviceId,
      slotIndex,
    });

    if (error || !dose) {
      return res.status(statusCode || 404).json({ message: error || 'Scheduled dose not found.' });
    }

    dose.status = 'taken';
    dose.takenAt = new Date();
    dose.verifiedByHardware = true;
    await dose.save();

    // Decrease stock count
    if (dose.medication?._id) {
      await Medication.findByIdAndUpdate(dose.medication._id, {
        $inc: { stockCount: -1 },
      });
    }

    const takenTimeIST = formatISTTime(dose.takenAt, true);

    // Send Telegram alert to patient & caretakers
    const patient = await User.findById(dose.patient._id || dose.patient).populate('linkedPatients');
    if (patient) {
      if (patient.telegramChatId) {
        await sendDoseTakenAlert(
          patient.telegramChatId,
          patient.name,
          dose.medication?.name || 'Medicine',
          takenTimeIST
        );
      }

      const caretakers = await User.find({
        linkedPatients: patient._id,
        telegramChatId: { $ne: null },
      });

      for (const caretaker of caretakers) {
        await sendDoseTakenAlert(
          caretaker.telegramChatId,
          patient.name,
          dose.medication?.name || 'Medicine',
          takenTimeIST
        );
      }
    }

    res.json({ message: 'Dose marked as taken.', dose });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/doses/missed
// ESP32 calls this when pill was NOT picked up within grace period; requires unique dose identification
router.post('/missed', protectDevice, async (req, res) => {
  try {
    const { doseId, deviceId, slotIndex } = req.body;

    const { dose, error, statusCode } = await resolveDoseForHardware({
      doseId,
      deviceId,
      slotIndex,
    });

    if (error || !dose) {
      return res.status(statusCode || 404).json({ message: error || 'Scheduled dose not found.' });
    }

    dose.status = 'missed';
    await dose.save();

    const patient = await User.findById(dose.patient._id || dose.patient);
    const scheduledTimeIST = formatISTTime(dose.scheduledAt, true);

    if (patient) {
      if (patient.telegramChatId) {
        await sendDoseMissedAlert(
          patient.telegramChatId,
          patient.name,
          dose.medication?.name || 'Medicine',
          scheduledTimeIST
        );
      }

      const caretakers = await User.find({
        linkedPatients: patient._id,
        telegramChatId: { $ne: null },
      });

      for (const caretaker of caretakers) {
        await sendDoseMissedAlert(
          caretaker.telegramChatId,
          patient.name,
          dose.medication?.name || 'Medicine',
          scheduledTimeIST
        );
      }
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

// GET /api/doses — get doses for a patient (filtered by date in Asia/Kolkata)
router.get('/', async (req, res) => {
  try {
    const { patientId, date, status } = req.query;

    const targetPatient = req.user.role === 'patient' ? req.user._id : patientId;

    const query = { patient: targetPatient };
    if (status) query.status = status;

    if (date) {
      const { startOfDay, endOfDay } = getISTDayBounds(date);
      query.scheduledAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const doses = await Dose.find(query)
      .populate('medication', 'name slotIndex slotColor dosageAmount dosageUnit')
      .sort({ scheduledAt: 1 });

    res.json({ doses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/doses/stats — adherence stats (using Asia/Kolkata day boundary)
router.get('/stats', async (req, res) => {
  try {
    const { patientId, days = 7 } = req.query;
    const targetPatient = req.user.role === 'patient' ? req.user._id : patientId;

    const { startOfDay: todayStartIST } = getISTDayBounds(new Date());
    const parsedDays = Math.max(1, parseInt(days, 10) || 7);
    const since = new Date(todayStartIST.getTime() - (parsedDays - 1) * 24 * 60 * 60 * 1000);

    const doses = await Dose.find({
      patient: targetPatient,
      scheduledAt: { $gte: since },
    });

    const total = doses.length;
    const taken = doses.filter((d) => d.status === 'taken').length;
    const missed = doses.filter((d) => d.status === 'missed').length;
    const skipped = doses.filter((d) => d.status === 'skipped').length;
    const pending = doses.filter((d) => d.status === 'pending').length;
    const completedCount = total - pending;
    const adherencePercent = completedCount > 0 ? Math.round((taken / completedCount) * 100) : 0;

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

// POST /api/doses/schedule-reminder — set a reminder time or countdown timer from the mobile app (in Asia/Kolkata)
router.post('/schedule-reminder', async (req, res) => {
  try {
    const {
      medicationId,
      mode = 'timer', // 'timer' (countdown in seconds) or 'clock' (HH:MM time string in Asia/Kolkata)
      alertInSeconds = 275,
      clockTime,      // e.g. '14:30'
      slotIndex = 1,
    } = req.body;

    const patientId = req.user.role === 'patient' ? req.user._id : (req.body.patientId || req.user._id);

    let medication = medicationId
      ? await Medication.findById(medicationId)
      : await Medication.findOne({ patient: patientId, isActive: true }).sort({ slotIndex: 1 });

    if (!medication) {
      medication = await Medication.create({
        patient: patientId,
        addedBy: req.user._id,
        name: 'Scheduled Medicine',
        slotIndex: slotIndex || 1,
        slotColor: 'red',
        dosageAmount: 1,
        dosageUnit: 'tablet',
        times: [clockTime || '09:00'],
        stockCount: 30,
        stockAlertThreshold: 5,
      });
    }

    const now = new Date();
    let scheduledAt;

    if (mode === 'clock' && clockTime) {
      scheduledAt = getISTDateForClockTime(clockTime, now);
      // If that IST clock time already passed more than 1 minute ago today, schedule for tomorrow in IST
      if (scheduledAt.getTime() < now.getTime() - 60 * 1000) {
        scheduledAt = new Date(scheduledAt.getTime() + 24 * 60 * 60 * 1000);
      }
      // Preserve all existing daily reminder times and add the new clockTime if not present
      if (!medication.times.includes(clockTime)) {
        medication.times = [...medication.times, clockTime].sort();
        await medication.save();
      }
    } else {
      scheduledAt = new Date(now.getTime() + Number(alertInSeconds) * 1000);
      const timeStrIST = formatISTTime(scheduledAt, false);
      if (!medication.times.includes(timeStrIST)) {
        medication.times = [...medication.times, timeStrIST].sort();
        await medication.save();
      }
    }

    // Find an existing pending dose for this exact medication & scheduled time, or create a dedicated pending dose
    let dose = await Dose.findOne({
      patient: patientId,
      medication: medication._id,
      status: 'pending',
      scheduledAt,
    });

    if (!dose) {
      dose = await Dose.create({
        patient: patientId,
        medication: medication._id,
        scheduledAt,
        slotIndex: medication.slotIndex,
        status: 'pending',
      });
    }

    const populated = await Dose.findById(dose._id).populate(
      'medication',
      'name slotIndex slotColor dosageAmount dosageUnit times'
    );

    res.json({
      message: 'Reminder scheduled and synced to ESP32!',
      dose: populated,
      timezone: IST_TIMEZONE,
      serverTimeEpochMs: Date.now(),
    });
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
