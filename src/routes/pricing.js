const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const CAN_EDIT = ['super_admin', 'admin', 'cs_head', 'rop'];

// Список всех городов с ценами (для таблицы прайса и автодополнения)
router.get('/movers', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pricing_movers ORDER BY city');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ставки по конкретному городу (для калькулятора)
router.get('/movers/city', authMiddleware, async (req, res) => {
  try {
    const { city } = req.query;
    if (!city) return res.status(400).json({ error: 'city required' });
    const { rows } = await pool.query('SELECT * FROM pricing_movers WHERE city ILIKE $1 LIMIT 1', [city]);
    if (!rows.length) return res.status(404).json({ error: 'Город не найден в прайсе' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Расчёт стоимости грузчиков (B2C)
// tariff: 'prr' | 'shift8' | 'shift12', workers, hours, withGazel
router.post('/movers/calc', authMiddleware, async (req, res) => {
  try {
    const { city, tariff, workers, hours, withGazel } = req.body;
    const { rows } = await pool.query('SELECT * FROM pricing_movers WHERE city ILIKE $1 LIMIT 1', [city]);
    if (!rows.length) return res.status(404).json({ error: 'Город не найден' });
    const p = rows[0];
    const w = Number(workers) || 1;
    let h = Number(hours) || 0;
    // применяем минимум часов
    const minH = Number(p.min_hours) || 2;
    if (h < minH) h = minH;
    // выбираем ставку
    let rate;
    if (tariff === 'shift12') rate = Number(p.shift12_rate);
    else if (tariff === 'shift8') rate = Number(p.shift8_rate);
    else rate = Number(p.prr_rate);
    let total = w * h * rate;
    const gazel = withGazel ? Number(p.gazel_price) : 0;
    total += gazel;
    res.json({
      city: p.city, tariff, rate, workers: w, hours: h, min_hours: minH,
      labor: w * h * rate, gazel, total, note: p.note || null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить цену по городу (только разрешённые роли)
router.put('/movers/:id', authMiddleware, async (req, res) => {
  if (!CAN_EDIT.includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { prr_rate, min_hours, shift8_rate, shift12_rate, gazel_price, note } = req.body;
    const { rows } = await pool.query(
      `UPDATE pricing_movers SET prr_rate=$1, min_hours=$2, shift8_rate=$3,
       shift12_rate=$4, gazel_price=$5, note=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [prr_rate, min_hours, shift8_rate, shift12_rate, gazel_price, note, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Добавить город (только разрешённые роли)
router.post('/movers', authMiddleware, async (req, res) => {
  if (!CAN_EDIT.includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { city, prr_rate, min_hours, shift8_rate, shift12_rate, gazel_price, note } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO pricing_movers (city, prr_rate, min_hours, shift8_rate, shift12_rate, gazel_price, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [city, prr_rate, min_hours || 2, shift8_rate, shift12_rate, gazel_price || 2000, note]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
