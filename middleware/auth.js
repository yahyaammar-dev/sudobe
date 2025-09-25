const jwt = require('jsonwebtoken');
const path = require('path');
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const SECRET = 'your_jwt_secret';

function verifyToken(req, res, next) {
  const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'auth.html'));
  }
  
  jwt.verify(token, SECRET, async (err, decoded) => {
    if (err) {
      return res.sendFile(path.join(__dirname, '..', 'public', 'auth.html'));
    }
    
    try {
      // Additional verification for 2FA
      if (!decoded.verified) {
        // Clear invalid token
        res.clearCookie('token');
        return res.sendFile(path.join(__dirname, '..', 'public', 'auth.html'));
      }
      
      // Optional: Verify user still exists and is active
      const user = await swell.get(`/content/cms-users/${decoded.id}`);
      if (!user) {
        res.clearCookie('token');
        return res.sendFile(path.join(__dirname, '..', 'public', 'auth.html'));
      }
      
      // Add user info to request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        verified: decoded.verified,
        userData: user.content
      };
      
      next();
      
    } catch (error) {
      console.error('Token verification error:', error);
      res.clearCookie('token');
      return res.sendFile(path.join(__dirname, '..', 'public', 'auth.html'));
    }
  });
}

// // Optional: Logout endpoint to clear cookies and user session
// function logout(req, res) {
//   res.clearCookie('token');
//   res.redirect('/auth.html?status=success&message=Logged out successfully');
// }

module.exports = verifyToken 


// const jwt = require('jsonwebtoken');
// const path = require('path');
// const SECRET = 'your_jwt_secret';

// function verifyToken(req, res, next) {
//   const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];

//   if (!token) {
//     return res.sendFile(path.join(__dirname, '..', 'public', 'auth.html'));
//   }

//   jwt.verify(token, SECRET, (err, decoded) => {
//     if (err) {
//       return res.sendFile(path.join(__dirname, '..', 'public', 'auth.html'));
//     }

//     req.user = decoded;
//     next();
//   });
// }

// module.exports = verifyToken;


