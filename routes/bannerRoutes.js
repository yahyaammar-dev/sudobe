const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const verifyToken = require('../middleware/auth');
const xlsx = require('xlsx');
const axios = require('axios');

// Helper function to check if URL is already a Swell URL
function isSwellUrl(url) {
  return url.includes('swell.store') || url.includes('cdn.swell');
}

// Helper function to download image and upload to Swell
async function processImageToSwell(imageUrl) {
  try {
    // If it's already a Swell URL, return it as is
    if (isSwellUrl(imageUrl)) {
      return {
        url: imageUrl,
        isSwell: true
      };
    }

    // Download the external image
    console.log(`Downloading image: ${imageUrl}`);
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Get content type from response or try to determine from URL
    let contentType = response.headers['content-type'];
    if (!contentType) {
      const extension = imageUrl.split('.').pop().toLowerCase();
      const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
      };
      contentType = mimeTypes[extension] || 'image/jpeg';
    }

    // Convert to base64
    const base64Data = Buffer.from(response.data).toString('base64');
    
    // Extract filename from URL
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'image.jpg';
    
    // Upload to Swell
    console.log(`Uploading to Swell: ${filename}`);
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
      url: uploadedFile.url,
      isSwell: false
    };

  } catch (error) {
    console.error(`Error processing image ${imageUrl}:`, error.message);
    return null;
  }
}

// Helper function to process all images for a product
async function processProductImages(imageUrls) {
  const processedImages = [];
  
  for (const imageUrl of imageUrls) {
    // Clean up the URL - remove extra whitespace and validate
    const cleanUrl = imageUrl.trim();
    
    // Skip empty URLs
    if (!cleanUrl || cleanUrl === '') {
      console.log('Skipping empty image URL');
      continue;
    }
    
    // Basic URL validation
    try {
      new URL(cleanUrl);
    } catch (urlError) {
      console.error(`Invalid URL format: ${cleanUrl}`, urlError.message);
      continue;
    }
    
    try {
      console.log(`Processing image: ${cleanUrl}`);
      const processedImage = await processImageToSwell(cleanUrl);
      if (processedImage) {
        // Format according to Swell's image structure
        if (processedImage.isSwell) {
          // For existing Swell URLs, we need to get the file info
          // For now, we'll store the URL directly
          processedImages.push({
            url: processedImage.url
          });
        } else {
          // For newly uploaded images, use the full structure
          processedImages.push({
            id: processedImage.id,
            file: processedImage.file,
            url: processedImage.url
          });
        }
        console.log(`Successfully processed image: ${cleanUrl}`);
      } else {
        console.log(`Failed to process image: ${cleanUrl}`);
      }
    } catch (error) {
      console.error(`Failed to process image ${cleanUrl}:`, error);
    }
  }
  
  return processedImages;
}

