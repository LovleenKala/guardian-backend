// src/seedData.js
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./models/User');
const Patient = require('./models/Patient');
const Organization = require('./models/Organization');
const Credential = require('./models/Credentials');
const Log = require('./models/Log');

// ---------- helpers ----------
const makeEmail = (name) => `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`;
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// create or update by unique keys
async function upsertOrganization(name) {
  const found = await Organization.findOne({ name });
  return found || Organization.create({ name });
}

async function upsertUser({ fullName, email, role, org = null, isApproved = true, password = 'Passw0rd!' }) {
  // The User schema hashes passwordHash on save/update
  let user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    user = new User({ fullName, email, role, org, isApproved, passwordHash: password });
    await user.save();
    return user;
  }
  // Keep it idempotent; only update mutable fields
  const update = { fullName, role, org, isApproved };
  await User.findByIdAndUpdate(user._id, update, { new: true, runValidators: true });
  return User.findById(user._id);
}

async function upsertPatient({
  fullName,
  dateOfBirth,
  org = null,
  assignedNurse = null,
  assignedCaretaker = null,
  emergencyContact = '',
  medicalSummary = '',
}) {
  const key = { fullName, org: org ? org._id : null };
  let p = await Patient.findOne(key);
  if (!p) {
    p = await Patient.create({
      ...key,
      dateOfBirth,
      emergencyContact,
      medicalSummary,
      assignedNurse: assignedNurse ? assignedNurse._id : null,
      assignedCaretaker: assignedCaretaker ? assignedCaretaker._id : null,
      admittedAt: new Date(Date.now() - rnd(1, 30) * 24 * 3600 * 1000),
    });
  } else {
    p.assignedNurse = assignedNurse ? assignedNurse._id : null;
    p.assignedCaretaker = assignedCaretaker ? assignedCaretaker._id : null;
    await p.save();
  }
  return p;
}

async function upsertCredential({ user, type, identifier, issuer, issuedAt, expiresAt }) {
  // Unique composite (user, type, identifier)
  const existing = await Credential.findOne({ user: user._id, type, identifier });
  if (existing) return existing;
  return Credential.create({
    user: user._id,
    type,
    identifier,
    issuer,
    issuedAt,
    expiresAt,
    status: 'PENDING',
    documents: [],
  });
}

async function addLogsForPatient(patient, actors) {
  // 3 logs alternating between assigned nurse and caretaker when available
  const titles = ['Vitals check', 'Medication administered', 'Progress note'];
  const descriptions = [
    'Routine vitals captured and within normal range.',
    'Medication schedule followed without adverse events.',
    'Patient progressing as expected; no new concerns.',
  ];
  const now = Date.now();
  const items = [];

  for (let i = 0; i < 3; i++) {
    const by = i % 2 === 0 ? actors.nurse : actors.caretaker;
    if (!by) continue;
    items.push({
      title: titles[i],
      description: descriptions[i],
      timestamp: new Date(now - (i + 1) * 6 * 3600 * 1000),
      patient: patient._id,
      createdBy: by._id,
      createdByRole: by.role, // 'nurse' or 'caretaker'
    });
  }
  if (items.length) await Log.insertMany(items);
}

