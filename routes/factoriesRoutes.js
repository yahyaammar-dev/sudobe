const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const ActivityLogger = require('../services/activityLogger');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');

// Serve the factories HTML page
function serveFactoriesPage(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'factories.html'));
}

// Helper function to upload image to Swell
async function uploadImageToSwell(imageBuffer, filename, contentType) {
  try {
    const base64Data = imageBuffer.toString('base64');
    const uploadedFile = await swell.post('/:files', {
      filename: filename,
      content_type: contentType,
      data: {
        $base64: base64Data
      }
    });
    return {
      id: uploadedFile.id,
      file: uploadedFile.file,
      url: uploadedFile.url
    };
  } catch (error) {
    console.error('Error uploading image to Swell:', error);
    throw error;
  }
}

// API Routes for factories management
// Get all factories
router.get('/api', async (req, res) => {
  try {
    const factories = await swell.get('/accounts', {
      where: {
        'content.factory_name': { $ne: null }
      },
      limit: 1000
    });

    res.json({
      success: true,
      data: factories.results || []
    });
  } catch (error) {
    console.error('Error fetching factories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch factories'
    });
  }
});

// Get a single factory
router.get('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const factory = await swell.get(`/accounts/${id}`);
    res.json({
      success: true,
      data: factory
    });
  } catch (error) {
    console.error('Error fetching factory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch factory'
    });
  }
});

