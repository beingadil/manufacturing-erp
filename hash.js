const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('04HaMJAGCce3kwn5IEA1!').digest('hex');
console.log(hash);
