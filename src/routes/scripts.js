const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

const ADMIN_ROLES = ['super_admin', 'admin', 'rop', 'cs_head'];

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await req.db.query('SELECT * FROM scripts WHERE is_active = true ORDER BY sort_order, id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/all', authMiddleware, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
    const result = await req.db.query('SELECT * FROM scripts ORDER BY sort_order, id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
    const { category, title, content, sort_order } = req.body;
    const result = await req.db.query(
      'INSERT INTO scripts (category, title, content, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [category, title, JSON.stringify(content || []), sort_order || 0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
    const { category, title, content, sort_order, is_active } = req.body;
    const result = await req.db.query(
      'UPDATE scripts SET category=$1, title=$2, content=$3, sort_order=$4, is_active=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [category, title, JSON.stringify(content || []), sort_order || 0, is_active !== false, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
    await req.db.query('DELETE FROM scripts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
