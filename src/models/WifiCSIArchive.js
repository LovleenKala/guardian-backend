const mongoose = require('mongoose');

const WifiCSIArchiveSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    csi_data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    archived_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
  }
);

// Query speed for history by user + time
WifiCSIArchiveSchema.index({ user_id: 1, timestamp: -1 });

// TTL for archived data (e.g., delete after 180 days)

WifiCSIArchiveSchema.index(
   { archived_at: 1 },
   { expireAfterSeconds: 180 * 24 * 60 * 60 } // Change 180 (days) to match data retention policy
 );

module.exports = mongoose.model('WifiCSIArchive', WifiCSIArchiveSchema);
