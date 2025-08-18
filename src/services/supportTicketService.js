const { isValidObjectId } = require('mongoose');
const SupportTicket = require('../models/SupportTicket');

async function createTicket({ subject, description, status, createdBy, assignedTo }) {
  const doc = await SupportTicket.create({
    subject,
    description,
    status: status || 'OPEN',
    createdBy: isValidObjectId(createdBy) ? createdBy : undefined,
    assignedTo: isValidObjectId(assignedTo) ? assignedTo : undefined
  });
  return doc;
}

async function getTickets({ status, limit = 50, offset = 0 } = {}) {
  const filter = {};
  if (status) filter.status = status;
  const total = await SupportTicket.countDocuments(filter);
  const items = await SupportTicket.find(filter)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(Math.min(limit, 200));
  return { total, items };
}

async function updateTicket(ticketId, updates, updater) {
  if (!isValidObjectId(ticketId)) throw new Error('Invalid ticketId');
  const allowed = {};
  if (updates.subject !== undefined) allowed.subject = updates.subject;
  if (updates.description !== undefined) allowed.description = updates.description;
  if (updates.status !== undefined) allowed.status = updates.status;
  if (updates.assignedTo !== undefined) allowed.assignedTo = updates.assignedTo;

  const doc = await SupportTicket.findByIdAndUpdate(ticketId, allowed, { new: true, runValidators: true });
  return doc;
}

module.exports = { createTicket, getTickets, updateTicket };
