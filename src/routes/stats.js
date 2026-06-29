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


// KPI диспетчера
router.get('/dispatcher', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const today = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_total,
        COUNT(*) FILTER (WHERE status = 'in_progress' AND assigned_to = $1) as in_progress,
        COUNT(*) FILTER (WHERE status IN ('transferred_mfl','transferred_b2b','taken') AND assigned_to = $1 AND DATE(updated_at) = CURRENT_DATE) as today_converted,
        COUNT(*) FILTER (WHERE status IN ('expensive','no_answer','found_another','not_our_service','rejected','spam') AND assigned_to = $1 AND DATE(updated_at) = CURRENT_DATE) as today_rejected
      FROM leads
      WHERE assigned_to = $1
    `, [userId]);

    const rejectReasons = await pool.query(`
      SELECT lost_reason, COUNT(*) as count
      FROM leads
      WHERE assigned_to = $1 AND lost_reason IS NOT NULL
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY lost_reason ORDER BY count DESC
    `, [userId]);

    const conversion = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('transferred_mfl','transferred_b2b','taken')) as converted
      FROM leads
      WHERE assigned_to = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [userId]);

    const avgResponse = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (lh.created_at - l.created_at))/60) as avg_minutes
      FROM lead_history lh
      JOIN leads l ON l.id = lh.lead_id
      WHERE lh.action = 'status_changed' AND lh.new_value = 'in_progress'
        AND lh.user_id = $1 AND lh.created_at >= NOW() - INTERVAL '30 days'
    `, [userId]);

    const byStatus = await pool.query(`
      SELECT status, COUNT(*) as count FROM leads
      WHERE assigned_to = $1 AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status ORDER BY count DESC
    `, [userId]);

    res.json({
      today: today.rows[0],
      rejectReasons: rejectReasons.rows,
      conversion: conversion.rows[0],
      avgResponseMinutes: Math.round(avgResponse.rows[0]?.avg_minutes || 0),
      byStatus: byStatus.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка статистики диспетчера' });
  }
});

module.exports = router;
