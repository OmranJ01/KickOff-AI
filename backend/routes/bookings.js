const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate, requireOwner } = require("../middleware");
const { toMin, splitSlot, restoreSlot } = require("../slotHelpers");
const { emitNotification } = require("../socket");

// Player: create a booking with custom time range
// Validates: booked range must fit inside an available slot
// Does NOT split immediately — split happens on owner confirmation
router.post('/', authenticate, async (req, res) => {

  if (req.user.userType !== 'player') return res.status(403).json({ error: 'Only players can book' });
  const { stadium_id, day_of_week, booked_start, booked_end, note } = req.body;

  if (!stadium_id || day_of_week === undefined || !booked_start || !booked_end)
    return res.status(400).json({ error: 'stadium_id, day_of_week, booked_start, booked_end are required' });

  const bStart = toMin(booked_start);
  const bEnd = toMin(booked_end);
  if (bEnd <= bStart) return res.status(400).json({ error: 'End time must be after start time' });

  try {
    // Find a parent slot that fully contains the requested range
    const slotRes = await pool.query(
      `SELECT * FROM stadium_schedule
       WHERE stadium_id=$1 AND day_of_week=$2 AND is_available=TRUE
         AND slot_start <= $3::time AND slot_end >= $4::time
       ORDER BY slot_start LIMIT 1`,
      [stadium_id, day_of_week, booked_start, booked_end]
    );
    if (!slotRes.rows.length)
      return res.status(400).json({ error: 'Your chosen time range is not within any available slot' });

    const parentSlot = slotRes.rows[0];

    // Only block if a CONFIRMED booking already covers this slot
    // Pending bookings are allowed to overlap — owner decides who gets it
    const conflict = await pool.query(
      `SELECT id FROM bookings
       WHERE stadium_id=$1 AND day_of_week=$2 AND status='confirmed'
         AND booked_start < $4::time AND booked_end > $3::time`,
      [stadium_id, day_of_week, booked_start, booked_end]
    );
    if (conflict.rows.length) return res.status(409).json({ error: 'This slot has already been confirmed for another booking' });

    const r = await pool.query(
      `INSERT INTO bookings (stadium_id,player_id,day_of_week,booked_start,booked_end,parent_schedule_id,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [stadium_id, req.user.id, day_of_week, booked_start, booked_end, parentSlot.id, note || null]
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
        const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day_of_week];
        await pool.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1, 'booking', $2, $3, 'booking')`,
          [owner_id,
           `📅 ${player_name} requested a booking at ${stadium_name} on ${dayName} (${String(booked_start).slice(0,5)}–${String(booked_end).slice(0,5)})`,
           booking.id]
        );
        emitNotification(owner_id, { type: 'booking' });
      }
    } catch (notifErr) { console.error('Notification error:', notifErr); }

    res.status(201).json(booking);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



// Owner: resolve booking id → stadium_id (for notification redirect)
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

// Player: view my bookings
router.get('/mine', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*, s.name AS stadium_name, s.city AS stadium_city, s.country AS stadium_country,
              s.price_per_hour, s.phone AS stadium_phone
       FROM bookings b JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.player_id=$1 ORDER BY b.day_of_week, b.booked_start`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});




// Player: cancel own booking — restores the slot
router.patch('/:id/cancel', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch BEFORE updating so we have the original status
    const fetchRes = await client.query(
      `SELECT * FROM bookings WHERE id=$1 AND player_id=$2 AND status IN ('pending','confirmed')`,
      [req.params.id, req.user.id]
    );
    if (!fetchRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }

    const b = fetchRes.rows[0];

    const bRes = await client.query(
      `UPDATE bookings SET status='cancelled',updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );

    // Only restore if confirmed — confirmed bookings split the slot, pending ones did not
    if (b.status === 'confirmed') {
      await restoreSlot(client, b);
    }

    // Notify the owner that the player cancelled
    try {
      const infoRes = await client.query(
        `SELECT u.name AS player_name, s.name AS stadium_name, s.owner_id
         FROM users u, stadiums s WHERE u.id=$1 AND s.id=$2`,
        [b.player_id, b.stadium_id]
      );
      if (infoRes.rows.length) {
        const { player_name, stadium_name, owner_id } = infoRes.rows[0];
        const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][b.day_of_week];
        const timeStr = `${String(b.booked_start).slice(0,5)}–${String(b.booked_end).slice(0,5)}`;
        await client.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1,'booking_cancelled',$2,$3,'booking')`,
          [owner_id,
           `❌ ${player_name} cancelled their booking at ${stadium_name} on ${dayName} (${timeStr})`,
           b.id]
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



// Owner: view all bookings for a stadium
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
         b.created_at DESC`,
      [req.params.stadiumId]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Owner: confirm or cancel a booking
// On CONFIRM → split the parent slot into up to 2 remaining pieces
// On CANCEL  → restore the slot
router.patch('/:id/status', authenticate, requireOwner, async (req, res) => {
  const { status } = req.body;
  if (!['confirmed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify owner owns the stadium
    const bRes = await client.query(
      `SELECT b.* FROM bookings b
       JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.id=$1 AND s.owner_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!bRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }

    const b = bRes.rows[0];
    if (b.status === status) { await client.query('ROLLBACK'); return res.json(b); }

    // Update booking status
    const updated = await client.query(
      'UPDATE bookings SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, b.id]
    );

    if (status === 'confirmed') {
      // Find other pending bookings that overlap this confirmed slot — auto-cancel them
      const overlapping = await client.query(
        `SELECT b.*, u.name AS player_name FROM bookings b
         JOIN users u ON b.player_id = u.id
         WHERE b.stadium_id=$1 AND b.day_of_week=$2 AND b.status='pending' AND b.id != $3
           AND b.booked_start < $5::time AND b.booked_end > $4::time`,
        [b.stadium_id, b.day_of_week, b.id, b.booked_start, b.booked_end]
      );

      // Auto-cancel each conflicting pending booking and notify those players
      for (const ob of overlapping.rows) {
        await client.query(
          `UPDATE bookings SET status='cancelled', updated_at=NOW() WHERE id=$1`,
          [ob.id]
        );
        const stRes = await client.query('SELECT name FROM stadiums WHERE id=$1', [b.stadium_id]);
        const stadiumName = stRes.rows[0]?.name || 'the stadium';
        const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][ob.day_of_week];
        const timeStr = `${String(ob.booked_start).slice(0,5)}–${String(ob.booked_end).slice(0,5)}`;
        await client.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1,'booking_cancelled_by_owner',$2,$3,'booking')`,
          [ob.player_id,
           `❌ Your booking at ${stadiumName} on ${dayName} (${timeStr}) was cancelled — another booking was confirmed for that slot`,
           ob.id]
        );
        emitNotification(ob.player_id, { type: 'booking_cancelled_by_owner' });
      }

      // Split the parent slot
      await splitSlot(client, b);

      // If there were conflicts, include a warning in the response
      if (overlapping.rows.length > 0) {
        const names = overlapping.rows.map(r => r.player_name).join(', ');
        await client.query('COMMIT');
        return res.json({ ...updated.rows[0], _warning: `${overlapping.rows.length} overlapping pending booking(s) were auto-cancelled (${names}). Those players have been notified.` });
      }
    } else if (status === 'cancelled') {
      // Only restore the schedule slot if the booking was confirmed
      // Pending bookings never touched the schedule, so nothing to restore
      if (b.status === 'confirmed') {
        await restoreSlot(client, b);
      }
    }

    // Notify the player of the owner's decision
    try {
      const infoRes = await client.query(
        `SELECT u.name AS owner_name, s.name AS stadium_name
         FROM users u, stadiums s WHERE u.id=$1 AND s.id=$2`,
        [req.user.id, b.stadium_id]
      );
      if (infoRes.rows.length) {
        const { owner_name, stadium_name } = infoRes.rows[0];
        const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][b.day_of_week];
        const timeStr = `${String(b.booked_start).slice(0,5)}–${String(b.booked_end).slice(0,5)}`;
        const msg = status === 'confirmed'
          ? `✅ ${owner_name} confirmed your booking at ${stadium_name} on ${dayName} (${timeStr})`
          : `❌ ${owner_name} cancelled your booking at ${stadium_name} on ${dayName} (${timeStr})`;
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



// Owner: delete a booking from the list (hard delete — only for cancelled/completed records)
router.delete('/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.* FROM bookings b
       JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.id=$1 AND s.owner_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Booking not found' });
    if (r.rows[0].status !== 'cancelled') return res.status(400).json({ error: 'Only cancelled bookings can be removed' });
    await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});
// Called when owner confirms a booking.
// Deletes the parent slot and inserts up to 2 new slots for the remaining time.
// e.g. parent: 10:00-19:00, booked: 12:00-14:00
//   → new slots: 10:00-12:00 and 14:00-19:00

module.exports = router;
