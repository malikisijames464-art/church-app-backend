const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const Message = require('../models/Message');

const router = express.Router();

// ====================== MULTER SETUP ======================
const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});


const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// ====================== POST NEW MESSAGE ======================
router.post(
  '/',
  protect,
  adminOnly,
  upload.array('images', 5),
  async (req, res) => {
    try {
      console.log('BODY:', req.body);
      console.log('FILES:', req.files);

      const { title, content } = req.body;

      // Allow:
      // Text only
      // Image only
      // Text + Image

      if (
  (!content || !content.trim()) &&
  (!req.files || req.files.length === 0)
) {
        return res.status(400).json({
          success: false,
          message: 'Please enter content or attach an image'
        });
      }

   let imageUrls = [];

if (req.files && req.files.length > 0) {
  try {
    const uploads = await Promise.all(
      req.files.map(file =>
        cloudinary.uploader.upload(file.path, {
          folder: 'church_announcements',
          resource_type: 'image'
        })
      )
    );

    imageUrls = uploads.map(result => result.secure_url);

    // delete local temp files
    req.files.forEach(file => {
      fs.unlink(file.path, err => {
        if (err) console.error(err);
      });
    });

  } catch (uploadError) {
    console.error(uploadError);

    return res.status(500).json({
      success: false,
      message: 'Failed to upload images'
    });
  }
}

    

    const message = await Message.create({
  title: title?.trim() || 'Church Announcement',
  content: content?.trim() || '',
  images: imageUrls,
  postedBy: req.user.id
});

      res.status(201).json({
        success: true,
        message: 'Announcement posted successfully',
        data: message
      });

    } catch (error) {
      console.error('POST MESSAGE ERROR:', error);

      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
);

// ====================== GET ALL MESSAGES ======================
router.get('/', protect, async (req, res) => {
  try {
    const messages = await Message.find()
      .populate('postedBy', 'name photo')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      count: messages.length,
      data: messages
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// ====================== DELETE MESSAGE ======================
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(
      req.params.id
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    res.json({
      success: true,
      message: 'Announcement deleted'
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

module.exports = router;