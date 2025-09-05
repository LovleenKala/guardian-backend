const { io } = require('socket.io-client');

const userId = process.argv[2] || process.env.USER_ID;
const wsUrl = process.argv[3] || process.env.WS_URL || 'http://localhost:3000';

if (!userId) {
  console.error('Usage: node client.js <userId> [wsUrl]');
  process.exit(1);
}

const socket = io(wsUrl, { transports: ['websocket'] });

socket.on('connect', () => {
  socket.emit('register', String(userId));
  console.log('connected', socket.id);
});

socket.on('notification:new', (payload) => {
  console.log('notification:new', payload);
});

socket.on('disconnect', (reason) => {
  console.log('disconnected', reason);
});
