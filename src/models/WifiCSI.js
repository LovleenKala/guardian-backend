const mongoose = require('mongoose');

const MAX_CSI_BYTES = 1024 * 256; // Adjustable size limit

const WifiCSISchema = new mongoose.Schema(
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
      // Validate timestamp: forbid future timestamps within margin of error
      validate: {
        validator: (v) => v instanceof Date && v.getTime() <= Date.now() + 5_000,
        message: 'timestamp cannot be in the future',
      },
      index: true,
    },
    // Allow mixed structured JSON with validation
    csi_data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (v) => {
          try {
            // Size check; convert to string and bound
            const bytes = Buffer.byteLength(JSON.stringify(v || {}), 'utf8');
            return bytes > 0 && bytes <= MAX_CSI_BYTES;
          } catch {
            return false;
          }
        },
        message: `csi_data must be valid JSON and <= ${MAX_CSI_BYTES} bytes`,
      },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
  }
);

// Fast path: by user + time (supports pagination & sorting)
WifiCSISchema.index({ user_id: 1, timestamp: -1 });
// Enable page by insertion order
WifiCSISchema.index({ created_at: -1 });

module.exports = mongoose.model('WifiCSI', WifiCSISchema);
