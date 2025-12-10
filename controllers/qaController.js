require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// In-memory job store (in production, consider using Redis or database)
const pdfJobs = new Map();

// Clean up old jobs and their PDF files (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000;
  for (const [jobId, job] of pdfJobs.entries()) {
    const jobTime = new Date(job.createdAt).getTime();
    if (jobTime < oneHourAgo) {
      // Delete PDF file if it exists
      if (job.pdfPath && fs.existsSync(job.pdfPath)) {
        try {
          fs.unlinkSync(job.pdfPath);
          console.log(`[PDF] Cleaned up PDF file: ${job.pdfPath}`);
        } catch (error) {
          console.warn(`[PDF] Failed to cleanup PDF file ${job.pdfPath}:`, error.message);
        }
      }
      pdfJobs.delete(jobId);
      console.log(`[PDF] Cleaned up old job ${jobId}`);
    }
  }
}, 600000); // Run cleanup every 10 minutes

// Get all QA reports
exports.getAllReports = async (req, res) => {
  try {
    const result = await swell.get('/content/qa', {
      limit: 1000,
      sort: 'date_created desc'
    });
    
    // Extract basic info for list view
    const reports = (result.results || []).map(report => {
      let reportData = {};
      try {
        reportData = JSON.parse(report.content?.report || '{}');
      } catch (e) {
        reportData = {};
      }
      
      return {
        id: report.id,
        po: reportData.po || 'N/A',
        customer: reportData.customer || 'N/A',
        factory: reportData.factory || 'N/A',
        loadDate: reportData.loadDate || '',
        overallStatus: reportData.overallStatus || '',
        dateCreated: report.date_created,
        dateUpdated: report.date_updated
      };
    });
    
    res.json({
      success: true,
      reports
    });
  } catch (error) {
    console.error('Error fetching QA reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch QA reports',
      error: error.message
    });
  }
};

// Get a single QA report by ID
exports.getReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await swell.get(`/content/qa/${id}`);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    let reportData = {};
    try {
      reportData = JSON.parse(report.content?.report || '{}');
    } catch (e) {
      reportData = {};
    }
    
    res.json({
      success: true,
      report: {
        id: report.id,
        data: reportData,
        dateCreated: report.date_created,
        dateUpdated: report.date_updated
      }
    });
  } catch (error) {
    console.error('Error fetching QA report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch QA report',
      error: error.message
    });
  }
};

// Create a new QA report
exports.createReport = async (req, res) => {
  try {
    const { reportData } = req.body;
    
    if (!reportData) {
      return res.status(400).json({
        success: false,
        message: 'Report data is required'
      });
    }
    
    // Store the JSON as a string in the report field
    const qaContent = {
      active: true,
      content: {
        report: JSON.stringify(reportData)
      }
    };
    
    const created = await swell.post('/content/qa', qaContent);
    
    res.json({
      success: true,
      message: 'Report saved successfully',
      report: {
        id: created.id,
        dateCreated: created.date_created
      }
    });
  } catch (error) {
    console.error('Error creating QA report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create QA report',
      error: error.message
    });
  }
};

// Update an existing QA report
exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { reportData } = req.body;
    
    if (!reportData) {
      return res.status(400).json({
        success: false,
        message: 'Report data is required'
      });
    }
    
    // Update the report field with new JSON data
    const updateData = {
      content: {
        report: JSON.stringify(reportData)
      }
    };
    
    const updated = await swell.put(`/content/qa/${id}`, updateData);
    
    res.json({
      success: true,
      message: 'Report updated successfully',
      report: {
        id: updated.id,
        dateUpdated: updated.date_updated
      }
    });
  } catch (error) {
    console.error('Error updating QA report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update QA report',
      error: error.message
    });
  }
};

// Upload image to Swell
exports.uploadImage = async (req, res) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed'
      });
    }

    // Upload to Swell
    const uploadedFile = await swell.post('/:files', {
      filename: file.originalname,
      content_type: file.mimetype,
      data: {
        $base64: file.buffer.toString('base64')
      }
    });

    res.json({
      success: true,
      image: {
        id: uploadedFile.id,
        url: uploadedFile.url,
        filename: uploadedFile.filename
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    
    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 10MB limit'
      });
    }
    
    if (error.message && error.message.includes('Only image files')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
};

