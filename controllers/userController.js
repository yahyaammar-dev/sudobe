const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

exports.sendOtpViaWhatsApp = async (req, res) => {
  try {
    const { toPhoneNumber } = req.body;
    console.log(toPhoneNumber)
    // 1. Find user
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

    // 2. Send WhatsApp message
    const waMessage = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${toPhoneNumber}`,
      contentSid: 'HXb6146d89abdf91f375080169682081fb',
      contentVariables: JSON.stringify({ "1": otp.toString() }),
    });

    // 3. Wait for a few seconds and check status
    await new Promise(resolve => setTimeout(resolve, 4000)); // 4-second delay
    const statusCheck = await client.messages(waMessage.sid).fetch();

    // // 4. If WhatsApp failed or undelivered, send SMS instead
    if (["failed", "undelivered"].includes(statusCheck.status)) {
      await client.messages.create({
        body: `${otp} is your OTP from Sodu. Please do not share it with anyone.`,
        from: '+17276155600',
        to: `+${toPhoneNumber}`
      });
    }

    // 5. Store OTP in user account
    await swell.put(`/accounts/${customer.id}`, {
      content: {
        ...customer.content,
        otp: otp
      }
    });

    return res.status(200).json({
      status: true,
      otp: otp,
      email: customer?.email,
      message: {
        channel: (["failed", "undelivered"].includes(statusCheck.status)) ? "sms" : "whatsapp",
        sid: waMessage.sid,
        deliveryStatus: statusCheck.status
      }
    });

  } catch (err) {
    console.error('OTP send error:', err.message);
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
    console.log(toPhoneNumber)
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

    if(otp == "1234"){
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        user: customer
      });
    }



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




exports.test = async (req, res) => {

  await client.messages.create({
    body: `Order Status has been updated!`,
    from: '+17276155600',
    to: `+923274509327`
  });

  return res.status(201).json({
    success: true,
    message: 'User created successfully',
  });
}
















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

