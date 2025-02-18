const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../config/dbConfig');

// Ruta para obtener opciones de NOMDESC
router.get('/users/user-options/:username', async (req, res) => {
  const { username } = req.params;
  let connection;
  
  try {
    connection = await getConnection();
    
    console.log("Buscando opciones para usuario:", username.toUpperCase());

    // Primero verificar si el usuario existe y su tipo
    const userCheck = await connection.execute(
      `SELECT TIPOUSER, NOMDESC FROM SYSTABREP.SY_USERS_BT WHERE USERNAME = :1`,
      [username.toUpperCase()]
    );

    // Debug log
    console.log("Resultado userCheck:", userCheck.rows);

    if (userCheck.rows.length === 0) {
      return res.status(404).send({ message: 'Usuario no encontrado' });
    }
    // Si existe pero no es tipo F
    if (userCheck.rows[0][0] !== 'F') {
      return res.status(400).send({ 
        message: 'Este sistema solo está disponible para usuarios físicos' 
      });
    }
    // Si llegamos aquí, el usuario existe y es tipo F
    const userDescValue = userCheck.rows[0][1];

    // Obtener 4 NOMDESC aleatorios diferentes de usuarios tipo F
    const otherOptions = await connection.execute(
      `SELECT NOMDESC 
       FROM (
         SELECT DISTINCT NOMDESC 
         FROM SYSTABREP.SY_USERS_BT 
         WHERE USERNAME != :1 
           AND NOMDESC IS NOT NULL
           AND TIPOUSER = 'F'
         ORDER BY DBMS_RANDOM.VALUE
       ) 
       WHERE ROWNUM <= 4`,
      [username.toUpperCase()]
    );

    // Debug log
    console.log("Resultado otherOptions:", otherOptions.rows);

    const otherValues = otherOptions.rows.map(row => row[0]);
    let options = [...otherValues, userDescValue].filter(desc => desc != null);

    // Debug log
    console.log("Opciones finales:", options);

    if (options.length === 0) {
      return res.status(500).send({ message: 'No se encontraron opciones válidas' });
    }

    // Mezclar el array de opciones
    options = options.sort(() => Math.random() - 0.5);

    res.json({ options });

  } catch (err) {
    console.error('Error completo:', err);
    res.status(500).send({ message: 'Error obteniendo opciones' });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error cerrando la conexión:', err);
      }
    }
  }
});

router.post('/users/unlock', async (req, res) => {
  const { username, email, selectedDesc } = req.body;

  if (!username || !selectedDesc) {
    return res.status(400).send({
      message: "El nombre de usuario y la descripción son requeridos",
    });
  }

  let connection;
  try {
    connection = await getConnection();

    // Verificar si el usuario existe en la base de datos y es tipo F
    const userResult = await connection.execute(
      `SELECT CORREO FROM SYSTABREP.SY_USERS_BT WHERE USERNAME = :1 AND TIPOUSER = 'F'`,
      [username.toUpperCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).send({
        message: "El usuario no existe en la Base de Datos o no es un usuario físico",
      });
    }

    const userCorreo = userResult.rows[0][0]; // Obtener el correo registrado

    // Si el usuario tiene correo registrado, verificar que el correo sea proporcionado
    if (userCorreo && !email) {
      return res.status(400).send({
        message: "El correo es obligatorio para este usuario",
      });
    }

    // Verificar que el correo y la descripción coincidan con el usuario tipo F
    const checkUser = await connection.execute(
      `SELECT 1 FROM SYSTABREP.SY_USERS_BT 
       WHERE USERNAME = :1 
       AND (CORREO = :2 OR CORREO IS NULL) 
       AND NOMDESC = :3
       AND TIPOUSER = 'F'`,
      [username.toUpperCase(), email, selectedDesc]
    );

    if (checkUser.rows.length === 0) {
      return res.status(400).send({
        message: "El correo o la descripción no coinciden con el usuario",
      });
    }

    // Proceder con el desbloqueo
    const result = await connection.execute(
      `DECLARE
         l_line VARCHAR2(32767);
         l_status INTEGER;
       BEGIN
         DBMS_OUTPUT.ENABLE(32767);
         SP_BD_DESBLOQUEO_CUENTA(:username);
         DBMS_OUTPUT.GET_LINE(l_line, l_status);
         :out := l_line;
       END;`,
      {
        username: username.toUpperCase(),
        out: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
      }
    );

    const message = result.outBinds.out || "Usuario desbloqueado exitosamente";
    res.status(200).send({ message });
  } catch (err) {
    console.error("Error:", err);
    if (err.errorNum) {
      switch (err.errorNum) {
        case 20001:
          return res.status(400).send({
            message:
              "El usuario debe renovar sus permisos con SINF, ha superado su fecha de vigencia.",
          });
        case 20002:
          return res.status(400).send({
            message: "El usuario no está registrado en la Base de Datos de Bantotal",
          });
        default:
          return res.status(500).send({
            message: err.message.split("\n")[0],
          });
      }
    }
    res.status(500).send({ message: "Error desbloqueando usuario" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error cerrando la conexión:", err);
      }
    }
  }
});

module.exports = router;