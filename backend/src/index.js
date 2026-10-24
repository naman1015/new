process.env.TZ = 'Asia/Kolkata';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');

const { setUseFallback } = require('./services/localStore');
const {
  IST_TIMEZONE,
  getISTParts,
  getISTDateForClockTime,
} = require('./utils/time');
const authRoutes = require('./routes/auth');
const medicationRoutes = require('./routes/medications');
const doseRoutes = require('./routes/doses');
const deviceRoutes = require('./routes/device');
const { initTelegram, sendLowStockAlert } = require('./services/telegram');
const Medication = require('./models/Medication');
const Dose = require('./models/Dose');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// ─── Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/doses', doseRoutes);
app.use('/api/device', deviceRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    message: '💊 Smart Medicine Manager API is running.',
    version: '1.0.0',
    timezone: IST_TIMEZONE,
    timestamp: new Date().toISOString(),
  });
});

// Serve built React frontend if available (works whether Root Dir is backend/ or repo root)
const backendPublic = path.join(__dirname, '../public');
const frontendDist = fs.existsSync(backendPublic)
  ? backendPublic
  : path.join(__dirname, '../../frontend/dist');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: '💊 Smart Medicine Manager API is running.',
      version: '1.0.0',
      timezone: IST_TIMEZONE,
      timestamp: new Date().toISOString(),
    });
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// ─── Database Connection (MongoDB Atlas with Built-in Fallback) ───
async function bootstrap() {
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('✅ Connected to MongoDB Atlas.');
    } catch (err) {
      console.warn('⚠️ MongoDB Atlas unreachable (' + err.message + '). Switching to built-in persistent store.');
      setUseFallback(true);
    }
  } else {
    console.log('ℹ️ No MONGO_URI set. Using built-in persistent store.');
    setUseFallback(true);
  }
  startServer();
}

bootstrap();

// ─── Cron Jobs (Explicitly bound to Asia/Kolkata) ─────────────────

// Every minute: generate upcoming dose records from all medication times in Asia/Kolkata
// Creates Dose documents up to 5 minutes before they are due
cron.schedule(
  '* * * * *',
  async () => {
    try {
      const now = new Date();
      const inFiveMinutes = new Date(now.getTime() + 5 * 60 * 1000);
      const { dayOfWeek: todayIST } = getISTParts(now);

      const medications = await Medication.find({ isActive: true }).populate('patient');

      for (const med of medications) {
        if (!med.patient) continue;

        // Check if this medication is scheduled for today in Asia/Kolkata (0=Sun ... 6=Sat)
        if (Array.isArray(med.daysOfWeek) && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayIST)) {
          continue;
        }

        for (const timeStr of med.times || []) {
          const scheduledAt = getISTDateForClockTime(timeStr, now);

          // Create if within [now - 1 min, now + 5 min] and not already created
          if (scheduledAt >= new Date(now.getTime() - 60 * 1000) && scheduledAt <= inFiveMinutes) {
            const exists = await Dose.findOne({
              medication: med._id,
              scheduledAt,
            });

            if (!exists) {
              await Dose.create({
                patient: med.patient._id,
                medication: med._id,
                scheduledAt,
                slotIndex: med.slotIndex,
                status: 'pending',
              });
              console.log(`📅 Dose created (${IST_TIMEZONE}): ${med.name} at ${timeStr}`);
            }
          }
        }
      }
    } catch (err) {
      console.error('Cron (dose generation) error:', err.message);
    }
  },
  { timezone: IST_TIMEZONE }
);

// Every 5 minutes: mark overdue pending doses as missed
cron.schedule(
  '*/5 * * * *',
  async () => {
    try {
      const gracePeriod = new Date(Date.now() - 10 * 60 * 1000); // 10 min grace

      const missed = await Dose.updateMany(
        {
          status: 'pending',
          scheduledAt: { $lt: gracePeriod },
        },
        { status: 'missed' }
      );

      if (missed.modifiedCount > 0) {
        console.log(`⚠️  Marked ${missed.modifiedCount} dose(s) as missed.`);
      }
    } catch (err) {
      console.error('Cron (missed dose) error:', err.message);
    }
  },
  { timezone: IST_TIMEZONE }
);

// Every hour: check low stock and send Telegram alerts
cron.schedule(
  '0 * * * *',
  async () => {
    try {
      const lowStockMeds = await Medication.find({
        isActive: true,
        $expr: { $lte: ['$stockCount', '$stockAlertThreshold'] },
      }).populate('patient', 'name telegramChatId');

      for (const med of lowStockMeds) {
        if (!med.patient) continue;
        if (med.patient.telegramChatId) {
          await sendLowStockAlert(
            med.patient.telegramChatId,
            med.patient.name,
            med.name,
            med.stockCount
          );
        }

        // Also notify linked caretakers
        const caretakers = await User.find({
          linkedPatients: med.patient._id,
          telegramChatId: { $ne: null },
        });

        for (const caretaker of caretakers) {
          await sendLowStockAlert(
            caretaker.telegramChatId,
            med.patient.name,
            med.name,
            med.stockCount
          );
        }
      }
    } catch (err) {
      console.error('Cron (low stock) error:', err.message);
    }
  },
  { timezone: IST_TIMEZONE }
);

// Every 2 minutes: mark devices offline if no heartbeat in last 3 minutes
cron.schedule(
  '*/2 * * * *',
  async () => {
    try {
      const Device = require('./models/Device');
      const threshold = new Date(Date.now() - 3 * 60 * 1000);

      await Device.updateMany(
        { 'lastHeartbeat.receivedAt': { $lt: threshold }, isOnline: true },
        { isOnline: false }
      );
    } catch (err) {
      console.error('Cron (device offline) error:', err.message);
    }
  },
  { timezone: IST_TIMEZONE }
);

// ─── Start Server ─────────────────────────────────────────────────
function startServer() {
  // Init Telegram bot
  initTelegram();

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT} (${IST_TIMEZONE})`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/auth/register`);
    console.log(`  POST /api/auth/login`);
    console.log(`  GET  /api/medications`);
    console.log(`  GET  /api/doses/pending   (ESP32)`);
    console.log(`  POST /api/doses/taken     (ESP32)`);
    console.log(`  POST /api/device/heartbeat (ESP32)\n`);
  });
}
