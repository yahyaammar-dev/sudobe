const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const SECRET = 'your_jwt_secret';
const JWT_EXPIRES_IN = '24h';


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
    // Check if user has phone number for 2FA
    if (!user.content.phone) {
      return res.redirect('/auth.html?status=error&message=Phone number not configured for 2FA');
    }

    // Generate and send OTP
    const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP

    try {
      console.log("Phone is:: ", `whatsapp:${user.content.phone}`)
      // Try WhatsApp first
      const waMessage = await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${user.content.phone}`,
        contentSid: 'HX9a310952405007ecb86ef08f61273cbc',
        contentVariables: JSON.stringify({ "1": otp.toString() }),
      });

      // Wait and check WhatsApp delivery status
      await new Promise(resolve => setTimeout(resolve, 4000));
      const statusCheck = await client.messages(waMessage.sid).fetch();
      // If WhatsApp failed, send SMS
      if (["failed", "undelivered"].includes(statusCheck.status)) {
        await client.messages.create({
          body: `${otp} is your OTP from Sodu CMS. Please do not share it with anyone.`,
          from: '+17276155600',
          to: '+' + user.content.phone
        });
      }

      // Store OTP in user profile with expiry (5 minutes)
      const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

      await swell.put(`/content/cms-users/${user.id}`, {
        content: {
          ...user.content,
          otp: otp,
          otpExpiry: otpExpiry.toISOString(),
          otpVerified: false
        }
      });


      // Redirect to OTP verification page with user ID
      return res.redirect(`/otp-verify.html?userId=${user.id}&channel=${["failed", "undelivered"].includes(statusCheck.status) ? "sms" : "whatsapp"}`);

    } catch (otpError) {
      console.error('OTP send error:', otpError);
      return res.redirect('/auth.html?status=error&message=Failed to send OTP');
    }

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


module.exports = router;