const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const router = express.Router();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const SECRET = 'your_jwt_secret';
const JWT_EXPIRES_IN = '24h';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10
  }
});


router.get('/test', async (req, res) => {
  require('dotenv').config();
  const twilio = require('twilio');

  const client = twilio(
    'process.env.TWILIO_ACCOUNT_SID',
    'process.env.TWILIO_AUTH_TOKEN'
  );

  let otp = 1234;
  const waMessage = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:923274509327`,
    contentSid: 'HX9a310952405007ecb86ef08f61273cbc',
    contentVariables: JSON.stringify({ "1": otp.toString() }),
  });
  
  return waMessage


})


// Step 1: Initial login - verify credentials and send OTP
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const users = await swell.get('/content/cms-users', {
      limit: 500
    });

    const user = users.results.find(u => u.content?.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.redirect('/auth.html?status=error&message=Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.content.password);

    if (!match) {
      return res.redirect('/auth.html?status=error&message=Invalid credentials');
    }

    await swell.put(`/content/cms-users/${user.id}`, {
      content: {
        ...user.content,
        otp: null,
        otpExpiry: null,
        otpVerified: true,
        lastLogin: new Date().toISOString()
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.content.email,
        verified: true
      },
      SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
      sameSite: 'Strict',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    });

    res.redirect('/api/content');

    // Check if user has phone number for 2FA
    // if (!user.content.phone) {
    //   return res.redirect('/auth.html?status=error&message=Phone number not configured for 2FA');
    // }

    // // Generate and send OTP
    // const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP

    // try {
    //   console.log("Phone is:: ", `whatsapp:${user.content.phone}`)
    //   // Try WhatsApp first
    //   const waMessage = await client.messages.create({
    //     from: process.env.TWILIO_WHATSAPP_FROM,
    //     to: `whatsapp:${user.content.phone}`,
    //     contentSid: 'HX9a310952405007ecb86ef08f61273cbc',
    //     contentVariables: JSON.stringify({ "1": otp.toString() }),
    //   });

    //   // Wait and check WhatsApp delivery status
    //   await new Promise(resolve => setTimeout(resolve, 4000));
    //   const statusCheck = await client.messages(waMessage.sid).fetch();
    //   // If WhatsApp failed, send SMS
    //   if (["failed", "undelivered"].includes(statusCheck.status)) {
    //     await client.messages.create({
    //       body: `${otp} is your OTP from Sodu CMS. Please do not share it with anyone.`,
    //       from: '+17276155600',
    //       to: '+' + user.content.phone
    //     });
    //   }

    //   // Store OTP in user profile with expiry (5 minutes)
    //   const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    //   await swell.put(`/content/cms-users/${user.id}`, {
    //     content: {
    //       ...user.content,
    //       otp: otp,
    //       otpExpiry: otpExpiry.toISOString(),
    //       otpVerified: false
    //     }
    //   });


      // Redirect to OTP verification page with user ID
      // return res.redirect(`/otp-verify.html?userId=${user.id}&channel=${["failed", "undelivered"].includes(statusCheck.status) ? "sms" : "whatsapp"}`);

    // } catch (otpError) {
    //   console.error('OTP send error:', otpError);
    //   return res.redirect('/auth.html?status=error&message=Failed to send OTP');
    // }

  } catch (error) {
    console.error('Login error:', error);
    res.redirect('/auth.html?status=error&message=Internal server error');
  }
});

// Step 2: Verify OTP and complete login
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.redirect('/otp-verify.html?status=error&message=Missing required fields');
    }

    // Get user
    const user = await swell.get(`/content/cms-users/${userId}`);

    if (!user) {
      return res.redirect('/auth.html?status=error&message=User not found');
    }

    // Check if OTP exists and hasn't expired
    if (!user.content.otp || !user.content.otpExpiry) {
      return res.redirect('/auth.html?status=error&message=No OTP found. Please login again');
    }

    const otpExpiry = new Date(user.content.otpExpiry);
    const now = new Date();

    if (now > otpExpiry) {
      // Clear expired OTP
      await swell.put(`/content/cms-users/${userId}`, {
        content: {
          ...user.content,
          otp: null,
          otpExpiry: null,
          otpVerified: false
        }
      });
      return res.redirect('/auth.html?status=error&message=OTP expired. Please login again');
    }

    // Verify OTP
    if (parseInt(otp) !== parseInt(user.content.otp)) {
      return res.redirect(`/otp-verify.html?userId=${userId}&status=error&message=Invalid OTP`);
    }

    // Mark OTP as verified and clear it
    await swell.put(`/content/cms-users/${userId}`, {
      content: {
        ...user.content,
        otp: null,
        otpExpiry: null,
        otpVerified: true,
        lastLogin: new Date().toISOString()
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.content.email,
        verified: true
      },
      SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
      sameSite: 'Strict',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    });

    res.redirect('/api/content');

  } catch (error) {
    console.error('OTP verification error:', error);
    res.redirect('/auth.html?status=error&message=Internal server error');
  }
});

// Resend OTP endpoint
router.post('/resend-otp', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }

    const user = await swell.get(`/content/cms-users/${userId}`);

    if (!user || !user.content.phone) {
      return res.status(404).json({ success: false, message: 'User or phone not found' });
    }

    // Generate new OTP
    const otp = Math.floor(1000 + Math.random() * 9000);

    try {
      // Try WhatsApp first
      const waMessage = await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${user.content.phone}`,
        contentSid: 'HX9a310952405007ecb86ef08f61273cbc',
        contentVariables: JSON.stringify({ "1": otp.toString() }),
      });

      // Wait and check status
      await new Promise(resolve => setTimeout(resolve, 4000));
      const statusCheck = await client.messages(waMessage.sid).fetch();

      // Fallback to SMS if needed
      if (["failed", "undelivered"].includes(statusCheck.status)) {
        await client.messages.create({
          body: `${otp} is your OTP from Sodu CMS. Please do not share it with anyone.`,
          from: '+17276155600',
          to: '+' + user.content.phone
        });
      }

      // Update OTP in user profile
      const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

      await swell.put(`/content/cms-users/${userId}`, {
        content: {
          ...user.content,
          otp: otp,
          otpExpiry: otpExpiry.toISOString(),
          otpVerified: false
        }
      });

      return res.json({
        success: true,
        message: 'OTP sent successfully',
        channel: ["failed", "undelivered"].includes(statusCheck.status) ? "sms" : "whatsapp"
      });

    } catch (otpError) {
      console.error('Resend OTP error:', otpError);
      return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }

  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, phone } = req.body;

    const existing = await swell.get('/content/cms-users', {
      where: { email }
    });

    if (existing.results.length > 0) {
      return res.redirect('/auth.html?status=error&message=Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await swell.post('/content/cms-users', {
      content: {
        email,
        password: hashedPassword,
        name,
        role,
        phone
      },
      active: true
    });

    console.log(createdUser);

    // Redirect to success page or next step
    res.redirect('/auth.html?status=success&message=User registered successfully');

  } catch (error) {
    console.error('Registration error:', error);
    res.redirect('/auth.html?status=error&message=Internal server error');
  }
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/auth.html');
});

