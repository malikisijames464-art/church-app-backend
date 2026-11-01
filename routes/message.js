const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const Message = require('../models/Message');

const router = express.Router();

const MAX_VIDEO_SECONDS = 30;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // Cloudinary free plan limit
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5; // a video counts as one

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', '3gp', '3gpp', 'mkv', 'webm', 'avi', 'mpeg', 'mpg'];

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
    const safeName = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + safeName);
  }
});

const getExt = (name = '') => (name.split('.').pop() || '').toLowerCase();

// Phones are inconsistent about mime types (camera clips and screen
// recordings sometimes arrive as application/octet-stream), so a video is
// accepted if EITHER the mime type OR the file extension says it is one.
const looksLikeVideo = (file) =>
  (file.mimetype || '').startsWith('video/') ||
  VIDEO_EXTENSIONS.includes(getExt(file.originalname));

const looksLikeImage = (file) =>
  (file.mimetype || '').startsWith('image/') ||
  ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(getExt(file.originalname));

const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'images' && looksLikeImage(file)) return cb(null, true);
    if (file.fieldname === 'video' && looksLikeVideo(file)) return cb(null, true);
    cb(new Error('Unsupported file type. Use an image or a video file.'), false);
  }
}).fields([
  { name: 'images', maxCount: MAX_ATTACHMENTS },
  { name: 'video', maxCount: 1 }
]);

// ====================== HELPERS ======================
const flattenFiles = (files) => Object.values(files || {}).flat();

const removeTempFiles = (files) => {
  const list = Array.isArray(files) ? files : flattenFiles(files);
  list.forEach((file) => {
    fs.unlink(file.path, (err) => {
      if (err && err.code !== 'ENOENT') console.error('Temp file cleanup error:', err);
    });
  });
};

// Wraps multer so upload errors come back as clean JSON
const handleUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      removeTempFiles(req.files);
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Video is too large. Please choose a video under 100MB (record at 1080p or lower).'
          : err.message;
      return res.status(400).json({ success: false, message });
    }

    const images = (req.files && req.files.images) || [];
    if (images.some((f) => f.size > MAX_IMAGE_BYTES)) {
      removeTempFiles(req.files);
      return res.status(400).json({
        success: false,
        message: 'Each image must be 5MB or smaller.'
      });
    }
    next();
  });
};

// Turns a Cloudinary URL into its public_id so the file can be deleted
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

const destroyImage = async (url) => {
  const publicId = getPublicId(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary image delete error:', err);
  }
};

const destroyVideo = async (video) => {
  if (!video?.publicId) return;
  try {
    await cloudinary.uploader.destroy(video.publicId, { resource_type: 'video' });
  } catch (err) {
    console.error('Cloudinary video delete error:', err);
  }
};

const uploadImages = async (files) => {
  const uploads = await Promise.all(
    files.map((file) =>
      cloudinary.uploader.upload(file.path, {
        folder: 'church_announcements',
        resource_type: 'image'
      })
    )
  );
  return uploads.map((r) => r.secure_url);
};

// Chunked upload: works for large files and slow connections
const uploadLarge = (filePath, options) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, options, (err, result) => {
      if (err) return reject(err);
      if (result && result.error) return reject(result.error);
      resolve(result);
    });
  });

const isSizeError = (err) =>
  /file size too large|maximum is|too large/i.test(err?.message || '');

const makeUploadError = (message, code, status) => {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
};

// Video playback URL: first 30s, H.264 + AAC, max 1280px wide
const trimmedDeliveryUrl = (secureUrl) =>
  secureUrl
    .replace(
      '/upload/',
      `/upload/so_0,eo_${MAX_VIDEO_SECONDS},w_1280,c_limit,vc_h264,ac_aac,q_auto/`
    )
    .replace(/\.[^/.]+$/, '.mp4');

const makeThumbnail = (secureUrl) =>
  secureUrl
    .replace('/upload/', '/upload/so_0,w_800,c_limit/')
    .replace(/\.[^/.]+$/, '.jpg');

// Handles camera clips (often HEVC / 4K) and screen recordings.
//   Attempt 1: store only the first 30s, converted to H.264/AAC.
//   Attempt 2 (if attempt 1 fails for any non-size reason): store the
//     original and trim/convert it at playback time via the URL.
const uploadVideo = async (file) => {
  const baseOptions = {
    folder: 'church_announcements/videos',
    resource_type: 'video',
    chunk_size: 6 * 1024 * 1024,
    timeout: 10 * 60 * 1000
  };

  try {
    const result = await uploadLarge(file.path, {
      ...baseOptions,
      transformation: [
        { start_offset: 0, end_offset: MAX_VIDEO_SECONDS },
        { width: 1280, crop: 'limit' },
        { video_codec: 'h264', audio_codec: 'aac' }
      ]
    });

    return {
      url: result.secure_url,
      thumbnail: makeThumbnail(result.secure_url),
      duration: Math.min(Math.round(result.duration || 0), MAX_VIDEO_SECONDS),
      publicId: result.public_id
    };
  } catch (firstError) {
    console.error('VIDEO UPLOAD (trimmed) FAILED:', firstError?.message || firstError);

    if (isSizeError(firstError)) {
      throw makeUploadError(
        'Video is too large for upload. Record at 1080p or lower, or choose a shorter clip.',
        'VIDEO_TOO_LARGE',
        400
      );
    }
  }

  // Fallback: plain upload, trim at playback time
  try {
    const result = await uploadLarge(file.path, {
      ...baseOptions,
      eager: [
        {
          start_offset: 0,
          end_offset: MAX_VIDEO_SECONDS,
          width: 1280,
          crop: 'limit',
          video_codec: 'h264',
          audio_codec: 'aac',
          format: 'mp4'
        }
      ],
      eager_async: true
    });

    return {
      url: trimmedDeliveryUrl(result.secure_url),
      thumbnail: makeThumbnail(result.secure_url),
      duration: Math.min(Math.round(result.duration || 0), MAX_VIDEO_SECONDS),
      publicId: result.public_id
    };
  } catch (secondError) {
    console.error('VIDEO UPLOAD (fallback) FAILED:', secondError?.message || secondError);

    if (isSizeError(secondError)) {
      throw makeUploadError(
        'Video is too large for upload. Record at 1080p or lower, or choose a shorter clip.',
        'VIDEO_TOO_LARGE',
        400
      );
    }
    throw makeUploadError(
      `Video upload failed: ${secondError?.message || 'unknown error'}`,
      'VIDEO_UPLOAD_FAILED',
      500
    );
  }
};

