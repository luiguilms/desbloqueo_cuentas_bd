const oracledb = require('oracledb');
require('dotenv').config(); // Asegúrate de que dotenv está cargado para leer el .env
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: `(DESCRIPTION = 
    (ADDRESS_LIST = (ADDRESS = (PROTOCOL = TCP)(HOST = ${process.env.DB_HOST})(PORT = ${process.env.DB_PORT})))
    (CONNECT_DATA = (SERVER = DEDICATED) (SERVICE_NAME = ${process.env.DB_SERVICE_NAME}) )
  )`
};

async function getConnection() {
  try {
    return await oracledb.getConnection(dbConfig);
  } catch (err) {
    console.error("Error conectando a Oracle:", err);
    throw err;
  }
}

module.exports = { getConnection };
