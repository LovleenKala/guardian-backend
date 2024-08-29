// config/db.js
const mongoose = require('mongoose');

const mongoDBUrl = process.env.MONGODB_URL;

mongoose.connect(mongoDBUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false 
}).then(() => {
  console.log('MongoDB connected.');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

module.exports = mongoose;
