const mongoose = require('mongoose');

const doseSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    medication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medication',
      required: true,
    },
    // Scheduled time for this dose
    scheduledAt: {
      type: Date,
      required: true,
    },
    // When the patient actually took it (set by IR sensor confirmation)
    takenAt: {
      type: Date,
      default: null,
    },
    // Dose lifecycle: pending → taken / skipped / missed
    status: {
      type: String,
      enum: ['pending', 'taken', 'skipped', 'missed'],
      default: 'pending',
    },
    // Was it verified by the IR sensor on the hardware?
    verifiedByHardware: {
      type: Boolean,
      default: false,
    },
    // Slot number that was used when dispensing
    slotIndex: {
      type: Number,
      required: true,
    },
    // Notes (e.g. manually corrected by caretaker)
    notes: {
      type: String,
      default: '',
    },
    // Telegram alert sent for this dose?
    alertSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for fast queries
doseSchema.index({ patient: 1, scheduledAt: -1 });
doseSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Dose', doseSchema);
