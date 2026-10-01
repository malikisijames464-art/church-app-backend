const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  title: String,

  content: {
    type: String,
    default: ''
  },

  // Changed from single image to array of images
  images: {
    type: [String],     // Array of image URLs/paths
    default: []
  },

  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Message', messageSchema);