const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;
const onlineUsers = new Map(); // userId (number) -> socketId

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] }
  });

  // Verify JWT on every connection
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    onlineUsers.set(socket.userId, socket.id);

    socket.on('join_group', ({ groupId }) => {
      socket.join(`group_${groupId}`);
    });

    socket.on('leave_group', ({ groupId }) => {
      socket.leave(`group_${groupId}`);
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(socket.userId);
    });
  });

  return io;
}

function getIo() { return io; }
function getOnlineUsers() { return onlineUsers; }

// Emit a notification event to a user if they are currently online
function emitNotification(userId, data) {
  if (!io) return;
  const socketId = onlineUsers.get(Number(userId));
  if (socketId) io.to(socketId).emit('notification', data);
}

module.exports = { initSocket, getIo, getOnlineUsers, emitNotification };
