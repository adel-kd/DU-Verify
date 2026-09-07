const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  keyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeveloperKey', required: true },
  idempotencyKey: { type: String, required: true },
  fingerprint: { type: String, required: true },
  state: { type: String, enum: ['pending', 'complete'], default: 'pending' },
  provider: String,
  reference: String,
  // Kept outside the saved response so duplicates can be found without
  // exposing a provider receipt to the portal or admin usage table.
  outcome: String,
  receiptFound: { type: Boolean, default: false },
  cost: { type: Number, required: true },
  charged: { type: Number, default: 0 },
  httpStatus: Number,
  response: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, provider: 1, reference: 1, receiptFound: 1 });
module.exports = mongoose.model('DeveloperRequest', schema);