// Helper function to fetch categories
async function fetchCategories() {
  try {
    const result = await swell.get('/categories', { limit: 100 });

    // Filter to get only top-level categories (no parent_id)
    const topLevelCategories = (result.results || []).filter(
      (category) => !category.parent_id
    );

    return topLevelCategories;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

// Helper function to fetch products (for autocomplete)
async function fetchProducts(searchTerm = '') {
  try {
    const result = await swell.get('/products', {
      search: searchTerm,
      limit: 10,
      expand: ['variants']
    });
    return result.results || [];
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Helper function to fetch factories
async function fetchFactories() {
  try {
    const result = await swell.get('/accounts', {
      where: {
        'content.factory_name': { $ne: null }
      },
      limit: 100
    });
    return result.results || [];
  } catch (error) {
    console.error('Error fetching factories:', error);
    return [];
  }
}


router.get('/', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});


router.get('/categories', async (req, res) => {
  try {
    const categories = await fetchCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// API endpoint to fetch products for autocomplete
router.get('/products', async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    const products = await fetchProducts(searchTerm);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// API endpoint to fetch factories
router.get('/factories', async (req, res) => {
  try {
    const factories = await fetchFactories();
    res.json(factories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch factories' });
  }
});

// Handle form submission
router.post('/', upload.single('bannerImage'), async (req, res) => {
  try {
    const { bannerType, bannerValue, priority } = req.body;
    const bannerImage = req.file;

    if (!bannerImage) {
      return res.status(400).json({ error: 'Banner image is required' });
    }

    // 1. Upload the image file to Swell
    let imageAsset;
    try {
      const uploadedFile = await swell.post('/:files', {
        filename: bannerImage.originalname,
        content_type: bannerImage.mimetype,
        data: {
          $base64: bannerImage.buffer.toString('base64')
        },
        width: 1200, // Adjust as needed
        height: 800  // Adjust as needed
      });

      imageAsset = {
        id: uploadedFile.id,
        file: uploadedFile.file,
        url: uploadedFile.url
      };
    } catch (uploadError) {
      console.error('Error uploading image:', uploadError);
      return res.status(500).json({ error: 'Failed to upload banner image' });
    }

    // 2. Create the banner content in Swell
    try {
      const bannerData = {
        active: true,
        content: {
          image: imageAsset,
          link_type: bannerType, // 'category', 'product', or 'factory'
          data_id: bannerValue,   // The ID of the selected item
          priority: priority
        }
      };

      const createdBanner = await swell.post('/content/banners', bannerData);

      return res.redirect('/api/content?status=success&message=Banner created successfully');
    } catch (contentError) {
      console.error('Error creating banner content:', contentError);
      return res.redirect('/api/content?status=error&message=Failed to create banner');
    }

  } catch (error) {
    console.error('Error processing banner submission:', error);
    return res.redirect('/api/content?status=error&message=Internal server error');
  }
});




router.get('/get', async (req, res) => {
  try {
    const banners = await swell.get('/content/banners', {
      where: { active: true },
      limit: 100
    });

    res.json(banners);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});



router.post('/banking', async (req, res) => {
  try {
    const {
      accountNumber,
      swiftCode,
      beneficiaryName,
      beneficiaryAddress,
      beneficiaryBank,
      beneficiaryBankAddress
    } = req.body;

    // Basic validation
    if (
      !accountNumber || !swiftCode || !beneficiaryName ||
      !beneficiaryAddress || !beneficiaryBank || !beneficiaryBankAddress
    ) {
      return res.redirect('/api/content/?section=banking&status=error&message=All fields are required');
    }

    // Example: Sending to Swell or any external API
    try {
      const bankingData = {
        account_number: accountNumber,
        swift_code: swiftCode,
        beneficiary_name: beneficiaryName,
        beneficiary_address: beneficiaryAddress,
        beneficiary_bank: beneficiaryBank,
        beneficiary_bank_address: beneficiaryBankAddress,
        active: true
      };

      // Optional: Save to Swell or any other service
      const saved = await swell.post('/content/banking', bankingData);

      return res.redirect('/api/content/?section=banking&status=success&message=Banking details submitted successfully');
    } catch (saveError) {
      console.error('Error saving banking details:', saveError);
      return res.redirect('/api/content/?section=banking&status=error&message=Failed to save banking details');
    }

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.redirect('/api/content/?section=banking&status=error&message=Internal server error');
  }
});


router.post('/protection', upload.single('proctectionIcon'), async (req, res) => {
  try {
    const { title, short_description, long_description } = req.body;
    const protectionIcon = req.file;

    if (!title || !short_description || !long_description || !protectionIcon) {
      return res.redirect('/api/content?section=protection&status=error&message=All fields are required');
    }

    // 1. Upload the protection icon image
    let imageAsset;
    try {
      const uploadedIcon = await swell.post('/:files', {
        filename: protectionIcon.originalname,
        content_type: protectionIcon.mimetype,
        data: {
          $base64: protectionIcon.buffer.toString('base64')
        }
      });

      imageAsset = {
        id: uploadedIcon.id,
        file: uploadedIcon.file,
        url: uploadedIcon.url
      };
    } catch (uploadError) {
      console.error('Error uploading protection icon:', uploadError);
      return res.redirect('/api/content?section=protection&status=error&message=Failed to upload icon');
    }

    // 2. Create the protection content
    try {
      const protectionData = {
        active: true,
        content: {
          title,
          short_description,
          long_description,
          icon: imageAsset
        }
      };

      const savedProtection = await swell.post('/content/protection', protectionData);

      return res.redirect('/api/content?section=protection&status=success&message=Protection saved successfully');
    } catch (saveError) {
      console.error('Error saving protection:', saveError);
      return res.redirect('/api/content?section=protection&status=error&message=Failed to save protection');
    }

  } catch (err) {
    console.error('Unexpected error in protection POST:', err);
    return res.redirect('/api/content?section=protection&status=error&message=Internal server error');
  }
});

router.get('/banners', async (req, res) => {
  try {
    const result = await swell.get('/content/banners', {
      limit: 100,
    });
    res.json(result.results || []);
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

router.get('/protections', async (req, res) => {
  try {
    const result = await swell.get('/content/protection', {
      limit: 100,
      where: { active: true }
    });
    res.json(result.results || []);
  } catch (error) {
    console.error('Error fetching protections:', error);
    res.status(500).json({ error: 'Failed to fetch protections' });
  }
});

router.delete('/banners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await swell.delete(`/content/banners/${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

router.delete('/protections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await swell.delete(`/content/protection/${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting protection:', error);
    res.status(500).json({ error: 'Failed to delete protection' });
  }
});

router.put('/banners/:id', upload.single('bannerImage'), async (req, res) => {
  try {
    const { bannerType, bannerValue, priority } = req.body;
    const bannerImage = req.file;

    let imageAsset = null;
    if (bannerImage) {
      const uploadedFile = await swell.post('/:files', {
        filename: bannerImage.originalname,
        content_type: bannerImage.mimetype,
        data: {
          $base64: bannerImage.buffer.toString('base64')
        }
      });

      imageAsset = {
        id: uploadedFile.id,
        file: uploadedFile.file,
        url: uploadedFile.url
      };
    }

    const payload = {
      content: {
        link_type: bannerType,
        data_id: bannerValue,
        priority: priority
      }
    };
    if (imageAsset) payload.content.image = imageAsset;

    await swell.put(`/content/banners/${req.params.id}`, payload);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating banner:', err);
    res.status(500).json({ error: 'Failed to save banner' });
  }
});



router.put('/protections/:id', upload.single('proctectionIcon'), async (req, res) => {
  try {
    const { title, short_description, long_description } = req.body;
    const protectionIcon = req.file;

    let imageAsset = null;
    if (protectionIcon) {
      const uploadedFile = await swell.post('/:files', {
        filename: protectionIcon.originalname,
        content_type: protectionIcon.mimetype,
        data: {
          $base64: protectionIcon.buffer.toString('base64')
        }
      });

      imageAsset = {
        id: uploadedFile.id,
        file: uploadedFile.file,
        url: uploadedFile.url
      };
    }

    const payload = {
      content: {
        title,
        short_description,
        long_description
      }
    };
    if (imageAsset) payload.content.icon = imageAsset;

    await swell.put(`/content/protection/${req.params.id}`, payload);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating protection:', err);
    res.status(500).json({ error: 'Failed to update protection' });
  }
});

// Products endpoint for creating products from Excel
router.post('/products', upload.single('excelFile'), async (req, res) => {
  try {
    const excelFile = req.file;
    
    if (!excelFile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Excel file is required' 
      });
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    
    if (!allowedMimeTypes.includes(excelFile.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)'
      });
    }

    // Read Excel file with error handling
    let workbook, sheetName, worksheet, jsonData;
    try {
      workbook = xlsx.read(excelFile.buffer, { type: 'buffer' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Excel file contains no worksheets'
        });
      }
      
      sheetName = workbook.SheetNames[0];
      worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        return res.status(400).json({
          success: false,
          error: 'First worksheet is empty or corrupted'
        });
      }
      
      jsonData = xlsx.utils.sheet_to_json(worksheet);
      
      if (!jsonData || jsonData.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Excel file contains no data rows'
        });
      }
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Failed to parse Excel file. Please ensure the file is not corrupted',
        details: parseError.message
      });
    }


    // Define required columns for template validation - updated to match export structure
    const requiredColumns = [
      'Main-UPC',
      'ProductNameEN',
      'Price',
      'CategoryID',
      'FactoryName',
      'FactoryID'
    ];
    
    const optionalColumns = [
      'ProductNameFR',
      'ProductDescriptionEN',
      'ProductDescriptionFR',
      'Slug',
      'OldPrice',
      'CategoryName',
      'Images',
      'WeightValu',
      'WeightUnit',
      'CartonLength',
      'CartonWidth',
      'CartonHeight',
      'DimensionUnit',
      'MinDays',
      'MaxDays',
      'Quantity20-FT',
      'Quantity40-FT-HC',
      'MinmumQuantity',
      'UnitQuantity',
      'UnitQuantityFR',
      'ExpiryDate',
      'PageTitelEn',
      'PageTitelFR',
      'MetaDescriptionEN',
      'MetaDescriptionFR',
      'TagsEn',
      'TagsFR',
      'VariantType',
      'VariantValue',
      'Variant Price',
      'VariantUPC',
      'VariantID'
    ];

    // Validate template structure
    const templateErrors = [];
    const firstRow = jsonData[0];
    const availableColumns = Object.keys(firstRow);
    
    // Check for required columns
    for (const requiredCol of requiredColumns) {
      if (!availableColumns.includes(requiredCol)) {
        templateErrors.push(`Missing required column: ${requiredCol}`);
      }
    }
    
    // Check for unexpected columns (not in required or optional)
    const allValidColumns = [...requiredColumns, ...optionalColumns];
    for (const col of availableColumns) {
      if (!allValidColumns.includes(col)) {
        templateErrors.push(`Unexpected column found: ${col}. Please check the template format.`);
      }
    }
    
    if (templateErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Template validation failed',
        template_errors: templateErrors,
        available_columns: availableColumns,
        required_columns: requiredColumns
      });
    }

    // Validate data quality
    const dataErrors = [];
    let validRows = 0;
    
    // Group rows by Main-UPC first to understand the structure
    const productGroups = {};
    jsonData.forEach(row => {
      const mainUPC = row['Main-UPC'];
      if (!mainUPC) return; // Skip rows without Main-UPC
      
      if (!productGroups[mainUPC]) {
        productGroups[mainUPC] = [];
      }
      productGroups[mainUPC].push(row);
    });

    // Validate each product group
    for (const [mainUPC, rows] of Object.entries(productGroups)) {
      const groupErrors = [];
      
      // Check if we have at least one row
      if (rows.length === 0) {
        groupErrors.push('No data rows found for this product');
        dataErrors.push({
          main_upc: mainUPC,
          errors: groupErrors
        });
        continue;
      }

      // Validate the first row (main product data)
      const firstRow = rows[0];
      const firstRowErrors = [];
      
      // Check required fields for main product
      if (!firstRow['Main-UPC'] || firstRow['Main-UPC'].toString().trim() === '') {
        firstRowErrors.push('Main-UPC is required');
      }
      
      if (!firstRow['ProductNameEN'] || firstRow['ProductNameEN'].toString().trim() === '') {
        firstRowErrors.push('ProductNameEN is required');
      }
      
      if (!firstRow['Price'] || isNaN(parseFloat(firstRow['Price']))) {
        firstRowErrors.push('Price must be a valid number');
      }
      
      if (!firstRow['CategoryID'] || firstRow['CategoryID'].toString().trim() === '') {
        firstRowErrors.push('CategoryID is required');
      }
      
      if (!firstRow['FactoryName'] || firstRow['FactoryName'].toString().trim() === '') {
        firstRowErrors.push('FactoryName is required');
      }
      
      if (!firstRow['FactoryID'] || firstRow['FactoryID'].toString().trim() === '') {
        firstRowErrors.push('FactoryID is required');
      }
      
      // Validate numeric fields for main product
      if (firstRow['Price'] && isNaN(parseFloat(firstRow['Price']))) {
        firstRowErrors.push('Price must be a valid number');
      }
      
      if (firstRow['OldPrice'] && isNaN(parseFloat(firstRow['OldPrice']))) {
        firstRowErrors.push('OldPrice must be a valid number');
      }
      
      if (firstRow['WeightValu'] && isNaN(parseFloat(firstRow['WeightValu']))) {
        firstRowErrors.push('WeightValu must be a valid number');
      }
      
      if (firstRow['CartonLength'] && isNaN(parseFloat(firstRow['CartonLength']))) {
        firstRowErrors.push('CartonLength must be a valid number');
      }
      
      if (firstRow['CartonWidth'] && isNaN(parseFloat(firstRow['CartonWidth']))) {
        firstRowErrors.push('CartonWidth must be a valid number');
      }
      
      if (firstRow['CartonHeight'] && isNaN(parseFloat(firstRow['CartonHeight']))) {
        firstRowErrors.push('CartonHeight must be a valid number');
      }
      
      if (firstRow['MinDays'] && isNaN(parseInt(firstRow['MinDays']))) {
        firstRowErrors.push('MinDays must be a valid integer');
      }
      
      if (firstRow['MaxDays'] && isNaN(parseInt(firstRow['MaxDays']))) {
        firstRowErrors.push('MaxDays must be a valid integer');
      }
      
      if (firstRow['MinmumQuantity'] && isNaN(parseInt(firstRow['MinmumQuantity']))) {
        firstRowErrors.push('MinmumQuantity must be a valid integer');
      }
      
      if (firstRow['Quantity20-FT'] && isNaN(parseInt(firstRow['Quantity20-FT']))) {
        firstRowErrors.push('Quantity20-FT must be a valid integer');
      }
      
      if (firstRow['Quantity40-FT-HC'] && isNaN(parseInt(firstRow['Quantity40-FT-HC']))) {
        firstRowErrors.push('Quantity40-FT-HC must be a valid integer');
      }
      
      if (firstRowErrors.length > 0) {
        dataErrors.push({
          main_upc: mainUPC,
          row: 2, // First data row (after header)
          errors: firstRowErrors
        });
      } else {
        validRows++;
      }

      // Validate variant rows (if any)
      if (rows.length > 1) {
        for (let i = 1; i < rows.length; i++) {
          const variantRow = rows[i];
          const variantErrors = [];
          const rowNumber = i + 2; // +2 because Excel is 1-indexed and we skip header
          
          // For variant rows, only validate variant-specific fields
          if (variantRow['VariantType'] && !variantRow['VariantValue']) {
            variantErrors.push('VariantValue is required when VariantType is provided');
          }
          
          if (variantRow['VariantValue'] && !variantRow['VariantType']) {
            variantErrors.push('VariantType is required when VariantValue is provided');
          }
          
          if (variantRow['Variant Price'] && isNaN(parseFloat(variantRow['Variant Price']))) {
            variantErrors.push('Variant Price must be a valid number');
          }
          
          // Validate numeric fields for variants
          if (variantRow['WeightValu'] && isNaN(parseFloat(variantRow['WeightValu']))) {
            variantErrors.push('WeightValu must be a valid number');
          }
          
          if (variantRow['CartonLength'] && isNaN(parseFloat(variantRow['CartonLength']))) {
            variantErrors.push('CartonLength must be a valid number');
          }
          
          if (variantRow['CartonWidth'] && isNaN(parseFloat(variantRow['CartonWidth']))) {
            variantErrors.push('CartonWidth must be a valid number');
          }
          
          if (variantRow['CartonHeight'] && isNaN(parseFloat(variantRow['CartonHeight']))) {
            variantErrors.push('CartonHeight must be a valid number');
          }
          
          if (variantRow['MinDays'] && isNaN(parseInt(variantRow['MinDays']))) {
            variantErrors.push('MinDays must be a valid integer');
          }
          
          if (variantRow['MaxDays'] && isNaN(parseInt(variantRow['MaxDays']))) {
            variantErrors.push('MaxDays must be a valid integer');
          }
          
          if (variantRow['MinmumQuantity'] && isNaN(parseInt(variantRow['MinmumQuantity']))) {
            variantErrors.push('MinmumQuantity must be a valid integer');
          }
          
          if (variantRow['Quantity20-FT'] && isNaN(parseInt(variantRow['Quantity20-FT']))) {
            variantErrors.push('Quantity20-FT must be a valid integer');
          }
          
          if (variantRow['Quantity40-FT-HC'] && isNaN(parseInt(variantRow['Quantity40-FT-HC']))) {
            variantErrors.push('Quantity40-FT-HC must be a valid integer');
          }
          
          if (variantErrors.length > 0) {
            dataErrors.push({
              main_upc: mainUPC,
              row: rowNumber,
              errors: variantErrors
            });
          }
        }
      }
    }
    
    // If there are data validation errors, return them
    if (dataErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Data validation failed',
        data_errors: dataErrors,
        total_rows: jsonData.length,
        valid_rows: validRows,
        invalid_rows: dataErrors.length
      });
    }

    // Group rows by Main-UPC (this was already done above, but keeping for consistency)
    // Remove the duplicate declaration - productGroups already exists from line 653
    // Also remove the duplicate grouping - it was already done during validation
    
    // Remove this entire block since productGroups is already populated:
    // jsonData.forEach(row => {
    //   const mainUPC = row['Main-UPC'];
    //   if (!mainUPC) return; // Skip rows without Main-UPC
    //   
    //   if (!productGroups[mainUPC]) {
    //     productGroups[mainUPC] = [];
    //   }
    //   productGroups[mainUPC].push(row);
    // });

    const createdProducts = [];
    const errors = [];

    // Process each product group
    for (const [mainUPC, rows] of Object.entries(productGroups)) {
      try {
        // Use the first row for main product data
        const mainRow = rows[0];
        
        // Collect all images from all rows in the group
        const allImages = [];
        rows.forEach((row, index) => {
          if (row.Images) {
            console.log(`Row ${index + 1} images: ${row.Images}`);
            const rowImages = row.Images
              .split(',')
              .map(img => img.trim())
              .filter(img => img && img.length > 0); // Filter out empty strings
            
            console.log(`Processed row images:`, rowImages);
            allImages.push(...rowImages);
          }
        });

        // Remove duplicates while preserving order
        const uniqueImages = [...new Set(allImages)];

        console.log('All unique images for group:', uniqueImages);

        // Process images - download external ones and upload to Swell
        console.log(`Processing ${uniqueImages.length} images for product ${mainUPC}`);
        const processedImages = await processProductImages(uniqueImages);
        console.log(`Successfully processed ${processedImages.length} images`);

        // Build variants from all rows
        const variants = [];
        const optionValues = {};
        
        rows.forEach(row => {
          if (row.VariantType && row.VariantValue) {
            // Group variants by type
            if (!optionValues[row.VariantType]) {
              optionValues[row.VariantType] = [];
            }
            
            optionValues[row.VariantType].push({
              name: row.VariantValue,
              price: parseFloat(row['Variant Price']) || parseFloat(row.Price) || 0,
              upc: row.VariantUPC || row['Main-UPC'],
              id: row.VariantID,
              shipment_weight: parseFloat(row.WeightValu) || 0,
              flc_quantity: [
                {
                  "20_ft_": parseInt(row['Quantity20-FT']) || 0,
                  "40_ft_hc": parseInt(row['Quantity40-FT-HC']) || 0
                }
              ],
              carton_dimensions_cm_: `${row.CartonLength} x ${row.CartonWidth} x ${row.CartonHeight}`,
              expiry_date: row.ExpiryDate,
              lead_time: [
                {
                  min_days: parseInt(row.MinDays) || 0,
                  max_days: parseInt(row.MaxDays) || 0
                }
              ],
              minimum_quantity: parseInt(row.MinmumQuantity) || 1000,
              unit_quantity: row.UnitQuantity,
              unit_quantity_fr: row.UnitQuantityFR
            });
          }
        });

        // Create product data
        const productData = {
          name: mainRow.ProductNameEN || 'Unnamed Product',
          slug: mainRow.Slug || mainRow.ProductNameEN?.toLowerCase().replace(/\s+/g, '-'),
          description: mainRow.ProductDescriptionEN || '',
          price: parseFloat(mainRow.Price) || 0,
          sale_price: parseFloat(mainRow.OldPrice) || null,
          active: true,
          category_id: mainRow.CategoryID,  
          images: processedImages, // Use the processed images
          content: {
            // English content
            name_en: mainRow.ProductNameEN,
            description_en: mainRow.ProductDescriptionEN,
            page_title_en: mainRow.PageTitelEn,
            meta_description_en: mainRow.MetaDescriptionEN,
            tags_en: mainRow.TagsEn,
            
            // French content
            name_fr: mainRow.ProductNameFR,
            description_fr: mainRow.ProductDescriptionFR,
            page_title_fr: mainRow.PageTitelFR,
            meta_description_fr: mainRow.MetaDescriptionFR,
            tags_fr: mainRow.TagsFR,
            
            // Product details
            main_upc: mainRow['Main-UPC'],
            factory_name: mainRow.FactoryName,
            factory_id: mainRow.FactoryID,
            category_name: mainRow.CategoryName,
            minimum_quantity: parseInt(mainRow.MinmumQuantity) || 1000,
            unit_quantity: mainRow.UnitQuantity,
            unit_quantity_fr: mainRow.UnitQuantityFR,
            expiry_date: mainRow.ExpiryDate,
            
            // Physical properties
            weight_value: parseFloat(mainRow.WeightValu) || 0,
            weight_unit: mainRow.WeightUnit,
            carton_length: parseFloat(mainRow.CartonLength) || 0,
            carton_width: parseFloat(mainRow.CartonWidth) || 0,
            carton_height: parseFloat(mainRow.CartonHeight) || 0,
            dimension_unit: mainRow.DimensionUnit,
            
            // Lead time
            min_days: parseInt(mainRow.MinDays) || 0,
            max_days: parseInt(mainRow.MaxDays) || 0,
            
            // FLC quantities
            flc_quantity: [
              {
                "20_ft_": parseInt(mainRow['Quantity20-FT']) || 0,
                "40_ft_hc": parseInt(mainRow['Quantity40-FT-HC']) || 0
              }
            ],
            expiry_date: mainRow.ExpiryDate,
            lead_time: [
              {
                min_days: parseInt(mainRow.MinDays) || 0,
                max_days: parseInt(mainRow.MaxDays) || 0
              }
            ],
            minimum_quantity: parseInt(mainRow.MinmumQuantity) || 1000,
            weight: [
              {
                value: parseFloat(mainRow.WeightValu) || 0,
                unit: mainRow.WeightUnit
              }
            ],
            dimensions: [
              {
                height: parseFloat(mainRow.CartonLength) || 0,
                width: parseFloat(mainRow.CartonWidth) || 0,
                depth: parseFloat(mainRow.CartonHeight) || 0,
                unit: mainRow.DimensionUnit
              }
            ],
            unit_quantity: mainRow.UnitQuantity,
            unit_quantity_fr: mainRow.UnitQuantityFR,
          }
        };

        // Add options if variants exist
        if (Object.keys(optionValues).length > 0) {
          productData.options = Object.entries(optionValues).map(([type, values]) => ({
            name: type,
            values: values
          }));
        }

        const createdProduct = await swell.post('/products', productData);
        createdProducts.push(createdProduct);

      } catch (productError) {
        console.error(`Error creating product group ${mainUPC}:`, productError);
        errors.push({
          mainUPC: mainUPC,
          error: productError.message,
          rows: rows.length
        });
      }
    }

    res.json({
      success: true,
      message: `Successfully processed ${createdProducts.length} product groups from Excel`,
      products: createdProducts,
      total_processed: createdProducts.length,
      total_groups: Object.keys(productGroups).length,
      total_rows: jsonData.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error processing Excel file:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process Excel file',
      details: error.message 
    });
  }
});

