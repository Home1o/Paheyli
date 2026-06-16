// Run this from your project root when you need your signup verification code:
//   node get-otp.js
require('./server/db').dbReady.then(function(db) {
  var row = db.prepare('SELECT code, email, expires_at FROM otps ORDER BY id DESC LIMIT 1').get();
  if (!row) { console.log('No OTP found. Try registering first.'); }
  else {
    var expired = Date.now()/1000 > row.expires_at;
    console.log('─────────────────────────────');
    console.log('Email :', row.email);
    console.log('Code  :', row.code);
    console.log('Status:', expired ? '⚠️  EXPIRED — register again' : '✅ Valid');
    console.log('─────────────────────────────');
  }
  process.exit(0);
});