// Get current user info including role
const verifyToken = require('../middleware/auth');
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await swell.get(`/content/cms-users/${req.user.id}`);
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: user.content?.role || null
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user info' 
    });
  }
});


// Create or login user with OTP
router.post('/register-user', async (req, res) => {
  try {
    const { email, phone, companyName, country, registrationNumber, fullName } = req.body;
    // Validate required fields
    if (!email || !phone || !companyName || !country || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'email, phone, companyName, country, and fullName are required'
      });
    }

    // Check if user already exists by phone or email
    const existingUser = await swell.get('/accounts', {
      where: { 
        $or: [
          { phone },
          { email }
        ]
      }
    });

    console.log('Existing user check:', existingUser);
    const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP

    // Helper function to send OTP
    const sendOtp = async (phone, otp) => {
      console.log('Phone number:', phone);
      console.log('Environment check:', {
        hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
        hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
        whatsappFrom: process.env.TWILIO_WHATSAPP_FROM
      });

      try {
        const waMessage = await client.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: `whatsapp:${phone}`,
          contentSid: 'HXb6146d89abdf91f375080169682081fb',
          contentVariables: JSON.stringify({ "1": otp.toString() }),
        });

        console.log('WhatsApp message sent:', waMessage.sid);

        // Wait and check status
        await new Promise(resolve => setTimeout(resolve, 4000));
        const statusCheck = await client.messages(waMessage.sid).fetch();

        // If WhatsApp failed, send SMS instead
        if (["failed", "undelivered"].includes(statusCheck.status)) {
          console.log('WhatsApp failed, sending SMS instead');
          await client.messages.create({
            body: `${otp} is your OTP from Sodu. Please do not share it with anyone.`,
            from: '+17276155600',
            to: `${phone}`
          });
        }

      } catch (otpError) {
        console.error('OTP send error:', otpError);
      }
    };

    // --- CASE 1: User already exists ---
    if (existingUser.count > 0) {
      const user = existingUser.results[0];

      // Update user OTP in Swell
      await swell.put(`/accounts/${user.id}`, {
        content: {
          ...user.content,
          otp
        }
      });

      // Send OTP via Twilio
      await sendOtp(phone, otp);

      return res.status(200).json({
        success: true,
        message: 'User already exists, OTP sent for login',
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          company_name: user.content?.company_name,
          country: user.content?.country
        }
      });
    }

    // --- CASE 2: Register new user ---
    const hashedPassword = await bcrypt.hash('pk_lhTK2kZ913rmXFqsa8Tg8o0slpLrVNVx', 10);

    const user = await swell.post('/accounts', {
      email,
      first_name: fullName,
      last_name: '',
      phone,
      content: {
        password: hashedPassword,
        role: 'buyer',
        verified: false,
        company_name: companyName,
        country,
        registration_number: registrationNumber,
        otp
      }
    });

    console.log('User created successfully:', user);

    // Send OTP for registration
    await sendOtp(phone, otp);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully, OTP sent for verification',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        first_name: user?.first_name,
        company_name: user.content?.company_name,
        country: user.content?.country
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message,
      details: error.response?.data || error
    });
  }
});


