const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  startDate: Date,
  endDate: Date,
  status: { type: String, enum: ['ongoing', 'completed', 'upcoming'], default: 'upcoming' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member'
  }],
  image: String
}, { timestamps: true });


module.exports = mongoose.model('Project', projectSchema);