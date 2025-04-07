// backend/config/tempCodesDbConfig.js
const oracledb = require('oracledb');
require('dotenv').config();

const tempCodesDbConfig = {
  user: process.env.TEMP_DB_USER,
  password: process.env.TEMP_DB_PASSWORD,
  connectString: `(DESCRIPTION = 
    (ADDRESS_LIST = (ADDRESS = (PROTOCOL = TCP)(HOST = ${process.env.TEMP_DB_HOST})(PORT = ${process.env.TEMP_DB_PORT})))
    (CONNECT_DATA = (SERVER = DEDICATED) (SERVICE_NAME = ${process.env.TEMP_DB_SERVICE_NAME}) )
  )`
};

async function getTempCodesConnection() {
  try {
    return await oracledb.getConnection(tempCodesDbConfig);
  } catch (err) {
    console.error("Error conectando a Oracle (códigos temporales):", err);
    throw err;
  }
}

module.exports = { getTempCodesConnection };