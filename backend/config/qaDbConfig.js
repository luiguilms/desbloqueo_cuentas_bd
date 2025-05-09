// ejemplo de configuración para qaDbConfig.js
const oracledb = require('oracledb');
require('dotenv').config();

const qaDbConfig = {
  user: process.env.QA_DB_USER,
  password: process.env.QA_DB_PASSWORD,
  connectString: `(DESCRIPTION = 
    (ADDRESS_LIST = (ADDRESS = (PROTOCOL = TCP)(HOST = ${process.env.QA_DB_HOST})(PORT = ${process.env.QA_DB_PORT})))
    (CONNECT_DATA = (SERVER = DEDICATED) (SERVICE_NAME = ${process.env.QA_DB_SERVICE_NAME}) )
  )`
};

async function getQaDbConnection() {
  try {
    return await oracledb.getConnection(qaDbConfig);
  } catch (err) {
    console.error("Error conectando a la base de datos Calidad:", err);
    throw err;
  }
}

module.exports = { getConnection: getQaDbConnection };
