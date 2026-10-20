const express = require('express');
const Medication = require('../models/Medication');
const Dose = require('../models/Dose');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper: synchronize today's pending Dose records whenever a medication's times are created or updated
async function syncTodayDosesForMedication(medication) {
  const now = new Date();
  const todayDay = now.getDay();

  // Remove old future pending doses for this medication today so updated times replace them cleanly
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  await Dose.deleteMany({
    medication: medication._id,
    status: 'pending',
    scheduledAt: { $gte: startOfDay, $lte: endOfDay },
  });

  if (!medication.isActive) return;
  if (medication.daysOfWeek?.length > 0 && !medication.daysOfWeek.includes(todayDay)) return;

  for (const timeStr of medication.times || []) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) continue;

    const scheduledAt = new Date(now);
    scheduledAt.setHours(hours, minutes, 0, 0);

    // Create pending dose for any time today that hasn't passed more than 5 minutes ago
    if (scheduledAt.getTime() >= now.getTime() - 5 * 60 * 1000) {
      const alreadyExists = await Dose.findOne({
        medication: medication._id,
        scheduledAt,
      });
      if (!alreadyExists) {
        await Dose.create({
          patient: medication.patient,
          medication: medication._id,
          scheduledAt,
          slotIndex: medication.slotIndex,
          status: 'pending',
        });
      }
    }
  }
}

// All routes require login
router.use(protect);

// POST /api/medications — add a new medication (doctor/caretaker/admin)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      slotIndex,
      slotColor,
      dosageAmount,
      dosageUnit,
      times,
      daysOfWeek,
      stockCount,
      stockAlertThreshold,
      notes,
      startDate,
      endDate,
    } = req.body;

    // Patient always adds for themselves; others must specify patientId
    const patientId = req.user.role === 'patient'
      ? req.user._id
      : req.body.patientId;

    if (!patientId) {
      return res.status(400).json({ message: 'patientId is required.' });
    }

    // Check slot is not already in use for this patient
    const slotTaken = await Medication.findOne({
      patient: patientId,
      slotIndex,
      isActive: true,
    });

    if (slotTaken) {
      return res.status(400).json({
        message: `Slot ${slotIndex} is already used by "${slotTaken.name}". Please use a different slot.`,
      });
    }

    const medication = await Medication.create({
      patient: patientId,
      addedBy: req.user._id,
      name,
      slotIndex,
      slotColor: slotColor || 'white',
      dosageAmount: dosageAmount || 1,
      dosageUnit: dosageUnit || 'tablet',
      times,
      daysOfWeek: daysOfWeek || [],
      stockCount: stockCount || 30,
      stockAlertThreshold: stockAlertThreshold || 5,
      notes,
      startDate,
      endDate,
    });

    await syncTodayDosesForMedication(medication);

    res.status(201).json({ message: 'Medication added.', medication });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/medications — get all medications for logged-in patient
// or all medications for linked patients if caretaker/doctor
router.get('/', async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'patient') {
      query.patient = req.user._id;
    } else if (['caretaker', 'doctor'].includes(req.user.role)) {
      const patientId = req.query.patientId;
      if (!patientId) {
        return res.status(400).json({ message: 'patientId query param required.' });
      }
      // Make sure this caretaker is linked to the patient
      const isLinked = req.user.linkedPatients
        .map((id) => id.toString())
        .includes(patientId);
      if (!isLinked && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not linked to this patient.' });
      }
      query.patient = patientId;
    } else if (req.user.role === 'admin') {
      if (req.query.patientId) query.patient = req.query.patientId;
    }

    const medications = await Medication.find({ ...query, isActive: true })
      .populate('patient', 'name email')
      .populate('addedBy', 'name role')
      .sort({ slotIndex: 1 });

    res.json({ medications });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/medications/:id — get single medication
router.get('/:id', async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id)
      .populate('patient', 'name email')
      .populate('addedBy', 'name role');

    if (!medication) {
      return res.status(404).json({ message: 'Medication not found.' });
    }

    res.json({ medication });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/medications/:id — update a medication (including reminder times)
router.patch('/:id', async (req, res) => {
  try {
    const medication = await Medication.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!medication) {
      return res.status(404).json({ message: 'Medication not found.' });
    }

    await syncTodayDosesForMedication(medication);

    res.json({ message: 'Medication updated.', medication });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/medications/:id — soft delete
router.delete('/:id', async (req, res) => {
  try {
    const medication = await Medication.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (medication) {
      await syncTodayDosesForMedication(medication);
    }
    res.json({ message: 'Medication deactivated.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/medications/:id/stock — update stock count
router.patch('/:id/stock', async (req, res) => {
  try {
    const { stockCount } = req.body;
    const medication = await Medication.findByIdAndUpdate(
      req.params.id,
      { stockCount },
      { new: true }
    );
    res.json({ message: 'Stock updated.', medication });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
