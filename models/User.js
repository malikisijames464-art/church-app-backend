const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    unique: true,
    sparse: true,
    default: undefined,
    lowercase: true,
    trim: true
  },

  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },

  // Optional because admin-added church members
  // do not necessarily have login credentials yet.
  password: {
    type: String,
    select: false,
    minlength: 6
  },

  address: {
    type: String,
    trim: true,
    default: ''
  },

  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },

  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },

  photo: {
    type: String,
    default: ''
  },

  joinedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);