// ---------- main ----------
module.exports = async function seedData() {
  console.log('[seedData] start');

  // Ensure connection (in case you run this as a standalone)
  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  }

  // 1) Org
  const demoOrg = await upsertOrganization('Demo Health Org');

  // 2) Users (admin + staff)
  const admin = await upsertUser({
    fullName: 'Alex Admin',
    email: makeEmail('alex admin'),
    role: 'admin',
    org: demoOrg._id,
    isApproved: true,
    password: 'Admin#1234',
  });

  // Nurses: 2 freelance, 1 org
  const nurseFreelance1 = await upsertUser({
    fullName: 'Nina Nurse',
    email: makeEmail('nina nurse'),
    role: 'nurse',
    org: null,
    isApproved: true,
    password: 'Nurse#1234',
  });
  const nurseFreelance2 = await upsertUser({
    fullName: 'Noah Nurse',
    email: makeEmail('noah nurse'),
    role: 'nurse',
    org: null,
    isApproved: true,
    password: 'Nurse#1234',
  });
  const nurseOrg = await upsertUser({
    fullName: 'Olivia Nurse',
    email: makeEmail('olivia nurse'),
    role: 'nurse',
    org: demoOrg._id,
    isApproved: true,
    password: 'Nurse#1234',
  });

  // Caretakers: 2 freelance, 1 org
  const caretakerFreelance1 = await upsertUser({
    fullName: 'Casey Caretaker',
    email: makeEmail('casey caretaker'),
    role: 'caretaker',
    org: null,
    isApproved: true,
    password: 'Caretaker#1234',
  });
  const caretakerFreelance2 = await upsertUser({
    fullName: 'Corey Caretaker',
    email: makeEmail('corey caretaker'),
    role: 'caretaker',
    org: null,
    isApproved: true,
    password: 'Caretaker#1234',
  });
  const caretakerOrg = await upsertUser({
    fullName: 'Cora Caretaker',
    email: makeEmail('cora caretaker'),
    role: 'caretaker',
    org: demoOrg._id,
    isApproved: true,
    password: 'Caretaker#1234',
  });

  // 3) Credentials for staff
  const today = new Date();
  const twoYears = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate());

  const staff = [
    { u: nurseFreelance1, type: 'AHPRA', id: 'AHPRA-NN-1001' },
    { u: nurseFreelance2, type: 'AHPRA', id: 'AHPRA-NN-1002' },
    { u: nurseOrg,        type: 'AHPRA', id: 'AHPRA-ON-1003' },
    { u: caretakerFreelance1, type: 'CERTIFICATE', id: 'CERT-CC-2001' },
    { u: caretakerFreelance2, type: 'CERTIFICATE', id: 'CERT-CC-2002' },
    { u: caretakerOrg,        type: 'CERTIFICATE', id: 'CERT-OC-2003' },
  ];

  for (const s of staff) {
    await upsertCredential({
      user: s.u,
      type: s.type,
      identifier: s.id,
      issuer: s.type === 'AHPRA' ? 'AHPRA' : 'National Training',
      issuedAt: today,
      expiresAt: twoYears,
    });
  }

  // 4) Patients (2 freelance, 1 org), with assignments
  const patientFreelance1 = await upsertPatient({
    fullName: 'Pat Freelance One',
    dateOfBirth: new Date('1995-05-12'),
    org: null,
    assignedNurse: nurseFreelance1,
    assignedCaretaker: caretakerFreelance1,
    emergencyContact: '0400 000 001',
    medicalSummary: 'Mild asthma; routine check-ins.',
  });
  const patientFreelance2 = await upsertPatient({
    fullName: 'Pat Freelance Two',
    dateOfBirth: new Date('1988-10-03'),
    org: null,
    assignedNurse: nurseFreelance2,
    assignedCaretaker: caretakerFreelance2,
    emergencyContact: '0400 000 002',
    medicalSummary: 'Rehabilitation; home care plan.',
  });
  const patientOrg = await upsertPatient({
    fullName: 'Pat Org Linked',
    dateOfBirth: new Date('1979-02-21'),
    org: demoOrg,
    assignedNurse: nurseOrg,
    assignedCaretaker: caretakerOrg,
    emergencyContact: '0400 000 003',
    medicalSummary: 'Post-surgical recovery; daily visit.',
  });

  // 5) Logs (3 per patient; alternating nurse/caretaker)
  await addLogsForPatient(patientFreelance1, { nurse: nurseFreelance1, caretaker: caretakerFreelance1 });
  await addLogsForPatient(patientFreelance2, { nurse: nurseFreelance2, caretaker: caretakerFreelance2 });
  await addLogsForPatient(patientOrg,        { nurse: nurseOrg,        caretaker: caretakerOrg });

  console.table([
    { role: 'admin', email: admin.email, org: 'Demo Health Org' },
    { role: 'nurse', email: nurseFreelance1.email, org: null },
    { role: 'nurse', email: nurseFreelance2.email, org: null },
    { role: 'nurse', email: nurseOrg.email, org: 'Demo Health Org' },
    { role: 'caretaker', email: caretakerFreelance1.email, org: null },
    { role: 'caretaker', email: caretakerFreelance2.email, org: null },
    { role: 'caretaker', email: caretakerOrg.email, org: 'Demo Health Org' },
  ]);
  console.table([
    { patient: patientFreelance1.fullName, org: null },
    { patient: patientFreelance2.fullName, org: null },
    { patient: patientOrg.fullName, org: 'Demo Health Org' },
  ]);

  console.log('[seedData] done.');
};
