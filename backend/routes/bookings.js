const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate, requireOwner } = require("../middleware");
const { toMin } = require("../slotHelpers");
const { emitNotification } = require("../socket");

// ── helpers ──────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : new Date(d);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Player: create a booking ─────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  if (req.user.userType !== 'player') return res.status(403).json({ error: 'Only players can book' });

  const { stadium_id, booking_date, booked_start, booked_end, note } = req.body;

  if (!stadium_id || !booking_date || !booked_start || !booked_end)
    return res.status(400).json({ error: 'stadium_id, booking_date, booked_start, booked_end are required' });

  const today = new Date().toISOString().slice(0, 10);
  if (booking_date < today)
    return res.status(400).json({ error: 'Booking date cannot be in the past' });

  const bStart = toMin(booked_start);
  const bEnd   = toMin(booked_end);
  if (bEnd <= bStart) return res.status(400).json({ error: 'End time must be after start time' });

  try {
    const dow = new Date(booking_date + 'T12:00:00').getDay();

    // Validate that the weekly schedule covers the requested time on this day-of-week
    const schedRes = await pool.query(
      `SELECT id FROM stadium_schedule
       WHERE stadium_id=$1 AND day_of_week=$2 AND is_available=TRUE
         AND slot_start <= $3::time AND slot_end >= $4::time
       LIMIT 1`,
      [stadium_id, dow, booked_start, booked_end]
    );
    if (!schedRes.rows.length)
      return res.status(400).json({ error: 'No available slot for that day and time in the weekly schedule' });

    // Block if a CONFIRMED booking already covers this time on this exact date
    const conflict = await pool.query(
      `SELECT id FROM bookings
       WHERE stadium_id=$1 AND booking_date=$2 AND status='confirmed'
         AND booked_start < $4::time AND booked_end > $3::time`,
      [stadium_id, booking_date, booked_start, booked_end]
    );
    if (conflict.rows.length)
      return res.status(409).json({ error: 'This time slot is already confirmed for another booking on that date' });

    const r = await pool.query(
      `INSERT INTO bookings
         (stadium_id, player_id, day_of_week, booking_date, booked_start, booked_end, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [stadium_id, req.user.id, dow, booking_date, booked_start, booked_end, note || null]
    );
    const booking = r.rows[0];

    // Notify the stadium owner
    try {
      const infoRes = await pool.query(
        `SELECT u.name AS player_name, s.name AS stadium_name, s.owner_id
         FROM users u, stadiums s WHERE u.id=$1 AND s.id=$2`,
        [req.user.id, stadium_id]
      );
      if (infoRes.rows.length) {
        const { player_name, stadium_name, owner_id } = infoRes.rows[0];
        await pool.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1,'booking',$2,$3,'booking')`,
          [owner_id,
           `📅 ${player_name} requested a booking at ${stadium_name} on ${fmtDate(booking_date)} (${booked_start.slice(0,5)}–${booked_end.slice(0,5)})`,
           booking.id]
        );
        emitNotification(owner_id, { type: 'booking' });
      }
    } catch (notifErr) { console.error('Notification error:', notifErr); }

    res.status(201).json(booking);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Owner: resolve booking id → stadium_id (for notification redirect) ──
