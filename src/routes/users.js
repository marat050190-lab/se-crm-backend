const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

const ADMIN_ROLES = ['super_admin', 'admin', 'rop', 'cs_head'];
const ALL_ROLES = ['super_admin','admin','rop','dispatcher','b2b_manager','mfl_manager','cs_head','cs_manager','accountant','accountant_cashier','debt_specialist'];

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, phone, beeline_extension, telegram_id, rop_id, is_active FROM users ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/', async (req, res) => {
  if (!ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const { name, email, password, role, phone, beeline_extension, telegram_id, rop_id } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, phone, beeline_extension, telegram_id, rop_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, email, role, phone, beeline_extension, telegram_id, rop_id, is_active
    `, [name, email.toLowerCase(), hash, role || 'dispatcher', phone, beeline_extension, telegram_id, rop_id || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email уже занят' });
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

router.patch('/:id', async (req, res) => {
  if (!ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const { name, phone, beeline_extension, telegram_id, role, is_active, password, email } = req.body;
  const rop_id = req.body.rop_id || null;
  try {
    let passwordHash = null;
    if (password) passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      UPDATE users SET
        name = COALESCE($2, name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        beeline_extension = COALESCE($5, beeline_extension),
        telegram_id = COALESCE($6, telegram_id),
        role = COALESCE($7, role),
        is_active = COALESCE($8, is_active),
        ${passwordHash ? 'rop_id = COALESCE($9, rop_id), password_hash = $10' : 'rop_id = COALESCE($9, rop_id)'}
      WHERE id = $1
      RETURNING id, name, email, role, phone, beeline_extension, telegram_id, is_active
    `, passwordHash
      ? [req.params.id, name, email, phone, beeline_extension, telegram_id, role, is_active, rop_id, passwordHash]
      : [req.params.id, name, email, phone, beeline_extension, telegram_id, role, is_active, rop_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
