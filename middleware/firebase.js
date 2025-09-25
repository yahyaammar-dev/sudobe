// firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('../soduapp-firebase-adminsdk-fbsvc-70f45abd70.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

module.exports = admin;