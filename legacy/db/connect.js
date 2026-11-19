const { error, log } = require("console");
const sqlite = require("sqlite3").verbose();
const path = require("path");
const { loadEnvFile } = require("process");

const DB_PATH = path.join(__dirname, "test.db");

console.log("Attempting to open database: ", DB_PATH);

const db = new sqlite.Database(DB_PATH, (err) => {
  if (err) {
    console.error("FATAL: Error opening database:", err);
    process.exit(1);
  } else {
    console.log("Connected to the SQLite database");
    initializeDatabase();
  }
});

function initializeDatabase() {
  const createEmployeesTableSql = `
        CREATE TABLE IF NOT EXISTS employees (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          surname TEXT UNIQUE NOT NULL,
          is_Admin INTEGER DEFAULT 0, -- 0 = false, 1=true
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
  `;
  const selectEmployees = `SELECT * FROM employees`;
  db.serialize(() => {
    db.run(createEmployeesTableSql, (err) => {
      if (err) console.error("DB Error (users table):", err);
      else console.log(" users table OK");
    });
    db.get(selectEmployees, (err) => {
      if (err) console.error("DB Error (users table):", err);
      else console.log(" users table OK");
    });
  });
}
