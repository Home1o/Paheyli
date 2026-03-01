// Run this from your project root: node diagnose.js
// It will tell us exactly what sql.js API calls work for lastInsertRowid

require('sql.js')().then(function(SQL) {
  var db = new SQL.Database();
  db.run('CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, val TEXT)');
  
  console.log('--- Testing different API approaches ---');
  
  // Test 1: exec() then SELECT last_insert_rowid()
  db.run("INSERT INTO test (val) VALUES ('hello')");
  var r1 = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  console.log('After db.run() INSERT, last_insert_rowid():', r1);
  
  // Test 2: getRowsModified
  console.log('getRowsModified():', db.getRowsModified());
  
  // Test 3: Statement API
  var stmt = db.prepare("INSERT INTO test (val) VALUES (?)");
  stmt.bind(['world']);
  stmt.step();
  stmt.free();
  var r2 = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  console.log('After stmt.step() INSERT, last_insert_rowid():', r2);
  console.log('getRowsModified() after stmt.step():', db.getRowsModified());
  
  // Test 4: exec with params
  db.exec("INSERT INTO test (val) VALUES (?)", ['third']);
  var r3 = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  console.log('After exec() with params INSERT, last_insert_rowid():', r3);
  console.log('getRowsModified() after exec():', db.getRowsModified());
  
  // Show all rows
  var rows = db.exec('SELECT * FROM test');
  console.log('\nAll rows in table:', JSON.stringify(rows[0].values));
  
}).catch(function(e) { console.error('ERROR:', e.message); });
