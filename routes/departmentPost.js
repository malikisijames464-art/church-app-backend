const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const cloudinary = require('../config/cloudinary');

const { protect } = require('../middleware/auth');

const Department = require('../models/Department');
const DepartmentPost = require('../models/DepartmentPost');

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

router.post(
  '/:departmentId',
  protect,
  upload.single('image'),
  async (req, res) => {
    try {
      const department = await Department.findById(
        req.params.departmentId
      );

      if (!department) {
        return res.status(404).json({
          message: 'Department not found',
        });
      }

      const isAdmin =
        req.user.role === 'admin';

      const isMember =
        department.members.some(
          m => m.toString() === req.user.id
        );

      if (!isAdmin && !isMember) {
        return res.status(403).json({
          message:
            'Only department members can post',
        });
      }

      const { title, content } = req.body;

      let imageUrl = '';

      if (req.file) {
        const result =
          await cloudinary.uploader.upload(
            req.file.path,
            {
              folder: 'department_posts',
              resource_type: 'image',
            }
          );

        imageUrl = result.secure_url;
      }

      const post =
        await DepartmentPost.create({
          department: department._id,
          title:
            title?.trim() ||
            department.name,
          content:
            content?.trim() || '',
          image: imageUrl,
          postedBy: req.user.id,
        });

      res.status(201).json(post);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message: 'Server Error',
      });
    }
  }
);

router.get(
  '/:departmentId',
  protect,
  async (req, res) => {
    try {
      const department =
        await Department.findById(
          req.params.departmentId
        );

      if (!department) {
        return res.status(404).json({
          message: 'Department not found',
        });
      }

      const isAdmin =
        req.user.role === 'admin';

      const isMember =
        department.members.some(
          m => m.toString() === req.user.id
        );

      if (!isAdmin && !isMember) {
        return res.status(403).json({
          message: 'Access denied',
        });
      }

      const posts =
        await DepartmentPost.find({
          department: department._id,
        })
          .populate(
            'postedBy',
            'name photo'
          )
          .sort({
            createdAt: -1,
          });

      res.json(posts);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message: 'Server Error',
      });
    }
  }
);

router.delete(
  '/:postId/delete',
  protect,
  async (req, res) => {
    try {
      const post =
        await DepartmentPost.findById(
          req.params.postId
        );

      if (!post) {
        return res.status(404).json({
          message: 'Post not found',
        });
      }

      const isAdmin =
        req.user.role === 'admin';

      const isOwner =
        post.postedBy.toString() ===
        req.user.id;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          message: 'Not allowed',
        });
      }

      await post.deleteOne();

      res.json({
        success: true,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message: 'Server Error',
      });
    }
  }
);

module.exports = router;