const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contractors ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, phone, type, specialization, skills, inn, card_number, sbp_phone, bank_name } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO contractors (name, phone, type, specialization, skills, inn, card_number, payment_phone, bank_name, contractor_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [name, phone, type||'self_employed', specialization||'грузчик', JSON.stringify(skills||[]), inn||'', card_number||null, sbp_phone||null, bank_name||null, type||'self_employed']);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, phone, type, specialization, skills, inn, card_number, sbp_phone, bank_name, is_active } = req.body;
  try {
    const result = await pool.query(`
      UPDATE contractors SET name=$1, phone=$2, type=$3, specialization=$4, skills=$5, inn=$6, card_number=$7, payment_phone=$8, bank_name=$9, contractor_type=$10, is_active=$11
      WHERE id=$12 RETURNING *
    `, [name, phone, type||'self_employed', specialization, JSON.stringify(skills||[]), inn||'', card_number||null, sbp_phone||null, bank_name||null, type||'self_employed', is_active !== false, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contractors WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
