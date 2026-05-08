const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_NAME || "test",
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = db;
