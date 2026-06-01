const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate } = require("../middleware");
const { emitNotification } = require("../socket");

router.get('/players/search', authenticate, async (req, res) => {

  const q = (req.query.q || '').trim();
  const city = (req.query.city || '').trim();
  const country = (req.query.country || '').trim();
  const day = req.query.day !== undefined && req.query.day !== '' ? parseInt(req.query.day) : null;
  const myId = parseInt(req.user.id, 10);

  try {
    let baseWhere = `u.user_type='player' AND u.id<>$1`;
    const params = [myId];
    let idx = 2;

    if (q) { baseWhere += ` AND (u.name ILIKE $${idx} OR u.city ILIKE $${idx} OR u.country ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
    if (city) { baseWhere += ` AND u.city ILIKE $${idx}`; params.push(`%${city}%`); idx++; }
    if (country) { baseWhere += ` AND u.country ILIKE $${idx}`; params.push(`%${country}%`); idx++; }

    let joinClause = '';
    if (day !== null) {
      joinClause = `JOIN player_availability pa ON pa.player_id=u.id AND pa.day_of_week=$${idx}`;
      params.push(day); idx++;
    }

    // Why LeftJoin ? Because the frontend needs to know the friendship status with each player
    //  in the search results — so it can show the right button next to each player.
    const sql = `
      SELECT DISTINCT u.id, u.name, u.city, u.country, u.avatar_url,
        f.status AS friendship_status, f.requester_id AS friendship_requester
      FROM users u
      LEFT JOIN friendships f
        ON (f.requester_id=u.id AND f.addressee_id=$1) OR (f.addressee_id=u.id AND f.requester_id=$1)
      ${joinClause}
      WHERE ${baseWhere}
      ORDER BY u.name LIMIT 30`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } 

  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.post('/friends/request', authenticate, async (req, res) => {
  const { addresseeId } = req.body;
  if (!addresseeId) return res.status(400).json({ error: 'addresseeId is required' });

  if (Number(addresseeId) === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });

  try {
    const t = await pool.query('SELECT id FROM users WHERE id=$1 AND user_type=$2', [addresseeId, 'player']);
    if (!t.rows.length) return res.status(404).json({ error: 'Player not found' });
    const r = await pool.query(
      `INSERT INTO friendships (requester_id,addressee_id,status) VALUES ($1,$2,'pending')
       ON CONFLICT (requester_id,addressee_id) DO UPDATE SET status='pending',updated_at=NOW() RETURNING *`,
      [req.user.id, addresseeId]
    );
    // Notify addressee of new friend request
    pool.query('SELECT name FROM users WHERE id=$1', [req.user.id]).then(sndr => {
      const name = sndr.rows[0]?.name || 'Someone';
      pool.query(
        `INSERT INTO notifications (user_id, type, message, related_id, related_type) VALUES ($1,'friend_request',$2,$3,'friendship')`,
        [addresseeId, `👥 ${name} sent you a friend request`, r.rows[0].id]
      ).then(() => emitNotification(addresseeId, { type: 'friend_request' })).catch(()=>{});
    }).catch(()=>{});
    
    res.status(201).json(r.rows[0]);
  } 
  
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.patch('/friends/:requesterId/respond', authenticate, async (req, res) => {
  const { action } = req.body;
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    const r = await pool.query(
      `UPDATE friendships SET status=$1,updated_at=NOW()
       WHERE requester_id=$2 AND addressee_id=$3 AND status='pending' RETURNING *`,
      [action === 'accept' ? 'accepted' : 'declined', req.params.requesterId, req.user.id]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    // Notify requester when accepted
    if (action === 'accept') {
      pool.query('SELECT name FROM users WHERE id=$1', [req.user.id]).then(u => {
        const name = u.rows[0]?.name || 'Someone';

        pool.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type) VALUES ($1,'friend_accepted',$2,$3,'friendship')`,
          [req.params.requesterId, `✅ ${name} accepted your friend request`, r.rows[0].id]
        ).then(() => emitNotification(Number(req.params.requesterId), { type: 'friend_accepted' })).catch(()=>{});
      }).catch(()=>{});
    }

    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.delete('/friends/:otherId', authenticate, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
      [req.user.id, req.params.otherId]
    );
    res.json({ success: true });
  } 
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/friends', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id,u.name,u.city,u.country,u.avatar_url,f.created_at AS friends_since
       FROM friendships f
       JOIN users u ON (CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END=u.id)
       WHERE (f.requester_id=$1 OR f.addressee_id=$1) AND f.status='accepted' ORDER BY u.name`,
      [req.user.id]
    );
    res.json(r.rows);
  } 
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.get('/friends/requests/incoming', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id,u.name,u.city,u.country,u.avatar_url,f.created_at AS requested_at
       FROM friendships f JOIN users u ON f.requester_id=u.id
       WHERE f.addressee_id=$1 AND f.status='pending' ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.get('/players/:id/profile', authenticate, async (req, res) => {
  try {
    const profileId = parseInt(req.params.id);

    const [userRes, statsRes, friendsRes] = await Promise.all([
      pool.query(
        `SELECT id, name, city, country, avatar_url, bio FROM users WHERE id=$1 AND user_type='player'`,
        [profileId]
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT pms.match_result_id)::int        AS matches_played,
           COALESCE(SUM(pms.goals),   0)::int              AS total_goals,
           COALESCE(SUM(pms.assists), 0)::int              AS total_assists,
           MODE() WITHIN GROUP (ORDER BY pms.position)     AS top_position
         FROM player_match_stats pms WHERE pms.player_id=$1`,
        [profileId]
      ),
      pool.query(
        `SELECT u.id, u.name, u.avatar_url
         FROM friendships f
         JOIN users u ON (CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END = u.id)
         WHERE (f.requester_id=$1 OR f.addressee_id=$1) AND f.status='accepted'
         ORDER BY u.name LIMIT 20`,
        [profileId]
      ),
    ]);

    if (!userRes.rows.length) return res.status(404).json({ error: 'Player not found' });
    const u = userRes.rows[0];
    res.json({ ...u, stats: statsRes.rows[0], friends: friendsRes.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/friends/requests/outgoing', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id,u.name,u.city,u.country,u.avatar_url,f.created_at AS requested_at
       FROM friendships f JOIN users u ON f.addressee_id=u.id
       WHERE f.requester_id=$1 AND f.status='pending' ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


module.exports = router;
