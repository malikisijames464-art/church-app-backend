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

// ====================== HELPERS ======================
// Turns a Cloudinary URL into its public_id so the file can be deleted
// e.g. https://res.cloudinary.com/x/image/upload/v123/church_announcements/abc.jpg
//   -> church_announcements/abc
const getPublicId = (url) => {
  try {
    const afterUpload = url.split('/upload/')[1];
    if (!afterUpload) return null;
    const withoutVersion = afterUpload.replace(/^v\d+\//, '');
    return withoutVersion.replace(/\.[^/.]+$/, '');
  } catch {
    return null;
  }
};

const removeTempFiles = (files = []) => {
  files.forEach((file) => {
    fs.unlink(file.path, (err) => {
      if (err) console.error('Temp file cleanup error:', err);
    });
  });
};

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

// ====================== UPDATE MESSAGE ======================
router.put(
  '/:id',
  protect,
  adminOnly,
  upload.array('images', 5),
  async (req, res) => {
    try {
      const message = await Message.findById(req.params.id);

      if (!message) {
        removeTempFiles(req.files);
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      const { title, content } = req.body;

      // Existing images the admin chose to keep (sent as a JSON string)
      let keptImages = [];
      try {
        keptImages = req.body.existingImages
          ? JSON.parse(req.body.existingImages)
          : [];
      } catch {
        removeTempFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'Invalid existingImages format'
        });
      }

      // Only allow URLs that already belong to this message
      keptImages = keptImages.filter((url) => message.images.includes(url));

      const newFiles = req.files || [];

      if (keptImages.length + newFiles.length > 5) {
        removeTempFiles(newFiles);
        return res.status(400).json({
          success: false,
          message: 'Maximum of 5 images allowed'
        });
      }

      if (
        (!content || !content.trim()) &&
        keptImages.length === 0 &&
        newFiles.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: 'Please enter content or attach an image'
        });
      }

      // Upload any new images to Cloudinary
      let newImageUrls = [];
      if (newFiles.length > 0) {
        try {
          const uploads = await Promise.all(
            newFiles.map((file) =>
              cloudinary.uploader.upload(file.path, {
                folder: 'church_announcements',
                resource_type: 'image'
              })
            )
          );
          newImageUrls = uploads.map((result) => result.secure_url);
        } catch (uploadError) {
          console.error(uploadError);
          removeTempFiles(newFiles);
          return res.status(500).json({
            success: false,
            message: 'Failed to upload images'
          });
        }
        removeTempFiles(newFiles);
      }

      // Work out which old images were removed
      const removedImages = message.images.filter(
        (url) => !keptImages.includes(url)
      );

      message.title = title?.trim() || 'Church Announcement';
      message.content = content?.trim() || '';
      message.images = [...keptImages, ...newImageUrls];

      await message.save();

      // Delete removed images from Cloudinary (after the save succeeds,
      // so a failure here never loses data)
      await Promise.all(
        removedImages.map(async (url) => {
          const publicId = getPublicId(url);
          if (!publicId) return;
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error('Cloudinary delete error:', err);
          }
        })
      );

      const updated = await Message.findById(message._id).populate(
        'postedBy',
        'name photo'
      );

      res.json({
        success: true,
        message: 'Announcement updated successfully',
        data: updated
      });
    } catch (error) {
      console.error('UPDATE MESSAGE ERROR:', error);
      removeTempFiles(req.files);

      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
);

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