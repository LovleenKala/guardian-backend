const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema(
  {
    subject:     { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status:      { type: String, enum: ['OPEN','IN_PROGRESS','RESOLVED','CLOSED'], default: 'OPEN', index: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true, versionKey: false }
);

SupportTicketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
