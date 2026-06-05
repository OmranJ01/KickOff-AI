import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";
import socket from "../socket";


function ReviewModal({ booking, onClose }) {
  const [form, setForm] = useState({ rating: 0, comment: '' });
  const [hovered, setHovered] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) { setError('Please select a rating'); return; }
    setSubmitting(true); setError('');
    try {
      await apiCall(`/stadiums/${booking.stadium_id}/reviews`, 'POST', form);
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Rate {booking.stadium_name}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Share your experience</p>
          </div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        {done ? (
          <div className="booking-success">
            <div className="success-icon">✓</div>
            <p>Review submitted!</p>
          </div>
        ) : (
          <form onSubmit={submit} className="modal-form">
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {[1,2,3,4,5].map(i => (
                <span
                  key={i}
                  style={{ fontSize: 32, cursor: 'pointer', color: i <= (hovered || form.rating) ? '#facc15' : '#374151', transition: 'color 0.1s' }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setForm({ ...form, rating: i })}
                >★</span>
              ))}
            </div>
            {form.rating > 0 && <div style={{ fontSize: 13, color: '#facc15', marginBottom: 12 }}>{['','Terrible','Poor','OK','Good','Excellent'][form.rating]}</div>}
            <div className="field">
              <label>Comment <span className="optional">(optional)</span></label>
              <textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="How was the pitch, facilities, staff...?" rows={3} />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={submitting || !form.rating}>
                {submitting ? <span className="spinner" /> : 'Submit Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [reviewBooking, setReviewBooking] = useState(null);

  const load = async()=>{ 
    setLoading(true); 
    try{
    setBookings(await apiCall("/bookings/mine"));
    }
    catch{}
    
    setLoading(false); 
  };

  useEffect(()=>{load();},[]);

  useEffect(() => {
    const onNotif = (data) => {
      if (['booking_confirmed','booking_cancelled','booking_cancelled_by_owner'].includes(data?.type)) {
        load();
      }
    };
    socket.on('notification', onNotif);
    return () => socket.off('notification', onNotif);
  }, []);

  const cancel = async(id)=>{
    if(!window.confirm("Cancel this booking?")) return;
    setCancelLoading(id);
    try{await apiCall(`/bookings/${id}/cancel`,"PATCH");await load();}catch{}
    setCancelLoading(null);
  };

  const filtered = bookings.filter(b=>filterStatus==="all"||b.status===filterStatus);

  return (
    <div className="stadiums-page">
      
      <div className="stadiums-header">
        <div><h2 className="page-title">My Bookings</h2><p className="page-sub">{bookings.length} total</p></div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="filter-select">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading&&<div className="center-spinner"><span className="spinner large"/></div>}
      {!loading&&filtered.length===0&&<div className="empty-state"><div className="empty-icon"><IconBookmark/></div><p>{filterStatus!=="all"?`No ${filterStatus} bookings`:"No bookings yet — browse stadiums to book!"}</p></div>}
      
      <div className="booking-list">
        {filtered.map(b=>(

          <div key={b.id} className="booking-card">
            <div className="booking-stadium-info">
              <div className="booking-stadium-name">{b.stadium_name}</div>
              <div className="booking-meta"><IconMapPin/> {[b.stadium_city, b.stadium_country].filter(Boolean).join(', ')}</div>
            </div>

            <div className="booking-slot-info">
              <span className="booking-day">
                {b.booking_date
                  ? new Date(String(b.booking_date).slice(0,10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
                  : DAYS[b.day_of_week]}
              </span>
              <span className="booking-time">{b.booked_start?.slice(0,5)} – {b.booked_end?.slice(0,5)}</span>
              <span className="booking-price">₪{Number(b.price_per_hour).toLocaleString()}/hr</span>
              {b.note&&<span className="booking-note">"{b.note}"</span>}
            </div>

            <div className="booking-card-right">
              <span className="status-badge" style={{color:STATUS_COLOR[b.status],background:STATUS_BG[b.status],borderColor:`${STATUS_COLOR[b.status]}40`}}>{b.status}</span>
              {(b.status==="pending"||b.status==="confirmed")&&(
                <button className="action-btn danger" style={{marginTop:6}} onClick={()=>cancel(b.id)} disabled={cancelLoading===b.id}>
                  {cancelLoading===b.id?<span className="spinner sm"/>:<><IconX/> Cancel</>}
                </button>
              )}
              {b.status==="confirmed"&&(
                <button className="action-btn" style={{marginTop:6,background:'rgba(250,204,21,0.08)',border:'1px solid rgba(250,204,21,0.3)',color:'#facc15',fontSize:12}} onClick={()=>setReviewBooking(b)}>
                  ★ Review
                </button>
              )}
            </div>
          </div>
        ))}

      </div>
      {reviewBooking&&<ReviewModal booking={reviewBooking} onClose={()=>setReviewBooking(null)}/>}
    </div>
  );
}


export default MyBookingsPage;
