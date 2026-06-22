const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/users — список менеджеров (для назначения)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, phone, beeline_extension, is_active FROM users ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// POST /api/users — создать пользователя (только admin/rop)
router.post('/', requireRole('admin', 'rop'), async (req, res) => {
  const { name, email, password, role, phone, beeline_extension } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, phone, beeline_extension)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, role, phone, beeline_extension
    `, [name, email.toLowerCase(), hash, role || 'manager', phone, beeline_extension]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email уже занят' });
    }
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

// PATCH /api/users/:id — обновить
router.patch('/:id', requireRole('admin'), async (req, res) => {
  const { name, phone, beeline_extension, role, is_active } = req.body;
  try {
    const result = await pool.query(`
      UPDATE users
      SET name = COALESCE($2, name),
          phone = COALESCE($3, phone),
          beeline_extension = COALESCE($4, beeline_extension),
          role = COALESCE($5, role),
          is_active = COALESCE($6, is_active)
      WHERE id = $1
      RETURNING id, name, email, role, phone, beeline_extension, is_active
    `, [req.params.id, name, phone, beeline_extension, role, is_active]);

    if (!result.rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

module.exports = router;
