// ejemplo de configuración para arquiDbConfig.js
const oracledb = require('oracledb');
require('dotenv').config();

const arquiDbConfig = {
  user: process.env.ARQUI_DB_USER,
  password: process.env.ARQUI_DB_PASSWORD,
  connectString: `(DESCRIPTION = 
    (ADDRESS_LIST = (ADDRESS = (PROTOCOL = TCP)(HOST = ${process.env.ARQUI_DB_HOST})(PORT = ${process.env.ARQUI_DB_PORT})))
    (CONNECT_DATA = (SERVER = DEDICATED) (SERVICE_NAME = ${process.env.ARQUI_DB_SERVICE_NAME}) )
  )`
};

async function getArquiDbConnection() {
  try {
    return await oracledb.getConnection(arquiDbConfig);
  } catch (err) {
    console.error("Error conectando a la base de datos Arquitectura:", err);
    throw err;
  }
}

module.exports = { getConnection: getArquiDbConnection };
