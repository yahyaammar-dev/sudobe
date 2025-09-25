const express = require("express");
const multer = require("multer");
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  }
});

router.get("/images", async (req, res) => {
  try {
    const response = await swell.get(":files", {
      where: {
        content_type: { $regex: "^image/" }
      },
      limit: 100,
      sort: { date_created: -1 }
    });
    res.json(response.results || []);
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

router.post("/images", upload.array("images", 20), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    const uploadedImages = [];
    const errors = [];

    for (const file of files) {
      try {
        const uploadedFile = await swell.post(":files", {
          filename: file.originalname,
          content_type: file.mimetype,
          data: {
            $base64: file.buffer.toString("base64")
          },
          width: 1200,
          height: 800
        });

        uploadedImages.push({
          id: uploadedFile.id,
          filename: uploadedFile.filename,
          url: uploadedFile.url,
          file_size: uploadedFile.file_size,
          date_created: uploadedFile.date_created
        });
      } catch (uploadError) {
        console.error(`Error uploading ${file.originalname}:`, uploadError);
        errors.push({
          filename: file.originalname,
          error: uploadError.message
        });
      }
    }

    if (uploadedImages.length === 0) {
      return res.status(500).json({
        error: "Failed to upload any images",
        details: errors
      });
    }

    res.json({
      success: true,
      uploaded: uploadedImages,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully uploaded ${uploadedImages.length} image(s)`
    });

  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).json({ error: "Failed to upload images" });
  }
});

router.delete("/images/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await swell.delete(`:files/${id}`);
    res.json({ success: true, message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

module.exports = router;
