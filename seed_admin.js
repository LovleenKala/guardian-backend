#!/usr/bin/env node
/**
 * One-time Admin Bootstrap
 * Creates (or updates) an admin user with isApproved=true and a known password.
 *
 * Usage:
 *   MONGO_URI="mongodb://127.0.0.1:27017/guardian" node seed_admin.js \
 *     --email admin@example.com --password "Admin#123Aa" --name "System Admin"
 *
 * Notes:
 * - Safe to re-run: upserts the user by email.
 * - Password is hashed with bcryptjs.
 * - Requires the same User model semantics as your app.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('email', { type: 'string', demandOption: true })
  .option('password', { type: 'string', demandOption: true })
  .option('name', { type: 'string', default: 'Administrator' })
  .help()
  .argv;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guardian';

async function main() {
  await mongoose.connect(MONGO_URI, { autoIndex: true });

  // Define a minimal User schema compatible with your app (fields used here).
  const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true, index: true },
    passwordHash: String,
    role: { type: String, default: 'admin' },
    org: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', default: null },
    isApproved: { type: Boolean, default: true },
  }, { timestamps: true, versionKey: false });

  const User = mongoose.model('User', userSchema, 'users');

  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(argv.password, salt);

  const update = {
    fullName: argv.name,
    email: argv.email.toLowerCase(),
    passwordHash: hashed,
    role: 'admin',
    isApproved: true,
  };

  const res = await User.findOneAndUpdate(
    { email: update.email },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  console.log('✅ Admin upserted:', { id: res._id, email: res.email, role: res.role, isApproved: res.isApproved });
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Failed to seed admin:', err);
  process.exit(1);
});
