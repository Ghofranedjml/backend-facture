// generate-token.js
const jwt = require('jsonwebtoken'); // ou import si ESM

const secret = 'c8e3baefc6aa655c23c147229c23e1ce6f1284e98de41b82284320093a86bbff';
const payload = {
  userId: 'test-user-id',   // même userId que dans ton seed
  email: 'test@etafakna.com'
  // tu peux ajouter d'autres champs si ton middleware les utilise
};

const token = jwt.sign(payload, secret, { expiresIn: '7d' });
console.log('Token généré :');
console.log(token);