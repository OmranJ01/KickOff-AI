const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate } = require("../middleware");
const { getIo, getOnlineUsers } = require("../socket");

// Helper: create a notification and push to user if online
async function createNotification(client, userId, type, message, relatedId = null, relatedType = null) {
  const r = await client.query(
    `INSERT INTO notifications (user_id, type, message, related_id, related_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, message, relatedId, relatedType]
  );
  const io = getIo();
  if (io) {
    const socketId = getOnlineUsers().get(Number(userId));
    if (socketId) io.to(socketId).emit('notification', r.rows[0]);
  }
}

router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`,
      [req.user.id]
    );
    res.json({ count: r.rows[0].count });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`, [req.user.id]);
    res.json({ success: true });
  } 

  catch (err) { res.status(500).json({ error: 'Server error' }); }
});


router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});


module.exports = router;
module.exports.createNotification = createNotification;
