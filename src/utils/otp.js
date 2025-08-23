/*
// OTP FEATURE (disabled)
const crypto = require('crypto');

exports.generateNumericOTP = (len = 6) => {
  let s = '';
  for (let i = 0; i < len; i++) s += crypto.randomInt(0, 10).toString();
  return s;
};
*/
