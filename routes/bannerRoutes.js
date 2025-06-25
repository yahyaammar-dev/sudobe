// routes/bannerRoutes.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });


// Helper function to fetch categories
async function fetchCategories() {
  try {
    const result = await swell.get('/categories', { limit: 100 });
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

router.get('/', (req, res) => {
  const { status, message, section = 'banner' } = req.query;

  let alertScript = '';
  if (status && message) {
    alertScript = `
      <script>
        window.onload = function() {
          alert('${message}');
          if (window.history.replaceState) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        };
      </script>
    `;
  }

  // Define Sidebar HTML
  const sidebar = `
    <div style="width: 200px; float: left; padding: 20px; background-color: #f5f5f5;">
      <h3>Menu</h3>
      <ul style="list-style: none; padding-left: 0;">
        <li><a href="/api/content?section=banner">Banner</a></li>
        <li><a href="/api/content?section=banking">Banking Details</a></li>
        <li><a href="/api/content?section=protection">Protections</a></li>
      </ul>
    </div>
  `;

  // Banner Form HTML (reuse your existing one)
  const bannerForm = `
    <h1>Banner Form</h1>
    ${status === 'error' ? '<p style="color: red;">Error: ' + message + '</p>' : ''}
    ${status === 'success' ? '<p style="color: green;">Success: ' + message + '</p>' : ''}
    <form action="/api/content" method="POST" enctype="multipart/form-data">
      <div class="form-group">
        <label for="bannerType">Banner Type:</label>
        <select id="bannerType" name="bannerType" required>
          <option value="">-- Select Type --</option>
          <option value="category">Category</option>
          <option value="product">Product</option>
          <option value="factory">Factory</option>
        </select>
      </div>
      <div class="form-group" id="valueContainer"></div>
      <div class="form-group">
        <label for="bannerImage">Banner Image:</label>
        <input type="file" id="bannerImage" name="bannerImage" required>
      </div>
      <button type="submit">Submit Banner</button>
    </form>
  `;

  const protectionForm = `
  <h1>Banner Form</h1>
  ${status === 'error' ? '<p style="color: red;">Error: ' + message + '</p>' : ''}
  ${status === 'success' ? '<p style="color: green;">Success: ' + message + '</p>' : ''}
  <form action="/api/content/protection" method="POST" enctype="multipart/form-data">
    <div class="form-group">
      <label for="proctectionIcon">Protection Icon:</label>
      <input type="file" id="proctectionIcon" name="proctectionIcon" required>
    </div>  
    <div class="form-group">
      <label for="title">Title:</label>
      <input type="text" id="title" name="title" required>
    </div>
    <div class="form-group">
      <label for="short_description">Short Description:</label>
      <input type="text" id="short_description" name="short_description" required>
    </div>
    <div class="form-group">
      <label for="long_description">Long Description:</label>
      <input type="text" id="long_description" name="long_description" required>
    </div>  
    <div class="form-group" id="valueContainer"></div>
    <button type="submit">Submit Protection</button>
  </form>
`;

  // Banking Details Form
  const bankingForm = `
    <h1>Banking Details</h1>
    <form action="/api/content/banking" method="POST">
      <div class="form-group">
        <label for="accountNumber">Account Number:</label>
        <input type="text" id="accountNumber" name="accountNumber" required>
      </div>
      <div class="form-group">
        <label for="swiftCode">SWIFT Code:</label>
        <input type="text" id="swiftCode" name="swiftCode" required>
      </div>
      <div class="form-group">
        <label for="beneficiaryName">Beneficiary Name:</label>
        <input type="text" id="beneficiaryName" name="beneficiaryName" required>
      </div>
      <div class="form-group">
        <label for="beneficiaryAddress">Beneficiary Address:</label>
        <textarea id="beneficiaryAddress" name="beneficiaryAddress" required></textarea>
      </div>
      <div class="form-group">
        <label for="beneficiaryBank">Beneficiary Bank:</label>
        <input type="text" id="beneficiaryBank" name="beneficiaryBank" required>
      </div>
      <div class="form-group">
        <label for="beneficiaryBankAddress">Beneficiary Bank Address:</label>
        <textarea id="beneficiaryBankAddress" name="beneficiaryBankAddress" required></textarea>
      </div>
      <button type="submit">Submit Banking Details</button>
    </form>
  `;

  // Decide which form to show
  let formContent;

  if (section === 'banking') {
    formContent = bankingForm;
  } else if (section === 'protection') {
    formContent = protectionForm;
  } else if (section === 'banner') {
    formContent = bannerForm;
  } else {
    formContent = '<p style="color: red;">Invalid section selected.</p>';
  }

  // Send the full HTML
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${section === 'banking' ? 'Banking Details' : 'Banner Form'}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; display: flex; }
        .form-container { padding: 20px; width: 100%; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input, textarea, select { width: 100%; padding: 8px; box-sizing: border-box; }
        button { background: #007bff; color: white; border: none; padding: 10px 15px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .autocomplete { position: relative; }
        .autocomplete-items { position: absolute; border: 1px solid #d4d4d4; z-index: 99; width: 100%; }
        .autocomplete-items div { padding: 10px; cursor: pointer; background-color: #fff; border-bottom: 1px solid #d4d4d4; }
        .autocomplete-items div:hover { background-color: #e9e9e9; }
      </style>
    </head>
    <body>
      ${sidebar}
      <div class="form-container">
        ${formContent}
      </div>
      ${alertScript}
      <script>
        ${section === 'banner' ? `
        const bannerTypeSelect = document.getElementById('bannerType');
        const valueContainer = document.getElementById('valueContainer');
        
        bannerTypeSelect.addEventListener('change', async function() {
          const selectedValue = this.value;
          valueContainer.innerHTML = '<p>Loading options...</p>';
          try {
            let html = '<label for="bannerValue">Select Option:</label>';
            if (selectedValue === 'category') {
              const response = await fetch('/api/content/categories');
              const categories = await response.json();
              html += '<select id="bannerValue" name="bannerValue" required>';
              html += '<option value="">-- Select Category --</option>';
              categories.forEach(c => html += \`<option value="\${c.id}">\${c.name}</option>\`);
              html += '</select>';
            } else if (selectedValue === 'factory') {
              const response = await fetch('/api/content/factories');
              const factories = await response.json();
              html += '<select id="bannerValue" name="bannerValue" required>';
              html += '<option value="">-- Select Factory --</option>';
              factories.forEach(f => html += \`<option value="\${f.id}">\${f.name}</option>\`);
              html += '</select>';
            } else if (selectedValue === 'product') {
              html += \`
                <div class="autocomplete">
                  <input type="text" id="bannerValueInput" placeholder="Search for products..." autocomplete="off">
                  <input type="hidden" id="bannerValue" name="bannerValue" required>
                  <div id="productAutocomplete" class="autocomplete-items"></div>
                </div>\`;
            }
            valueContainer.innerHTML = html;

            if (selectedValue === 'product') {
              const input = document.getElementById('bannerValueInput');
              const hiddenInput = document.getElementById('bannerValue');
              const autocomplete = document.getElementById('productAutocomplete');
              input.addEventListener('input', async function() {
                if (this.value.length < 2) {
                  autocomplete.innerHTML = '';
                  return;
                }
                const response = await fetch(\`/api/content/products?search=\${encodeURIComponent(this.value)}\`);
                const products = await response.json();
                autocomplete.innerHTML = '';
                products.forEach(product => {
                  const item = document.createElement('div');
                  item.innerHTML = \`<strong>\${product.name}</strong> (SKU: \${product.sku || 'N/A'})\`;
                  item.addEventListener('click', function() {
                    input.value = product.name;
                    hiddenInput.value = product.id;
                    autocomplete.innerHTML = '';
                  });
                  autocomplete.appendChild(item);
                });
              });
            }
          } catch (error) {
            console.error('Error loading options:', error);
            valueContainer.innerHTML = '<p>Error loading options. Please try again.</p>';
          }
        });
        ` : ''}
      </script>
    </body>
    </html>
  `);
});

// API endpoint to fetch categories
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
    const { bannerType, bannerValue } = req.body;
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
          data_id: bannerValue   // The ID of the selected item
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



module.exports = router;