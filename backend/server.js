const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();
const { initSocket } = require('./socket');

const app = express();
const httpServer = http.createServer(app);
initSocket(httpServer);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api',               require('./routes/friends'));
app.use('/api/stadiums',      require('./routes/stadiums'));
app.use('/api/bookings',      require('./routes/bookings'));
app.use('/api/players',       require('./routes/players'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/groups',        require('./routes/groups'));
app.use('/api/match-results',           require('./routes/matchResults'));
app.use('/api/ai',                      require('./routes/ai'));
app.use('/api/stadiums/:id/reviews',   require('./routes/reviews'));

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
