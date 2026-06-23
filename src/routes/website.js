const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { notifyNewCall } = require('../services/telegram');

router.post('/lead', async (req, res) => {
  // Проверка секретного ключа
  const secret = req.query.secret || req.body.secret;
  if (secret !== 'se-site-webhook-2024') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const {
      phone, name, city, site, form_id, message
    } = req.body;

    if (!phone) return res.status(400).json({ error: 'Телефон обязателен' });

    // Генерируем номер лида
    const numRes = await pool.query("SELECT lead_number FROM leads ORDER BY id DESC LIMIT 1");
    let leadNumber = 'SE-0001';
    if (numRes.rows.length) {
      const last = numRes.rows[0].lead_number;
      const num = parseInt(last.replace('SE-', '')) + 1;
      leadNumber = `SE-${String(num).padStart(4, '0')}`;
    }

    const comment = [
      city ? 'Город: ' + city : '',
      site ? 'Сайт: ' + site : '',
      form_id ? 'Форма: ' + form_id : '',
      message ? 'Сообщение: ' + message : '',
    ].filter(Boolean).join('\n');

    const result = await pool.query(`
      INSERT INTO leads (
        lead_number, client_name, client_phone,
        client_type, source, comment, status
      ) VALUES ($1, $2, $3, 'individual', 'site_form', $4, 'new')
      RETURNING *
    `, [leadNumber, name || null, phone, comment || null]);

    const lead = result.rows[0];

    await pool.query(`
      INSERT INTO lead_history (lead_id, user_id, action, comment)
      VALUES ($1, NULL, 'created', $2)
    `, [lead.id, 'Заявка с сайта: ' + (site || 'неизвестно') + (city ? ', ' + city : '')]);

    // Socket.io
    const io = req.app.get('io');
    if (io) io.emit('new_lead', lead);

    // Telegram диспетчерам
    const tgText = '🌐 <b>Заявка с сайта</b>' +
      (city ? '\n📍 ' + city : '') +
      '\nТелефон: <code>' + phone + '</code>' +
      (name ? '\nИмя: ' + name : '') +
      (site ? '\nСайт: ' + site : '') +
      '\nЛид: <a href="https://se-crm-frontend-production.up.railway.app/leads/' + lead.id + '">' + leadNumber + '</a>';

    const { notifyRole } = require('../services/telegram');
    await notifyRole('dispatcher', tgText);

    console.log('[SITE] Создан лид ' + leadNumber + ' с сайта ' + (site || '?') + ', тел: ' + phone);
    res.json({ ok: true, leadId: lead.id, leadNumber });

  } catch (err) {
    console.error('[SITE] Ошибка:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
