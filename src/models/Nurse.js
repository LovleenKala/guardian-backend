const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const NurseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isApproved: { type: Boolean, default: false },
  assignedPatients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }], // Assigned patients
  role: { type: String, default: 'nurse', immutable: true },  // Make role immutable means it can not be changed
  lastPasswordChange: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Hash the password before saving
NurseSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const Nurse = mongoose.model('Nurse', NurseSchema);

module.exports = Nurse;
