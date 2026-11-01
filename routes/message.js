
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const Message = require('../models/Message');

const router = express.Router();

/* =========================================================
   LIMITS
========================================================= */

const MAX_VIDEO_SECONDS = 30;

// Keep the upload limit at 100MB.
// This is large enough for normal camera and screen recordings.
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MAX_ATTACHMENTS = 5; // Images + video combined

/* =========================================================
   SUPPORTED VIDEO EXTENSIONS
   Android camera/screen recordings can sometimes report
   unusual MIME types such as application/octet-stream.
   Therefore we check BOTH MIME TYPE and FILE EXTENSION.
========================================================= */

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.qt',
  '.3gp',
  '.3gpp',
  '.3g2',
  '.avi',
  '.mkv',
  '.webm',
  '.wmv',
  '.flv',
  '.f4v',
  '.mpeg',
  '.mpg',
  '.mpe',
  '.mpv',
  '.m2v',
  '.ts',
  '.mts',
  '.m2ts',
  '.mxf',
  '.vob',
  '.ogv',
  '.ogg',
  '.hevc',
  '.h264',
  '.h265',
  '.avc'
]);

const isVideoFile = (file) => {
  if (!file) return false;

  const mimeType = String(file.mimetype || '').toLowerCase();

  // Normal Android/iOS video MIME types
  if (mimeType.startsWith('video/')) {
    return true;
  }

  // Some phones/apps report generic MIME types.
  const extension = path
    .extname(file.originalname || '')
    .toLowerCase();

  return VIDEO_EXTENSIONS.has(extension);
};

/* =========================================================
   UPLOAD DIRECTORY
========================================================= */

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* =========================================================
   MULTER STORAGE
========================================================= */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const safeName = String(file.originalname || 'file')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    cb(null, `${Date.now()}-${safeName}`);
  }
});

/* =========================================================
   MULTER
========================================================= */

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_VIDEO_BYTES
  },

  fileFilter: function (req, file, cb) {
    const mimeType = String(file.mimetype || '').toLowerCase();

    /* -------------------------
       IMAGES
    ------------------------- */

    if (
      file.fieldname === 'images' &&
      mimeType.startsWith('image/')
    ) {
      return cb(null, true);
    }

    /* -------------------------
       VIDEOS
    ------------------------- */

    if (
      file.fieldname === 'video' &&
      isVideoFile(file)
    ) {
      return cb(null, true);
    }

    return cb(
      new Error(
        `Unsupported media type: ${
          file.originalname || 'unknown file'
        }`
      ),
      false
    );
  }
}).fields([
  {
    name: 'images',
    maxCount: MAX_ATTACHMENTS
  },
  {
    name: 'video',
    maxCount: 1
  }
]);

/* =========================================================
   FILE HELPERS
========================================================= */

const flattenFiles = (files) => {
  return Object.values(files || {}).flat();
};

const removeTempFiles = (files) => {
  const list = Array.isArray(files)
    ? files
    : flattenFiles(files);

  list.forEach((file) => {
    if (!file?.path) return;

    fs.unlink(file.path, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(
          'Temp file cleanup error:',
          err.message
        );
      }
    });
  });
};

/* =========================================================
   MULTER ERROR HANDLER
========================================================= */

const handleUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      removeTempFiles(req.files);

      let message = err.message || 'File upload failed';

      if (err.code === 'LIMIT_FILE_SIZE') {
        message =
          'File too large. Videos must be 100MB or smaller and images must be 5MB or smaller.';
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message =
          'Too many files attached. A post can contain up to 5 images, or 4 images plus 1 video.';
      }

      return res.status(400).json({
        success: false,
        message
      });
    }

    /* -------------------------
       IMAGE SIZE CHECK
    ------------------------- */

    const images =
      (req.files && req.files.images) || [];

    const oversizedImage = images.find(
      (file) => file.size > MAX_IMAGE_BYTES
    );

    if (oversizedImage) {
      removeTempFiles(req.files);

      return res.status(400).json({
        success: false,
        message:
          'Each image must be 5MB or smaller.'
      });
    }

    /* -------------------------
       VIDEO SIZE CHECK
    ------------------------- */

    const videoFiles =
      (req.files && req.files.video) || [];

    const videoFile = videoFiles[0];

    if (
      videoFile &&
      videoFile.size > MAX_VIDEO_BYTES
    ) {
      removeTempFiles(req.files);

      return res.status(400).json({
        success: false,
        message:
          'Video must be 100MB or smaller.'
      });
    }

    next();
  });
};

