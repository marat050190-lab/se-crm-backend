const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM contractors ORDER BY name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, phone, type, specialization, skills, inn, card_number, sbp_phone, bank_name, ip_name, bank_account, bank_bik, is_active } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO contractors (full_name, phone, contractor_type, specialization, skills, inn, card_number, payment_phone, payment_card, bank_name, ip_name, bank_account, bank_bik, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [name, phone, type||'self_employed', specialization, JSON.stringify(skills||[]), inn, card_number, sbp_phone, card_number, bank_name, ip_name, bank_account, bank_bik, is_active !== false]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, phone, type, specialization, skills, inn, card_number, sbp_phone, bank_name, ip_name, bank_account, bank_bik, is_active } = req.body;
  try {
    const result = await pool.query(`
      UPDATE contractors SET full_name=$1, phone=$2, contractor_type=$3, specialization=$4, skills=$5, inn=$6, card_number=$7, payment_phone=$8, payment_card=$9, bank_name=$10, ip_name=$11, bank_account=$12, bank_bik=$13, is_active=$14
      WHERE id=$15 RETURNING *
    `, [name, phone, type||'self_employed', specialization, JSON.stringify(skills||[]), inn, card_number, sbp_phone, card_number, bank_name, ip_name, bank_account, bank_bik, is_active !== false, req.params.id]);
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
