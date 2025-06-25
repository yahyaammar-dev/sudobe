const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);


/**
 * Sends an OTP to a user's WhatsApp number
 * @param {string} toPhoneNumber - in the format 'whatsapp:+10234567890'
 */
exports.sendOtpViaWhatsApp = async (req, res) => {
  try {
    const { toPhoneNumber } = req.body;

    // Find customer account by phone number
    const result = await swell.get('/accounts', {
      where: { phone: toPhoneNumber }
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const customer = result.results[0];
    const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP

    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${toPhoneNumber}`,
      contentSid: 'HX9a310952405007ecb86ef08f61273cbc',
      contentVariables: JSON.stringify({
        "1": otp.toString()  // ✅ must be string
      }),
    });

    // Store OTP in the customer's content
    await swell.put(`/accounts/${customer.id}`, {
      content: {
        ...customer.content,
        otp: otp
      }
    });

    return res.status(200).json({
      status: true,
      sid: message.sid,
      otp: otp,
      email: customer.email
    });

  } catch (err) {
    console.error('Failed to send WhatsApp message:', err.message);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};



/**
 * Verifies the OTP entered by the user
 * @param {string} toPhoneNumber - phone number to verify (e.g. '+1234567890')
 * @param {string|number} otp - the 4-digit OTP user entered
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { toPhoneNumber, otp } = req.body;

    // Get account by phone number
    const result = await swell.get('/accounts', {
      where: { phone: toPhoneNumber }
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const customer = result.results[0];
    const storedOtp = customer.content?.otp;

    if (!storedOtp) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    if (parseInt(otp) !== parseInt(storedOtp)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Optionally clear OTP after successful verification
    await swell.put(`/accounts/${customer.id}`, {
      content: {
        ...customer.content,
        otp: null,
        verified: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      user: customer
    });

  } catch (err) {
    console.error('OTP verification error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};






/**
 * Creates a new user account in Swell
 * @param {string} phone - User's phone number (required)
 * @param {string} email - User's email (optional)
 * @param {string} firstName - User's first name (optional)
 * @param {string} lastName - User's last name (optional)
 * @param {string|number} otp - 4-digit OTP to store in content (optional)
 * @param {object} content - Any additional custom fields for the user
 */
exports.createUser = async (req, res) => {
  try {
    const {
      phone,
      email,
      firstName,
      lastName,
      content = {}
    } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Check if the user already exists
    const existingUser = await swell.get('/accounts', {
      where: { phone }
    });

    if (existingUser.count > 0) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this phone number'
      });
    }

    // Create the user
    const user = await swell.post('/accounts', {
      phone,
      email,
      first_name: firstName,
      last_name: lastName,
      content: {
        ...content
      }
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      user
    });

  } catch (err) {
    console.error('User creation error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};


















const multer = require('multer');

// Multer setup for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to handle multiple file uploads on 'certifications' field
exports.uploadCertifications = upload.array('certifications');

/**
 * @route PUT /api/accounts/:id/certifications
 * @desc Upload certifications and update user account on Swell
 */
exports.updateUserWithCertifications = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Fetch existing user data
    const user = await swell.get(`/accounts/${id}`);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const previousCertifications = user.content?.certifications || [];
    const newCertifications = [];

    // Upload each file using POST /:files endpoint (with colon)
    for (const file of req.files || []) {
      if (!file?.buffer) continue;

      try {
        const uploaded = await swell.post('/:files', {
          filename: file.originalname,
          content_type: file.mimetype,
          data: {
            $base64: file.buffer.toString('base64'),
          },
          ...(file.mimetype.startsWith('image/') ? { width: 1200, height: 800 } : {}),
        });

        const ext = file.originalname.split('.').pop();

        newCertifications.push({
          ...uploaded,
          originalFilename: file.originalname,
          extension: ext,
          mimeType: file.mimetype,
        });
      } catch (uploadErr) {
        console.error(`Error uploading file ${file.originalname}:`, uploadErr.message);
      }
    }


    // Combine old and new certifications
    const updatedCertifications = [...previousCertifications, ...newCertifications];

    // Update user account with new certifications list
    const updatedUser = await swell.put(`/accounts/${id}`, {
      content: {
        ...user.content,
        certifications: updatedCertifications,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Certifications uploaded and user updated',
      user: updatedUser,
    });
  } catch (err) {
    console.error('Error updating certifications:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};




























/**
 * @route PUT /api/accounts/:id/personalid
 * @desc Upload personalId and update user account on Swell
 */
exports.updateUserWithPersonalid = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Fetch user from Swell
    const user = await swell.get(`/accounts/${id}`);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const previousPersonalIds = user.content?.personal_id || [];
    const newPersonalIds = [];

    // Upload each file to Swell
    for (const file of req.files || []) {
      if (!file?.buffer) continue;

      try {
        const uploaded = await swell.post('/:files', {
          filename: file.originalname,
          content_type: file.mimetype,
          data: {
            $base64: file.buffer.toString('base64'),
          },
        });

        newPersonalIds.push(uploaded);
      } catch (fileErr) {
        console.error(`Error uploading file ${file.originalname}:`, fileErr.message);
      }
    }

    const updatedPersonalIds = [...previousPersonalIds, ...newPersonalIds];

    // Update user's certifications in Swell
    const updatedUser = await swell.put(`/accounts/${id}`, {
      content: {
        ...user.content,
        personal_id: updatedPersonalIds,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Personal Id uploaded and user updated',
      user: updatedUser,
    });

  } catch (err) {
    console.error('Error updating Personal Id:', err.message);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};















// Debug function to inspect your Content Template
exports.debugContentTemplate = async (req, res) => {
  try {
    const contentSid = 'HX9a310952405007ecb86ef08f61273cbc';

    // Fetch template details
    const content = await client.content.v1.contents(contentSid).fetch();

    console.log('Content Template Details:');
    console.log('SID:', content.sid);
    console.log('Friendly Name:', content.friendlyName);
    console.log('Variables:', content.variables);
    console.log('Types:', content.types);

    return res.status(200).json({
      success: true,
      template: {
        sid: content.sid,
        friendlyName: content.friendlyName,
        variables: content.variables,
        types: content.types
      }
    });

  } catch (err) {
    console.error('Failed to fetch template:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Simplified version - try this first
exports.sendOtpViaWhatsAppSimple = async (req, res) => {
  try {
    const { toPhoneNumber } = req.body;

    if (!toPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const cleanPhoneNumber = toPhoneNumber.replace('whatsapp:', '');

    // Find customer account by phone number
    const result = await swell.get('/accounts', {
      where: { phone: cleanPhoneNumber }
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const customer = result.results[0];
    const otp = Math.floor(1000 + Math.random() * 9000);

    // Try the most common variable patterns
    const variablePatterns = [
      { '1': otp.toString() },
      { 1: otp.toString() },
      { authCode: otp.toString() },
      { code: otp.toString() },
      { otp: otp.toString() },
      { verification_code: otp.toString() }
    ];

    let message = null;
    let lastError = null;

    for (let i = 0; i < variablePatterns.length; i++) {
      try {
        console.log(`Trying pattern ${i + 1}:`, variablePatterns[i]);

        message = await client.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: `whatsapp:${cleanPhoneNumber}`,
          contentSid: 'HX9a310952405007ecb86ef08f61273cbc',
          contentVariables: variablePatterns[i]
        });

        console.log('Success with pattern:', variablePatterns[i]);
        break;

      } catch (err) {
        console.log(`Pattern ${i + 1} failed:`, err.message);
        lastError = err;
        continue;
      }
    }

    if (!message) {
      throw new Error(`All variable patterns failed. Last error: ${lastError.message}`);
    }

    // Store OTP in the customer's content
    await swell.put(`/accounts/${customer.id}`, {
      content: {
        ...customer.content,
        otp: otp,
        otpTimestamp: Date.now()
      }
    });

    return res.status(200).json({
      status: true,
      sid: message.sid,
      email: customer.email
    });

  } catch (err) {
    console.error('Failed to send WhatsApp message:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: err.message
    });
  }
};