import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";
import socket from "../socket";
function ChatWindow({ user, partner, onBack }) {
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoomPhoto, setZoomPhoto] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { msgId, isMe, x, y }
  const messagesEndRef = useRef(null);
  const holdTimer = useRef(null);

  const loadMessages = useCallback(async () => {
    try { setMessages(await apiCall(`/messages/${partner.partner_id}`)); }
    catch {} setLoading(false);
  }, [partner.partner_id]);

  useEffect(() => {
    loadMessages();
    const onNewMessage = (msg) => {
      if (msg.sender_id === partner.partner_id) {
        setMessages(prev => [...prev, msg]);
      }
    };
    socket.on('new_message', onNewMessage);
    return () => socket.off('new_message', onNewMessage);
  }, [loadMessages, partner.partner_id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [ctxMenu]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiCall('/messages', 'POST', { receiverId: partner.partner_id, content: newMsg });
      setMessages(prev => [...prev, { ...msg, sender_name: user.name, sender_avatar: user.avatarUrl }]);
      setNewMsg('');
    } catch {}
    setSending(false);
  };

  const deleteMessage = async (msgId, scope) => {
    setCtxMenu(null);
    try {
      await apiCall(`/messages/${msgId}`, 'DELETE', { scope });
      if (scope === 'me') {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      } else {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted_for_all: true, content: null } : m));
      }
    } catch (err) { alert(err.message); }
  };

  const onHoldStart = (e, msg, isMe) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect(); // capture NOW before timeout
    holdTimer.current = setTimeout(() => {
      setCtxMenu({ msgId: msg.id, isMe, x: rect.left, y: rect.top });
    }, 500);
  };
  const onHoldEnd = () => clearTimeout(holdTimer.current);

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      {zoomPhoto && <PhotoZoomModal name={zoomPhoto.name} src={zoomPhoto.src} onClose={() => setZoomPhoto(null)}/>}

      {/* Context menu */}
      {ctxMenu && (
        <div className="msg-ctx-menu" style={{position:'fixed',top:ctxMenu.y,left:ctxMenu.x,zIndex:9999}}
          onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
          <button onClick={() => deleteMessage(ctxMenu.msgId, 'me')}>🗑️ Delete for me</button>
          {ctxMenu.isMe && <button onClick={() => deleteMessage(ctxMenu.msgId, 'all')} style={{color:'#f87171'}}>🗑️ Delete for everyone</button>}
        </div>
      )}

      {/* Header */}
      <div className="chat-main-header">
        <button className="back-btn" onClick={onBack}><IconArrowLeft /></button>
        <div style={{cursor:'pointer'}} onClick={() => setZoomPhoto({ name: partner.partner_name, src: partner.partner_avatar })}>
          <Avatar name={partner.partner_name} src={partner.partner_avatar} size={40}/>
        </div>
        <div>
          <span className="chat-partner-name" style={{cursor:'pointer'}}
            onClick={() => setZoomPhoto({ name: partner.partner_name, src: partner.partner_avatar })}>
            {partner.partner_name}
          </span>
          {[partner.partner_city, partner.partner_country].filter(Boolean).join(', ') && <span className="chat-partner-loc"><IconMapPin /> {[partner.partner_city, partner.partner_country].filter(Boolean).join(', ')}</span>}
          {partner.partner_role && <span className="chat-partner-loc" style={{color:'#f59e0b'}}>⚽ {partner.partner_role}</span>}
        </div>
      </div>

      <div className="messages-list">
        {loading && <div className="center-spinner"><span className="spinner large" /></div>}
        {!loading && messages.length === 0 && <div className="chat-empty-hint">Say hi! 👋</div>}
        {messages.map((m, i) => {
          const isMe = m.sender_id === user.id;
          const showAvatar = !isMe && (i === 0 || messages[i-1]?.sender_id !== m.sender_id);
          const showMyAvatar = isMe && (i === messages.length-1 || messages[i+1]?.sender_id !== m.sender_id);
          const isDeleted = m.deleted_for_all;
          return (
            <div key={m.id} className={`message-row ${isMe ? 'me' : 'them'}`}>
              {!isMe && (
                showAvatar
                  ? <div style={{cursor:'pointer', flexShrink:0}} onClick={() => setZoomPhoto({ name: m.sender_name, src: m.sender_avatar })}>
                      <Avatar name={m.sender_name} src={m.sender_avatar} size={30}/>
                    </div>
                  : <div style={{ width: 30, flexShrink:0 }} />
              )}
              <div
                className={`message-bubble${isDeleted?' deleted':''}`}
                onMouseDown={!isDeleted ? (e) => onHoldStart(e, m, isMe) : undefined}
                onMouseUp={onHoldEnd} onMouseLeave={onHoldEnd}
                onTouchStart={!isDeleted ? (e) => onHoldStart(e, m, isMe) : undefined}
                onTouchEnd={onHoldEnd}
                style={!isDeleted ? {cursor:'context-menu'} : {}}
              >
                {isDeleted
                  ? <p style={{fontStyle:'italic',opacity:0.5,fontSize:13}}>🚫 This message was deleted</p>
                  : <p>{m.content}</p>
                }
                <span className="message-time">{formatTime(m.created_at)}</span>
              </div>
              {isMe && (
                showMyAvatar
                  ? <div style={{cursor:'pointer', flexShrink:0}} onClick={() => setZoomPhoto({ name: user.name, src: user.avatarUrl })}>
                      <Avatar name={user.name} src={user.avatarUrl} size={30}/>
                    </div>
                  : <div style={{ width: 30, flexShrink:0 }} />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form className="message-input-row" onSubmit={sendMessage}>
        <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
          placeholder="Type a message..." className="message-input" disabled={sending} />
        <button type="submit" disabled={!newMsg.trim() || sending}
          style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
            background: !newMsg.trim() || sending ? 'rgba(96,165,250,0.2)' : '#3b82f6',
            border: 'none', cursor: !newMsg.trim() || sending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s', color: '#fff',
          }}>
          {sending
            ? <span className="spinner sm" />
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          }
        </button>
      </form>
    </>
  );
}


function ChatPage({ user, initialPartner }) {
  const [contacts, setContacts] = useState([]); // friends + owners from conversations
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(initialPartner || null);
  const [search, setSearch] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      // Load friends + existing conversations merged into one list
      const [friends, convs] = await Promise.all([
        apiCall('/friends'),
        apiCall('/messages/conversations'),
      ]);
      // Build a map by id so we merge duplicates (friend with existing conv)
      const map = new Map();
      friends.forEach(f => map.set(f.id, {
        partner_id: f.id,
        partner_name: f.name,
        partner_city: f.city, partner_country: f.country,
        partner_avatar: f.avatar_url || null,
        partner_role: 'Friend',
        last_message: null,
        unread_count: 0,
      }));
      convs.forEach(c => {
        const existing = map.get(c.partner_id);
        map.set(c.partner_id, {
          partner_id: c.partner_id,
          partner_name: c.partner_name,
          partner_city: c.partner_city, partner_country: c.partner_country,
          partner_avatar: c.partner_avatar || existing?.partner_avatar || null,
          partner_role: existing?.partner_role || null,
          last_message: c.last_message,
          last_message_at: c.last_message_at,
          unread_count: c.unread_count,
        });
      });
      // Sort: conversations with messages first (by recency), then friends
      const sorted = [...map.values()].sort((a, b) => {
        if (a.last_message_at && b.last_message_at) return new Date(b.last_message_at) - new Date(a.last_message_at);
        if (a.last_message_at) return -1;
        if (b.last_message_at) return 1;
        return a.partner_name.localeCompare(b.partner_name);
      });
      setContacts(sorted);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // If initialPartner was passed (from stadium card), open that chat
  useEffect(() => {
    if (initialPartner) setActiveConv(initialPartner);
  }, [initialPartner]);

  const filtered = contacts.filter(c =>
    c.partner_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="chat-page">
      {/* Sidebar */}
      <div className={`chat-sidebar ${activeConv ? 'hidden-mobile' : ''}`}>
        <div className="chat-sidebar-header">
          <h2 className="page-title">Messages</h2>
          <p className="page-sub">Friends & conversations</p>
        </div>
        <div style={{ padding: '10px 16px' }}>
          <div className="search-bar" style={{ height: 36 }}>
            <span className="search-icon"><IconSearch /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." />
          </div>
        </div>
        {loading && <div className="center-spinner"><span className="spinner large" /></div>}
        {!loading && contacts.length === 0 && (
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="empty-icon"><IconChat /></div>
            <p>Add friends in the Players tab to start chatting!</p>
          </div>
        )}
        <div className="conv-list">
          {filtered.map(c => (
            <div key={c.partner_id}
              className={`conv-item ${activeConv?.partner_id === c.partner_id ? 'active' : ''}`}
              onClick={() => setActiveConv(c)}>
              <Avatar name={c.partner_name} src={c.partner_avatar} size={42} />
              <div className="conv-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="conv-name">{c.partner_name}</span>
                  {c.partner_role && <span className="conv-role-tag">{c.partner_role}</span>}
                </div>
                <span className="conv-last">
                  {c.last_message ? c.last_message.slice(0, 35) + (c.last_message.length > 35 ? '...' : '') : 'Tap to start chatting'}
                </span>
              </div>
              {c.unread_count > 0 && <span className="count-badge green">{c.unread_count}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className={`chat-main ${!activeConv ? 'hidden-mobile' : ''}`}>
        {!activeConv ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon"><IconChat /></div>
            <p>Select a friend to start chatting</p>
          </div>
        ) : (
          <ChatWindow
            user={user}
            partner={activeConv}
            onBack={() => { setActiveConv(null); loadContacts(); }}
          />
        )}
      </div>
    </div>
  );
}


export { ChatWindow, ChatPage };