/* =========================================================
   CLOUDINARY PUBLIC ID
========================================================= */

const getPublicId = (url) => {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const marker = '/upload/';

    const uploadIndex = url.indexOf(marker);

    if (uploadIndex === -1) {
      return null;
    }

    let publicPath = url.substring(
      uploadIndex + marker.length
    );

    // Remove transformation segment if present.
    if (publicPath.startsWith('v')) {
      const versionMatch =
        publicPath.match(/^v\d+\/(.+)$/);

      if (versionMatch) {
        publicPath = versionMatch[1];
      }
    }

    // Remove extension
    publicPath = publicPath.replace(
      /\.[^/.]+$/,
      ''
    );

    return publicPath || null;
  } catch (error) {
    console.error(
      'GET PUBLIC ID ERROR:',
      error.message
    );

    return null;
  }
};

/* =========================================================
   DELETE CLOUDINARY IMAGE
========================================================= */

const destroyImage = async (url) => {
  const publicId = getPublicId(url);

  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: 'image'
      }
    );
  } catch (error) {
    console.error(
      'Cloudinary image delete error:',
      error.message
    );
  }
};

/* =========================================================
   DELETE CLOUDINARY VIDEO
========================================================= */

const destroyVideo = async (video) => {
  if (!video?.publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(
      video.publicId,
      {
        resource_type: 'video'
      }
    );
  } catch (error) {
    console.error(
      'Cloudinary video delete error:',
      error.message
    );
  }
};

/* =========================================================
   UPLOAD IMAGES
========================================================= */

const uploadImages = async (files) => {
  if (!files || files.length === 0) {
    return [];
  }

  const uploads = await Promise.all(
    files.map((file) =>
      cloudinary.uploader.upload(file.path, {
        folder: 'church_announcements',
        resource_type: 'image'
      })
    )
  );

  return uploads.map(
    (result) => result.secure_url
  );
};

/* =========================================================
   UPLOAD VIDEO
=========================================================

   IMPORTANT:

   - Accepts common camera formats
   - Accepts screen recordings
   - Accepts generic MIME types when extension is valid
   - Trims video to first 30 seconds
   - Converts video to MP4
   - Uses H.264 video codec
   - Uses AAC audio codec
   - Generates thumbnail
   - Stores Cloudinary public ID
========================================================= */

const uploadVideo = async (file) => {
  if (!file || !file.path) {
    throw new Error('No video file supplied');
  }

  console.log('================ VIDEO UPLOAD ================');

  console.log('Original name:', file.originalname);
  console.log('MIME type:', file.mimetype);
  console.log('Size:', file.size);
  console.log('Path:', file.path);

  try {
    /*
      upload_large is used here because it is more suitable
      for larger video files than the normal upload method.
    */

    const result =
      await cloudinary.uploader.upload_large(
        file.path,
        {
          folder:
            'church_announcements/videos',

          resource_type: 'video',

          /*
            Convert everything into a format that
            Android/iOS video players can handle reliably.
          */

          format: 'mp4',

          /*
            Trim every announcement video to
            a maximum of 30 seconds.
          */

          transformation: [
            {
              start_offset: 0,
              end_offset: MAX_VIDEO_SECONDS,

              video_codec: 'h264',

              audio_codec: 'aac'
            }
          ]
        }
      );

    console.log(
      'Cloudinary video upload successful'
    );

    console.log(
      'Cloudinary URL:',
      result.secure_url
    );

    console.log(
      'Duration:',
      result.duration
    );

    /*
      Cloudinary thumbnail.

      The original URL should now be MP4.
      Replace the extension with JPG and add
      a first-frame transformation.
    */

    let thumbnail = null;

    if (result.secure_url) {
      thumbnail = result.secure_url
        .replace(
          '/upload/',
          '/upload/so_0,w_800,c_limit/'
        )
        .replace(
          /\.[^/.]+$/,
          '.jpg'
        );
    }

    const duration = Math.min(
      Math.round(
        Number(result.duration) || 0
      ),
      MAX_VIDEO_SECONDS
    );

    return {
      url: result.secure_url,

      thumbnail,

      duration,

      publicId: result.public_id
    };
  } catch (error) {
    console.error(
      'CLOUDINARY VIDEO UPLOAD ERROR:',
      error
    );

    throw error;
  }
};

/* =========================================================
   POST NEW MESSAGE
========================================================= */

