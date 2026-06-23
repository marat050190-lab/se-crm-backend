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

router.post('/run-ks', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'se-migrate-2024') return res.status(403).json({ error: 'Forbidden' });
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrate_ks.sql'), 'utf8');
    await pool.query(sql);
    res.json({ ok: true, message: 'KS migration applied' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run-rop', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'se-migrate-2024') return res.status(403).json({ error: 'Forbidden' });
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrate_rop.sql'), 'utf8');
    await pool.query(sql);
    res.json({ ok: true, message: 'ROP migration applied' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run-pricing', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'se-migrate-2024') return res.status(403).json({ error: 'Forbidden' });
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrate_pricing.sql'), 'utf8');
    await pool.query(sql);
    const cnt = await pool.query('SELECT COUNT(*) FROM pricing_movers');
    res.json({ ok: true, message: 'Pricing migration applied', cities: cnt.rows[0].count });
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