router.get('/stadium-for-notif/:bookingId', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.stadium_id FROM bookings b
       JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.id=$1 AND s.owner_id=$2`,
      [req.params.bookingId, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ stadium_id: r.rows[0].stadium_id });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── Player: view my bookings ─────────────────────────────────────
router.get('/mine', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*, s.name AS stadium_name, s.city AS stadium_city, s.country AS stadium_country,
              s.price_per_hour, s.phone AS stadium_phone
       FROM bookings b JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.player_id=$1
       ORDER BY COALESCE(b.booking_date, '1970-01-01') DESC, b.booked_start DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Player: cancel own booking ───────────────────────────────────
router.patch('/:id/cancel', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fetchRes = await client.query(
      `SELECT * FROM bookings WHERE id=$1 AND player_id=$2 AND status IN ('pending','confirmed')`,
      [req.params.id, req.user.id]
    );
    if (!fetchRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }

    const b = fetchRes.rows[0];

    const bRes = await client.query(
      `UPDATE bookings SET status='cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );

    try {
      const infoRes = await client.query(
        `SELECT u.name AS player_name, s.name AS stadium_name, s.owner_id
         FROM users u, stadiums s WHERE u.id=$1 AND s.id=$2`,
        [b.player_id, b.stadium_id]
      );
      if (infoRes.rows.length) {
        const { player_name, stadium_name, owner_id } = infoRes.rows[0];
        const dateStr = fmtDate(b.booking_date);
        const timeStr = `${String(b.booked_start).slice(0,5)}–${String(b.booked_end).slice(0,5)}`;
        await client.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1,'booking_cancelled',$2,$3,'booking')`,
          [owner_id, `❌ ${player_name} cancelled their booking at ${stadium_name} on ${dateStr} (${timeStr})`, b.id]
        );
        emitNotification(owner_id, { type: 'booking_cancelled' });
      }
    } catch (notifErr) { console.error('Cancel notif error:', notifErr); }

    await client.query('COMMIT');
    res.json(bRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ── Owner: view all bookings for a stadium ───────────────────────
router.get('/stadium/:stadiumId', authenticate, requireOwner, async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.stadiumId, req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    const r = await pool.query(
      `SELECT b.*, u.name AS player_name, u.email AS player_email
       FROM bookings b JOIN users u ON b.player_id=u.id
       WHERE b.stadium_id=$1
       ORDER BY
         CASE b.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
         COALESCE(b.booking_date, '2099-01-01') ASC,
         b.booked_start`,
      [req.params.stadiumId]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Owner: confirm or cancel a booking ──────────────────────────
router.patch('/:id/status', authenticate, requireOwner, async (req, res) => {
  const { status } = req.body;
  if (!['confirmed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bRes = await client.query(
      `SELECT b.* FROM bookings b
       JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.id=$1 AND s.owner_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!bRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }

    const b = bRes.rows[0];
    if (b.status === status) { await client.query('ROLLBACK'); return res.json(b); }

    const updated = await client.query(
      'UPDATE bookings SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, b.id]
    );

    if (status === 'confirmed') {
      // Auto-cancel other pending bookings that overlap on the same date
      const overlapping = await client.query(
        `SELECT b2.*, u.name AS player_name FROM bookings b2
         JOIN users u ON b2.player_id=u.id
         WHERE b2.stadium_id=$1 AND b2.booking_date=$2 AND b2.status='pending' AND b2.id<>$3
           AND b2.booked_start < $5::time AND b2.booked_end > $4::time`,
        [b.stadium_id, b.booking_date, b.id, b.booked_start, b.booked_end]
      );

      for (const ob of overlapping.rows) {
        await client.query(`UPDATE bookings SET status='cancelled', updated_at=NOW() WHERE id=$1`, [ob.id]);
        const stRes = await client.query('SELECT name FROM stadiums WHERE id=$1', [b.stadium_id]);
        const stadiumName = stRes.rows[0]?.name || 'the stadium';
        const dateStr = fmtDate(ob.booking_date);
        const timeStr = `${String(ob.booked_start).slice(0,5)}–${String(ob.booked_end).slice(0,5)}`;
        await client.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1,'booking_cancelled_by_owner',$2,$3,'booking')`,
          [ob.player_id,
           `❌ Your booking at ${stadiumName} on ${dateStr} (${timeStr}) was cancelled — another booking was confirmed for that slot`,
           ob.id]
        );
        emitNotification(ob.player_id, { type: 'booking_cancelled_by_owner' });
      }

      if (overlapping.rows.length > 0) {
        const names = overlapping.rows.map(r => r.player_name).join(', ');
        await client.query('COMMIT');
        return res.json({ ...updated.rows[0], _warning: `${overlapping.rows.length} overlapping booking(s) auto-cancelled (${names}). Those players have been notified.` });
      }
    }

    // Notify the player
    try {
      const infoRes = await client.query(
        `SELECT u.name AS owner_name, s.name AS stadium_name
         FROM users u, stadiums s WHERE u.id=$1 AND s.id=$2`,
        [req.user.id, b.stadium_id]
      );
      if (infoRes.rows.length) {
        const { owner_name, stadium_name } = infoRes.rows[0];
        const dateStr = fmtDate(b.booking_date);
        const timeStr = `${String(b.booked_start).slice(0,5)}–${String(b.booked_end).slice(0,5)}`;
        const msg = status === 'confirmed'
          ? `✅ ${owner_name} confirmed your booking at ${stadium_name} on ${dateStr} (${timeStr})`
          : `❌ ${owner_name} cancelled your booking at ${stadium_name} on ${dateStr} (${timeStr})`;
        const notifType = status === 'confirmed' ? 'booking_confirmed' : 'booking_cancelled_by_owner';
        await client.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1,$2,$3,$4,'booking')`,
          [b.player_id, notifType, msg, b.id]
        );
        emitNotification(b.player_id, { type: notifType });
      }
    } catch (notifErr) { console.error('Status notif error:', notifErr); }

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ── Owner: delete a cancelled booking from the list ──────────────
router.delete('/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.* FROM bookings b JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.id=$1 AND s.owner_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Booking not found' });
    if (r.rows[0].status !== 'cancelled') return res.status(400).json({ error: 'Only cancelled bookings can be removed' });
    await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