// Create a new factory
router.post('/api', upload.fields([
  { name: 'store_front_cover_photo', maxCount: 1 },
  { name: 'store_front_logo', maxCount: 1 },
  { name: 'personal_id', maxCount: 1 },
  { name: 'certifications', maxCount: 10 }
]), async (req, res) => {
  try {
    const { 
      factory_name, 
      email, 
      country, 
      city, 
      registration_number, 
      tax_id, 
      minimum_quantity, 
      min_days,
      max_days,
      verified,
      vetted
    } = req.body;
    
    if (!factory_name) {
      return res.status(400).json({
        success: false,
        message: 'Factory name is required'
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const factoryData = {
      email: email,
      first_name: 'factory',
      name: factory_name, // Store factory name as customer name
      content: {
        factory_name: factory_name
      }
    };

    // Add text fields to content
    if (country !== undefined) factoryData.content.country = country;
    if (city !== undefined) factoryData.content.city = city;
    if (registration_number !== undefined) factoryData.content.registration_number = registration_number;
    if (tax_id !== undefined) factoryData.content.tax_id = tax_id;
    if (minimum_quantity !== undefined) factoryData.content.minimum_quantity = minimum_quantity;
    
    console.log("-------------->  min_days, max_days", min_days, max_days);
    console.log("-------------->  req.body keys:", Object.keys(req.body));
    
    // Handle lead_time as object with min_days and max_days
    if (min_days !== undefined && min_days !== '' || max_days !== undefined && max_days !== '') {
      factoryData.content.lead_time = {};
      if (min_days !== undefined && min_days !== '') {
        factoryData.content.lead_time.min_days = parseInt(min_days);
      }
      if (max_days !== undefined && max_days !== '') {
        factoryData.content.lead_time.max_days = parseInt(max_days);
      }
    }
    
    if (verified !== undefined) factoryData.content.verified = verified === true || verified === 'true';
    if (vetted !== undefined) factoryData.content.vetted = vetted === true || vetted === 'true';

    // Handle store_front_cover_photo
    if (req.files && req.files.store_front_cover_photo && req.files.store_front_cover_photo[0]) {
      const file = req.files.store_front_cover_photo[0];
      const uploadedImage = await uploadImageToSwell(file.buffer, file.originalname, file.mimetype);
      factoryData.content.store_front_cover_photo = uploadedImage;
    }

    // Handle store_front_logo
    if (req.files && req.files.store_front_logo && req.files.store_front_logo[0]) {
      const file = req.files.store_front_logo[0];
      const uploadedImage = await uploadImageToSwell(file.buffer, file.originalname, file.mimetype);
      factoryData.content.store_front_logo = uploadedImage;
    }

    // Handle personal_id (single file)
    if (req.files && req.files.personal_id && req.files.personal_id[0]) {
      const file = req.files.personal_id[0];
      const uploadedFile = await swell.post('/:files', {
        filename: file.originalname,
        content_type: file.mimetype,
        data: {
          $base64: file.buffer.toString('base64')
        }
      });
      factoryData.content.personal_id = {
        id: uploadedFile.id,
        filename: uploadedFile.filename,
        url: uploadedFile.url,
        originalFilename: file.originalname,
        extension: file.originalname.split('.').pop(),
        mimeType: file.mimetype,
        date_uploaded: new Date().toISOString()
      };
    }

    // Handle certifications (multiple files)
    if (req.files && req.files.certifications && req.files.certifications.length > 0) {
      const certifications = [];
      for (const file of req.files.certifications) {
        try {
          const uploadedFile = await swell.post('/:files', {
            filename: file.originalname,
            content_type: file.mimetype,
            data: {
              $base64: file.buffer.toString('base64')
            }
          });
          certifications.push({
            id: uploadedFile.id,
            filename: uploadedFile.filename,
            url: uploadedFile.url,
            originalFilename: file.originalname,
            extension: file.originalname.split('.').pop(),
            mimeType: file.mimetype,
            date_uploaded: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error(`Error uploading certification ${file.originalname}:`, uploadError);
        }
      }
      if (certifications.length > 0) {
        factoryData.content.certifications = certifications;
      }
    }

    const created = await swell.post('/accounts', factoryData);
    
    // Log the activity
    ActivityLogger.logFactoryCreated(
      req.user?.id,
      req.user?.email,
      created.id,
      created,
      req
    );
    
    res.json({
      success: true,
      message: 'Factory created successfully',
      data: created
    });
  } catch (error) {
    console.error('Error creating factory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create factory',
      error: error.message
    });
  }
});

// Update a factory
router.put('/api/:id', upload.fields([
  { name: 'store_front_cover_photo', maxCount: 1 },
  { name: 'store_front_logo', maxCount: 1 },
  { name: 'personal_id', maxCount: 1 },
  { name: 'certifications', maxCount: 10 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      factory_name, 
      email, 
      country, 
      city, 
      registration_number, 
      tax_id, 
      minimum_quantity, 
      min_days,
      max_days,
      verified,
      vetted
    } = req.body;
    
    // Get existing factory to preserve other content fields
    const existingFactory = await swell.get(`/accounts/${id}`);
    const updateData = {
      content: {
        ...(existingFactory?.content || {})
      }
    };

    // Update text fields
    if (factory_name !== undefined) {
      updateData.content.factory_name = factory_name;
    }
    if (country !== undefined) updateData.content.country = country;
    if (city !== undefined) updateData.content.city = city;
    if (registration_number !== undefined) updateData.content.registration_number = registration_number;
    if (tax_id !== undefined) updateData.content.tax_id = tax_id;
    if (minimum_quantity !== undefined) updateData.content.minimum_quantity = minimum_quantity;
    
    console.log("-------------->  min_days, max_days", min_days, max_days);

    // Handle lead_time as object with min_days and max_days
    if (min_days !== undefined || max_days !== undefined) {
      // Preserve existing lead_time if it exists
      updateData.content.lead_time = updateData.content.lead_time || {};
      if (min_days !== undefined && min_days !== '') {
        updateData.content.lead_time.min_days = parseInt(min_days);
      }
      if (max_days !== undefined && max_days !== '') {
        updateData.content.lead_time.max_days = parseInt(max_days);
      }
    }
    
    if (verified !== undefined) updateData.content.verified = verified === true || verified === 'true';
    if (vetted !== undefined) updateData.content.vetted = vetted === true || vetted === 'true';

    if (email !== undefined) {
      updateData.email = email;
    }

    // Always set first_name to 'factory' and update name to factory_name
    updateData.first_name = 'factory';
    if (factory_name !== undefined) {
      updateData.name = factory_name;
    }

    // Handle store_front_cover_photo
    if (req.files && req.files.store_front_cover_photo && req.files.store_front_cover_photo[0]) {
      const file = req.files.store_front_cover_photo[0];
      const uploadedImage = await uploadImageToSwell(file.buffer, file.originalname, file.mimetype);
      updateData.content.store_front_cover_photo = uploadedImage;
    }

    // Handle store_front_logo
    if (req.files && req.files.store_front_logo && req.files.store_front_logo[0]) {
      const file = req.files.store_front_logo[0];
      const uploadedImage = await uploadImageToSwell(file.buffer, file.originalname, file.mimetype);
      updateData.content.store_front_logo = uploadedImage;
    }

    // Handle personal_id (single file - replaces existing)
    if (req.files && req.files.personal_id && req.files.personal_id[0]) {
      const file = req.files.personal_id[0];
      const uploadedFile = await swell.post('/:files', {
        filename: file.originalname,
        content_type: file.mimetype,
        data: {
          $base64: file.buffer.toString('base64')
        }
      });
      updateData.content.personal_id = {
        id: uploadedFile.id,
        filename: uploadedFile.filename,
        url: uploadedFile.url,
        originalFilename: file.originalname,
        extension: file.originalname.split('.').pop(),
        mimeType: file.mimetype,
        date_uploaded: new Date().toISOString()
      };
    }

    // Handle certifications (multiple files - appends to existing)
    if (req.files && req.files.certifications && req.files.certifications.length > 0) {
      const existingCertifications = existingFactory?.content?.certifications || [];
      const newCertifications = [];
      
      for (const file of req.files.certifications) {
        try {
          const uploadedFile = await swell.post('/:files', {
            filename: file.originalname,
            content_type: file.mimetype,
            data: {
              $base64: file.buffer.toString('base64')
            }
          });
          newCertifications.push({
            id: uploadedFile.id,
            filename: uploadedFile.filename,
            url: uploadedFile.url,
            originalFilename: file.originalname,
            extension: file.originalname.split('.').pop(),
            mimeType: file.mimetype,
            date_uploaded: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error(`Error uploading certification ${file.originalname}:`, uploadError);
        }
      }
      
      if (newCertifications.length > 0) {
        updateData.content.certifications = [...existingCertifications, ...newCertifications];
      }
    }

    const updated = await swell.put(`/accounts/${id}`, updateData);
    
    // Log the activity
    ActivityLogger.logFactoryUpdated(
      req.user?.id,
      req.user?.email,
      id,
      { factory_name, email, country, city, verified, vetted },
      req
    );
    
    res.json({
      success: true,
      message: 'Factory updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating factory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update factory',
      error: error.message
    });
  }
});

// Delete a factory
router.delete('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await swell.delete(`/accounts/${id}`);
    
    // Log the activity
    ActivityLogger.logFactoryDeleted(
      req.user?.id,
      req.user?.email,
      id,
      req
    );
    
    res.json({
      success: true,
      message: 'Factory deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting factory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete factory',
      error: error.message
    });
  }
});

// Export both the page handler and the router
module.exports = serveFactoriesPage;
module.exports.router = router;

