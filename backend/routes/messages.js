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
         t.partner_id,
         CASE WHEN b.id IS NOT NULL THEN 'App User' ELSE t.partner_name END AS partner_name,
         t.partner_city, t.partner_country,
         CASE WHEN b.id IS NOT NULL THEN NULL ELSE t.partner_avatar END AS partner_avatar,
         t.last_message, t.last_message_at, t.unread_count,
         (b.id IS NOT NULL) AS blocked_by_partner
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
       LEFT JOIN blocks b ON b.blocker_id=t.partner_id AND b.blocked_id=$1
       ORDER BY partner_id, last_message_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Block status between current user and another user
router.get('/block-status/:userId', authenticate, async (req, res) => {
  try {
    const [iBlock, theyBlock] = await Promise.all([
      pool.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, req.params.userId]),
      pool.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.params.userId, req.user.id]),
    ]);
    res.json({ iBlockedThem: iBlock.rows.length > 0, theyBlockedMe: theyBlock.rows.length > 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Block a user
router.post('/block/:userId', authenticate, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Unblock a user
router.delete('/block/:userId', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, req.params.userId]);
    res.json({ success: true });
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
       WHERE ((m.sender_id=$1 AND m.receiver_id=$2 AND m.deleted_for_sender IS NOT TRUE)
           OR (m.sender_id=$2 AND m.receiver_id=$1 AND m.deleted_for_receiver IS NOT TRUE))
         AND m.deleted_for_all IS NOT TRUE
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

  const blockCheck = await pool.query(
    'SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1',
    [req.user.id, receiverId]
  );
  if (blockCheck.rows.length) return res.status(403).json({ error: 'You cannot message this user' });

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
      // Notify the other person in real-time
      const otherId = msg.sender_id === req.user.id ? msg.receiver_id : msg.sender_id;
      const io = getIo();
      const socketId = getOnlineUsers().get(Number(otherId));
      if (io && socketId) io.to(socketId).emit('message_deleted', { id: req.params.id });
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
