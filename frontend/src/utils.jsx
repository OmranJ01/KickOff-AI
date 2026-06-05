
import { useState, useEffect, useCallback, useRef } from "react";

const API = (process.env.REACT_APP_API_URL || "http://localhost:5000") + "/api";
async function apiCall(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}


// ── Constants ────────────────────────────────────────────────────
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SURFACES = { grass:"Grass", artificial:"Artificial Turf", futsal:"Futsal", indoor:"Indoor" };
const SURFACE_COLOR = { grass:"#4ade80", artificial:"#60a5fa", futsal:"#fb923c", indoor:"#c084fc" };
const STATUS_COLOR = { pending:"#facc15", confirmed:"#4ade80", cancelled:"#f87171" };
const STATUS_BG = { pending:"rgba(250,204,21,0.1)", confirmed:"rgba(74,222,128,0.1)", cancelled:"rgba(248,113,113,0.1)" };

function toMin(t) { const [h,m]=(t||"00:00").split(":").map(Number); return h*60+m; }
function fromMin(m) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

// Generate HH:00 options between two times (inclusive of start, exclusive of end)
function hoursInRange(slotStart, slotEnd) {
  const s = toMin(slotStart);
  const e = toMin(slotEnd);
  const opts = [];
  for (let m = s; m <= e; m += 60) opts.push(fromMin(m));
  return opts;
}

// Given available schedule slots and existing bookings, compute truly free ranges
// Returns array of {start, end} free windows
function computeFreeWindows(slots, bookings) {
  const windows = [];
  for (const slot of slots) {
    const sStart = toMin(slot.slot_start);
    const sEnd = toMin(slot.slot_end);
    // Bookings that overlap this slot, sorted
    const overlapping = bookings
      .filter(b => toMin(b.booked_start) < sEnd && toMin(b.booked_end) > sStart)
      .sort((a,b) => toMin(a.booked_start) - toMin(b.booked_start));

    let cursor = sStart;
    for (const b of overlapping) {
      const bS = toMin(b.booked_start);
      const bE = toMin(b.booked_end);
      if (bS > cursor) windows.push({ start: cursor, end: bS });
      cursor = Math.max(cursor, bE);
    }
    if (cursor < sEnd) windows.push({ start: cursor, end: sEnd });
  }
  return windows;
}

// Given a chosen start time, return valid end options within the same free window
function validEndTimes(startMin, freeWindows) {
  const win = freeWindows.find(w => startMin >= w.start && startMin < w.end);
  if (!win) return [];
  const opts = [];
  for (let m = startMin + 60; m <= win.end; m += 60) opts.push(fromMin(m));
  return opts;
}

// Generate time options (every hour) for all free window start points
function validStartTimes(freeWindows) {
  const opts = new Set();
  for (const w of freeWindows) {
    for (let m = w.start; m < w.end; m += 60) opts.add(fromMin(m));
  }
  return [...opts].sort();
}

// ── Icons ────────────────────────────────────────────────────────
const IconBall = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 6.7 17.2M12 2a10 10 0 0 0-6.7 17.2M12 22V12M5.3 7l6.7 5 6.7-5"/></svg>);
const IconStadium = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v5M9 12v5M15 12v5"/></svg>);
const IconLogout = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>);
const IconSettings = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
const IconEye = ({ open }) => open ? (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>) : (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>);
const IconUsers = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconHome = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>);
const IconSearch = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>);
const IconCheck = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><polyline points="20,6 9,17 4,12"/></svg>);
const IconX = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
const IconUserPlus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>);
const IconUserMinus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>);
const IconMapPin = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>);
const IconClock = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>);
const IconPlus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
const IconEdit = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const IconTrash = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>);
const IconCalendar = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
const IconPhone = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.9 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.1 4.2 2 2 0 0 1 5.08 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>);
const IconDollar = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>);
const IconUsers2 = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconToggle = ({ on }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx={on?16:8} cy="12" r="3" fill="currentColor"/></svg>);
const IconFilter = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/></svg>);
const IconBell = ({ filled }) => (<svg viewBox="0 0 24 24" fill={filled?"currentColor":"none"} stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>);
const IconChat = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
const IconGroup = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconSend = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>);
const IconArrowLeft = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/></svg>);
const IconShield = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
const IconBookmark = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>);
const IconArrow = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>);

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ name, size = 38, src, onClick, editable }) {
  const initials = name ? name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";
  const hue = name ? name.charCodeAt(0)*17%360 : 120;
  return (
    <div
      className={`avatar${editable ? ' avatar-editable' : ''}`}
      style={{width:size,height:size,minWidth:size,background:src?'transparent':
        `hsl(${hue},45%,22%)`,border:`1.5px solid ${src?'rgba(61,220,104,0.35)':`hsl(${hue},45%,32%)`}`,fontSize:size*0.36,
        color:`hsl(${hue},70%,72%)`, overflow:'hidden', cursor: editable ? 'pointer' : 'default', position:'relative',
        borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}
      onClick={onClick}
    >
      {src
        ? <img src={src} alt={name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
        : initials
      }
      {editable && (
        <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',
          justifyContent:'center',opacity:0,transition:'opacity 0.2s'}}
          className="avatar-overlay">
          <svg width={size*0.32} height={size*0.32} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
      )}
    </div>
  );
}

