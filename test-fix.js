// Run from project root: node test-fix.js
// This tests the EXACT same code path as db.js run()

require('sql.js')().then(function(SQL) {
  var fs = require('fs');
  var path = require('path');
  
  // Load the actual database file just like db.js does
  var dbFile = path.join(__dirname, 'db', 'margin.sqlite');
  var sqlDb = fs.existsSync(dbFile)
    ? new SQL.Database(fs.readFileSync(dbFile))
    : new SQL.Database();
    
  console.log('DB loaded from file:', fs.existsSync(dbFile));
  
  // Test 1: direct sqlDb.run() - the exact code in run() method
  console.log('\n--- Test 1: sqlDb.run() then last_insert_rowid() ---');
  sqlDb.run('INSERT INTO points (user_name,amount,reason) VALUES (?,?,?)', ['testuser', 1, 'test']);
  var rid1 = sqlDb.exec('SELECT last_insert_rowid()')[0].values[0][0];
  var chg1 = sqlDb.getRowsModified();
  console.log('lastInsertRowid:', rid1);
  console.log('changes:', chg1);
  
  // Test 2: verify the row was actually inserted
  console.log('\n--- Test 2: verify insert happened ---');
  var rows = sqlDb.exec("SELECT * FROM points WHERE user_name='testuser'");
  console.log('Rows found:', rows.length ? rows[0].values.length : 0);
  if (rows.length) console.log('Row data:', JSON.stringify(rows[0].values));
  
  // Test 3: check if persist() affects last_insert_rowid
  console.log('\n--- Test 3: does persist() reset last_insert_rowid? ---');
  sqlDb.run('INSERT INTO points (user_name,amount,reason) VALUES (?,?,?)', ['testuser2', 1, 'test']);
  var rid_before = sqlDb.exec('SELECT last_insert_rowid()')[0].values[0][0];
  console.log('rowid BEFORE persist():', rid_before);
  fs.writeFileSync(dbFile + '.bak', Buffer.from(sqlDb.export())); // write to .bak not real file
  var rid_after = sqlDb.exec('SELECT last_insert_rowid()')[0].values[0][0];
  console.log('rowid AFTER persist():', rid_after);

}).catch(function(e) { console.error('ERROR:', e); });
