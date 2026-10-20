const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false, // never return password in queries
    },
    role: {
      type: String,
      enum: ['patient', 'caretaker', 'doctor', 'admin'],
      default: 'patient',
    },
    // Telegram chat ID for alerts (user links their Telegram account)
    telegramChatId: {
      type: String,
      default: null,
    },
    // Caretakers/doctors can be linked to multiple patients
    linkedPatients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Which device is linked to this patient
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const { createHybridModel } = require('../services/localStore');

module.exports = createHybridModel(
  mongoose.model('User', userSchema),
  'users',
  { role: 'patient', telegramChatId: null, linkedPatients: [], device: null, isActive: true }
);
