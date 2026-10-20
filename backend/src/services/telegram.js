const TelegramBot = require('node-telegram-bot-api');

let bot = null;

// Initialize Telegram bot (only if token is set)
const initTelegram = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('⚠️  Telegram bot token not set. Alerts disabled.');
    return;
  }

  try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

    // When someone sends /start to the bot, give them their Chat ID
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(
        chatId,
        `👋 Welcome to *Smart Medicine Manager Bot!*\n\n` +
          `Your Chat ID is: \`${chatId}\`\n\n` +
          `Copy this ID and paste it in your profile settings on the dashboard to receive alerts.`,
        { parse_mode: 'Markdown' }
      );
    });

    // Allow caretaker to check status
    bot.onText(/\/status/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId, `✅ Bot is active and monitoring medication schedules.`);
    });

    console.log('✅ Telegram bot initialized successfully.');
  } catch (err) {
    console.error('❌ Telegram bot failed to initialize:', err.message);
  }
};

// Send a dose taken alert
const sendDoseTakenAlert = async (chatId, patientName, medicationName, time) => {
  if (!bot || !chatId) return;

  const message =
    `✅ *Dose Taken!*\n\n` +
    `👤 Patient: *${patientName}*\n` +
    `💊 Medication: *${medicationName}*\n` +
    `🕐 Time: *${time}*\n` +
    `📡 Verified by IR sensor on dispenser.`;

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Telegram alert error (taken):', err.message);
  }
};

// Send a dose missed alert
const sendDoseMissedAlert = async (chatId, patientName, medicationName, scheduledTime) => {
  if (!bot || !chatId) return;

  const message =
    `⚠️ *Dose MISSED!*\n\n` +
    `👤 Patient: *${patientName}*\n` +
    `💊 Medication: *${medicationName}*\n` +
    `🕐 Scheduled at: *${scheduledTime}*\n\n` +
    `Please check in with the patient.`;

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Telegram alert error (missed):', err.message);
  }
};

// Send a low stock alert
const sendLowStockAlert = async (chatId, patientName, medicationName, remaining) => {
  if (!bot || !chatId) return;

  const message =
    `🔴 *Low Stock Alert!*\n\n` +
    `👤 Patient: *${patientName}*\n` +
    `💊 Medication: *${medicationName}*\n` +
    `📦 Only *${remaining} dose(s)* remaining.\n\n` +
    `Please refill the dispenser slot soon.`;

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Telegram alert error (stock):', err.message);
  }
};

// Generic custom message
const sendCustomAlert = async (chatId, message) => {
  if (!bot || !chatId) return;
  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Telegram alert error (custom):', err.message);
  }
};

module.exports = {
  initTelegram,
  sendDoseTakenAlert,
  sendDoseMissedAlert,
  sendLowStockAlert,
  sendCustomAlert,
};
