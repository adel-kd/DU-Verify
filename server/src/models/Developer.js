const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  applicationName: { type: String, required: true, maxlength: 100 },
  enabled: { type: Boolean, default: true },
  admissionCounter: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model('Developer', schema);