// Internal function to generate PDF (used by async job)
async function generatePDFInternal(html, jobId) {
  let browser = null;
  try {
    // Update job status to processing
    if (pdfJobs.has(jobId)) {
      pdfJobs.set(jobId, {
        ...pdfJobs.get(jobId),
        status: 'processing',
        startedAt: new Date().toISOString()
      });
    }

    // Launch browser with system Chrome/Chromium
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    };
    
    // Use system Chromium if available (production)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      const fs = require('fs');
      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      
      if (!fs.existsSync(executablePath)) {
        const alternatives = [
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable'
        ];
        for (const alt of alternatives) {
          try {
            if (fs.existsSync(alt)) {
              executablePath = alt;
              break;
            }
          } catch (e) {
            // Continue to next alternative
          }
        }
      }
      
      launchOptions.executablePath = executablePath;
      launchOptions.args.push('--no-zygote', '--single-process');
    }
    
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 1
    });
    
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    console.log('[PDF] Waiting for images to load...');
    const imageStartTime = Date.now();
    
    try {
      const imageCount = await page.evaluate(() => document.images.length);
      console.log(`[PDF] Found ${imageCount} images to load`);
      
      if (imageCount > 0) {
        const maxWaitTime = Math.min(120000, imageCount * 6000);
        console.log(`[PDF] Waiting up to ${maxWaitTime/1000}s for images to load...`);
        
        await Promise.race([
          page.evaluate(() => {
            return Promise.allSettled(
              Array.from(document.images).map(img => {
                if (img.complete && img.naturalHeight > 0) {
                  return Promise.resolve();
                }
                return new Promise((resolve) => {
                  const cleanup = () => {
                    img.removeEventListener('load', onLoad);
                    img.removeEventListener('error', onError);
                  };
                  const onLoad = () => {
                    cleanup();
                    resolve();
                  };
                  const onError = () => {
                    cleanup();
                    resolve();
                  };
                  
                  img.addEventListener('load', onLoad);
                  img.addEventListener('error', onError);
                  
                  setTimeout(() => {
                    cleanup();
                    resolve();
                  }, 15000);
                });
              })
            );
          }),
          new Promise((resolve) => setTimeout(resolve, maxWaitTime))
        ]);
        
        let loadedCount = 0;
        let attempts = 0;
        const maxPollAttempts = 40;
        
        while (attempts < maxPollAttempts) {
          loadedCount = await page.evaluate(() => {
            return Array.from(document.images).filter(
              img => img.complete && img.naturalHeight > 0
            ).length;
          });
          
          if (loadedCount >= imageCount * 0.9) {
            console.log(`[PDF] ${loadedCount}/${imageCount} images loaded (${Math.round(loadedCount/imageCount*100)}%)`);
            break;
          }
          
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const elapsed = Date.now() - imageStartTime;
        console.log(`[PDF] Images loaded: ${loadedCount}/${imageCount} in ${elapsed}ms`);
      }
    } catch (e) {
      console.log(`[PDF] Image loading error (proceeding anyway):`, e.message);
    }
    
    // Convert all images to base64 server-side for iOS compatibility
    // This ensures images are properly embedded in the PDF and work on iOS viewers
    console.log('[PDF] Converting images to base64 for iOS compatibility...');
    try {
      const conversionResult = await page.evaluate(() => {
        return Promise.all(
          Array.from(document.images).map((img) => {
            // Skip if already base64
            if (img.src && img.src.startsWith('data:')) {
              return Promise.resolve({ success: true, skipped: true });
            }
            
            return new Promise((resolve) => {
              // If image is already loaded, convert immediately
              if (img.complete && img.naturalHeight > 0 && img.naturalWidth > 0) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = img.naturalWidth;
                  canvas.height = img.naturalHeight;
                  ctx.drawImage(img, 0, 0);
                  // Use JPEG format with 0.92 quality for better iOS compatibility
                  const base64 = canvas.toDataURL('image/jpeg', 0.92);
                  img.src = base64;
                  resolve({ success: true, converted: true });
                } catch (e) {
                  console.warn('Failed to convert loaded image to base64:', img.src, e);
                  resolve({ success: false, error: e.message });
                }
                return;
              }
              
              // Image not loaded yet, wait for it
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              const timeout = setTimeout(() => {
                console.warn('Image conversion timeout:', img.src);
                resolve({ success: false, error: 'timeout' });
              }, 10000);
              
              const onLoad = function() {
                clearTimeout(timeout);
                try {
                  canvas.width = this.naturalWidth;
                  canvas.height = this.naturalHeight;
                  ctx.drawImage(this, 0, 0);
                  // Use JPEG format with 0.92 quality for better iOS compatibility
                  const base64 = canvas.toDataURL('image/jpeg', 0.92);
                  this.src = base64;
                  resolve({ success: true, converted: true });
                } catch (e) {
                  console.warn('Failed to convert image to base64:', this.src, e);
                  resolve({ success: false, error: e.message });
                }
              };
              
              const onError = function() {
                clearTimeout(timeout);
                console.warn('Image load error during conversion:', this.src);
                resolve({ success: false, error: 'load failed' });
              };
              
              img.addEventListener('load', onLoad, { once: true });
              img.addEventListener('error', onError, { once: true });
            });
          })
        );
      });
      
      const results = conversionResult || [];
      const converted = results.filter(r => r && r.converted).length;
      const skipped = results.filter(r => r && r.skipped).length;
      const failed = results.filter(r => r && !r.success && !r.skipped).length;
      console.log(`[PDF] Image conversion: ${converted} converted, ${skipped} skipped, ${failed} failed`);
    } catch (e) {
      console.log(`[PDF] Image conversion error (proceeding anyway):`, e.message);
    }
    
    console.log('[PDF] Waiting for final image rendering...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate PDF with optimized settings to reduce file size and memory usage
    // Note: For large PDFs with many images, you may need to increase Node.js heap size:
    // NODE_OPTIONS="--max-old-space-size=4096" (4GB) or higher
    console.log('[PDF] Starting PDF generation...');
    const pdfStartTime = Date.now();
    const pdf = await page.pdf({
      format: 'A4',
      landscape: false,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      },
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      omitBackground: false,
      scale: 0.95 // Slightly reduce scale to reduce file size and memory usage
    });
    const pdfSizeMB = pdf.length / 1024 / 1024;
    console.log(`[PDF] PDF generated in ${Date.now() - pdfStartTime}ms (size: ${pdfSizeMB.toFixed(2)} MB)`);
    
    // Warn if PDF is very large (may cause memory issues)
    if (pdfSizeMB > 50) {
      console.warn(`[PDF] Warning: Large PDF (${pdfSizeMB.toFixed(2)} MB) may cause memory issues. Consider increasing Node.js heap size with NODE_OPTIONS="--max-old-space-size=4096"`);
    }
    
    await browser.close();
    
    // Store PDF in temp file for direct download (no Swell upload to save memory)
    // This avoids base64 encoding which doubles memory usage
    const filename = `qc-report-${jobId}.pdf`;
    const tempFilePath = path.join(os.tmpdir(), `pdf-${jobId}-${Date.now()}.pdf`);
    
    try {
      // Write PDF buffer to temp file
      console.log(`[PDF] Writing PDF to temp file (${pdfSizeMB.toFixed(2)} MB)...`);
      fs.writeFileSync(tempFilePath, pdf);
      
      // PDF buffer will be garbage collected after this scope
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Update job status to completed with temp file path
      pdfJobs.set(jobId, {
        ...pdfJobs.get(jobId),
        status: 'completed',
        pdfPath: tempFilePath, // Store temp file path instead of Swell URL
        filename: filename,
        completedAt: new Date().toISOString()
      });
      
      console.log(`[PDF] Job ${jobId} completed, PDF ready for download at ${tempFilePath}`);
    } catch (error) {
      // If file write fails, clean up
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error(`[PDF] Error generating PDF for job ${jobId}:`, error);
    
    // Update job status to failed
    if (pdfJobs.has(jobId)) {
      pdfJobs.set(jobId, {
        ...pdfJobs.get(jobId),
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }
  }
}

// Start PDF generation (async)
exports.startPDFGeneration = async (req, res) => {
  try {
    const { html, reportId } = req.body;
    
    if (!html) {
      return res.status(400).json({
        success: false,
        message: 'HTML content is required'
      });
    }
    
    // Generate unique job ID
    const jobId = crypto.randomBytes(16).toString('hex');
    
    // Create job entry
    pdfJobs.set(jobId, {
      id: jobId,
      reportId: reportId || null,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    
    // Start PDF generation in background (don't await)
    generatePDFInternal(html, jobId).catch(err => {
      console.error(`[PDF] Background job ${jobId} failed:`, err);
    });
    
    res.json({
      success: true,
      jobId: jobId,
      message: 'PDF generation started'
    });
  } catch (error) {
    console.error('Error starting PDF generation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start PDF generation',
      error: error.message
    });
  }
};

// Check PDF generation status
exports.checkPDFStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!pdfJobs.has(jobId)) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const job = pdfJobs.get(jobId);
    
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        pdfPath: job.pdfPath || null, // Changed from pdfUrl to pdfPath
        filename: job.filename || null,
        error: job.error || null,
        createdAt: job.createdAt,
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null
      }
    });
  } catch (error) {
    console.error('Error checking PDF status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check PDF status',
      error: error.message
    });
  }
};

