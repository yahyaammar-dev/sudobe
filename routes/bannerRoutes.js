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
const fs = require('fs');

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
    const result = await swell.get('/categories', { limit: 1000 });

    // Return ALL categories including subcategories (don't filter by parent_id)
    return result.results || [];
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
    // Fetch all accounts with a non-null factory_name, up to 1000 results
    const { results: accounts } = await swell.get('/accounts', {
      where: {
        'content.factory_name': { $ne: null }
      },
      limit: 1000
    });

    // Filter out accounts where factory_name is empty/whitespace or verified is not true
    const validFactories = (accounts || []).filter(
      acc => acc.content?.factory_name?.trim() && acc.content?.verified
    );

    return validFactories;
  } catch (error) {
    console.error('Error fetching factories:', error);
    return [];
  }
}


// Helper function to find existing product by Main-UPC or ProductID
async function findExistingProduct(mainUPC, productId = null) {
  try {
    // First try to find by Main-UPC in content
    if (mainUPC) {
      const searchByUPC = await swell.get('/products', {
        where: {
          'content.main_upc': mainUPC
        },
        limit: 1
      });
      
      if (searchByUPC.results && searchByUPC.results.length > 0) {
        return searchByUPC.results[0];
      }
    }
    
    // If not found by UPC and we have a productId, try to find by ID
    if (productId) {
      try {
        const product = await swell.get(`/products/${productId}`);
        return product;
      } catch (error) {
        // Product not found by ID, continue
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding existing product:', error);
    return null;
  }
}

// Helper function to check if an image URL is already a Swell image
function isExistingSwellImage(imageUrl, existingProduct) {
  if (!existingProduct || !existingProduct.images) return false;
  
  return existingProduct.images.some(img => 
    img.url === imageUrl || 
    img.file?.url === imageUrl ||
    (img.file && img.file.url === imageUrl)
  );
}

// Helper function to process images for existing products (avoid duplicates)
async function processImagesForExistingProduct(imageUrls, existingProduct) {
  const processedImages = [];
  const existingImages = existingProduct.images || [];
  
  // Keep existing Swell images
  for (const existingImg of existingImages) {
    if (existingImg.url || existingImg.file?.url) {
      processedImages.push({
        id: existingImg.id,
        file: existingImg.file,
        url: existingImg.url || existingImg.file?.url
      });
    }
  }
  
  // Process only new images (not already in Swell)
  for (const imageUrl of imageUrls) {
    const cleanUrl = imageUrl.trim();
    
    // Skip empty URLs
    if (!cleanUrl || cleanUrl === '') {
      continue;
    }
    
    // Skip if this image is already in the product
    if (isExistingSwellImage(cleanUrl, existingProduct)) {
      console.log(`Image already exists in product: ${cleanUrl}`);
      continue;
    }
    
    // Skip if it's already a Swell URL (to avoid re-uploading)
    if (isSwellUrl(cleanUrl)) {
      console.log(`Image is already a Swell URL: ${cleanUrl}`);
      // Add the Swell URL directly without re-uploading
      processedImages.push({
        url: cleanUrl
      });
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
      console.log(`Processing new image: ${cleanUrl}`);
      const processedImage = await processImageToSwell(cleanUrl);
      if (processedImage) {
        processedImages.push({
          id: processedImage.id,
          file: processedImage.file,
          url: processedImage.url
        });
        console.log(`Successfully processed new image: ${cleanUrl}`);
      }
    } catch (error) {
      console.error(`Failed to process image ${cleanUrl}:`, error);
    }
  }
  
  return processedImages;
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const factoryId = req.query.factory || '';
    
    // Build query options
    const queryOptions = {
      search: searchTerm,
      limit: limit,
      page: page,
      expand: ['variants', 'category', 'images']
    };
    
    // If a specific factory is selected, filter by that factory
    if (factoryId) {
      queryOptions.where = {
        'content.factory_id': factoryId
      };
    } else {
      // If no specific factory is selected, filter by all verified factories
      const verifiedFactories = await fetchFactories();
      const verifiedFactoryIds = verifiedFactories.map(f => f.id);
      
      if (verifiedFactoryIds.length > 0) {
        queryOptions.where = {
          'content.factory_id': { $in: verifiedFactoryIds }
        };
      }
    }
    
    // Fetch products with pagination
    const result = await swell.get('/products', queryOptions);
    
    // Calculate total pages from count and limit
    const totalProducts = result.count || 0;
    const totalPages = Math.ceil(totalProducts / limit);
    
    // Return full result with pagination data
    res.json({
      results: result.results || [],
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalProducts: totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit: limit
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
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
      
      // Parse with header option to ensure all columns are included
      jsonData = xlsx.utils.sheet_to_json(worksheet, { 
        header: 1, // Use first row as header
        defval: '' // Default value for empty cells
      });
      
      // Convert to object format with proper headers
      if (jsonData.length > 0) {
        const headers = jsonData[0];
        const dataRows = jsonData.slice(1);
        
        jsonData = dataRows.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] || '';
          });
          return obj;
        });
      }
      
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
      'ProductID',
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
      'VariantPrice',
      'VariantUPC',
      'VariantID',
      'UnitPerCarton'
    ];

    // Validate template structure
    const templateErrors = [];
    const firstRow = jsonData[0];
    const availableColumns = Object.keys(firstRow);
    
    // Add debugging to see what's in the first row
    console.log('First row data:', firstRow);
    console.log('Available columns:', availableColumns);
    
    // Filter out empty columns (__EMPTY, __EMPTY_1, etc.)
    const validColumns = availableColumns.filter(col => 
      !col.startsWith('__EMPTY') && 
      col !== undefined && 
      col !== null &&
      col.trim() !== '' // Add this to filter out empty strings
    );
    
    console.log('Valid columns after filtering:', validColumns);
    
    // Check for required columns
    for (const requiredCol of requiredColumns) {
      if (!validColumns.includes(requiredCol)) {
        // Check if the column exists but is empty in all rows
        const columnExistsInData = jsonData.some(row => row.hasOwnProperty(requiredCol));
        
        if (columnExistsInData) {
          // Column exists but is empty - this is acceptable for optional data
          console.log(`Column ${requiredCol} exists but is empty in all rows - this is acceptable`);
        } else {
          templateErrors.push(`Missing required column: ${requiredCol}`);
        }
      }
    }
    
    // Check for unexpected columns (not in required or optional)
    const allValidColumns = [...requiredColumns, ...optionalColumns];
    for (const col of validColumns) {
      if (!allValidColumns.includes(col)) {
        templateErrors.push(`Unexpected column found: ${col}. Please check the template format.`);
      }
    }
    
    if (templateErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Template validation failed',
        template_errors: templateErrors,
        available_columns: validColumns,
        required_columns: requiredColumns,
        filtered_empty_columns: availableColumns.filter(col => col.startsWith('__EMPTY'))
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
      
      if (firstRow['Price'] && isNaN(parseFloat(firstRow['Price']))) {
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

      if (firstRow['UnitPerCarton'] && isNaN(parseInt(firstRow['UnitPerCarton']))) {
        firstRowErrors.push('UnitPerCarton must be a valid integer');
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
          
          if (variantRow['VariantPrice'] && isNaN(parseFloat(variantRow['VariantPrice']))) {
            variantErrors.push('VariantPrice must be a valid number');
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

          if (variantRow['UnitPerCarton'] && isNaN(parseInt(variantRow['UnitPerCarton']))) {
            variantErrors.push('UnitPerCarton must be a valid integer');
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
            
            console.log("Variant carton dimension is:: " , `${row.CartonLength} x ${row.CartonWidth} x ${row.CartonHeight}`)

            optionValues[row.VariantType].push({
              name: row.VariantValue,
              price: row['VariantPrice'] ? parseFloat(row['VariantPrice']) : 0,
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
          $locale: {
            'en-US': {
              name: mainRow.ProductNameEN,
              description: mainRow.ProductDescriptionEN,
              meta_title: mainRow.PageTitelEn,
              meta_description: mainRow.MetaDescriptionEN,
              tags: mainRow.TagsEn ? mainRow.TagsEn.split(',').map(tag => tag.trim()) : []
            },
            'fr': {
              name: mainRow.ProductNameFR,
              description: mainRow.ProductDescriptionFR,
              meta_title: mainRow.PageTitelFR,
              meta_description: mainRow.MetaDescriptionFR,
              tags: mainRow.TagsFR ? mainRow.TagsFR.split(',').map(tag => tag.trim()) : []
            }
          },
          content: {
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
            unit_quantity: mainRow.UnitPerCarton
          }
        };

        // Add options if variants exist
        if (Object.keys(optionValues).length > 0) {
          productData.options = Object.entries(optionValues).map(([type, values]) => ({
            name: type,
            values: values
          }));
        }

        // Check if product already exists
        const existingProduct = await findExistingProduct(mainRow['Main-UPC'], mainRow['ProductID']);

        if (existingProduct) {
          
          // Process images for existing product (avoid duplicates)
          const processedImages = await processImagesForExistingProduct(uniqueImages, existingProduct);
          
          // Update productData with processed images
          productData.images = processedImages;
          
          // Update existing product
          try {
            const updatedProduct = await swell.put(`/products/${existingProduct.id}`, productData);
            createdProducts.push({
              ...updatedProduct,
              action: 'updated',
              originalId: existingProduct.id
            });
            console.log(`Successfully updated product: ${existingProduct.id}`);
          } catch (updateError) {
            console.error(`Error updating product ${existingProduct.id}:`, updateError);
            errors.push({
              mainUPC: mainUPC,
              error: `Failed to update existing product: ${updateError.message}`,
              rows: rows.length
            });
          }
        } else {
          console.log(`Creating new product with Main-UPC: ${mainRow['Main-UPC']}`);
          
          // Process images normally for new products
          console.log(`Processing ${uniqueImages.length} images for new product ${mainUPC}`);
          const processedImages = await processProductImages(uniqueImages);
          console.log(`Successfully processed ${processedImages.length} images`);
          
          // Update productData with processed images
          productData.images = processedImages;
          
          // Create new product
          try {
            const createdProduct = await swell.post('/products', productData);
            
            // Check if the response contains errors
            if (createdProduct.errors && Object.keys(createdProduct.errors).length > 0) {
              console.error(`Product creation failed with errors:`, createdProduct.errors);
              errors.push({
                mainUPC: mainUPC,
                error: `Failed to create product: ${JSON.stringify(createdProduct.errors)}`,
                rows: rows.length,
                swellErrors: createdProduct.errors
              });
            } else {
              // Only add to createdProducts if there are no errors
              createdProducts.push({
                ...createdProduct,
                action: 'created'
              });
              console.log(`Successfully created new product: ${createdProduct.id}`);
            }
          } catch (createError) {
            console.error(`Error creating product:`, createError);
            errors.push({
              mainUPC: mainUPC,
              error: `Failed to create new product: ${createError.message}`,
              rows: rows.length
            });
          }
        }

      } catch (productError) {
        console.error(`Error creating product group ${mainUPC}:`, productError);
        errors.push({
          mainUPC: mainUPC,
          error: productError.message,
          rows: rows.length
        });
      }
    }

    // Determine overall success based on whether there are any errors
    const hasErrors = errors.length > 0;
    const successCount = createdProducts.length;
    
    res.json({
      success: !hasErrors,
      message: hasErrors 
        ? `Import completed with ${errors.length} errors. ${successCount} products processed successfully.`
        : `Successfully processed ${successCount} product groups from Excel`,
      products: createdProducts,
      total_processed: successCount,
      total_groups: Object.keys(productGroups).length,
      total_rows: jsonData.length,
      created_count: createdProducts.filter(p => p.action === 'created').length,
      updated_count: createdProducts.filter(p => p.action === 'updated').length,
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

    // Fetch products in both English and French locales
    const [productsResponseEN, productsResponseFR] = await Promise.all([
      swell.get('/products?$locale=en', {
        limit: 1000,
        expand: ['category', 'images', 'variants']
      }),
      swell.get('/products?$locale=fr', {
        limit: 1000,
        expand: ['category', 'images', 'variants']
      })
    ]);

    const productsEN = productsResponseEN.results || [];
    const productsFR = productsResponseFR.results || [];


    // Merge products from both locales by product ID
    const productsMap = new Map();
    
    // Add English products
    productsEN.forEach(product => {
      productsMap.set(product.id, {
        ...product,
        en_data: product
      });
    });
    
    // Merge with French products
    productsFR.forEach(product => {
      if (productsMap.has(product.id)) {
        productsMap.get(product.id).fr_data = product;
      } else {
        productsMap.set(product.id, {
          ...product,
          fr_data: product
        });
      }
    });

    const products = Array.from(productsMap.values());

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

      // Get main product data from both locales
      const productEN = product.en_data || product;
      const productFR = product.fr_data || product;
      
      const mainRow = {
        'Main-UPC': product.content?.main_upc || product.id,
        'ProductID': product.id, // Add the Swell product ID after Main-UPC
        'FactoryName': factoryName,
        'FactoryID': factoryId,
        'ProductNameEN': productEN.content?.name_en || productEN.name || '',
        'ProductNameFR': productFR.content?.name_fr || productFR.name || '',
        'Slug': product.slug || '',
        'ProductDescriptionEN': productEN.content?.description_en || productEN.description || '',
        'ProductDescriptionFR': productFR.content?.description_fr || productFR.description || '',
        'PageTitelEn': productEN.meta_title || '',
        'PageTitelFR': productFR.meta_title || '',
        'MetaDescriptionEN': productEN.meta_description || '',
        'MetaDescriptionFR': productFR.meta_description || '',
        'CategoryName': categoryName,
        'CategoryID': categoryId,
        'TagsEn': productEN.content?.tags_en || '',
        'TagsFR': productFR.content?.tags_fr || '',
        'Price': product.price || 0,
        'OldPrice': product.sale_price || '',
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
        'UnitPerCarton': product.content?.unit_quantity || '',
        'UnitQuantityFR': product.content?.unit_quantity_fr || '',
        'ExpiryDate': product.content?.expiry_date || '',
        'Images': product.images?.map(img => img.file?.url || img.url).filter(Boolean).join(',') || ''
      };
      // If product has variants, create additional rows for each variant
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          const variantRow = {
            'Main-UPC': variant.upc || mainRow['Main-UPC'],
            'ProductID': product.id,
            'VariantID': variant.id || '',
            'FactoryName': mainRow.FactoryName,
            'FactoryID': mainRow.FactoryID,
            'ProductNameEN': mainRow.ProductNameEN,
            'ProductNameFR': mainRow.ProductNameFR,
            'Slug': mainRow.Slug,
            'ProductDescriptionEN': mainRow.ProductDescriptionEN,
            'ProductDescriptionFR': mainRow.ProductDescriptionFR,
            'PageTitelEn': mainRow.PageTitelEn,
            'PageTitelFR': mainRow.PageTitelFR,
            'MetaDescriptionEN': mainRow.MetaDescriptionEN,
            'MetaDescriptionFR': mainRow.MetaDescriptionFR,
            'CategoryName': mainRow.CategoryName,
            'CategoryID': mainRow.CategoryID,
            'TagsEn': mainRow.TagsEn,
            'TagsFR': mainRow.TagsFR,
            'Price': mainRow.Price,
            'VariantType': variant.variant_type || '', // Assuming variant_type is the type
            'VariantValue': variant.name || '',
            'VariantPrice': variant.price || mainRow.Price,
            'VariantUPC': variant.upc || mainRow['Main-UPC'],
            'UnitPerCarton': mainRow.UnitPerCarton,
            'Quantity20-FT': variant.flc_quantity?.[0]?.['20_ft_'] || mainRow['Quantity20-FT'],
            'Quantity40-FT-HC': variant.flc_quantity?.[0]?.['40_ft_hc'] || mainRow['Quantity40-FT-HC'],
            'WeightValu': variant.shipment_weight || mainRow.WeightValu,
            'WeightUnit': mainRow.WeightUnit,
            'CartonLength': variant.carton_dimensions_cm_?.split(' x ')[0] || mainRow.CartonLength,
            'CartonWidth': variant.carton_dimensions_cm_?.split(' x ')[1] || mainRow.CartonWidth,
            'CartonHeight': variant.carton_dimensions_cm_?.split(' x ')[2] || mainRow.CartonHeight,
            'DimensionUnit': mainRow.DimensionUnit,
            'MinDays': variant.lead_time?.[0]?.min_days || mainRow.MinDays,
            'MaxDays': variant.lead_time?.[0]?.max_days || mainRow.MaxDays,
            'MinmumQuantity': variant.minimum_quantity || mainRow.MinmumQuantity,
            'UnitQuantity': variant.unit_quantity || mainRow.UnitQuantity,
            'UnitQuantityFR': variant.unit_quantity_fr || mainRow.UnitQuantityFR,
            'ExpiryDate': variant.expiry_date || mainRow.ExpiryDate,
            'Images': mainRow.Images
          };
          excelData.push(variantRow);
        }
      } else if (product.options && product.options.length > 0) {
        // Fallback to options if variants are not available
        for (const option of product.options) {
          if (option.values && option.values.length > 0) {
            for (const variant of option.values) {
              const variantRow = {
                'Main-UPC': variant.upc || mainRow['Main-UPC'],
                'ProductID': product.id,
                'VariantID': variant.id || '',
                'FactoryName': mainRow.FactoryName,
                'FactoryID': mainRow.FactoryID,
                'ProductNameEN': mainRow.ProductNameEN,
                'ProductNameFR': mainRow.ProductNameFR,
                'Slug': mainRow.Slug,
                'ProductDescriptionEN': mainRow.ProductDescriptionEN,
                'ProductDescriptionFR': mainRow.ProductDescriptionFR,
                'PageTitelEn': mainRow.PageTitelEn,
                'PageTitelFR': mainRow.PageTitelFR,
                'MetaDescriptionEN': mainRow.MetaDescriptionEN,
                'MetaDescriptionFR': mainRow.MetaDescriptionFR,
                'CategoryName': mainRow.CategoryName,
                'CategoryID': mainRow.CategoryID,
                'TagsEn': mainRow.TagsEn,
                'TagsFR': mainRow.TagsFR,
                'Price': mainRow.Price,
                'VariantType': option.name || '',
                'VariantValue': variant.name || '',
                'VariantPrice': variant.price || mainRow.Price,
                'VariantUPC': variant.upc || mainRow['Main-UPC'],
                'UnitPerCarton': mainRow.UnitPerCarton,
                'Quantity20-FT': variant.flc_quantity?.[0]?.['20_ft_'] || mainRow['Quantity20-FT'],
                'Quantity40-FT-HC': variant.flc_quantity?.[0]?.['40_ft_hc'] || mainRow['Quantity40-FT-HC'],
                'WeightValu': variant.shipment_weight || mainRow.WeightValu,
                'WeightUnit': mainRow.WeightUnit,
                'CartonLength': variant.carton_dimensions_cm_?.split(' x ')[0] || mainRow.CartonLength,
                'CartonWidth': variant.carton_dimensions_cm_?.split(' x ')[1] || mainRow.CartonWidth,
                'CartonHeight': variant.carton_dimensions_cm_?.split(' x ')[2] || mainRow.CartonHeight,
                'DimensionUnit': mainRow.DimensionUnit,
                'MinDays': variant.lead_time?.[0]?.min_days || mainRow.MinDays,
                'MaxDays': variant.lead_time?.[0]?.max_days || mainRow.MaxDays,
                'MinmumQuantity': variant.minimum_quantity || mainRow.MinmumQuantity,
                'UnitQuantity': variant.unit_quantity || mainRow.UnitQuantity,
                'UnitQuantityFR': variant.unit_quantity_fr || mainRow.UnitQuantityFR,
                'ExpiryDate': variant.expiry_date || mainRow.ExpiryDate,
                'Images': mainRow.Images
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
      { wch: 20 }, // ProductID (new column)
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
      { wch: 10 }, // VariantPrice
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

// Get list of factories for export filters
router.get('/products/factories', async (req, res) => {
  try {
    // Fetch all products to get unique factory IDs
    const productsResponse = await swell.get('/products', {
      limit: 1000,
      where: {
        'content.factory_id': { $ne: null }
      }
    });

    const products = productsResponse.results || [];
    const factoryIds = [...new Set(products.map(p => p.content?.factory_id).filter(Boolean))];

    if (factoryIds.length === 0) {
      return res.json({
        success: true,
        factories: []
      });
    }

    // Fetch factory details
    const factoriesResponse = await swell.get('/accounts', {
      where: { id: { $in: factoryIds } },
      limit: factoryIds.length
    });

    const factories = (factoriesResponse.results || []).map(factory => ({
      id: factory.id,
      name: factory.name || factory.id
    }));

    res.json({
      success: true,
      factories: factories.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    });
  } catch (error) {
    console.error('Error fetching factories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch factories',
      details: error.message
    });
  }
});




// Export products to Word document filtered by factory
router.get('/products/export-pdf', async (req, res) => {
  try {
    const { factoryIds, factoryId } = req.query; // Support both single and multiple

    // Handle both old single factoryId and new multiple factoryIds
    let factoryIdArray = [];
    if (factoryIds) {
      factoryIdArray = factoryIds.split(',').map(id => id.trim()).filter(Boolean);
    } else if (factoryId) {
      factoryIdArray = [factoryId];
    }

    if (factoryIdArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one Factory ID is required'
      });
    }

    // Fetch factory details for all selected factories
    const factoriesMap = {};
    for (const fid of factoryIdArray) {
      try {
        const factory = await swell.get(`/accounts/${fid}`);
        factoriesMap[fid] = factory?.name || fid;
      } catch (error) {
        console.error(`Error fetching factory ${fid}:`, error);
        factoriesMap[fid] = fid;
      }
    }

    // Fetch products for all selected factories
    const productsResponse = await swell.get('/products', {
      limit: 1000,
      where: {
        'content.factory_id': { $in: factoryIdArray }
      },
      expand: ['images']
    });

    const products = productsResponse.results || [];

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No products found for the selected factories'
      });
    }

    // Group products by factory
    const productsByFactory = {};
    products.forEach(product => {
      const factoryId = product.content?.factory_id;
      if (!factoryId) return;
      
      if (!productsByFactory[factoryId]) {
        productsByFactory[factoryId] = [];
      }
      productsByFactory[factoryId].push(product);
    });

    const factoryNames = factoryIdArray.map(fid => factoriesMap[fid]);
    const displayTitle = factoryNames.length === 1 
      ? factoryNames[0] 
      : `${factoryNames.length} Factories`;

    // Sort factories by name for consistent display
    const sortedFactoryIds = Object.keys(productsByFactory).sort((a, b) => {
      return (factoriesMap[a] || a).localeCompare(factoriesMap[b] || b);
    });

    // Generate Word document using docx library
    const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, ImageRun, Header, Footer } = require('docx');

    // Read logo file
    let logoBuffer = null;
    const logoPath = path.join(__dirname, '../public/assets/headerlogo.jpeg');
    try {
      if (fs.existsSync(logoPath)) {
        logoBuffer = fs.readFileSync(logoPath);
      }
    } catch (error) {
      console.error('Error loading logo:', error);
    }

    // Build header table with logo using ImageRun directly (as per docx library docs)
    let headerTable = null;
    if (logoBuffer) {
      try {
        console.log('Creating logo image with ImageRun, buffer size:', logoBuffer.length);
        
        // Create ImageRun directly with the buffer data (as per docx documentation)
        const logoImageRun = new ImageRun({
          type: 'jpeg', // or 'jpg' - both work
          data: logoBuffer,
          transformation: {
            width: 200,
            height: 80,
          },
        });
        
        console.log('Logo ImageRun created successfully');
        
        // Build header table with logo
        const headerRowsWithLogo = [
          new TableRow({
            children: [
              // Left cell with company address
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'SODU INC.',
                        bold: true,
                        color: 'FFFFFF',
                        size: 24,
                        font: 'Arial'
                      })
                    ],
                    spacing: { after: 200 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: '251 Little Falls drive,',
                        color: 'FFFFFF',
                        size: 20,
                        font: 'Arial'
                      })
                    ],
                    spacing: { after: 100 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Wilmington, DE 19808 USA',
                        color: 'FFFFFF',
                        size: 20,
                        font: 'Arial'
                      })
                    ]
                  })
                ],
                width: { size: 50, type: WidthType.PERCENTAGE },
                verticalAlign: 'center',
                shading: { fill: '0c373c' }
              }),
              // Right cell with logo - using ImageRun directly
              new TableCell({
                children: [
                  new Paragraph({
                    children: [logoImageRun],
                    alignment: AlignmentType.RIGHT
                  })
                ],
                width: { size: 50, type: WidthType.PERCENTAGE },
                verticalAlign: 'center',
                shading: { fill: '0c373c' }
              })
            ],
            height: { value: 2160, rule: 'exact' }
          })
        ];
        
        // Use full page width for header table (12240 twips = 8.5 inches for US Letter)
        headerTable = new Table({
          width: { size: 12240, type: WidthType.DXA }, // Full page width (US Letter: 8.5" = 12240 twips)
          columnWidths: [6120, 6120], // Equal width columns (50% each = 6120 twips)
          rows: headerRowsWithLogo
        });
        
        console.log('Header table built with logo using ImageRun');
      } catch (error) {
        console.error('Error creating logo ImageRun:', error);
        console.error('Error stack:', error.stack);
        // Fallback: create header table without logo
        // Use full page width for header table (12240 twips = 8.5 inches for US Letter)
        headerTable = new Table({
          width: { size: 12240, type: WidthType.DXA }, // Full page width (US Letter: 8.5" = 12240 twips)
          columnWidths: [6120, 6120], // Equal width columns (50% each = 6120 twips)
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: 'SODU INC.',
                          bold: true,
                          color: 'FFFFFF',
                          size: 24,
                          font: 'Arial'
                        })
                      ],
                      spacing: { after: 200 }
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: '251 Little Falls drive,',
                          color: 'FFFFFF',
                          size: 20,
                          font: 'Arial'
                        })
                      ],
                      spacing: { after: 100 }
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: 'Wilmington, DE 19808 USA',
                          color: 'FFFFFF',
                          size: 20,
                          font: 'Arial'
                        })
                      ]
                    })
                  ],
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  verticalAlign: 'center',
                  shading: { fill: '0c373c' }
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: '' })]
                    })
                  ],
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  verticalAlign: 'center',
                  shading: { fill: '0c373c' }
                })
              ],
              height: { value: 2160, rule: 'exact' }
            })
          ]
        });
      }
    } else {
      // Create header table without logo
      // Use full page width for header table (12240 twips = 8.5 inches for US Letter)
      headerTable = new Table({
        width: { size: 12240, type: WidthType.DXA }, // Full page width (US Letter: 8.5" = 12240 twips)
        columnWidths: [6120, 6120], // Equal width columns (50% each = 6120 twips)
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'SODU INC.',
                        bold: true,
                        color: 'FFFFFF',
                        size: 24,
                        font: 'Arial'
                      })
                    ],
                    spacing: { after: 200 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: '251 Little Falls drive,',
                        color: 'FFFFFF',
                        size: 20,
                        font: 'Arial'
                      })
                    ],
                    spacing: { after: 100 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Wilmington, DE 19808 USA',
                        color: 'FFFFFF',
                        size: 20,
                        font: 'Arial'
                      })
                    ]
                  })
                ],
                width: { size: 50, type: WidthType.PERCENTAGE },
                verticalAlign: 'center',
                shading: { fill: '0c373c' }
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: '' })]
                  })
                ],
                width: { size: 50, type: WidthType.PERCENTAGE },
                verticalAlign: 'center',
                shading: { fill: '0c373c' }
              })
            ],
            height: { value: 2160, rule: 'exact' }
          })
        ]
      });
    }

    // Create document paragraphs (without header table - it goes in Header component)
    // Add 0.5 inch (720 twips) margins on both left and right to content only
    const docElements = [
      new Paragraph({
        text: '',
        spacing: { after: 400 },
        indent: { left: 720, right: 720 }
      }),
      new Paragraph({
        children: [
          new TextRun({ 
            text: `Products Export - ${displayTitle}`,
            font: 'Arial',
            size: 32,
            bold: true,
            color: 'c1ff72',
            shading: { color: 'c1ff72' }
          })
        ],
        heading: 'Heading1',
        spacing: { after: 400 },
        shading: { color: 'c1ff72' },
        indent: { left: 720, right: 720 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Total Products: ', bold: true, font: 'Arial' }),
          new TextRun({ text: String(products.length), font: 'Arial' })
        ],
        spacing: { after: 200 },
        indent: { left: 720, right: 720 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Selected Factories: ', bold: true, font: 'Arial' }),
          new TextRun({ text: factoryNames.join(', '), font: 'Arial' })
        ],
        spacing: { after: 200 },
        indent: { left: 720, right: 720 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Export Date: ', bold: true, font: 'Arial' }),
          new TextRun({ text: new Date().toLocaleDateString(), font: 'Arial' })
        ],
        spacing: { after: 400 },
        indent: { left: 720, right: 720 }
      })
    ];

    // Build table rows for all factories
    const tableRows = [];
    
    // Add table header row
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: 'FACTORY NAME', bold: true, font: 'Arial', color: 'FFFFFF' })],
              alignment: AlignmentType.CENTER
            })],
            shading: { fill: '0c373c', color: 'FFFFFF' }
          }),
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: 'PRODUCT NAME', bold: true, font: 'Arial', color: 'FFFFFF' })],
              alignment: AlignmentType.CENTER
            })],
            shading: { fill: '0c373c', color: 'FFFFFF' }
          }),
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: 'QUANTITY PER CARTON', bold: true, font: 'Arial', color: 'FFFFFF' })],
              alignment: AlignmentType.CENTER
            })],
            shading: { fill: '0c373c', color: 'FFFFFF' }
          }),
          new TableCell({
            children: [new Paragraph({ 
              children: [new TextRun({ text: 'PRICE', bold: true, font: 'Arial', color: 'FFFFFF' })],
              alignment: AlignmentType.CENTER
            })],
            shading: { fill: '0c373c', color: 'FFFFFF' }
          })
        ]
      })
    );
    
    // Add factory sections and product rows
    sortedFactoryIds.forEach(factoryId => {
      const factoryProducts = productsByFactory[factoryId];
      const factoryName = factoriesMap[factoryId];
      
      // Add factory header row
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ 
                      text: `${factoryName} (${factoryProducts.length} product${factoryProducts.length !== 1 ? 's' : ''})`,
                      bold: true,
                      font: 'Arial'
                    })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              columnSpan: 4,
              shading: { fill: 'c1ff72' }
            })
          ]
        })
      );
      
      // Add product rows for this factory
      factoryProducts.forEach(product => {
        const productName = product.name || 'N/A';
        const quantityPerCarton = product.content?.unit_quantity || product.content?.unit_quantity_fr || 'N/A';
        const price = product.price ? `$${parseFloat(product.price).toFixed(2)}` : 'N/A';
        
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: factoryName, font: 'Arial' })],
                  alignment: AlignmentType.CENTER
                })]
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: productName, font: 'Arial' })],
                  alignment: AlignmentType.CENTER
                })]
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: String(quantityPerCarton), font: 'Arial' })],
                  alignment: AlignmentType.CENTER
                })]
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: price, font: 'Arial' })],
                  alignment: AlignmentType.CENTER
                })]
              })
            ]
          })
        );
      });
    });
    
    // Add the table to document elements with 1 inch margins on left and right
    // Page width is 12240 twips (8.5 inches)
    // With 1 inch (1440 twips) margins on each side: 12240 - 2880 = 9360 twips available
    // Scale column widths proportionally: 2000, 5000, 1500, 1500 -> 1872, 4680, 1404, 1404
    
    // Add the product table with 0.5 inch margins on both sides
    docElements.push(
      new Table({
        width: { size: 10800, type: WidthType.DXA }, // Full page width minus 1 inch total (12240 - 1440 = 10800 twips)
        columnWidths: [2160, 5400, 1620, 1620], // Factory (20%), Product (50%), Quantity (15%), Price (15%)
        rows: tableRows,
        alignment: AlignmentType.LEFT,
        indent: { size: 720, type: WidthType.DXA } // 0.5 inch left indentation
      })
    );

    // Create footer table with two rectangles
    // First: lime colored line (10px height)
    // Second: green colored line (100px height, same as header color)
    const footerTable = new Table({
      width: { size: 12240, type: WidthType.DXA }, // Full page width
      columnWidths: [12240], // Single column spanning full width
      rows: [
        // Lime colored rectangle (10px = ~200 twips)
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: '' })],
              shading: { fill: '32CD32' }, // Lime color
              width: { size: 100, type: WidthType.PERCENTAGE }
            })
          ],
          height: { value: 100, rule: 'exact' } // 10px height (~200 twips)
        }),
        // Green colored rectangle (100px = ~2000 twips)
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: '' })],
              shading: { fill: '0c373c' }, // Same green as header
              width: { size: 30, type: WidthType.PERCENTAGE }
            })
          ],
          height: { value: 500, rule: 'exact' } // 100px height (~2000 twips)
        })
      ]
    });

    // Create the document with proper Header component
    // Note: Word headers have default margins, so we use full page width table
    // The table width is set to 12240 twips (full page width) to span edge-to-edge
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              width: 12240, // 8.5 inches in twips (A4 width)
              height: 15840 // 11 inches in twips (A4 height)
            },
            margin: {
              top: 0,      // No margin (header handles top)
              right: 0, 
              bottom: 0,   // No margin (footer handles bottom)
              left: 0,
              header: 0,   // Header distance from edge (0 twips = 0 inches)
              footer: 0    // Footer distance from edge (0 twips = 0 inches)
            }
          }
        },
        headers: {
          default: new Header({
            children: [headerTable] // Header table with full page width (12240 twips)
          })
        },
        footers: {
          default: new Footer({
            children: [footerTable] // Footer table with lime and green rectangles
          })
        },
        children: docElements
      }]
    });

    const docToUse = doc;

    // Generate the Word document buffer
    const buffer = await Packer.toBuffer(docToUse);

    // Set response headers
    const filenameBase = factoryIdArray.length === 1
      ? factoriesMap[factoryIdArray[0]].replace(/[^a-z0-9]/gi, '_')
      : `${factoryIdArray.length}_factories`;
    const filename = `products_export_${filenameBase}_${new Date().toISOString().split('T')[0]}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Error exporting products to PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export products to PDF',
      details: error.message
    });
  }
});

// Helper function to escape HTML
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

module.exports = router;