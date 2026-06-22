const axios = require('axios');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = 'https://api.telegram.org/bot' + TOKEN;

// Список chat_id для уведомлений по роли
// Добавляй сюда Telegram ID сотрудников
const NOTIFY_TARGETS = {
  super_admin: ['364102600'],
  b2b_manager: ['364102600'], // пока ты, потом добавим менеджеров
  mfl_manager: ['364102600'],
  dispatcher:  ['364102600'],
};

async function sendMessage(chatId, text) {
  try {
    await axios.post(BASE_URL + '/sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('[TG] Ошибка отправки:', err.response?.data || err.message);
  }
}

async function notifyRole(role, text) {
  const targets = NOTIFY_TARGETS[role] || [];
  for (const chatId of targets) {
    await sendMessage(chatId, text);
  }
}

async function notifyNewCall(phone, leadId, leadNumber, region) {
  const regionText = region ? '\n📍 ' + region : '';
  const text = `📞 <b>Входящий звонок</b>${regionText}\nНомер: <code>+${phone}</code>\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/${leadId}">${leadNumber}</a>`;
  await notifyRole('dispatcher', text);
}

async function notifyNewEmail(from, fromName, subject, leadId, leadNumber, mailbox) {
  const text = `✉️ <b>Новое письмо → B2B</b>\nОт: <b>${fromName}</b> (${from})\nТема: ${subject}\nЯщик: ${mailbox}\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/${leadId}">${leadNumber}</a>`;
  await notifyRole('b2b_manager', text);
}

async function notifyTransferredMFL(phone, leadId, leadNumber) {
  const text = `👤 <b>Передан в МФЛ</b>\nТелефон: <code>+${phone}</code>\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/${leadId}">${leadNumber}</a>`;
  await notifyRole('mfl_manager', text);
}

async function notifyB2BApproved(company, leadId, leadNumber) {
  const text = `✅ <b>B2B согласован → КС</b>\nКомпания: <b>${company || '—'}</b>\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/${leadId}">${leadNumber}</a>`;
  await notifyRole('super_admin', text);
}

module.exports = { sendMessage, notifyRole, notifyNewCall, notifyNewEmail, notifyTransferredMFL, notifyB2BApproved };