// ── Image Picker — reusable upload widget ─────────────────────────
function ImagePicker({ value, onChange, round = false, width = 120, height = 120, label = "Upload Image" }) {
  const ref = useRef();
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Image too large (max 8MB)'); return; }
    // Resize + compress before storing (max 900px wide for stadiums, 400px for avatars)
    const maxW = round ? 400 : 900;
    const maxH = round ? 400 : 600;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxW || h > maxH) { const r = Math.min(maxW/w, maxH/h); w = Math.round(w*r); h = Math.round(h*r); }
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      onChange(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.src = url;
  };
  const radius = round ? '50%' : '12px';
  return (
    <div style={{position:'relative', width, height, flexShrink:0}}>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}} onChange={handleFile}/>
      <div
        onClick={() => ref.current.click()}
        style={{width:'100%', height:'100%', borderRadius:radius, overflow:'hidden', cursor:'pointer',
          border: value ? '2px solid rgba(61,220,104,0.4)' : '2px dashed rgba(61,220,104,0.3)',
          background: value ? 'transparent' : 'rgba(61,220,104,0.05)',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6,
          transition:'border-color 0.2s, background 0.2s', position:'relative'}}
        className="img-picker-wrap"
      >
        {value
          ? <img src={value} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          : <>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(61,220,104,0.55)" strokeWidth="1.8">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span style={{fontSize:11,color:'rgba(61,220,104,0.55)',textAlign:'center',lineHeight:1.3,padding:'0 8px'}}>{label}</span>
            </>
        }
        {/* hover overlay */}
        <div className="img-picker-overlay" style={{position:'absolute',inset:0,borderRadius:radius,
          background:'rgba(0,0,0,0.45)',display:'flex',flexDirection:'column',alignItems:'center',
          justifyContent:'center',gap:4,opacity:0,transition:'opacity 0.18s',pointerEvents:'none'}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span style={{fontSize:11,color:'white'}}>{value ? 'Change' : 'Upload'}</span>
        </div>
      </div>
      {value && (
        <button onClick={(e)=>{e.stopPropagation();onChange(null);}}
          style={{position:'absolute',top:-8,right:-8,width:22,height:22,borderRadius:'50%',
            background:'#ef4444',border:'2px solid rgba(0,0,0,0.3)',color:'white',
            fontSize:13,lineHeight:1,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
            zIndex:2}}>×</button>
      )}
    </div>
  );
}

// ── Photo Zoom Modal — click any avatar to see full photo ────────
function PhotoZoomModal({ name, src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'rgba(0,0,0,0.85)', backdropFilter:'blur(8px)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16,
      cursor:'zoom-out',
    }}>
      {src
        ? <img src={src} alt={name} onClick={e=>e.stopPropagation()} style={{
            maxWidth:'min(90vw, 480px)', maxHeight:'min(80vh, 480px)',
            borderRadius:16, objectFit:'cover',
            boxShadow:'0 20px 80px rgba(0,0,0,0.8)',
            border:'2px solid rgba(255,255,255,0.12)',
            cursor:'default',
          }}/>
        : <div style={{width:180,height:180,borderRadius:'50%',background:`hsl(${name?.charCodeAt(0)*17%360},45%,22%)`,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:64,color:`hsl(${name?.charCodeAt(0)*17%360},70%,72%)`,
            border:'3px solid rgba(255,255,255,0.15)',
          }}>
            {name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
          </div>
      }
      <span style={{color:'rgba(255,255,255,0.8)', fontSize:18, fontWeight:600, fontFamily:"'Syne',sans-serif"}}>{name}</span>
      <span style={{color:'rgba(255,255,255,0.4)', fontSize:12}}>Click anywhere to close</span>
    </div>
  );
}


export {
  apiCall,
  DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG,
  toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes,
  IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome,
  IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock,
  IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2,
  IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft,
  IconShield, IconBookmark, IconArrow,
  Avatar, ImagePicker, PhotoZoomModal
};
