const pool = require('../db/pool');
const https = require('https');

const TOKEN = process.env.FORWORK_BOT_TOKEN;

function sendMsg(chatId, text, keyboard = null) {
  const body = JSON.stringify({
    chat_id: chatId, text, parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: keyboard } : {})
  });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  });
  req.write(body);
  req.end();
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const text = msg.text || '';
  const phone = msg.contact?.phone_number;

  if (text === '/start') {
    await pool.query(
      'UPDATE contractors SET telegram_id=$1 WHERE telegram_id IS NULL AND phone IS NULL',
      [chatId]
    );
    sendMsg(chatId,
      `👋 <b>Добро пожаловать в ForWork!</b>\n\nЧтобы получать коды входа, поделитесь своим номером телефона.`,
      {
        keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true
      }
    );
    return;
  }

  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '').replace(/^8/, '7');
    const { rows } = await pool.query(
      'UPDATE contractors SET telegram_id=$1 WHERE phone=$2 RETURNING *',
      [chatId, cleanPhone]
    );
    if (rows.length > 0) {
      sendMsg(chatId, `✅ <b>Готово!</b> Теперь коды входа будут приходить сюда.\n\nОткройте приложение: https://forwork-app-production.up.railway.app`);
    } else {
      sendMsg(chatId, `Сначала зарегистрируйтесь в приложении:\nhttps://forwork-app-production.up.railway.app`);
    }
    return;
  }

  sendMsg(chatId, `Откройте приложение ForWork:\nhttps://forwork-app-production.up.railway.app`);
}

module.exports = { handleUpdate, sendMsg };