// Download PDF
exports.downloadPDF = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!pdfJobs.has(jobId)) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const job = pdfJobs.get(jobId);
    
    if (job.status !== 'completed' || !job.pdfPath) {
      return res.status(400).json({
        success: false,
        message: 'PDF is not ready yet'
      });
    }
    
    // Check if file exists
    if (!fs.existsSync(job.pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found (may have been cleaned up)'
      });
    }
    
    // Read PDF file and stream it directly
    const filename = job.filename || `qc-report-${jobId}.pdf`;
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file directly (more memory efficient for large files)
    const fileStream = fs.createReadStream(job.pdfPath);
    fileStream.pipe(res);
    
    // Clean up file after streaming (optional - you might want to keep it for a while)
    fileStream.on('end', () => {
      // Optionally delete the file after download
      // Uncomment if you want to delete immediately after download
      // setTimeout(() => {
      //   try {
      //     if (fs.existsSync(job.pdfPath)) {
      //       fs.unlinkSync(job.pdfPath);
      //       console.log(`[PDF] Cleaned up PDF file after download: ${job.pdfPath}`);
      //     }
      //   } catch (error) {
      //     console.warn(`[PDF] Failed to cleanup PDF file: ${error.message}`);
      //   }
      // }, 1000);
    });
    
  } catch (error) {
    console.error('Error downloading PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download PDF',
      error: error.message
    });
  }
};

