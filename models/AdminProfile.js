const mongoose = require('mongoose');

const adminProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyName: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  website: {
    type: String,
    required: true
  },
  industry: {
    type: String,
    default: ''
  },
  companySize: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  isComplete: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AdminProfile', adminProfileSchema);