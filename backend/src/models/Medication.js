const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
  {
    // Which patient this medication belongs to
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Who prescribed / added it
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Medication name is required'],
      trim: true,
    },
    // Physical compartment slot on the dispenser (1-6)
    slotIndex: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },
    // Color for the RGB LED ring on dispenser
    slotColor: {
      type: String,
      enum: ['red', 'green', 'blue', 'yellow', 'white'],
      default: 'white',
    },
    dosageAmount: {
      type: Number,
      required: true,
      default: 1,
    },
    dosageUnit: {
      type: String,
      enum: ['tablet', 'capsule', 'ml', 'mg'],
      default: 'tablet',
    },
    // Times of day e.g. ["08:00", "14:00", "21:00"]
    times: [
      {
        type: String,
        required: true,
      },
    ],
    // Days of week: 0=Sunday, 1=Monday ... 6=Saturday
    // Empty array means every day
    daysOfWeek: {
      type: [Number],
      default: [],
    },
    // How many pills remain in this slot
    stockCount: {
      type: Number,
      default: 30,
    },
    // Low stock alert threshold
    stockAlertThreshold: {
      type: Number,
      default: 5,
    },
    notes: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Start and end dates for the prescription
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const { createHybridModel } = require('../services/localStore');

module.exports = createHybridModel(
  mongoose.model('Medication', medicationSchema),
  'medications',
  {
    slotIndex: 1,
    slotColor: 'red',
    dosageAmount: 1,
    dosageUnit: 'tablet',
    times: ['08:00'],
    daysOfWeek: [],
    stockCount: 30,
    stockAlertThreshold: 5,
    notes: '',
    isActive: true,
  }
);
