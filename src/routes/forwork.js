const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('crypto');

const BOT_TOKEN = process.env.FORWORK_BOT_TOKEN;
const BOT_USERNAME = process.env.FORWORK_BOT_USERNAME || 'forwork_ru_bot';
const SESSION_TTL = 5 * 60 * 1000; // 5 минут
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 60 * 1000; // 60 секунд

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

function hashCode(code) {
  return crypto.createHash('sha256').update(code + 'forwork_salt').digest('hex');
}

// POST /api/forwork/auth/start — создать сессию и вернуть deep link
router.post('/auth/start', async (req, res) => {
  try {
    const payload = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL);

    await pool.query(
      `INSERT INTO forwork_auth_sessions (start_payload, status, expires_at)
       VALUES ($1, 'pending', $2)`,
      [payload, expiresAt]
    );

    res.json({
      sessionId: payload,
      telegramDeepLink: `https://t.me/${BOT_USERNAME}?start=${payload}`,
      expiresAt
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forwork/auth/verify — проверить код
router.post('/auth/verify', async (req, res) => {
  const { sessionId, code } = req.body;
  if (!sessionId || !code) return res.status(400).json({ error: 'Укажите sessionId и code' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM forwork_auth_sessions WHERE start_payload = $1', [sessionId]
    );

    if (!rows.length) return res.status(400).json({ error: 'Сессия не найдена. Начните вход заново.' });
    const session = rows[0];

    if (session.status === 'verified') return res.status(400).json({ error: 'Код уже использован.' });
    if (session.status === 'expired' || new Date() > new Date(session.expires_at)) {
      await pool.query('UPDATE forwork_auth_sessions SET status=$1 WHERE start_payload=$2', ['expired', sessionId]);
      return res.status(400).json({ error: 'Код устарел. Запросите новый.' });
    }
    if (session.status !== 'code_sent') return res.status(400).json({ error: 'Код ещё не отправлен. Откройте Telegram-бота.' });
    if (session.attempts >= MAX_ATTEMPTS) return res.status(400).json({ error: 'Слишком много попыток. Запросите новый код.' });

    await pool.query(
      'UPDATE forwork_auth_sessions SET attempts = attempts + 1 WHERE start_payload = $1', [sessionId]
    );

    if (hashCode(code) !== session.code_hash) {
      const attemptsLeft = MAX_ATTEMPTS - session.attempts - 1;
      return res.status(400).json({ error: `Неверный код. Осталось попыток: ${attemptsLeft}` });
    }

    // Код верный — авторизуем
    await pool.query(
      'UPDATE forwork_auth_sessions SET status=$1, confirmed_at=$2 WHERE start_payload=$3',
      ['verified', new Date(), sessionId]
    );

    // Находим или создаём исполнителя по telegram_id
    const tgId = session.telegram_user_id;
    let contractor = null;
    const existing = await pool.query('SELECT * FROM contractors WHERE telegram_id = $1', [tgId.toString()]);

    if (existing.rows.length > 0) {
      contractor = existing.rows[0];
    } else {
      const created = await pool.query(
        `INSERT INTO contractors (telegram_id, status) VALUES ($1, 'new') RETURNING *`,
        [tgId.toString()]
      );
      contractor = created.rows[0];
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: contractor.id, telegram_id: tgId, role: 'contractor' },
      process.env.JWT_SECRET || 'forwork_secret',
      { expiresIn: '30d' }
    );

    res.json({ ok: true, token, contractor });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forwork/auth/resend — повторно отправить код
router.post('/auth/resend', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Укажите sessionId' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM forwork_auth_sessions WHERE start_payload = $1', [sessionId]
    );

    if (!rows.length) return res.status(400).json({ error: 'Сессия не найдена.' });
    const session = rows[0];

    if (new Date() > new Date(session.expires_at)) return res.status(400).json({ error: 'Сессия устарела. Начните заново.' });
    if (!session.telegram_user_id) return res.status(400).json({ error: 'Сначала откройте Telegram-бота.' });

    if (session.last_resend_at && Date.now() - new Date(session.last_resend_at).getTime() < RESEND_COOLDOWN) {
      return res.status(429).json({ error: 'Подождите 60 секунд перед повторной отправкой.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpires = new Date(Date.now() + SESSION_TTL);

    await pool.query(
      `UPDATE forwork_auth_sessions SET code_hash=$1, status='code_sent', expires_at=$2, attempts=0, last_resend_at=$3
       WHERE start_payload=$4`,
      [hashCode(code), newExpires, new Date(), sessionId]
    );

    await sendTelegram(session.telegram_user_id,
      `🔐 Новый код для входа в ForWork:\n\n<b>${code}</b>\n\nКод действителен 5 минут. Не передавайте его никому.`
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Webhook от Telegram бота — обработка /start <payload>
router.post('/bot-webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.json({ ok: true });

    const text = message.text.trim();
    const tgUser = message.from;

    if (text.startsWith('/start ')) {
      const payload = text.replace('/start ', '').trim();

      const { rows } = await pool.query(
        'SELECT * FROM forwork_auth_sessions WHERE start_payload = $1 AND status = $2',
        [payload, 'pending']
      );

      if (!rows.length) {
        await sendTelegram(tgUser.id, '❌ Ссылка устарела или уже использована. Вернитесь в приложение и начните вход заново.');
        return res.json({ ok: true });
      }

      const session = rows[0];
      if (new Date() > new Date(session.expires_at)) {
        await pool.query('UPDATE forwork_auth_sessions SET status=$1 WHERE start_payload=$2', ['expired', payload]);
        await sendTelegram(tgUser.id, '❌ Сессия входа устарела. Вернитесь в приложение и начните заново.');
        return res.json({ ok: true });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const newExpires = new Date(Date.now() + SESSION_TTL);

      await pool.query(
        `UPDATE forwork_auth_sessions SET telegram_user_id=$1, code_hash=$2, status='code_sent', expires_at=$3, last_resend_at=$4
         WHERE start_payload=$5`,
        [tgUser.id, hashCode(code), newExpires, new Date(), payload]
      );

      await sendTelegram(tgUser.id,
        `👋 Привет, ${tgUser.first_name}!\n\n🔐 Ваш код для входа в ForWork:\n\n<b>${code}</b>\n\nВернитесь в приложение и введите этот код.\nКод действует 5 минут.`
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Bot webhook error:', e);
    res.json({ ok: true });
  }
});


// POST /api/forwork/register — заполнение профиля после входа
router.post('/register', async (req, res) => {
  const { first_name, last_name, middle_name, age, phone, city, is_self_employed } = req.body;
  if (!first_name || !last_name || !city) return res.status(400).json({ error: 'Заполните все обязательные поля' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Нет токена' });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET || 'forwork_secret');
    const contractorId = decoded.id;

    const { rows } = await pool.query(
      `UPDATE contractors SET first_name=$1, last_name=$2, middle_name=$3, age=$4, phone=$5, city=$6, is_self_employed=$7, status='active'
       WHERE id=$8 RETURNING *`,
      [first_name, last_name, middle_name || null, age || null, phone || null, city, is_self_employed || false, contractorId]
    );

    const contractor = rows[0];
    const token = jwt.sign(
      { id: contractor.id, telegram_id: contractor.telegram_id, role: 'contractor' },
      process.env.JWT_SECRET || 'forwork_secret',
      { expiresIn: '30d' }
    );

    res.json({ ok: true, token, contractor });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Старые роуты — оставляем для совместимости
router.post('/send-code', async (req, res) => {
  res.status(410).json({ error: 'Этот метод устарел. Используйте /auth/start' });
});

router.post('/verify-code', async (req, res) => {
  res.status(410).json({ error: 'Этот метод устарел. Используйте /auth/verify' });
});

module.exports = router;
