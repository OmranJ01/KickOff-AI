const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate } = require("../middleware");
const { createNotification } = require("./notifications");
const { getIo, getOnlineUsers } = require("../socket");

// Create a group/match
router.post('/', authenticate, async (req, res) => {
  const { name, description, stadium_id, match_day, match_start, match_end, max_players } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO groups (name, description, creator_id, stadium_id, match_day, match_start, match_end, max_players)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, description||null, req.user.id, stadium_id||null, match_day||null, match_start||null, match_end||null, max_players||10]
    );
    const group = r.rows[0];
    // Creator auto-joins as admin
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1,$2,'admin',NOW())`,
      [group.id, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(group);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Get my groups
router.get('/mine', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT g.*, u.name AS creator_name,
              s.name AS stadium_name, s.city AS stadium_city, s.country AS stadium_country,
              gm.role AS my_role,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id=g.id AND gm2.status='active')::int AS member_count,
              (SELECT COUNT(*) FROM group_messages gm3 WHERE gm3.group_id=g.id AND gm3.created_at > COALESCE(gm.last_read_at, '1970-01-01'))::int AS unread_count
       FROM groups g
       JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=$1 AND gm.status='active'
       JOIN users u ON g.creator_id=u.id
       LEFT JOIN stadiums s ON g.stadium_id=s.id
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Get group details with members
router.get('/:id', authenticate, async (req, res) => {
  try {
    const g = await pool.query(
      `SELECT g.*, u.name AS creator_name, s.name AS stadium_name, s.city AS stadium_city, s.country AS stadium_country
       FROM groups g JOIN users u ON g.creator_id=u.id LEFT JOIN stadiums s ON g.stadium_id=s.id
       WHERE g.id=$1`, [req.params.id]
    );
    if (!g.rows.length) return res.status(404).json({ error: 'Group not found' });
    const members = await pool.query(
      `SELECT u.id, u.name, u.city, u.country, u.avatar_url, gm.role, gm.joined_at
       FROM group_members gm JOIN users u ON gm.user_id=u.id
       WHERE gm.group_id=$1 AND gm.status='active' ORDER BY gm.joined_at`,
      [req.params.id]
    );
    res.json({ ...g.rows[0], members: members.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Invite a friend to group
router.post('/:id/invite', authenticate, async (req, res) => {
  const { userId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Check admin
    const admin = await client.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin' AND status='active'`,
      [req.params.id, req.user.id]
    );
    if (!admin.rows.length) return res.status(403).json({ error: 'Only admins can invite' });
    // Add member as pending
    await client.query(
      `INSERT INTO group_members (group_id, user_id, status) VALUES ($1,$2,'invited')
       ON CONFLICT (group_id, user_id) DO UPDATE SET status='invited'`,
      [req.params.id, userId]
    );
    const groupRes = await client.query('SELECT name FROM groups WHERE id=$1', [req.params.id]);
    const inviterRes = await client.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    await createNotification(client, userId, 'group_invite',
      `${inviterRes.rows[0].name} invited you to join "${groupRes.rows[0].name}"`,
      parseInt(req.params.id), 'group'
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Accept/decline group invite
router.patch('/:id/respond', authenticate, async (req, res) => {
  const { action } = req.body; // 'accept' or 'decline'
  try {
    if (action === 'accept') {
      await pool.query(
        `UPDATE group_members SET status='active', joined_at=NOW() WHERE group_id=$1 AND user_id=$2 AND status='invited'`,
        [req.params.id, req.user.id]
      );
    } else {
      await pool.query(
        `DELETE FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='invited'`,
        [req.params.id, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Leave group
// Admin kicks a member out
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const admin = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin' AND status='active'`,
      [req.params.id, req.user.id]
    );
    if (!admin.rows.length) return res.status(403).json({ error: 'Only admins can remove members' });
    if (req.params.userId == req.user.id) return res.status(400).json({ error: 'Cannot kick yourself' });
    await pool.query(
      `UPDATE group_members SET status='kicked' WHERE group_id=$1 AND user_id=$2`,
      [req.params.id, req.params.userId]
    );
    const [grpRes, adminRes] = await Promise.all([
      pool.query('SELECT name FROM groups WHERE id=$1', [req.params.id]),
      pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])
    ]);
    pool.query(
      `INSERT INTO notifications (user_id, type, message, related_id, related_type) VALUES ($1,'group_kicked',$2,$3,'group')`,
      [req.params.userId, `You were removed from "${grpRes.rows[0]?.name}" by ${adminRes.rows[0]?.name}`, req.params.id]
    ).catch(()=>{});

    // Notify kicked user in real-time if online
    const io = getIo();
    if (io) {
      const socketId = getOnlineUsers().get(Number(req.params.userId));
      if (socketId) io.to(socketId).emit('kicked_from_group', { groupId: Number(req.params.id) });
    }

    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Edit group (admin only)
router.put('/:id', authenticate, async (req, res) => {
  const { name, description, stadium_id, match_day, match_start, match_end, max_players } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    // Check admin
    const admin = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin' AND status='active'`,
      [req.params.id, req.user.id]
    );
    if (!admin.rows.length) return res.status(403).json({ error: 'Only admins can edit the group' });
    const r = await pool.query(
      `UPDATE groups SET name=$1, description=$2, stadium_id=$3, match_day=$4, match_start=$5, match_end=$6, max_players=$7
       WHERE id=$8 RETURNING *`,
      [name, description || null, stadium_id || null, match_day !== undefined ? match_day : null,
       match_start || null, match_end || null, max_players || 10, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id/leave', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE group_members SET status='left' WHERE group_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Get pending group invites for current user
router.get('/invites/pending', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT g.*, u.name AS creator_name,
              s.name AS stadium_name,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id=g.id AND gm2.status='active')::int AS member_count
       FROM group_members gm
       JOIN groups g ON gm.group_id=g.id
       JOIN users u ON g.creator_id=u.id
       LEFT JOIN stadiums s ON g.stadium_id=s.id
       WHERE gm.user_id=$1 AND gm.status='invited'
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Group Chat ─────────────────────────────────────────────────────

router.get('/:id/messages', authenticate, async (req, res) => {
  try {
    // Mark as read
    await pool.query(
      `UPDATE group_members SET last_read_at=NOW() WHERE group_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    // Get when this user joined (to only show messages from that point on)
    const memRes = await pool.query(
      `SELECT joined_at FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active'`,
      [req.params.id, req.user.id]
    );
    const joinedAt = memRes.rows[0]?.joined_at || new Date(0);
    const r = await pool.query(
      `SELECT gm.id, gm.group_id, gm.sender_id, gm.created_at,
              CASE WHEN gm.deleted_for_all THEN NULL
                   WHEN gm.deleted_for_sender AND gm.sender_id=$2 THEN NULL
                   ELSE gm.content END AS content,
              gm.deleted_for_all,
              (gm.deleted_for_sender AND gm.sender_id=$2) AS hidden_for_me,
              u.name AS sender_name, u.avatar_url AS sender_avatar
       FROM group_messages gm
       JOIN users u ON gm.sender_id=u.id
       WHERE gm.group_id=$1 AND gm.created_at >= $3
         AND NOT (gm.deleted_for_sender AND gm.sender_id=$2)
       ORDER BY gm.created_at ASC LIMIT 500`,
      [req.params.id, req.user.id, joinedAt]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Delete a group message (for me only or for everyone)
router.delete('/:id/messages/:msgId', authenticate, async (req, res) => {
  const { scope } = req.body; // 'me' | 'all'
  try {
    const r = await pool.query(
      'SELECT * FROM group_messages WHERE id=$1 AND group_id=$2',
      [req.params.msgId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const msg = r.rows[0];
    if (scope === 'all') {
      if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Only sender can delete for everyone' });
      await pool.query('UPDATE group_messages SET deleted_for_all=TRUE WHERE id=$1', [req.params.msgId]);
    } else {
      if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Not your message' });
      await pool.query('UPDATE group_messages SET deleted_for_sender=TRUE WHERE id=$1', [req.params.msgId]);
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/:id/messages', authenticate, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  try {
    // Check membership
    const mem = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active'`,
      [req.params.id, req.user.id]
    );
    if (!mem.rows.length) return res.status(403).json({ error: 'Not a member' });

    const r = await pool.query(
      `INSERT INTO group_messages (group_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, content.trim()]
    );

    // Notify all other active members (skip sender)
    const [groupRes, senderRes, membersRes] = await Promise.all([
      pool.query('SELECT name FROM groups WHERE id=$1', [req.params.id]),
      pool.query('SELECT name, avatar_url FROM users WHERE id=$1', [req.user.id]),
      pool.query(
        `SELECT user_id FROM group_members WHERE group_id=$1 AND user_id!=$2 AND status='active'`,
        [req.params.id, req.user.id]
      )
    ]);
    const groupName = groupRes.rows[0]?.name || 'Group';
    const senderName = senderRes.rows[0]?.name || 'Someone';
    const preview = content.trim().length > 60 ? content.trim().slice(0, 60) + '…' : content.trim();

    if (membersRes.rows.length) {
      const notifMsg = `💬 ${senderName} in ${groupName}: ${preview}`;
      Promise.all(membersRes.rows.map(m =>
        pool.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type) VALUES ($1,'group_message',$2,$3,'group')`,
          [m.user_id, notifMsg, req.params.id]
        )
      )).catch(() => {});
    }

    // Push message in real-time to group room members
    const io = getIo();
    if (io) {
      const fullMsg = {
        ...r.rows[0],
        hidden_for_me: false,
        sender_name: senderName,
        sender_avatar: senderRes.rows[0]?.avatar_url || null,
      };
      io.to(`group_${req.params.id}`).emit('group_message', fullMsg);

      // Push notification badge to online members not in the group room
      const groupRoom = io.sockets.adapter.rooms.get(`group_${req.params.id}`);
      for (const member of membersRes.rows) {
        const socketId = getOnlineUsers().get(Number(member.user_id));
        if (socketId && !groupRoom?.has(socketId)) {
          io.to(socketId).emit('notification', { type: 'group_message' });
        }
      }
    }

    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


module.exports = router;
