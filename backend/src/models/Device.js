const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    // Unique device identifier (set in ESP32 firmware)
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Which patient this device belongs to
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Last heartbeat data from the ESP32
    lastHeartbeat: {
      receivedAt: { type: Date, default: null },
      wifiStrength: { type: Number, default: null },   // dBm
      firmwareVersion: { type: String, default: null },
      uptimeSeconds: { type: Number, default: null },
      freeHeapBytes: { type: Number, default: null },
    },
    // Is the device currently online? (updated by cron)
    isOnline: {
      type: Boolean,
      default: false,
    },
    // Slot configuration (which slot has which color)
    slotColors: {
      type: Map,
      of: String,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const { createHybridModel } = require('../services/localStore');

module.exports = createHybridModel(
  mongoose.model('Device', deviceSchema),
  'devices',
  { patient: null, lastHeartbeat: {}, isOnline: false, isActive: true }
);
