const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: String, default: 'developer' },
  enabled: { type: Boolean, default: true },
  signupEnabled: { type: Boolean, default: true },
  cost: { type: Number, default: 1, min: 1, max: 1000 },
  requestsPerMinute: { type: Number, default: 10, min: 1, max: 120 },
  maxKeys: { type: Number, default: 3, min: 1, max: 10 },
});
schema.statics.current = function () {
  return this.findOneAndUpdate({ _id: 'developer' }, { $setOnInsert: { _id: 'developer' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
};
module.exports = mongoose.model('DeveloperSettings', schema);
