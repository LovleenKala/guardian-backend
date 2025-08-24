const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  // Link to the user account for self-access
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },

  fullName: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, required: true },
  guardian:       {
    name:         { type: String },
    contact:      { type: String } // guardian details
  },
  emergencyContact: { type: String },
  
  // Clinical / summary fields (read-only to patient via API)
  medicalSummary: { type: String },
  description:    { type: String }, // short description of condition
  photoUrl:       { type: String }, //URL or upload picture?

  admittedAt:     { type: Date }, // Date Of Admitting
  org: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  assignedNurse: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedCaretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

// Indexes for common queries
PatientSchema.index({ assignedNurse: 1 });
PatientSchema.index({ assignedCaretaker: 1 });
PatientSchema.index({ org: 1 });
PatientSchema.index({ admittedAt: -1 });
PatientSchema.index({ user: 1 }, { unique: true, sparse: true });

// Admin-safe roster projection (no clinical fields)
const ADMIN_ROSTER_PROJECTION = 'fullName org assignedNurse assignedCaretaker admittedAt createdAt updatedAt';

// Patient self projection (currently allow full access);
const PATIENT_SELF_PROJECTION = null; // null => full document access for now

module.exports = mongoose.model('Patient', PatientSchema);
module.exports.ADMIN_ROSTER_PROJECTION = ADMIN_ROSTER_PROJECTION;
module.exports.PATIENT_SELF_PROJECTION = PATIENT_SELF_PROJECTION;
