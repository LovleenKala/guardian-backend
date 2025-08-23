const mongoose = require('mongoose');

const CredentialSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: {
      type: String,
      required: true,
      enum: ['AHPRA', 'QUALIFICATION', 'CERTIFICATE', 'OTHER'],
    },

    identifier: { type: String, required: true, trim: true }, // e.g., AHPRA number
    issuer: { type: String, trim: true },
    issuedAt: { type: Date },
    expiresAt: { type: Date },

    // Verification controls (admin-managed)
    verified: { type: Boolean, default: false, index: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    notes: { type: String, trim: true },

    // Optional: references to uploaded files if implementing uploads later
    attachments: [
      {
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

// Uniqueness: a user should not duplicate the *same* identifier+type
CredentialSchema.index({ user: 1, type: 1, identifier: 1 }, { unique: true });

module.exports = mongoose.model('Credential', CredentialSchema);
