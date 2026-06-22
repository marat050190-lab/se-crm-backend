const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/stats/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.role === 'manager' ? req.user.id : null;
    const userFilter = userId ? `AND assigned_to = ${userId}` : '';

    const [byStatus, todayTasks, conversion] = await Promise.all([
      // Лиды по статусам
      pool.query(`
        SELECT status, COUNT(*) as count
        FROM leads
        WHERE created_at >= NOW() - INTERVAL '30 days' ${userFilter}
        GROUP BY status
      `),
      // Задачи на сегодня
      pool.query(`
        SELECT COUNT(*) as count FROM tasks
        WHERE assigned_to = $1
          AND status = 'pending'
          AND due_date::date = CURRENT_DATE
      `, [req.user.id]),
      // Конверсия за 30 дней
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'won') as won,
          COUNT(*) FILTER (WHERE status = 'lost') as lost,
          COUNT(*) as total
        FROM leads
        WHERE created_at >= NOW() - INTERVAL '30 days' ${userFilter}
      `),
    ]);

    const statusMap = {};
    byStatus.rows.forEach(r => { statusMap[r.status] = parseInt(r.count); });

    res.json({
      byStatus: statusMap,
      todayTasks: parseInt(todayTasks.rows[0].count),
      conversion: conversion.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка статистики' });
  }
});

module.exports = router;