// Export products to Excel
router.get('/products/export', async (req, res) => {
  try {
    // Fetch all products from Swell
    const productsResponse = await swell.get('/products', {
      limit: 1000, // Adjust limit as needed
      expand: ['category', 'images']
    });

    const products = productsResponse.results || [];
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No products found to export'
      });
    }

    // Extract unique category IDs and factory IDs for bulk fetching
    const categoryIds = new Set();
    const factoryIds = new Set();
    
    products.forEach(product => {
      // Extract category IDs from category_index
      if (product.category_index?.id && Array.isArray(product.category_index.id)) {
        product.category_index.id.forEach(id => categoryIds.add(id));
      }
      
      // Extract factory IDs
      if (product.content?.factory_id) {
        factoryIds.add(product.content.factory_id);
      }
    });

    // Fetch all categories in bulk
    const categoryMap = {};
    if (categoryIds.size > 0) {
      try {
        const categoriesResponse = await swell.get('/categories', {
          where: { id: { $in: Array.from(categoryIds) } },
          limit: categoryIds.size
        });
        
        (categoriesResponse.results || []).forEach(category => {
          console.log("Category is::", category);
          categoryMap[category.id] = category.name;
        });
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    }



    // Fetch all factories in bulk
    const factoryMap = {};
    if (factoryIds.size > 0) {
      try {
        const factoriesResponse = await swell.get('/accounts', {
          where: { id: { $in: Array.from(factoryIds) } },
          limit: factoryIds.size
        });
        
        (factoriesResponse.results || []).forEach(factory => {
          factoryMap[factory.id] = factory.name;
        });
      } catch (error) {
        console.error('Error fetching factories:', error);
      }
    }


    // Create Excel data with the same structure as import template
    const excelData = [];

    for (const product of products) {
      // Get the category ID that has a name (main category)
      const categoryIds = product.category_index?.id || [];
      let categoryId = '';
      let categoryName = '';
      
      // Find the first category ID that has a name in our categoryMap
      for (const catId of categoryIds) {
        if (categoryMap[catId]) {
          categoryId = catId;
          categoryName = categoryMap[catId];
          break;
        }
      }

      // Get factory name
      const factoryId = product.content?.factory_id || '';
      const factoryName = factoryId ? factoryMap[factoryId] || '' : '';

      // Get main product data
      const mainRow = {
        'Main-UPC': product.content?.main_upc || product.id,
        'ProductNameEN': product.content?.name_en || product.name || '',
        'ProductNameFR': product.content?.name_fr || '',
        'Price': product.price || 0,
        'OldPrice': product.sale_price || '',
        'CategoryID': categoryId,
        'CategoryName': categoryName,
        'FactoryName': factoryName,
        'FactoryID': factoryId,
        'ProductDescriptionEN': product.content?.description_en || product.description || '',
        'ProductDescriptionFR': product.content?.description_fr || '',
        'Slug': product.slug || '',
        'Images': product.images?.map(img => img.file?.url || img.url).filter(Boolean).join(',') || '',
        'WeightValu': product.content?.weight_value || '',
        'WeightUnit': product.content?.weight_unit || '',
        'CartonLength': product.content?.carton_length || '',
        'CartonWidth': product.content?.carton_width || '',
        'CartonHeight': product.content?.carton_height || '',
        'DimensionUnit': product.content?.dimension_unit || '',
        'MinDays': product.content?.min_days || '',
        'MaxDays': product.content?.max_days || '',
        'Quantity20-FT': product.content?.flc_quantity?.[0]?.['20_ft_'] || '',
        'Quantity40-FT-HC': product.content?.flc_quantity?.[0]?.['40_ft_hc'] || '',
        'MinmumQuantity': product.content?.minimum_quantity || '',
        'UnitQuantity': product.content?.unit_quantity || '',
        'UnitQuantityFR': product.content?.unit_quantity_fr || '',
        'ExpiryDate': product.content?.expiry_date || '',
        'PageTitelEn': product.content?.page_title_en || '',
        'PageTitelFR': product.content?.page_title_fr || '',
        'MetaDescriptionEN': product.content?.meta_description_en || '',
        'MetaDescriptionFR': product.content?.meta_description_fr || '',
        'TagsEn': product.content?.tags_en || '',
        'TagsFR': product.content?.tags_fr || ''
      };

      // If product has variants/options, create additional rows for each variant
      if (product.options && product.options.length > 0) {
        for (const option of product.options) {
          if (option.values && option.values.length > 0) {
            for (const variant of option.values) {
              const variantRow = {
                ...mainRow,
                'VariantType': option.name || '',
                'VariantValue': variant.name || '',
                'Variant Price': variant.price || mainRow.Price,
                'VariantUPC': variant.upc || mainRow['Main-UPC'],
                'VariantID': variant.id || '',
                'WeightValu': variant.shipment_weight || mainRow.WeightValu,
                'CartonLength': variant.carton_dimensions_cm_?.split(' x ')[0] || mainRow.CartonLength,
                'CartonWidth': variant.carton_dimensions_cm_?.split(' x ')[1] || mainRow.CartonWidth,
                'CartonHeight': variant.carton_dimensions_cm_?.split(' x ')[2] || mainRow.CartonHeight,
                'MinDays': variant.lead_time?.[0]?.min_days || mainRow.MinDays,
                'MaxDays': variant.lead_time?.[0]?.max_days || mainRow.MaxDays,
                'Quantity20-FT': variant.flc_quantity?.[0]?.['20_ft_'] || mainRow['Quantity20-FT'],
                'Quantity40-FT-HC': variant.flc_quantity?.[0]?.['40_ft_hc'] || mainRow['Quantity40-FT-HC'],
                'MinmumQuantity': variant.minimum_quantity || mainRow.MinmumQuantity,
                'UnitQuantity': variant.unit_quantity || mainRow.UnitQuantity,
                'UnitQuantityFR': variant.unit_quantity_fr || mainRow.UnitQuantityFR,
                'ExpiryDate': variant.expiry_date || mainRow.ExpiryDate
              };
              excelData.push(variantRow);
            }
          }
        }
      } else {
        // If no variants, just add the main product row
        excelData.push(mainRow);
      }
    }

    // Create workbook and worksheet
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(excelData);

    // Set column widths for better readability
    const columnWidths = [
      { wch: 15 }, // Main-UPC
      { wch: 30 }, // ProductNameEN
      { wch: 30 }, // ProductNameFR
      { wch: 10 }, // Price
      { wch: 10 }, // OldPrice
      { wch: 15 }, // CategoryID
      { wch: 20 }, // CategoryName
      { wch: 20 }, // FactoryName
      { wch: 15 }, // FactoryID
      { wch: 50 }, // ProductDescriptionEN
      { wch: 50 }, // ProductDescriptionFR
      { wch: 30 }, // Slug
      { wch: 100 }, // Images
      { wch: 15 }, // VariantType
      { wch: 20 }, // VariantValue
      { wch: 10 }, // Variant Price
      { wch: 15 }, // VariantUPC
      { wch: 15 }, // VariantID
      { wch: 10 }, // WeightValu
      { wch: 10 }, // WeightUnit
      { wch: 10 }, // CartonLength
      { wch: 10 }, // CartonWidth
      { wch: 10 }, // CartonHeight
      { wch: 10 }, // DimensionUnit
      { wch: 5 },  // MinDays
      { wch: 5 },  // MaxDays
      { wch: 10 }, // Quantity20-FT
      { wch: 10 }, // Quantity40-FT-HC
      { wch: 10 }, // MinmumQuantity
      { wch: 15 }, // UnitQuantity
      { wch: 15 }, // UnitQuantityFR
      { wch: 15 }, // ExpiryDate
      { wch: 30 }, // PageTitelEn
      { wch: 30 }, // PageTitelFR
      { wch: 50 }, // MetaDescriptionEN
      { wch: 50 }, // MetaDescriptionFR
      { wch: 30 }, // TagsEn
      { wch: 30 }  // TagsFR
    ];
    
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Products');

    // Generate Excel buffer
    const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers for file download
    const filename = `products_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);

    // Send the Excel file
    res.send(excelBuffer);

  } catch (error) {
    console.error('Error exporting products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export products',
      details: error.message
    });
  }
});

module.exports = router;