const sendUploadError = (res, err) => {
  const status = err.status || 500;
  const message =
    err.code === 'VIDEO_TOO_LARGE' || err.code === 'VIDEO_UPLOAD_FAILED'
      ? err.message
      : `Failed to upload media${err.message ? `: ${err.message}` : ''}`;
  return res.status(status).json({ success: false, message });
};

// ====================== POST NEW MESSAGE ======================
router.post('/', protect, adminOnly, handleUpload, async (req, res) => {
  const imageFiles = (req.files && req.files.images) || [];
  const videoFile = req.files && req.files.video ? req.files.video[0] : null;

  try {
    const { title, content } = req.body;

    if ((!content || !content.trim()) && imageFiles.length === 0 && !videoFile) {
      removeTempFiles(req.files);
      return res.status(400).json({
        success: false,
        message: 'Please enter content or attach an image or video'
      });
    }

    const maxImages = videoFile ? MAX_ATTACHMENTS - 1 : MAX_ATTACHMENTS;
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

    try {
      if (videoFile) video = await uploadVideo(videoFile);
      if (imageFiles.length > 0) imageUrls = await uploadImages(imageFiles);
    } catch (uploadError) {
      console.error('UPLOAD ERROR:', uploadError);
      if (video) await destroyVideo(video);
      removeTempFiles(req.files);
      return sendUploadError(res, uploadError);
    }

    removeTempFiles(req.files);

    const message = await Message.create({
      title: title?.trim() || 'Church Announcement',
      content: content?.trim() || '',
      images: imageUrls,
      video,
      postedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Announcement posted successfully',
      data: message
    });
  } catch (error) {
    console.error('POST MESSAGE ERROR:', error);
    removeTempFiles(req.files);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
});

// ====================== GET ALL MESSAGES ======================
router.get('/', async (req, res) => {
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
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// ====================== UPDATE MESSAGE ======================
router.put('/:id', protect, adminOnly, handleUpload, async (req, res) => {
  const newImageFiles = (req.files && req.files.images) || [];
  const newVideoFile = req.files && req.files.video ? req.files.video[0] : null;

  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      removeTempFiles(req.files);
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const { title, content } = req.body;

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
    keptImages = keptImages.filter((url) => message.images.includes(url));

    const oldVideo = message.video || null;
    const removeVideoRequested = req.body.removeVideo === 'true';
    const willHaveVideo = !!newVideoFile || (!!oldVideo && !removeVideoRequested);

    const maxImages = willHaveVideo ? MAX_ATTACHMENTS - 1 : MAX_ATTACHMENTS;
    if (keptImages.length + newImageFiles.length > maxImages) {
      removeTempFiles(req.files);
      return res.status(400).json({
        success: false,
        message: willHaveVideo
          ? 'A post with a video can have up to 4 images'
          : 'Maximum of 5 images allowed'
      });
    }

    if (
      (!content || !content.trim()) &&
      keptImages.length === 0 &&
      newImageFiles.length === 0 &&
      !willHaveVideo
    ) {
      removeTempFiles(req.files);
      return res.status(400).json({
        success: false,
        message: 'Please enter content or attach an image or video'
      });
    }

    let newImageUrls = [];
    let newVideo = null;
    try {
      if (newVideoFile) newVideo = await uploadVideo(newVideoFile);
      if (newImageFiles.length > 0) newImageUrls = await uploadImages(newImageFiles);
    } catch (uploadError) {
      console.error('UPLOAD ERROR:', uploadError);
      if (newVideo) await destroyVideo(newVideo);
      removeTempFiles(req.files);
      return sendUploadError(res, uploadError);
    }
    removeTempFiles(req.files);

    const removedImages = message.images.filter((url) => !keptImages.includes(url));

    let finalVideo = oldVideo;
    if (newVideo) finalVideo = newVideo;
    else if (removeVideoRequested) finalVideo = null;

    const videoReplacedOrRemoved =
      !!oldVideo && (!finalVideo || finalVideo.publicId !== oldVideo.publicId);

    message.title = title?.trim() || 'Church Announcement';
    message.content = content?.trim() || '';
    message.images = [...keptImages, ...newImageUrls];
    message.video = finalVideo;

    await message.save();

    await Promise.all(removedImages.map(destroyImage));
    if (videoReplacedOrRemoved) await destroyVideo(oldVideo);

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
});

// ====================== DELETE MESSAGE ======================
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    await Promise.all((message.images || []).map(destroyImage));
    if (message.video) await destroyVideo(message.video);

    res.json({ success: true, message: 'Announcement deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;