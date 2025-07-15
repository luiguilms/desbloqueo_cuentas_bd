// ejemplo de configuración para biDbConfig.js
const oracledb = require('oracledb');
require('dotenv').config();

const biDbConfig = {
  user: process.env.BI_DB_USER,
  password: process.env.BI_DB_PASSWORD,
  connectString: `(DESCRIPTION = 
    (ADDRESS_LIST = (ADDRESS = (PROTOCOL = TCP)(HOST = ${process.env.BI_DB_HOST})(PORT = ${process.env.BI_DB_PORT})))
    (CONNECT_DATA = (SERVER = DEDICATED) (SERVICE_NAME = ${process.env.BI_DB_SERVICE_NAME}) )
  )`
};

async function getBiDbConnection() {
  try {
    return await oracledb.getConnection(biDbConfig);
  } catch (err) {
    console.error("Error conectando a la base de datos BI:", err);
    throw err;
  }
}

module.exports = { getConnection: getBiDbConnection };
