const mongoose = require('mongoose');

const departmentPostSchema = new mongoose.Schema(
  {
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },

    title: {
      type: String,
      default: '',
    },

    content: {
      type: String,
      default: '',
    },

    image: {
      type: String,
      default: '',
    },

    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  'DepartmentPost',
  departmentPostSchema
);