// Check if user is verified
router.get('/check-verification/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Fetch user from Swell
    const user = await swell.get(`/accounts/${id}`);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check verification status
    const isVerified = user.content?.vetted || false;

    return res.status(200).json({
      success: true,
      message: 'User verification status retrieved successfully',
      data: {
        id: user.id,
        email: user.email,
        verified: isVerified,
        role: user.content?.role,
        companyName: user.content?.company_name || user.first_name,
        firstName: user.content?.first_name,
        country: user.content?.country,
        registrationNumber: user.content?.registration_number
      }
    });

  } catch (error) {
    console.error('Check verification error:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message,
      details: error.response?.data || error
    });
  }
});

// Add product to user's quotes
router.post('/add-quote/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { productId } = req.body;
    
    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Fetch user from Swell
    const user = await swell.get(`/accounts/${userId}`);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get existing quotes or initialize empty array
    let quotes = [];
    if (user.content?.quotes) {
      try {
        quotes = JSON.parse(user.content.quotes);
      } catch (parseError) {
        console.error('Error parsing existing quotes:', parseError);
        quotes = [];
      }
    }

    // Check if product is already in quotes
    if (quotes.includes(productId)) {
      return res.status(409).json({
        success: false,
        message: 'Product already in quotes'
      });
    }

    // Add new product to quotes
    quotes.push(productId);

    // Update user with new quotes
    const updatedUser = await swell.put(`/accounts/${userId}`, {
      content: {
        ...user.content,
        quotes: JSON.stringify(quotes)
      }
    });

    console.log('Quote added successfully:', {
      userId,
      productId,
      totalQuotes: quotes.length
    });

    return res.status(200).json({
      success: true,
      message: 'Product added to quotes successfully',
      data: {
        userId: updatedUser.id,
        quotes: quotes,
        totalQuotes: quotes.length
      }
    });

  } catch (error) {
    console.error('Add quote error:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message,
      details: error.response?.data || error
    });
  }
});

// Get user's quotes
router.get('/get-quotes/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate ID
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Fetch user from Swell
    const user = await swell.get(`/accounts/${userId}`);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get quotes
    let quotes = [];
    if (user.content?.quotes) {
      try {
        quotes = JSON.parse(user.content.quotes);
      } catch (parseError) {
        console.error('Error parsing quotes:', parseError);
        quotes = [];
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Quotes retrieved successfully',
      data: {
        userId: user.id,
        quotes: quotes,
        totalQuotes: quotes.length
      }
    });

  } catch (error) {
    console.error('Get quotes error:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message,
      details: error.response?.data || error
    });
  }
});

