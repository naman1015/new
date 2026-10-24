const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Device = require('../models/Device');

// Protect routes — requires valid JWT token
const protect = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server configuration error: JWT_SECRET is not set.' });
    }

    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized. No token.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password').populate('device');

    if (!req.user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid or expired.' });
  }
};

// Restrict to specific roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Role '${req.user.role}' is not allowed.`,
      });
    }
    next();
  };
};

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Protect hardware routes — verifies Bearer secret against env DEVICE_SECRET or per-device secret
const protectDevice = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Invalid device credentials.' });
    }

    const providedSecret = authHeader.slice('Bearer '.length).trim();
    if (!providedSecret || providedSecret.length < 8) {
      return res.status(401).json({ message: 'Device secret must be at least 8 characters.' });
    }

    const configuredSecret = process.env.DEVICE_SECRET;
    if (configuredSecret && safeEqual(configuredSecret, providedSecret)) {
      return next();
    }

    // Also support per-device unique secret set by user in dispenser.ino
    const deviceId = req.query?.deviceId || req.body?.deviceId || 'DISPENSER_01';
    const secretHash = crypto.createHash('sha256').update(providedSecret).digest('hex');
    const device = await Device.findOne({ deviceId });

    if (device?.deviceSecretHash) {
      if (safeEqual(device.deviceSecretHash, secretHash)) {
        return next();
      }
      // Allow updating secret if user re-flashed ESP32 with a new unique secret
      await Device.findOneAndUpdate({ deviceId }, { deviceSecretHash: secretHash });
      return next();
    }

    await Device.findOneAndUpdate(
      { deviceId },
      { deviceSecretHash: secretHash },
      { upsert: true }
    );
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid device credentials.' });
  }
};

module.exports = { protect, restrictTo, protectDevice };
