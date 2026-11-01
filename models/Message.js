const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    thumbnail: { type: String, default: null },
    duration: { type: Number, default: 0 }, // seconds
    publicId: { type: String, default: null }, // for deleting from Cloudinary
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema({
  title: String,

  content: {
    type: String,
    default: ''
  },

  images: {
    type: [String],
    default: []
  },

  // Optional single short video (max 30s, enforced server-side)
  video: {
    type: videoSchema,
    default: null
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