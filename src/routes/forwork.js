const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const BOT_TOKEN = process.env.FORWORK_BOT_TOKEN;
const CODES = {}; // временное хранилище кодов {phone: {code, expires}}

async function sendTelegram(chatId, text) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// POST /api/forwork/send-code
// Отправляет код подтверждения в Telegram
router.post('/send-code', async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Укажите телефон' });
  phone = '+7' + phone.replace(/\D/g, '').replace(/^[78]/, '');

  try {
    // Ищем исполнителя по телефону
    const { rows } = await pool.query(
      'SELECT * FROM contractors WHERE phone = $1', [phone.replace(/\D/g, '')]
    );

    // Генерируем 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 минут

    CODES[phone] = { code, expires, isNew: rows.length === 0 };

    if (rows.length > 0 && rows[0].telegram_id) {
      // Отправляем код в Telegram
      await sendTelegram(rows[0].telegram_id,
        `🔐 Ваш код для входа в ForWork:\n\n<b>${code}</b>\n\nКод действителен 10 минут. Не передавайте его никому.`
      );
      res.json({ ok: true, isNew: false });
    } else {
      // Новый исполнитель — возвращаем код (он введёт его сам)
      // В продакшне здесь можно отправить SMS
      res.json({ ok: true, isNew: true, code }); // временно для теста
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forwork/verify-code
router.post('/verify-code', async (req, res) => {
  let { phone, code } = req.body;
  phone = '+7' + phone.replace(/\D/g, '').replace(/^[78]/, '');
  const stored = CODES[phone];

  if (!stored) return res.status(400).json({ error: 'Код не найден. Запросите новый.' });
  if (Date.now() > stored.expires) return res.status(400).json({ error: 'Код истёк. Запросите новый.' });
  if (stored.code !== code) return res.status(400).json({ error: 'Неверный код.' });

  delete CODES[phone];

  const cleanPhone = phone.replace(/\D/g, '');
  const { rows } = await pool.query('SELECT * FROM contractors WHERE phone = $1', [cleanPhone]);

  if (rows.length > 0) {
    const contractor = rows[0];
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: contractor.id, role: 'contractor' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, contractor, isNew: false });
  } else {
    res.json({ ok: true, isNew: true, phone: cleanPhone });
  }
});

// POST /api/forwork/register
router.post('/register', async (req, res) => {
  const { first_name, last_name, middle_name, age, phone, is_self_employed, city, telegram_id } = req.body;
  if (!first_name || !last_name || !phone) return res.status(400).json({ error: 'Заполните обязательные поля' });

  try {
    const name = [last_name, first_name, middle_name].filter(Boolean).join(' ');
    const { rows } = await pool.query(
      `INSERT INTO contractors (name, phone, inn, type, specialization, city, is_self_employed, telegram_id, status, created_at)
       VALUES ($1, $2, '', 'self_employed', 'mover', $3, $4, $5, 'active', NOW()) RETURNING *`,
      [name, phone.replace(/\D/g, ''), city || '', is_self_employed || false, telegram_id || null]
    );
    const contractor = rows[0];
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: contractor.id, role: 'contractor' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, contractor });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/forwork/orders — список доступных заказов
router.get('/orders', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return res.status(401).json({ error: 'Не авторизован' });
    const decoded = jwt.verify(auth, process.env.JWT_SECRET);

    const { rows } = await pool.query(`
      SELECT o.*, c.name as client_name
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.status = 'new' AND o.contractor_id IS NULL
      ORDER BY o.created_at DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forwork/orders/:id/take — взять заказ
router.post('/orders/:id/take', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return res.status(401).json({ error: 'Не авторизован' });
    const decoded = jwt.verify(auth, process.env.JWT_SECRET);

    // Проверяем что заказ ещё свободен
    const check = await pool.query('SELECT * FROM orders WHERE id=$1 AND contractor_id IS NULL', [req.params.id]);
    if (check.rows.length === 0) return res.status(400).json({ error: 'Заказ уже занят' });

    await pool.query(
      'UPDATE orders SET contractor_id=$1, status=$2 WHERE id=$3',
      [decoded.id, 'pay_executor', req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/forwork/my-orders — мои заказы
router.get('/my-orders', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return res.status(401).json({ error: 'Не авторизован' });
    const decoded = jwt.verify(auth, process.env.JWT_SECRET);

    const { rows } = await pool.query(`
      SELECT o.*, c.name as client_name
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.contractor_id = $1
      ORDER BY o.created_at DESC
    `, [decoded.id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forwork/orders/:id/complete — выполнено
router.post('/orders/:id/complete', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return res.status(401).json({ error: 'Не авторизован' });
    const decoded = jwt.verify(auth, process.env.JWT_SECRET);

    await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 AND contractor_id=$3',
      ['done', req.params.id, decoded.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
