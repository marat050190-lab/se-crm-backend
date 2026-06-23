const axios = require('axios');
const pool = require('../db/pool');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = 'https://api.telegram.org/bot' + TOKEN;

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
  try {
    const result = await pool.query(
      'SELECT telegram_id FROM users WHERE role = $1 AND is_active = true AND telegram_id IS NOT NULL',
      [role]
    );
    for (const row of result.rows) {
      await sendMessage(row.telegram_id, text);
    }
    // Супер-админ всегда получает уведомления
    if (role !== 'super_admin') {
      const admins = await pool.query(
        'SELECT telegram_id FROM users WHERE role = $1 AND is_active = true AND telegram_id IS NOT NULL',
        ['super_admin']
      );
      for (const row of admins.rows) {
        await sendMessage(row.telegram_id, text);
      }
    }
  } catch (err) {
    console.error('[TG] Ошибка получения получателей:', err.message);
  }
}

async function notifyNewCall(phone, leadId, leadNumber, region) {
  const regionText = region ? '\n📍 ' + region : '';
  const text = '📞 <b>Входящий звонок</b>' + regionText + '\nНомер: <code>+' + phone + '</code>\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/' + leadId + '">' + leadNumber + '</a>';
  await notifyRole('dispatcher', text);
}

async function notifyNewEmail(from, fromName, subject, leadId, leadNumber, mailbox) {
  const text = '✉️ <b>Новое письмо → B2B</b>\nОт: <b>' + fromName + '</b> (' + from + ')\nТема: ' + subject + '\nЯщик: ' + mailbox + '\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/' + leadId + '">' + leadNumber + '</a>';
  await notifyRole('b2b_manager', text);
}

async function notifyTransferredMFL(phone, leadId, leadNumber) {
  const text = '👤 <b>Передан в МФЛ</b>\nТелефон: <code>+' + phone + '</code>\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/' + leadId + '">' + leadNumber + '</a>';
  await notifyRole('mfl_manager', text);
}

async function notifyB2BApproved(company, leadId, leadNumber) {
  const text = '✅ <b>B2B согласован → КС</b>\nКомпания: <b>' + (company || '—') + '</b>\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/' + leadId + '">' + leadNumber + '</a>';
  await notifyRole('cs_manager', text);
}

module.exports = { sendMessage, notifyRole, notifyNewCall, notifyNewEmail, notifyTransferredMFL, notifyB2BApproved };
