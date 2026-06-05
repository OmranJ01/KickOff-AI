import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";

// ── Schedule Builder ──────────────────────────────────────────────
function ScheduleBuilder({ stadiumId, onClose }) {
  const [slots, setSlots] = useState({0:[],1:[],2:[],3:[],4:[],5:[],6:[]});
  const [activeDay, setActiveDay] = useState(1);
  const [addStart, setAddStart] = useState("08:00");
  const [addEnd, setAddEnd] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const TIME_OPTIONS = [];
  for (let h = 6; h <= 24; h++) TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:00`);

  useEffect(() => {
    apiCall(`/stadiums/${stadiumId}/schedule`)
      .then(data => {
        const s = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
        data.forEach(row => {
          const d = row.day_of_week;
          s[d] = [...(s[d]||[]), { slot_start:row.slot_start.slice(0,5), slot_end:row.slot_end.slice(0,5) }];
        });
        setSlots(s);
      }).catch(()=>{}).finally(()=>setLoading(false));
  }, [stadiumId]);

  const addSlot = () => {
    setError("");
    if (addStart >= addEnd) { setError("End time must be after start time"); return; }
    const existing = slots[activeDay]||[];
    const conflict = existing.some(s => !(addEnd <= s.slot_start || addStart >= s.slot_end));
    if (conflict) { setError("This slot overlaps with an existing one"); return; }
    const updated = [...existing, {slot_start:addStart,slot_end:addEnd}].sort((a,b)=>a.slot_start.localeCompare(b.slot_start));
    setSlots({...slots,[activeDay]:updated});
  };

  const removeSlot = (day, idx) => {
    const updated = [...slots[day]]; updated.splice(idx,1); setSlots({...slots,[day]:updated});
  };

  const copyToAll = () => {
    const base = slots[activeDay];
    const n = {}; for(let i=0;i<7;i++) n[i]=[...base]; setSlots(n);
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const allSlots = [];
      for(let d=0;d<7;d++) (slots[d]||[]).forEach(s=>allSlots.push({day_of_week:d,slot_start:s.slot_start,slot_end:s.slot_end,is_available:true}));
      await apiCall(`/stadiums/${stadiumId}/schedule`,"PUT",{slots:allSlots});
      onClose(true);
    } catch(err){ setError(err.message); }
    finally{ setSaving(false); }
  };

  const totalSlots = Object.values(slots).reduce((a,v)=>a+v.length,0);

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose(false)}>
      <div className="modal schedule-modal">
        <div className="modal-header">
          <div><h2 className="modal-title">Weekly Schedule</h2><p style={{fontSize:12,color:"var(--text-muted)",marginTop:3}}>{totalSlots} slots configured</p></div>
          <button className="modal-close" onClick={()=>onClose(false)}><IconX/></button>
        </div>
        <div className="schedule-body">
          <div className="day-tabs">
            {DAYS_SHORT.map((d,i)=>(
              <button key={i} className={`day-tab ${activeDay===i?"active":""}`} onClick={()=>setActiveDay(i)}>
                {d}{slots[i]?.length>0&&<span className="day-dot">{slots[i].length}</span>}
              </button>
            ))}
          </div>
          <div className="schedule-day-content">
            <div className="schedule-day-label">{DAYS[activeDay]}</div>
            <div className="slot-list">
              {(slots[activeDay]||[]).length===0&&<div className="slot-empty">No slots for {DAYS[activeDay]} — add below</div>}
              {(slots[activeDay]||[]).map((s,i)=>(
                <div key={i} className="slot-row">
                  <span className="slot-time">{s.slot_start}</span>
                  <span className="slot-dash">→</span>
                  <span className="slot-time">{s.slot_end}</span>
                  <button className="slot-remove" onClick={()=>removeSlot(activeDay,i)}><IconX/></button>
                </div>
              ))}
            </div>
            <div className="add-slot-row">
              <select value={addStart} onChange={e=>setAddStart(e.target.value)} className="time-select">
                {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <span className="slot-dash">→</span>
              <select value={addEnd} onChange={e=>setAddEnd(e.target.value)} className="time-select">
                {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <button className="btn-add-slot" onClick={addSlot}><IconPlus/> Add</button>
            </div>
            {error&&<div className="error-msg" style={{marginTop:8}}>{error}</div>}
            <button className="copy-all-btn" onClick={copyToAll}>Copy {DAYS[activeDay]}'s slots to all days</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={()=>onClose(false)}>Cancel</button>
          <button className="submit-btn" style={{flex:1}} onClick={save} disabled={saving}>{saving?<span className="spinner"/>:"Save Schedule"}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  STADIUM FORM MODAL
// ══════════════════════════════════════════════════════════════════
const EMPTY_FORM = {name:"",city:"",country:"",description:"",price_per_hour:"",capacity:"",surface:"grass",phone:"",open_time:"08:00",close_time:"22:00"};

function StadiumModal({ stadium, onClose, onSave }) {
  const [form, setForm] = useState(stadium ? {
    name:stadium.name, city:stadium.city||"", country:stadium.country||"", description:stadium.description||"",
    price_per_hour:stadium.price_per_hour, capacity:stadium.capacity||"",
    surface:stadium.surface||"grass", phone:stadium.phone||"",
    open_time:stadium.open_time?.slice(0,5)||"08:00", close_time:stadium.close_time?.slice(0,5)||"22:00",
    image_url: stadium.image_url||null,
  } : {...EMPTY_FORM, image_url: null});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = (e) => setForm({...form,[e.target.name]:e.target.value});
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      if(stadium) await apiCall(`/stadiums/${stadium.id}`,"PUT",form);
      else await apiCall("/stadiums","POST",form);
      onSave();
    } catch(err){setError(err.message);}
    finally{setLoading(false);}
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{stadium?"Edit Stadium":"Add New Stadium"}</h2>
          <button className="modal-close" onClick={onClose}><IconX/></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          {/* Stadium photo */}
          <div className="field">
            <label>Stadium Photo</label>
            <div style={{display:'flex',alignItems:'flex-start',gap:16}}>
              <ImagePicker
                value={form.image_url}
                onChange={v => setForm({...form, image_url: v})}
                width={120} height={80} round={false}
                label="Add Photo"
              />
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
                <div className="field" style={{margin:0}}><label>Stadium Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Green Arena" required/></div>
                <div className="form-row" style={{margin:0}}>
                  <div className="field" style={{margin:0}}><label>City *</label><input name="city" value={form.city} onChange={handle} placeholder="Madrid" required/></div>
                  <div className="field" style={{margin:0}}><label>Country *</label><input name="country" value={form.country} onChange={handle} placeholder="Spain" required/></div>
                </div>
              </div>
            </div>
          </div>
          <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handle} placeholder="Describe your stadium..." rows={3}/></div>
          <div className="form-row">
            <div className="field"><label>Price per Hour (₪) *</label><input name="price_per_hour" type="number" min="0" step="0.01" value={form.price_per_hour} onChange={handle} placeholder="150" required/></div>
            <div className="field"><label>Capacity</label><input name="capacity" type="number" min="2" value={form.capacity} onChange={handle} placeholder="22"/></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Surface</label><select name="surface" value={form.surface} onChange={handle}><option value="grass">Grass</option><option value="artificial">Artificial Turf</option><option value="futsal">Futsal</option><option value="indoor">Indoor</option></select></div>
            <div className="field"><label>Phone</label><input name="phone" value={form.phone} onChange={handle} placeholder="050-1234567"/></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Opens At</label><input name="open_time" type="time" value={form.open_time} onChange={handle}/></div>
            <div className="field"><label>Closes At</label><input name="close_time" type="time" value={form.close_time} onChange={handle}/></div>
          </div>
          {error&&<div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" disabled={loading} style={{flex:1}}>{loading?<span className="spinner"/>:stadium?"Save Changes":"Create Stadium"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PLAYER: BOOK SLOT MODAL — full monthly calendar + time range picker
// ══════════════════════════════════════════════════════════════════
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_WDAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const STATUS_CLS  = { available:'cal-available', partial:'cal-partial', full:'cal-full', closed:'cal-closed', past:'cal-past' };

function BookSlotModal({ stadium, onClose, onBooked }) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [viewYear,    setViewYear]    = useState(today.getFullYear());
  const [viewMonth,   setViewMonth]   = useState(today.getMonth() + 1); // 1-12
  const [dayStatus,   setDayStatus]   = useState([]);
  const [loadingMonth,setLoadingMonth]= useState(true);
  const [selectedDate,setSelectedDate]= useState('');
  const [slotsData,   setSlotsData]   = useState({ slots:[], bookings:[], pending:[] });
  const [loadingSlots,setLoadingSlots]= useState(false);
  const [bookedStart, setBookedStart] = useState('');
  const [bookedEnd,   setBookedEnd]   = useState('');
  const [note,        setNote]        = useState('');
  const [booking,     setBooking]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  // Load month availability whenever month/year changes
  useEffect(() => {
    setLoadingMonth(true);
    setSelectedDate(''); setBookedStart(''); setBookedEnd('');
    apiCall(`/stadiums/${stadium.id}/month-availability?year=${viewYear}&month=${viewMonth}`)
      .then(d => setDayStatus(d))
      .catch(() => setDayStatus([]))
      .finally(() => setLoadingMonth(false));
  }, [stadium.id, viewYear, viewMonth]);

  // Load slot details when a day is clicked
  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true); setBookedStart(''); setBookedEnd(''); setError('');
    apiCall(`/stadiums/${stadium.id}/date-slots?date=${selectedDate}`)
      .then(d => setSlotsData(d))
      .catch(() => setSlotsData({ slots:[], bookings:[], pending:[] }))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, stadium.id]);

  const freeWindows  = computeFreeWindows(slotsData.slots, slotsData.bookings);
  const startOptions = validStartTimes(freeWindows);
  const endOptions   = bookedStart ? validEndTimes(toMin(bookedStart), freeWindows) : [];
  const pendingCount = (slotsData.pending || []).length;
  const duration     = bookedStart && bookedEnd ? (toMin(bookedEnd) - toMin(bookedStart)) / 60 : 0;
  const price        = duration * Number(stadium.price_per_hour);

  const firstDay    = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const curMonthStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const viewMonthStr= `${viewYear}-${String(viewMonth).padStart(2,'0')}`;
  const canGoPrev   = viewMonthStr > curMonthStr;
  const pad = n => String(n).padStart(2, '0');

  const statusMap = {};
  for (const d of dayStatus) statusMap[d.date] = d.status;

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  const handleBook = async () => {
    if (!selectedDate || !bookedStart || !bookedEnd) return;
    setBooking(true); setError('');
    try {
      await apiCall('/bookings', 'POST', {
        stadium_id: stadium.id,
        booking_date: selectedDate,
        booked_start: bookedStart,
        booked_end: bookedEnd,
        note: note || null,
      });
      setSuccess(true);
      setTimeout(() => onBooked(), 1800);
    } catch (err) { setError(err.message); }
    finally { setBooking(false); }
  };

  const fmtSelected = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const color = SURFACE_COLOR[stadium.surface] || '#4ade80';

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal booking-modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Book a Slot</h2>
            <p style={{fontSize:13,color:'var(--text-muted)',marginTop:2}}>
              {stadium.name} · <span style={{color}}>₪{Number(stadium.price_per_hour).toLocaleString()}/hr</span>
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><IconX/></button>
        </div>

        {success ? (
          <div className="booking-success">
            <div className="success-icon">✓</div>
            <p>Booking request sent!</p>
            <p style={{fontSize:13,color:'var(--text-muted)'}}>Waiting for owner confirmation</p>
          </div>
        ) : (
          <div className="modal-form">

            {/* Monthly calendar */}
            <div className="book-calendar">
              <div className="book-cal-nav">
                <button className="cal-nav-btn" onClick={prevMonth} disabled={!canGoPrev}>‹</button>
                <span className="cal-month-label">{MONTHS_LONG[viewMonth-1]} {viewYear}</span>
                <button className="cal-nav-btn" onClick={nextMonth}>›</button>
              </div>

              <div className="cal-legend">
                <span className="cal-legend-item"><span className="cal-dot available"/>Available</span>
                <span className="cal-legend-item"><span className="cal-dot partial"/>Partial</span>
                <span className="cal-legend-item"><span className="cal-dot full"/>Full</span>
                <span className="cal-legend-item"><span className="cal-dot closed"/>Closed</span>
              </div>

              <div className="cal-weekdays">
                {CAL_WDAYS.map(d=><span key={d} className="cal-weekday">{d}</span>)}
              </div>

              {loadingMonth ? (
                <div className="cal-loading"><span className="spinner sm" style={{marginRight:6}}/>Loading calendar…</div>
              ) : (
                <div className="cal-grid">
                  {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`} className="cal-cell empty"/>)}
                  {Array(daysInMonth).fill(null).map((_,i)=>{
                    const day = i + 1;
                    const dateStr = `${viewYear}-${pad(viewMonth)}-${pad(day)}`;
                    const status = statusMap[dateStr] || 'closed';
                    const clickable = status === 'available' || status === 'partial';
                    const isSel = selectedDate === dateStr;
                    const isToday = dateStr === todayStr;
                    return (
                      <div
                        key={dateStr}
                        className={`cal-cell ${STATUS_CLS[status]||''} ${isSel?'selected':''} ${isToday?'today':''} ${clickable?'clickable':''}`}
                        onClick={()=>clickable&&setSelectedDate(dateStr)}
                        title={status.charAt(0).toUpperCase()+status.slice(1)}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Time picker — shown below calendar when date selected */}
            {selectedDate && (
              <div className="cal-selected-section">
                <div className="cal-selected-header">
                  <span className="cal-selected-date">{fmtSelected(selectedDate)}</span>
                  <button className="cal-clear-date" onClick={()=>{setSelectedDate('');setBookedStart('');setBookedEnd('');}}>Change date</button>
                </div>

                {loadingSlots && <div className="center-spinner" style={{padding:16}}><span className="spinner large"/></div>}

                {!loadingSlots && freeWindows.length === 0 && (
                  <div className="slot-empty" style={{padding:'10px 0',fontSize:13}}>No free windows on this date — try another day</div>
                )}

                {!loadingSlots && freeWindows.length > 0 && (
                  <>
                    <div className="free-windows">
                      {freeWindows.map((w,i)=>(
                        <div key={i} className="free-window-chip">
                          <IconClock/><span>{fromMin(w.start)}</span><IconArrow/><span>{fromMin(w.end)}</span>
                          <span className="free-window-dur">{(w.end-w.start)/60}h free</span>
                        </div>
                      ))}
                    </div>
                    {pendingCount > 0 && (
                      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#facc15',margin:'6px 0',padding:'5px 10px',background:'rgba(250,204,21,0.07)',border:'1px solid rgba(250,204,21,0.18)',borderRadius:8}}>
                        <span>⏳</span><span>{pendingCount} pending request{pendingCount>1?'s':''} — still bookable</span>
                      </div>
                    )}

                    <div className="time-range-picker" style={{marginTop:12}}>
                      <div className="time-range-field">
                        <span className="time-range-label">From</span>
                        <select value={bookedStart} onChange={e=>{setBookedStart(e.target.value);setBookedEnd('');setError('');}} className="time-select">
                          <option value="">-- Start --</option>
                          {startOptions.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="time-range-arrow"><IconArrow/></div>
                      <div className="time-range-field">
                        <span className="time-range-label">To</span>
                        <select value={bookedEnd} onChange={e=>{setBookedEnd(e.target.value);setError('');}} className="time-select" disabled={!bookedStart}>
                          <option value="">-- End --</option>
                          {endOptions.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    {duration > 0 && (
                      <div className="price-preview">
                        <div className="price-preview-row">
                          <span>{duration}h × ₪{Number(stadium.price_per_hour).toLocaleString()}</span>
                          <span className="price-total">₪{price.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {bookedStart && bookedEnd && (
              <div className="field">
                <label>Note <span className="optional">(optional)</span></label>
                <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Team of 10 players..."/>
              </div>
            )}

            {error && <div className="error-msg">{error}</div>}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="submit-btn" style={{flex:1}} onClick={handleBook} disabled={!selectedDate||!bookedStart||!bookedEnd||booking}>
                {booking ? <span className="spinner"/> :
                  (selectedDate && bookedStart && bookedEnd)
                    ? `Book ${bookedStart}–${bookedEnd} · ${new Date(selectedDate+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`
                    : 'Select a date and time'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OWNER: BOOKING MANAGEMENT
// ══════════════════════════════════════════════════════════════════
function BookingsPanel({ stadiumId, stadiumName }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async()=>{ setLoading(true); try{setBookings(await apiCall(`/bookings/stadium/${stadiumId}`));}catch{} setLoading(false); },[stadiumId]);
  useEffect(()=>{load();},[load]);

  const updateStatus = async (id, status) => {
    setActionLoading(id);
    try {
      const result = await apiCall(`/bookings/${id}/status`, "PATCH", { status });
      await load();
      if (result._warning) {
        setTimeout(() => alert(`⚠️ ${result._warning}`), 100);
      }
    } catch {}
    setActionLoading(null);
  };

  const deleteBooking = async (id) => {
    if (!window.confirm('Remove this booking from the list? This cannot be undone.')) return;
    setActionLoading(`del-${id}`);
    try { await apiCall(`/bookings/${id}`, 'DELETE'); await load(); } catch {}
    setActionLoading(null);
  };

  const filtered = bookings.filter(b=>
    (!filterDate || (b.booking_date && b.booking_date.slice(0,10) === filterDate)) &&
    (filterStatus==="all"||b.status===filterStatus)
  );

  const fmtBookingDate = (b) => {
    if (b.booking_date) return new Date(String(b.booking_date).slice(0,10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    return DAYS[b.day_of_week] || '—';
  };

  // Find which pending bookings overlap each other (date + time)
  const pendingBookings = bookings.filter(b => b.status === 'pending');
  const overlapMap = new Map();
  for (let i = 0; i < pendingBookings.length; i++) {
    for (let j = i + 1; j < pendingBookings.length; j++) {
      const a = pendingBookings[i], b2 = pendingBookings[j];
      const sameDate = a.booking_date && b2.booking_date
        ? a.booking_date.slice(0,10) === b2.booking_date.slice(0,10)
        : a.day_of_week === b2.day_of_week;
      if (sameDate &&
          toMin(a.booked_start) < toMin(b2.booked_end) &&
          toMin(a.booked_end) > toMin(b2.booked_start)) {
        if (!overlapMap.has(a.id)) overlapMap.set(a.id, []);
        if (!overlapMap.has(b2.id)) overlapMap.set(b2.id, []);
        overlapMap.get(a.id).push({ name: b2.player_name, time: `${b2.booked_start?.slice(0,5)}–${b2.booked_end?.slice(0,5)}` });
        overlapMap.get(b2.id).push({ name: a.player_name, time: `${a.booked_start?.slice(0,5)}–${a.booked_end?.slice(0,5)}` });
      }
    }
  }
  const overlappingIds = new Set(overlapMap.keys());

  return (
    <div className="bookings-panel">
      <div className="bookings-panel-header">
        <h3 className="section-title">Bookings — {stadiumName}</h3>
        <div className="bookings-filters">
          <input
            type="date"
            value={filterDate}
            onChange={e=>setFilterDate(e.target.value)}
            className="filter-select"
            title="Filter by specific date"
            style={{colorScheme:'dark'}}
          />
          {filterDate && <button onClick={()=>setFilterDate('')} className="clear-filters" style={{padding:'6px 10px'}}>✕</button>}
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="filter-select">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading && <div className="center-spinner"><span className="spinner large"/></div>}
      {!loading && filtered.length===0 && <div className="empty-state"><div className="empty-icon"><IconBookmark/></div><p>No bookings{filterDate||filterStatus!=="all"?" matching filters":""}</p></div>}

      {!loading && overlappingIds.size > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'rgba(250,204,21,0.10)',border:'1px solid rgba(250,204,21,0.35)',borderRadius:12,marginBottom:12,color:'#facc15',fontWeight:600,fontSize:13}}>
          <span style={{fontSize:18}}>⚠️</span>
          <span>{overlappingIds.size} pending booking{overlappingIds.size>1?'s':''} overlap each other — review carefully before confirming. Confirming one will auto-cancel the others.</span>
        </div>
      )}

      <div className="booking-list">
        {filtered.map(b=>{
          const conflicts = overlapMap.get(b.id) || [];
          const hasConflict = conflicts.length > 0;
          return (
          <div key={b.id} style={{display:'flex',flexDirection:'column',gap:0}}>
            {hasConflict && (
              <div className="overlap-flag" style={{borderBottomLeftRadius:0,borderBottomRightRadius:0,marginBottom:0,borderBottom:'none',display:'flex',alignItems:'flex-start',gap:8,flexWrap:'wrap'}}>
                <span style={{flexShrink:0}}>⚠️ Conflicts with:</span>
                {conflicts.map((c,ci) => (
                  <span key={ci} style={{background:'rgba(250,204,21,0.15)',border:'1px solid rgba(250,204,21,0.35)',borderRadius:6,padding:'1px 8px',fontSize:12,whiteSpace:'nowrap'}}>
                    {c.name} · {c.time}
                  </span>
                ))}
                <span style={{fontSize:12,opacity:0.75,marginLeft:'auto'}}>Confirming this will auto-cancel the others</span>
              </div>
            )}
            <div className={`booking-card owner${hasConflict ? ' overlap-warning' : ''}`} style={hasConflict?{borderTopLeftRadius:0,borderTopRightRadius:0}:{}}>
            <div className="booking-card-left">
              <Avatar name={b.player_name} src={b.player_avatar} size={36}/>
              <div>
                <div className="booking-player-name">{b.player_name}</div>
                <div className="booking-meta">{b.player_email}</div>
              </div>
            </div>
            <div className="booking-slot-info">
              <span className="booking-day">{fmtBookingDate(b)}</span>
              <span className="booking-time">{b.booked_start?.slice(0,5)} – {b.booked_end?.slice(0,5)}</span>
              {b.note && <span className="booking-note">"{b.note}"</span>}
            </div>
            <div className="booking-card-right">
              <span className="status-badge" style={{color:STATUS_COLOR[b.status],background:STATUS_BG[b.status],borderColor:`${STATUS_COLOR[b.status]}40`}}>{b.status}</span>
              {b.status==="pending" && (
                <div className="booking-actions">
                  <button className="action-btn success" onClick={()=>updateStatus(b.id,"confirmed")} disabled={actionLoading===b.id}>
                    {actionLoading===b.id?<span className="spinner sm"/>:<><IconCheck/> Confirm</>}
                  </button>
                  <button className="action-btn danger" onClick={()=>updateStatus(b.id,"cancelled")} disabled={actionLoading===b.id}><IconX/></button>
                </div>
              )}
              {b.status === 'cancelled' && (
                <button
                  className="action-btn danger"
                  onClick={() => deleteBooking(b.id)}
                  disabled={actionLoading===`del-${b.id}`}
                  title="Remove from list"
                  style={{marginTop:6,fontSize:11,padding:'4px 10px',opacity:0.6}}
                >
                  {actionLoading===`del-${b.id}` ? <span className="spinner sm"/> : <><IconTrash/> Remove</>}
                </button>
              )}
            </div>
          </div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OWNER: ANALYTICS MODAL
// ══════════════════════════════════════════════════════════════════
const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function AnalyticsModal({ stadium, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall(`/stadiums/${stadium.id}/analytics`)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [stadium.id]);

  const dowMap = {};
  if (data) for (const r of data.byDow) dowMap[r.dow] = r.bookings;
  const maxDow = data ? Math.max(...Array.from({length:7},(_,i)=>dowMap[i]||0), 1) : 1;
  const maxHour = data?.popularHours?.[0]?.count || 1;

  const last30 = [];
  if (data) {
    const dateMap = {};
    for (const r of data.last30Days) dateMap[r.date] = r.confirmed;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      last30.push({ date: dateStr, count: dateMap[dateStr] || 0 });
    }
  }
  const maxDay = last30.length ? Math.max(...last30.map(d => d.count), 1) : 1;

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal analytics-modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Analytics</h2>
            <p style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>{stadium.name}</p>
          </div>
          <button className="modal-close" onClick={onClose}><IconX/></button>
        </div>

        {loading && <div className="center-spinner" style={{padding:40}}><span className="spinner large"/></div>}

        {!loading && data && (
          <div className="analytics-body">

            {/* Stat cards */}
            <div className="analytics-stats-grid">
              <div className="analytics-stat-card">
                <div className="analytics-stat-value">{data.thisMonth.confirmed}</div>
                <div className="analytics-stat-label">Bookings this month</div>
              </div>
              <div className="analytics-stat-card green">
                <div className="analytics-stat-value">₪{data.thisMonth.revenue.toLocaleString()}</div>
                <div className="analytics-stat-label">Revenue this month</div>
              </div>
              <div className="analytics-stat-card">
                <div className="analytics-stat-value">{data.allTime.confirmed}</div>
                <div className="analytics-stat-label">All-time bookings</div>
              </div>
              <div className="analytics-stat-card yellow">
                <div className="analytics-stat-value">{data.thisMonth.pending}</div>
                <div className="analytics-stat-label">Pending now</div>
              </div>
            </div>

            {/* Bookings by day of week */}
            <div className="analytics-section">
              <div className="analytics-section-title">Bookings by Day</div>
              <div className="analytics-dow-chart">
                {DOW_LABELS.map((d, i) => {
                  const count = dowMap[i] || 0;
                  const pct = Math.round((count / maxDow) * 100);
                  return (
                    <div key={i} className="analytics-dow-col">
                      <div className="analytics-dow-bar-wrap">
                        <div className="analytics-dow-bar" style={{height:`${Math.max(pct, count?5:0)}%`}}/>
                      </div>
                      <div className="analytics-dow-count">{count || ''}</div>
                      <div className="analytics-dow-label">{d}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Popular hours */}
            {data.popularHours.length > 0 && (
              <div className="analytics-section">
                <div className="analytics-section-title">Popular Time Slots</div>
                <div className="analytics-hours-list">
                  {data.popularHours.map((h, i) => (
                    <div key={i} className="analytics-hour-row">
                      <span className="analytics-hour-label">{String(h.hour).padStart(2,'0')}:00</span>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill" style={{width:`${Math.round((h.count/maxHour)*100)}%`}}/>
                      </div>
                      <span className="analytics-bar-val">{h.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Last 30 days sparkline */}
            <div className="analytics-section">
              <div className="analytics-section-title">Last 30 Days</div>
              <div className="analytics-sparkline">
                {last30.map((d, i) => (
                  <div
                    key={i}
                    className="analytics-spark-bar"
                    style={{height:`${Math.max((d.count/maxDay)*100, d.count?8:2)}%`, opacity:d.count?1:0.18}}
                    title={`${d.date}: ${d.count} booking${d.count!==1?'s':''}`}
                  />
                ))}
              </div>
            </div>

            <div style={{textAlign:'center',fontSize:12,color:'var(--text-muted)'}}>
              All-time revenue: <span style={{color:'var(--primary)',fontWeight:700}}>₪{data.allTime.revenue.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OWNER: STADIUM CARD
// ══════════════════════════════════════════════════════════════════
function StadiumCard({ stadium, onEdit, onDelete, onToggle, onSchedule, onViewBookings, onAnalytics }) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const color = SURFACE_COLOR[stadium.surface]||"#4ade80";

  return (
    <div className={`stadium-card ${!stadium.is_active?"inactive":""}`}>
      {stadium.image_url && (
        <div className="stadium-card-img">
          <img src={stadium.image_url} alt={stadium.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          <div className="stadium-card-img-overlay"/>
          <div className={`stadium-status-badge ${stadium.is_active?"active":"inactive"}`} style={{position:'absolute',top:10,right:10}}>{stadium.is_active?"Active":"Inactive"}</div>
        </div>
      )}
      <div className="stadium-card-header">
        <div className="stadium-surface-dot" style={{background:color}}/>
        <div className="stadium-card-info">
          <h3 className="stadium-card-name">{stadium.name}</h3>
          <span className="stadium-card-meta"><IconMapPin/> {[stadium.city, stadium.country].filter(Boolean).join(', ')}</span>
        </div>
        {!stadium.image_url && <div className={`stadium-status-badge ${stadium.is_active?"active":"inactive"}`}>{stadium.is_active?"Active":"Inactive"}</div>}
      </div>
      {stadium.description&&<p className="stadium-card-desc">{stadium.description}</p>}
      <div className="stadium-card-stats">
        <div className="stat"><IconDollar/><span>₪{Number(stadium.price_per_hour).toLocaleString()}/hr</span></div>
        {stadium.capacity&&<div className="stat"><IconUsers2/><span>{stadium.capacity} players</span></div>}
        <div className="stat"><span className="surface-tag" style={{color,borderColor:`${color}40`,background:`${color}10`}}>{SURFACES[stadium.surface]||stadium.surface}</span></div>
        <div className="stat"><IconClock/><span>{stadium.open_time?.slice(0,5)} – {stadium.close_time?.slice(0,5)}</span></div>
        {stadium.phone&&<div className="stat"><IconPhone/><span>{stadium.phone}</span></div>}
      </div>
      <div className="stadium-card-actions">
        <button className="action-btn muted" onClick={()=>onSchedule(stadium)}><IconCalendar/><span>Schedule</span></button>
        <button className="action-btn muted" onClick={()=>onViewBookings(stadium)}><IconBookmark/><span>Bookings</span></button>
        <button className="action-btn muted" onClick={()=>onAnalytics(stadium)} style={{color:'#a78bfa',borderColor:'rgba(167,139,250,0.3)'}}><IconFilter/><span>Stats</span></button>
        <button className="action-btn primary" onClick={()=>onEdit(stadium)}><IconEdit/><span>Edit</span></button>
        <button className="action-btn muted" onClick={async()=>{setToggling(true);await onToggle(stadium.id);setToggling(false);}} disabled={toggling}>{toggling?<span className="spinner sm"/>:<><IconToggle on={stadium.is_active}/><span>{stadium.is_active?"Off":"On"}</span></>}</button>
        <button className="action-btn danger" onClick={async()=>{if(!window.confirm(`Delete "${stadium.name}"?`))return;setDeleting(true);await onDelete(stadium.id);setDeleting(false);}} disabled={deleting}>{deleting?<span className="spinner sm"/>:<IconTrash/>}</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OWNER: STADIUMS PAGE
// ══════════════════════════════════════════════════════════════════
function OwnerStadiumsPage({ initialBookingStadiumId }) {
  const [stadiums, setStadiums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [schedulingStadium, setSchedulingStadium] = useState(null);
  const [bookingsStadium, setBookingsStadium] = useState(null);
  const [analyticsStadium, setAnalyticsStadium] = useState(null);

  const load = useCallback(async()=>{
    setLoading(true);
    try {
      const data = await apiCall("/stadiums/mine");
      setStadiums(data);
      if (initialBookingStadiumId) {
        const target = data.find(s => s.id === Number(initialBookingStadiumId));
        if (target) setBookingsStadium(target);
      }
    } catch {}
    setLoading(false);
  },[initialBookingStadiumId]);
  useEffect(()=>{load();},[load]);

  return (
    <div className="stadiums-page">
      <div className="stadiums-header">
        <div><h2 className="page-title">My Stadiums</h2><p className="page-sub">{stadiums.length} total · {stadiums.filter(s=>s.is_active).length} active</p></div>
        <button className="submit-btn" style={{width:"auto",padding:"10px 20px"}} onClick={()=>{setEditing(null);setShowModal(true);}}><IconPlus/> Add Stadium</button>
      </div>
      {loading&&<div className="center-spinner"><span className="spinner large"/></div>}
      {!loading&&stadiums.length===0&&(
        <div className="empty-state large">
          <div className="empty-icon large"><IconStadium/></div>
          <p className="empty-title">No stadiums yet</p>
          <p>Add your first stadium to start receiving bookings</p>
          <button className="cta-btn" style={{marginTop:16,width:"auto"}} onClick={()=>setShowModal(true)}><IconPlus/> Add Your First Stadium</button>
        </div>
      )}
      <div className="stadium-grid">
        {stadiums.map(s=>(
          <StadiumCard key={s.id} stadium={s}
            onEdit={s=>{setEditing(s);setShowModal(true);}}
            onDelete={async id=>{try{await apiCall(`/stadiums/${id}`,"DELETE");await load();}catch{}}}
            onToggle={async id=>{try{await apiCall(`/stadiums/${id}/toggle`,"PATCH");await load();}catch{}}}
            onSchedule={s=>setSchedulingStadium(s)}
            onViewBookings={s=>setBookingsStadium(s)}
            onAnalytics={s=>setAnalyticsStadium(s)}
          />
        ))}
      </div>
      {showModal&&<StadiumModal stadium={editing} onClose={()=>{setShowModal(false);setEditing(null);}} onSave={()=>{setShowModal(false);setEditing(null);load();}}/>}
      {schedulingStadium&&<ScheduleBuilder stadiumId={schedulingStadium.id} onClose={()=>setSchedulingStadium(null)}/>}
      {analyticsStadium&&<AnalyticsModal stadium={analyticsStadium} onClose={()=>setAnalyticsStadium(null)}/>}
      {bookingsStadium&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setBookingsStadium(null)}>
          <div className="modal wide-modal">
            <div className="modal-header">
              <h2 className="modal-title">Bookings</h2>
              <button className="modal-close" onClick={()=>setBookingsStadium(null)}><IconX/></button>
            </div>
            <div style={{padding:"0 28px 28px"}}><BookingsPanel stadiumId={bookingsStadium.id} stadiumName={bookingsStadium.name}/></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PLAYER: BROWSE STADIUMS
// ══════════════════════════════════════════════════════════════════
function BrowseStadiumsPage({ onMessageOwner }) {
  const [stadiums, setStadiums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', city: '', country: '', day: '', slot: '' });
  const [bookingStadium, setBookingStadium] = useState(null);
  const [reviewsStadium, setReviewsStadium] = useState(null);
  const debounceRef = useRef(null);

  const TIME_OPTIONS = [];
  for (let h = 6; h < 24; h++) TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:00`);

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.q) params.set('q', f.q);
      if (f.city) params.set('city', f.city);
      if (f.country) params.set('country', f.country);
      if (f.day !== '') {
        params.set('day', f.day);
        if (f.slot) { const end = `${String(parseInt(f.slot)+1).padStart(2,'0')}:00`; params.set('slot_start', f.slot); params.set('slot_end', end); }
      }
      setStadiums(await apiCall(`/stadiums?${params}`));
    } catch {}
    setLoading(false);
  }, []);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val, ...(key === 'day' ? { slot: '' } : {}) }));

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(filters), 350);
  }, [filters, load]);

  const hasFilters = filters.q || filters.city || filters.country || filters.day !== '';

  return (
    <div className="stadiums-page">
      <div className="stadiums-header">
        <div><h2 className="page-title">Stadiums</h2><p className="page-sub">Browse and book available stadiums</p></div>
      </div>

      {/* 4-field filter bar */}
      <div className="browse-filters" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="search-bar" style={{ flex: '2 1 160px', minWidth: 140 }}>
          <span className="search-icon"><IconSearch/></span>
          <input value={filters.q} onChange={e => setFilter('q', e.target.value)} placeholder="Stadium name..."/>
        </div>
        <input className="filter-input" value={filters.country} onChange={e => setFilter('country', e.target.value)} placeholder="🌍 Country" style={{ flex: '1 1 110px', minWidth: 100 }}/>
        <input className="filter-input" value={filters.city} onChange={e => setFilter('city', e.target.value)} placeholder="📍 City" style={{ flex: '1 1 110px', minWidth: 100 }}/>
        <select className="filter-select" value={filters.day} onChange={e => setFilter('day', e.target.value)}>
          <option value="">📅 Any Day</option>
          {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        {filters.day !== '' && (
          <select className="filter-select" value={filters.slot} onChange={e => setFilter('slot', e.target.value)}>
            <option value="">Any Time</option>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {hasFilters && <button className="clear-filters" onClick={() => setFilters({ q: '', city: '', country: '', day: '', slot: '' })}>✕ Clear</button>}
      </div>

      {loading && <div className="center-spinner" style={{ padding: 40 }}><span className="spinner large"/></div>}
      {!loading && stadiums.length === 0 && <div className="empty-state"><div className="empty-icon"><IconStadium/></div><p>{hasFilters ? 'No stadiums match your filters' : 'No active stadiums yet — owners must set their stadium to Active'}</p></div>}
      <div className="stadium-grid">
        {stadiums.map(s => {
          const color = SURFACE_COLOR[s.surface] || '#4ade80';
          return (
            <div key={s.id} className="stadium-card browse">
              {s.image_url && (
                <div className="stadium-card-img">
                  <img src={s.image_url} alt={s.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                  <div className="stadium-card-img-overlay"/>
                  <span className="surface-tag" style={{ color, borderColor:`${color}40`, background:`${color}20`, fontSize:11, position:'absolute', bottom:8, left:8 }}>{SURFACES[s.surface]}</span>
                </div>
              )}
              <div className="stadium-card-header">
                <div className="stadium-surface-dot" style={{ background: color }}/>
                <div className="stadium-card-info">
                  <h3 className="stadium-card-name">{s.name}</h3>
                  <span className="stadium-card-meta"><IconMapPin/> {[s.city, s.country].filter(Boolean).join(', ')}</span>
                </div>
                {!s.image_url && <span className="surface-tag" style={{ color, borderColor: `${color}40`, background: `${color}10`, fontSize: 11 }}>{SURFACES[s.surface]}</span>}
              </div>
              {s.description && <p className="stadium-card-desc">{s.description}</p>}
              <div className="stadium-card-stats">
                <div className="stat"><IconDollar/><span>₪{Number(s.price_per_hour).toLocaleString()}/hr</span></div>
                {s.capacity && <div className="stat"><IconUsers2/><span>{s.capacity} players</span></div>}
                <div className="stat"><IconClock/><span>{s.open_time?.slice(0,5)} – {s.close_time?.slice(0,5)}</span></div>
                {s.phone && <div className="stat"><IconPhone/><span>{s.phone}</span></div>}
              </div>
              {(s.avg_rating || s.review_count > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ display: 'inline-flex', gap: 1 }}>
                    {[1,2,3,4,5].map(i => (
                      <span key={i} style={{ fontSize: 13, color: i <= Math.round(s.avg_rating) ? '#facc15' : '#374151' }}>★</span>
                    ))}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#facc15' }}>{s.avg_rating}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({s.review_count} review{s.review_count !== 1 ? 's' : ''})</span>
                </div>
              )}
              <div className="browse-owner"><Avatar name={s.owner_name} src={s.owner_avatar} size={22}/><span>by {s.owner_name}</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="book-btn" style={{ flex: 1 }} onClick={() => setBookingStadium(s)}><IconCalendar/> Book a Slot</button>
                <button className="book-btn" style={{ flex: 1, background: 'rgba(74,222,128,0.08)', color: 'var(--primary)', border: '1px solid rgba(74,222,128,0.25)' }}
                  onClick={() => onMessageOwner && onMessageOwner({ partner_id: s.owner_id, partner_name: s.owner_name, partner_avatar: s.owner_avatar || null, partner_role: 'Stadium Owner' })}>
                  <IconChat /> Message
                </button>
                <button className="book-btn" style={{ background: 'rgba(250,204,21,0.08)', color: '#facc15', border: '1px solid rgba(250,204,21,0.25)', padding: '0 14px' }}
                  onClick={() => setReviewsStadium(s)} title="View reviews">
                  ★
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {bookingStadium&&<BookSlotModal stadium={bookingStadium} onClose={()=>setBookingStadium(null)} onBooked={()=>setBookingStadium(null)}/>}
      {reviewsStadium&&<ReviewsModal stadium={reviewsStadium} onClose={()=>{setReviewsStadium(null);load(filters);}}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  REVIEWS MODAL
// ══════════════════════════════════════════════════════════════════
function ReviewsModal({ stadium, onClose }) {
  const [data, setData] = useState({ reviews: [], avg_rating: null, total: 0 });
  const [loading, setLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [form, setForm] = useState({ rating: 0, comment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState(0);

  const load = async () => {
    setLoading(true);
    try { setData(await apiCall(`/stadiums/${stadium.id}/reviews`)); } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Check if user has a confirmed booking at this stadium
    apiCall('/bookings/mine').then(bookings => {
      const eligible = bookings.some(b => b.stadium_id === stadium.id && b.status === 'confirmed');
      setCanReview(eligible);
    }).catch(() => {});
  }, [stadium.id]);

  const myReview = data.reviews.find(r => r.is_mine);

  useEffect(() => {
    if (myReview) setForm({ rating: myReview.rating, comment: myReview.comment || '' });
  }, [myReview?.rating]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) { setError('Please select a rating'); return; }
    setSubmitting(true); setError('');
    try {
      await apiCall(`/stadiums/${stadium.id}/reviews`, 'POST', form);
      await load();
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  const deleteReview = async () => {
    try { await apiCall(`/stadiums/${stadium.id}/reviews`, 'DELETE'); await load(); setForm({ rating: 0, comment: '' }); } catch {}
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal wide-modal" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Reviews — {stadium.name}</h2>
            {data.avg_rating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 16, color: i <= Math.round(data.avg_rating) ? '#facc15' : '#374151' }}>★</span>)}
                <span style={{ fontWeight: 700, color: '#facc15' }}>{data.avg_rating}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({data.total} review{data.total !== 1 ? 's' : ''})</span>
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}><IconX/></button>
        </div>

        <div style={{ padding: '0 28px 28px' }}>
          {/* Write / Edit Review */}
          {canReview || myReview ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{myReview ? 'Your Review' : 'Write a Review'}</h3>
              <form onSubmit={submit}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {[1,2,3,4,5].map(i => (
                    <span
                      key={i}
                      style={{ fontSize: 28, cursor: 'pointer', color: i <= (hovered || form.rating) ? '#facc15' : '#374151', transition: 'color 0.1s' }}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(0)}
                      onClick={() => setForm({ ...form, rating: i })}
                    >★</span>
                  ))}
                  {form.rating > 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 6 }}>{['','Terrible','Poor','OK','Good','Excellent'][form.rating]}</span>}
                </div>
                <textarea
                  value={form.comment}
                  onChange={e => setForm({ ...form, comment: e.target.value })}
                  placeholder="Share your experience (optional)..."
                  rows={2}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={submitting || !form.rating}>
                    {submitting ? <span className="spinner" /> : myReview ? 'Update Review' : 'Submit Review'}
                  </button>
                  {myReview && (
                    <button type="button" className="action-btn danger" onClick={deleteReview}>Delete</button>
                  )}
                </div>
              </form>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔒</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>You need a <strong style={{ color: 'var(--text)' }}>confirmed booking</strong> at this stadium to leave a review.</span>
            </div>
          )}

          {/* Reviews list */}
          {loading && <div className="center-spinner"><span className="spinner large" /></div>}
          {!loading && data.reviews.length === 0 && (
            <div className="empty-state"><p>No reviews yet — be the first!</p></div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.reviews.map(r => (
              <div key={r.id} style={{
                background: 'var(--surface)', border: `1px solid ${r.is_mine ? 'rgba(74,222,128,0.35)' : 'var(--border)'}`,
                borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={r.player_name} src={r.player_avatar} size={34} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.player_name}{r.is_mine ? ' (you)' : ''}</div>
                      <div style={{ display: 'flex', gap: 1 }}>
                        {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 14, color: i <= r.rating ? '#facc15' : '#374151' }}>★</span>)}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.comment && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>"{r.comment}"</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PLAYER: MY BOOKINGS

export { ScheduleBuilder, StadiumModal, BookSlotModal, BookingsPanel, StadiumCard, OwnerStadiumsPage, BrowseStadiumsPage };
