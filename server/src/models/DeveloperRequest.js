const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  keyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeveloperKey', required: true },
  idempotencyKey: { type: String, required: true },
  fingerprint: { type: String, required: true },
  state: { type: String, enum: ['pending', 'complete'], default: 'pending' },
  provider: String,
  cost: { type: Number, required: true },
  charged: { type: Number, default: 0 },
  httpStatus: Number,
  response: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('DeveloperRequest', schema);
