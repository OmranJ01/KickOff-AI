const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../middleware');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


router.post('/signup', async (req, res) => {
  const { name, email, password, userType, city, country } = req.body;

  if (!name || !email || !password || !userType)
    return res.status(400).json({ error: 'All fields are required' });

  if (!['player', 'stadium_owner'].includes(userType))
    return res.status(400).json({ error: 'Invalid user type' });

  try {
    
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (name,email,password,user_type,city,country) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,email,user_type',
      [name, email, hash, userType, city || null, country || null]
    );
    const u = r.rows[0];
    const token = jwt.sign({ id: u.id, userType: u.user_type }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: u.id, name: u.name, email: u.email, userType: u.user_type, city: u.city, country: u.country, avatarUrl: null } });
  }

   catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password)))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: u.id, userType: u.user_type }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, userType: u.user_type, city: u.city, country: u.country, avatarUrl: u.avatar_url } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


router.get('/me', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT id,name,email,user_type,city,country,avatar_url,bio FROM users WHERE id=$1', [req.user.id]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ id: u.id, name: u.name, email: u.email, userType: u.user_type, city: u.city, country: u.country, avatarUrl: u.avatar_url, bio: u.bio || '' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/name', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name max 100 characters' });
  try {
    await pool.query('UPDATE users SET name=$1 WHERE id=$2', [name.trim(), req.user.id]);
    res.json({ name: name.trim() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/bio', authenticate, async (req, res) => {
  const { bio } = req.body;
  if (bio !== null && bio !== undefined && bio.length > 300) return res.status(400).json({ error: 'Bio max 300 characters' });
  try {
    await pool.query('UPDATE users SET bio=$1 WHERE id=$2', [bio || null, req.user.id]);
    res.json({ bio: bio || '' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Upload/update profile picture (base64), or remove it by sending null
router.put('/avatar', authenticate, async (req, res) => {
  const { imageBase64 } = req.body;
  if (imageBase64 === undefined) return res.status(400).json({ error: 'No image provided' });
  // null = remove avatar
  if (imageBase64 !== null && imageBase64.length > 2800000)
    return res.status(400).json({ error: 'Image too large (max 2MB)' });
  try {
    await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [imageBase64, req.user.id]);
    res.json({ avatarUrl: imageBase64 });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Delete own account — handles all cascades explicitly
router.delete('/delete-account', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = req.user.id;

    // If stadium owner: cancel all bookings for their stadiums (so players' bookings disappear),
    // then nullify stadium_id in groups (keep groups, just unlink the stadium)
    if (req.user.userType === 'stadium_owner') {
      // Cancel all bookings for owner's stadiums
      await client.query(
        `UPDATE bookings SET status='cancelled' WHERE stadium_id IN (SELECT id FROM stadiums WHERE owner_id=$1)`,
        [userId]
      );
      // Unlink stadiums from groups (keep groups, just remove the stadium reference)
      await client.query(
        `UPDATE groups SET stadium_id=NULL WHERE stadium_id IN (SELECT id FROM stadiums WHERE owner_id=$1)`,
        [userId]
      );
    }

    // Delete the user — FK cascades handle the rest:
    // friendships, messages (sender/receiver), group_members, group_messages, bookings (player_id), stadiums+schedule (owner)
    await client.query('DELETE FROM users WHERE id=$1', [userId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});



module.exports = router;
