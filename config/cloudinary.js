const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hudamoji-products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    // The admin panel already compresses in the browser; this only caps the dimensions.
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }]
  },
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 1024 * 1024, // 1MB per image; the browser sends ~350KB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

module.exports = { cloudinary, upload };