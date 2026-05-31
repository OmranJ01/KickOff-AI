const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate } = require("../middleware");
const { createNotification } = require("./notifications");
const { getIo, getOnlineUsers } = require("../socket");

// Get all conversations for current user (list of unique partners)
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT ON (partner_id)
         partner_id, partner_name, partner_city, partner_country, partner_avatar,
         last_message, last_message_at, unread_count
       FROM (
         SELECT
           CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END AS partner_id,
           u.name AS partner_name, u.city AS partner_city, u.country AS partner_country, u.avatar_url AS partner_avatar,
           m.content AS last_message, m.created_at AS last_message_at,
           (SELECT COUNT(*) FROM messages m2
            WHERE m2.sender_id=CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END
              AND m2.receiver_id=$1 AND m2.is_read=FALSE) AS unread_count
         FROM messages m
         JOIN users u ON u.id=CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END
         WHERE m.sender_id=$1 OR m.receiver_id=$1
         ORDER BY m.created_at DESC
       ) t
       ORDER BY partner_id, last_message_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


// Get messages with a specific user
router.get('/:partnerId', authenticate, async (req, res) => {

  try {
    // Mark as read
    await pool.query(
      `UPDATE messages SET is_read=TRUE WHERE sender_id=$1 AND receiver_id=$2 AND is_read=FALSE`,
      [req.params.partnerId, req.user.id]
    );
    const r = await pool.query(
      `SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar FROM messages m
       JOIN users u ON m.sender_id=u.id
       WHERE ((m.sender_id=$1 AND m.receiver_id=$2 AND m.deleted_for_sender=FALSE)
           OR (m.sender_id=$2 AND m.receiver_id=$1 AND m.deleted_for_receiver IS NOT TRUE))
         AND m.deleted_for_all=FALSE
       ORDER BY m.created_at ASC LIMIT 200`,
      [req.user.id, req.params.partnerId]
    );
    res.json(r.rows);
  } 
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


// Send a message
router.post('/', authenticate, async (req, res) => {
  const { receiverId, content } = req.body;
  if (!receiverId || !content?.trim()) return res.status(400).json({ error: 'receiverId and content required' });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, receiverId, content.trim()]
    );
    // Notify receiver
    const senderRes = await client.query('SELECT name, avatar_url FROM users WHERE id=$1', [req.user.id]);
    await createNotification(client, receiverId, 'message', `${senderRes.rows[0].name} sent you a message`, req.user.id, 'user');
    await client.query('COMMIT');

    // Push message in real-time to receiver if online
    const io = getIo();
    if (io) {
      const socketId = getOnlineUsers().get(Number(receiverId));
      if (socketId) {
        io.to(socketId).emit('new_message', {
          ...r.rows[0],
          sender_name: senderRes.rows[0].name,
          sender_avatar: senderRes.rows[0].avatar_url,
        });
      }
    }

    res.status(201).json(r.rows[0]);
  } 
  catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
   finally { client.release(); }
});

// Delete a direct message (for me only or for everyone)
router.delete('/:id', authenticate, async (req, res) => {
  const { scope } = req.body; // 'me' | 'all'

  try {
    const r = await pool.query('SELECT * FROM messages WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const msg = r.rows[0];

    if (scope === 'all') {
      if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Only sender can delete for everyone' });
      await pool.query('UPDATE messages SET deleted_for_all=TRUE WHERE id=$1', [req.params.id]);
    } 

    else {
      if (msg.sender_id !== req.user.id && msg.receiver_id !== req.user.id)
        return res.status(403).json({ error: 'Not your message' });
      if (msg.sender_id === req.user.id) await pool.query('UPDATE messages SET deleted_for_sender=TRUE WHERE id=$1', [req.params.id]);
      else await pool.query('UPDATE messages SET deleted_for_receiver=TRUE WHERE id=$1', [req.params.id]);
    }

    res.json({ success: true });
  } 
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});





module.exports = router;
