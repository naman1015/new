const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

// Protect hardware routes — requires configured DEVICE_SECRET key
const protectDevice = (req, res, next) => {
  const configuredSecret = process.env.DEVICE_SECRET;
  if (!configuredSecret) {
    return res.status(500).json({ message: 'Server configuration error: DEVICE_SECRET is not set.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Invalid device credentials.' });
  }

  const providedSecret = authHeader.slice('Bearer '.length);
  const expectedBuf = Buffer.from(configuredSecret, 'utf8');
  const providedBuf = Buffer.from(providedSecret, 'utf8');

  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return res.status(401).json({ message: 'Invalid device credentials.' });
  }

  next();
};

module.exports = { protect, restrictTo, protectDevice };
