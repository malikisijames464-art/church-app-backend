const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const Project = require('../models/Project');

const router = express.Router();

// ====================== MULTER SETUP (for project image) ======================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// ====================== CREATE PROJECT ======================
router.post('/', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    let imageUrl = '';

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'church_projects'
      });
      imageUrl = result.secure_url;
    }

    const { title, description, startDate, endDate, status, department } = req.body;

    const project = await Project.create({
      title,
      description,
      startDate,
      endDate,
      status,
      department,
      image: imageUrl
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ====================== GET ALL PROJECTS ======================
router.get('/', protect, async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('department', 'name')
      .sort({ createdAt: -1 });
    
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// ====================== UPDATE PROJECT ======================
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// ====================== DELETE PROJECT ======================
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;