// services/patientService.js
// Patient helpers shared by controllers (age derivation + reverse indexing on users)

const User = require('../models/User');

const calculateAge = (dob) => {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// Maintain reverse links for dashboards (User.assignedPatients[])
const addAssignedPatient = async (userId, patientId) => {
  if (!userId) return;
  await User.updateOne({ _id: userId }, { $addToSet: { assignedPatients: patientId } });
};

const removeAssignedPatient = async (userId, patientId) => {
  if (!userId) return;
  await User.updateOne({ _id: userId }, { $pull: { assignedPatients: patientId } });
};

module.exports = {
  calculateAge,
  addAssignedPatient,
  removeAssignedPatient,
};
