const express = require('express');
const router = express.Router();
const multer = require('multer');
const qaController = require('../controllers/qaController');

// Configure multer for memory storage (matching existing pattern)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 20
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get all QA reports
router.get('/reports', qaController.getAllReports);

// Get a single QA report
router.get('/reports/:id', qaController.getReport);

// Create a new QA report
router.post('/reports', qaController.createReport);

// Update an existing QA report
router.put('/reports/:id', qaController.updateReport);

// Upload image for QA report
router.post('/upload-image', upload.single('image'), (err, req, res, next) => {
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 10MB limit'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  // Handle other errors (like fileFilter errors)
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error'
    });
  }
  next();
}, qaController.uploadImage);

// Start PDF generation (async)
router.post('/generate-pdf', qaController.startPDFGeneration);

// Check PDF generation status
router.get('/pdf-status/:jobId', qaController.checkPDFStatus);

// Download generated PDF
router.get('/download-pdf/:jobId', qaController.downloadPDF);

module.exports = router;