router.post(
  '/',
  protect,
  adminOnly,
  handleUpload,
  async (req, res) => {
    const imageFiles =
      (req.files && req.files.images) || [];

    const videoFile =
      req.files &&
      req.files.video
        ? req.files.video[0]
        : null;

    try {
      const {
        title,
        content
      } = req.body;

      /* -------------------------
         REQUIRE CONTENT OR MEDIA
      ------------------------- */

      if (
        (!content || !content.trim()) &&
        imageFiles.length === 0 &&
        !videoFile
      ) {
        removeTempFiles(req.files);

        return res.status(400).json({
          success: false,
          message:
            'Please enter content or attach an image or video'
        });
      }

      /* -------------------------
         MAX ATTACHMENTS
      ------------------------- */

      const maxImages = videoFile
        ? MAX_ATTACHMENTS - 1
        : MAX_ATTACHMENTS;

      if (imageFiles.length > maxImages) {
        removeTempFiles(req.files);

        return res.status(400).json({
          success: false,
          message: videoFile
            ? 'A post with a video can have up to 4 images'
            : 'Maximum of 5 images allowed'
        });
      }

      let imageUrls = [];
      let video = null;

      /* -------------------------
         UPLOAD MEDIA
      ------------------------- */

      try {
        if (videoFile) {
          video =
            await uploadVideo(videoFile);
        }

        if (imageFiles.length > 0) {
          imageUrls =
            await uploadImages(
              imageFiles
            );
        }
      } catch (uploadError) {
        console.error(
          'MEDIA UPLOAD ERROR:',
          uploadError
        );

        if (video) {
          await destroyVideo(video);
        }

        removeTempFiles(req.files);

        return res.status(500).json({
          success: false,
          message:
            'Failed to upload media',
          error:
            uploadError.message
        });
      }

      /* -------------------------
         REMOVE LOCAL FILES
      ------------------------- */

      removeTempFiles(req.files);

      /* -------------------------
         CREATE MESSAGE
      ------------------------- */

      const message =
        await Message.create({
          title:
            title?.trim() ||
            'Church Announcement',

          content:
            content?.trim() || '',

          images: imageUrls,

          video,

          postedBy: req.user.id
        });

      /* -------------------------
         RESPONSE
      ------------------------- */

      res.status(201).json({
        success: true,

        message:
          'Announcement posted successfully',

        data: message
      });
    } catch (error) {
      console.error(
        'POST MESSAGE ERROR:',
        error
      );

      removeTempFiles(req.files);

      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
);

/* =========================================================
   GET ALL MESSAGES
   PUBLIC
========================================================= */

router.get('/', async (req, res) => {
  try {
    const messages =
      await Message.find()
        .populate(
          'postedBy',
          'name photo'
        )
        .sort({
          createdAt: -1
        })
        .limit(20);

    res.json({
      success: true,

      count: messages.length,

      data: messages
    });
  } catch (error) {
    console.error(
      'GET MESSAGES ERROR:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

/* =========================================================
   UPDATE MESSAGE
========================================================= */

router.put(
  '/:id',
  protect,
  adminOnly,
  handleUpload,
  async (req, res) => {
    const newImageFiles =
      (req.files && req.files.images) || [];

    const newVideoFile =
      req.files &&
      req.files.video
        ? req.files.video[0]
        : null;

    try {
      const message =
        await Message.findById(
          req.params.id
        );

      if (!message) {
        removeTempFiles(req.files);

        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      const {
        title,
        content
      } = req.body;

      /* =================================================
         EXISTING IMAGES
      ================================================= */

      let keptImages = [];

      try {
        keptImages =
          req.body.existingImages
            ? JSON.parse(
                req.body.existingImages
              )
            : [];
      } catch (error) {
        removeTempFiles(req.files);

        return res.status(400).json({
          success: false,
          message:
            'Invalid existingImages format'
        });
      }

      /*
        Only allow existing images that actually
        belong to this message.
      */

      keptImages =
        Array.isArray(keptImages)
          ? keptImages.filter(
              (url) =>
                message.images.includes(
                  url
                )
            )
          : [];

      /* =================================================
         VIDEO DECISION
      ================================================= */

      const oldVideo =
        message.video || null;

      const removeVideoRequested =
        req.body.removeVideo === 'true';

      /*
        If a new video is uploaded,
        it replaces the old one.

        Otherwise the old video stays unless
        removeVideo=true.
      */

      const willHaveVideo =
        !!newVideoFile ||
        (
          !!oldVideo &&
          !removeVideoRequested
        );

      /* =================================================
         ATTACHMENT LIMIT
      ================================================= */

      const maxImages = willHaveVideo
        ? MAX_ATTACHMENTS - 1
        : MAX_ATTACHMENTS;

      if (
        keptImages.length +
          newImageFiles.length >
        maxImages
      ) {
        removeTempFiles(req.files);

        return res.status(400).json({
          success: false,
          message: willHaveVideo
            ? 'A post with a video can have up to 4 images'
            : 'Maximum of 5 images allowed'
        });
      }

      /* =================================================
         CONTENT CHECK
      ================================================= */

      if (
        (!content ||
          !content.trim()) &&
        keptImages.length === 0 &&
        newImageFiles.length === 0 &&
        !willHaveVideo
      ) {
        removeTempFiles(req.files);

        return res.status(400).json({
          success: false,
          message:
            'Please enter content or attach an image or video'
        });
      }

      /* =================================================
         UPLOAD NEW MEDIA
      ================================================= */

      let newImageUrls = [];

      let newVideo = null;

      try {
        if (newVideoFile) {
          newVideo =
            await uploadVideo(
              newVideoFile
            );
        }

        if (
          newImageFiles.length > 0
        ) {
          newImageUrls =
            await uploadImages(
              newImageFiles
            );
        }
      } catch (uploadError) {
        console.error(
          'MEDIA UPDATE UPLOAD ERROR:',
          uploadError
        );

        if (newVideo) {
          await destroyVideo(
            newVideo
          );
        }

        removeTempFiles(req.files);

        return res.status(500).json({
          success: false,
          message:
            'Failed to upload media',
          error:
            uploadError.message
        });
      }

      /* =================================================
         REMOVE LOCAL FILES
      ================================================= */

      removeTempFiles(req.files);

      /* =================================================
         REMOVED IMAGES
      ================================================= */

      const removedImages =
        message.images.filter(
          (url) =>
            !keptImages.includes(url)
        );

      /* =================================================
         FINAL VIDEO
      ================================================= */

      let finalVideo = oldVideo;

      if (newVideo) {
        finalVideo = newVideo;
      } else if (
        removeVideoRequested
      ) {
        finalVideo = null;
      }

      /* =================================================
         DID VIDEO CHANGE?
      ================================================= */

      const videoReplacedOrRemoved =
        !!oldVideo &&
        (
          !finalVideo ||
          finalVideo.publicId !==
            oldVideo.publicId
        );

      /* =================================================
         UPDATE MESSAGE
      ================================================= */

      message.title =
        title?.trim() ||
        'Church Announcement';

      message.content =
        content?.trim() || '';

      message.images = [
        ...keptImages,
        ...newImageUrls
      ];

      message.video =
        finalVideo;

      await message.save();

      /* =================================================
         CLEAN OLD CLOUDINARY FILES
         ONLY AFTER DATABASE SAVE
      ================================================= */

      await Promise.all(
        removedImages.map(
          destroyImage
        )
      );

      if (
        videoReplacedOrRemoved
      ) {
        await destroyVideo(
          oldVideo
        );
      }

      /* =================================================
         RETURN POPULATED MESSAGE
      ================================================= */

      const updated =
        await Message.findById(
          message._id
        ).populate(
          'postedBy',
          'name photo'
        );

      res.json({
        success: true,

        message:
          'Announcement updated successfully',

        data: updated
      });
    } catch (error) {
      console.error(
        'UPDATE MESSAGE ERROR:',
        error
      );

      removeTempFiles(req.files);

      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
);

/* =========================================================
   DELETE MESSAGE
========================================================= */

router.delete(
  '/:id',
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const message =
        await Message.findByIdAndDelete(
          req.params.id
        );

      if (!message) {
        return res.status(404).json({
          success: false,
          message:
            'Message not found'
        });
      }

      /* -------------------------
         DELETE IMAGES
      ------------------------- */

      await Promise.all(
        (message.images || []).map(
          destroyImage
        )
      );

      /* -------------------------
         DELETE VIDEO
      ------------------------- */

      if (message.video) {
        await destroyVideo(
          message.video
        );
      }

      res.json({
        success: true,
        message:
          'Announcement deleted'
      });
    } catch (error) {
      console.error(
        'DELETE MESSAGE ERROR:',
        error
      );

      res.status(500).json({
        success: false,
        message: 'Server Error'
      });
    }
  }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
