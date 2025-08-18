const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('Organization', OrganizationSchema);