// Remove product from user's quotes
router.delete('/remove-quote/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;
    
    // Validate required fields
    if (!userId || !productId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Product ID are required'
      });
    }

    // Fetch user from Swell
    const user = await swell.get(`/accounts/${userId}`);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get existing quotes
    let quotes = [];
    if (user.content?.quotes) {
      try {
        quotes = JSON.parse(user.content.quotes);
      } catch (parseError) {
        console.error('Error parsing quotes:', parseError);
        quotes = [];
      }
    }

    // Check if product exists in quotes
    if (!quotes.includes(productId)) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in quotes'
      });
    }

    // Remove product from quotes
    quotes = quotes.filter(id => id !== productId);

    // Update user with new quotes
    const updatedUser = await swell.put(`/accounts/${userId}`, {
      content: {
        ...user.content,
        quotes: JSON.stringify(quotes)
      }
    });

    console.log('Quote removed successfully:', {
      userId,
      productId,
      remainingQuotes: quotes.length
    });

    return res.status(200).json({
      success: true,
      message: 'Product removed from quotes successfully',
      data: {
        userId: updatedUser.id,
        quotes: quotes,
        totalQuotes: quotes.length
      }
    });

  } catch (error) {
    console.error('Remove quote error:', error);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message,
      details: error.response?.data || error
    });
  }
});


// create api to upload document of personal_id in content of custom_fields of account
router.post('/upload-personal-id/:accountId', upload.single('personal_id'), async (req, res) => {
  try {
    const { accountId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Personal ID document is required' 
      });
    }

    const account = await swell.get(`/accounts/${accountId}`);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Upload file to Swell
    const uploadedFile = await swell.post('/:files', {
      filename: file.originalname,
      content_type: file.mimetype,
      data: {
        $base64: file.buffer.toString('base64')
      }
    });

    // Get existing content and update it directly (like updateOrderDocuments does)
    const previousContent = account.content || {};
    const updatedContent = { ...previousContent };
    
    // Add personal_id to the content directly
    updatedContent.personal_id = {
      id: uploadedFile.id,
      filename: uploadedFile.filename,
      url: uploadedFile.url,
      originalFilename: file.originalname,
      extension: file.originalname.split('.').pop(),
      mimeType: file.mimetype,
      date_uploaded: new Date().toISOString()
    };

    // Update the account with the new content (same pattern as updateOrderDocuments)
    await swell.put(`/accounts/${accountId}`, {
      content: updatedContent
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Personal ID document uploaded successfully',
      user: account,
      document: {
        id: uploadedFile.id,
        filename: uploadedFile.filename,
        url: uploadedFile.url
      }
    });
  } catch (error) {
    console.error('Upload document error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// create api to upload documents of certifications but from frontend accept as certifications in swell the field is certifications multiple documents
router.post('/upload-certifications/:accountId', upload.array('certifications', 10), async (req, res) => {
  try {
    const { accountId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one certification document is required' 
      });
    }

    const account = await swell.get(`/accounts/${accountId}`);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const uploadedCertifications = [];
    const errors = [];

    // Upload each file to Swell
    for (const file of files) {
      try {
        const uploadedFile = await swell.post('/:files', {
          filename: file.originalname,
          content_type: file.mimetype,
          data: {
            $base64: file.buffer.toString('base64')
          }
        });

        uploadedCertifications.push({
          id: uploadedFile.id,
          filename: uploadedFile.filename,
          url: uploadedFile.url,
          original_filename: file.originalname,
          date_uploaded: new Date().toISOString()
        });
      } catch (uploadError) {
        console.error(`Error uploading ${file.originalname}:`, uploadError);
        errors.push({
          filename: file.originalname,
          error: uploadError.message
        });
      }
    }

    if (uploadedCertifications.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload any certification documents',
        errors: errors
      });
    }

    // Get existing certifications and add new ones
    const existingCertifications = account.content?.certifications || [];
    const allCertifications = [...existingCertifications, ...uploadedCertifications];

    // Update account with certifications
    await swell.put(`/accounts/${accountId}`, {
      content: {
        ...account.content,
        certifications: allCertifications
      }
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Certification documents uploaded successfully',
      uploaded: uploadedCertifications,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Upload certifications error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
module.exports = router;