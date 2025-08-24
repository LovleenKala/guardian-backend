const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const WifiCSI = require('../models/WifiCSI');
const verifyToken = require('../middleware/verifyToken');
const { AppError } = require('../utils/appError');
const { asyncHandler } = require('../utils/asyncHandler');

// Helpers
const toBase64 = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
const fromBase64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

// POST /api/v1/wifi-csi
router.post(
  '/',
  verifyToken,
  asyncHandler(async (req, res) => {
    const { timestamp, csi_data } = req.body || {};
    if (!timestamp || !csi_data) {
      throw new AppError(422, 'Validation failed', 'timestamp and csi_data are required', {
        type: 'https://docs.api/errors/validation',
        code: 'MISSING_FIELDS',
        meta: { required: ['timestamp', 'csi_data'] }
      });
    }

    // Strict ISO timestamp check (fail fast; avoid ambiguous casting)
    const ts = new Date(timestamp);
    if (Number.isNaN(ts.getTime())) {
      throw new AppError(422, 'Validation failed', 'timestamp must be an ISO date string', {
        type: 'https://docs.api/errors/validation',
        code: 'INVALID_TIMESTAMP'
      });
    }

    // Model validators can still enforce future-date/size constraints
    const doc = await WifiCSI.create({
      user_id: req.user._id,
      timestamp: ts,
      csi_data
    });

    res.status(201).json(doc);
  })
);

// GET /api/v1/wifi-csi?limit=50&before=...&after=...&cursor=...
// First page:      GET /api/v1/wifi-csi?limit=50
// Subsequent page: GET /api/v1/wifi-csi?limit=50&cursor=eyJ0cyI6IjIwMjUtMDgtMDFUMTI6MDA6MDAuMDAwWiIsImlkIjoiNjkzYy..."}
router.get(
  '/',
  verifyToken,
  asyncHandler(async (req, res) => {
    const MAX_LIMIT = 200;
    const DEFAULT_LIMIT = 50;

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) {
      throw new AppError(400, 'Invalid parameter', `limit must be between 1 and ${MAX_LIMIT}`, {
        type: 'https://docs.api/errors/invalid-parameter',
        code: 'LIMIT_OUT_OF_RANGE'
      });
    }

    // Parse window bounds
    let before = null,
      after = null,
      cursor = null;

    if (req.query.before) {
      const d = new Date(req.query.before);
      if (Number.isNaN(d.getTime())) {
        throw new AppError(400, 'Invalid parameter', 'before must be an ISO date string', {
          type: 'https://docs.api/errors/invalid-parameter',
          code: 'INVALID_BEFORE'
        });
      }
      before = d;
    }

    if (req.query.after) {
      const d = new Date(req.query.after);
      if (Number.isNaN(d.getTime())) {
        throw new AppError(400, 'Invalid parameter', 'after must be an ISO date string', {
          type: 'https://docs.api/errors/invalid-parameter',
          code: 'INVALID_AFTER'
        });
      }
      after = d;
    }

    if (req.query.cursor) {
      try {
        cursor = fromBase64(req.query.cursor);
        if (!cursor.ts || !cursor.id) throw new Error('invalid');
      } catch {
        throw new AppError(400, 'Invalid parameter', 'cursor is not a valid base64 token', {
          type: 'https://docs.api/errors/invalid-parameter',
          code: 'INVALID_CURSOR'
        });
      }
    }

    // Base query (scoped to user)
    const query = { user_id: req.user._id };

    // Absolute windowing (ANDed with cursor constraints if provided)
    if (before || after) {
      query.timestamp = {};
      if (before) query.timestamp.$lt = before;
      if (after) query.timestamp.$gt = after;
    }

    // Keyset cursor (ts + id tie-breaker) in DESC order
    if (cursor?.ts && cursor?.id) {
      const ts = new Date(cursor.ts);
      if (Number.isNaN(ts.getTime())) {
        throw new AppError(400, 'Invalid parameter', 'cursor.ts must be an ISO date string', {
          type: 'https://docs.api/errors/invalid-parameter',
          code: 'CURSOR_TS_INVALID'
        });
      }
      let oid;
      try {
        oid = new mongoose.Types.ObjectId(cursor.id);
      } catch {
        throw new AppError(400, 'Invalid parameter', 'cursor.id must be a valid ObjectId', {
          type: 'https://docs.api/errors/invalid-parameter',
          code: 'CURSOR_ID_INVALID'
        });
      }

      // "strictly older than (ts, id)" in DESC sort: (ts < cursor.ts) OR (ts == cursor.ts AND _id < cursor.id)
      query.$or = [{ timestamp: { $lt: ts } }, { timestamp: ts, _id: { $lt: oid } }];
    }

    // Execute: sort DESC by time, then _id; fetch one extra to compute nextCursor
    const docs = await WifiCSI.find(query).sort({ timestamp: -1, _id: -1 }).limit(limit + 1).lean();

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;

    // Build next cursor from the last returned
    let nextCursor = null;
    if (hasMore && items.length) {
      const last = items[items.length - 1];
      nextCursor = toBase64({ ts: last.timestamp, id: String(last._id) });
    }

    res.status(200).json({ items, nextCursor, hasMore, limit });
  })
);

module.exports = router;