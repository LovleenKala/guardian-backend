const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  timestamp:   { type: Date,   required: true },

  patient:     { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByRole: { type: String, enum: ['nurse','caretaker'], required: true },
}, { timestamps: true, versionKey: false });

// Indexes for performance
LogSchema.index({ patient: 1, _id: 1 });           // keyset pagination by patient
LogSchema.index({ patient: 1, timestamp: -1 });    // recent-first per patient
LogSchema.index({ createdBy: 1, timestamp: -1 });  // actor's activity timeline
LogSchema.index({ createdByRole: 1 });             // optional filtering by role

module.exports = mongoose.model('Log', LogSchema);