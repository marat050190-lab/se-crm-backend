const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');

router.post('/run', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'se-migrate-2024') return res.status(403).json({ error: 'Forbidden' });
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrate_roles.sql'), 'utf8');
    await pool.query(sql);
    res.json({ ok: true, message: 'Migration applied' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const bcrypt = require('bcryptjs');
router.post('/reset-passwords', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'se-migrate-2024') return res.status(403).json({ error: 'Forbidden' });
  try {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query('UPDATE users SET password_hash = $1', [hash]);
    res.json({ ok: true, message: 'All passwords reset to admin123' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
