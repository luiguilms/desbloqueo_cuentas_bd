// ejemplo de configuración para dwDbConfig.js
const oracledb = require('oracledb');
require('dotenv').config();

const dwDbConfig = {
  user: process.env.DW_DB_USER,
  password: process.env.DW_DB_PASSWORD,
  connectString: `(DESCRIPTION = 
    (ADDRESS_LIST = (ADDRESS = (PROTOCOL = TCP)(HOST = ${process.env.DW_DB_HOST})(PORT = ${process.env.DW_DB_PORT})))
    (CONNECT_DATA = (SERVER = DEDICATED) (SERVICE_NAME = ${process.env.DW_DB_SERVICE_NAME}) )
  )`
};

async function getDwDbConnection() {
  try {
    return await oracledb.getConnection(dwDbConfig);
  } catch (err) {
    console.error("Error conectando a la base de datos DWHOUSE:", err);
    throw err;
  }
}

module.exports = { getConnection: getDwDbConnection };
