// config/db.js
require('dotenv').config();
const mongoose = require('mongoose');
const seedRoles = require('../seedRoles');

const mongoDBUrl = process.env.MONGODB_URL || "mongodb://mongo:TTIDqLOFFZHpnBqXQOSkYTZCjHnlkytZ@autorack.proxy.rlwy.net:28357";

mongoose.set("strictQuery", false);
mongoose.connect(mongoDBUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(async () => {
    console.log('MongoDB connected successfully');

    // Seed roles when the server starts
    await seedRoles();
  })
  .catch(err => console.error('MongoDB connection error:', err));

module.exports = mongoose;

