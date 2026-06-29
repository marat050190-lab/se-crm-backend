const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const ALLOWED = ['order', 'lead'];

router.post('/:entityType/:entityId', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    if (!ALLOWED.includes(entityType)) return res.status(400).json({ error: 'Неверный тип' });
    if (!req.file) return res.status(400).json({ error: 'Файл не передан' });
    const { rows } = await pool.query(
      `INSERT INTO files (entity_type, entity_id, filename, mime_type, size_bytes, content, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, entity_type, entity_id, filename, mime_type, size_bytes, uploaded_by, created_at`,
      [entityType, entityId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/:entityType/:entityId', authMiddleware, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { rows } = await pool.query(
      `SELECT id, filename, mime_type, size_bytes, uploaded_by, created_at
       FROM files WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/download/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT filename, mime_type, content FROM files WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    const f = rows[0];
    res.setHeader('Content-Type', f.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
    res.send(f.content);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM files WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
