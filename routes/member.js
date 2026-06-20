const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// ====================== MULTER SETUP ======================
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
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ====================== ADD NEW MEMBER (No Email Required) ======================
router.post('/', protect, upload.single('photo'), async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and Phone Number are required' 
      });
    }

    let photoUrl = '';

    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'church_members'
        });
        photoUrl = result.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError.message);
      }
    }

    const member = await User.create({
      name: name.trim(),
      // Email is intentionally NOT set for normal members
      phone: phone.trim(),
      address: address?.trim() || '',
      photo: photoUrl,
      role: 'member'
    });

    res.status(201).json({
      success: true,
      message: 'Member added successfully',
      member
    });

  } catch (error) {
    console.error('Add member error:', error);

   if (error.code === 11000) {
  console.log("Duplicate key:", error.keyValue);

  return res.status(400).json({
    success: false,
    message: `Duplicate: ${JSON.stringify(error.keyValue)}`
  });
}

    res.status(500).json({ 
      success: false,
      message: 'Failed to add member. Please try again.' 
    });
  }
});

// ====================== GET ALL MEMBERS ======================
router.get('/', protect, async (req, res) => {
  try {
    const members = await User.find()
      .populate('department', 'name')
      .select('-password -__v');
    res.json(members);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// ====================== UPDATE MEMBER (Admin Only) ======================
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and Phone Number are required' 
      });
    }

    const updatedMember = await User.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        phone: phone.trim(),
        address: address?.trim() || '',
      },
      { new: true, runValidators: true }
    );

    if (!updatedMember) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    res.json({
      success: true,
      message: 'Member updated successfully',
      member: updatedMember
    });

  } catch (error) {
    console.error('Update member error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Duplicate: ${JSON.stringify(error.keyValue)}`
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Failed to update member' 
    });
  }
});

// ====================== DELETE MEMBER (Admin Only) ======================
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const member = await User.findByIdAndDelete(req.params.id);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;