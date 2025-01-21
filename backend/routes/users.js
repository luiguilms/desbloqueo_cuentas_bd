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

    // Obtener el NOMDESC correcto del usuario
    const userDesc = await connection.execute(
      `SELECT NOMDESC FROM SYSTABREP.SY_USERS_BT WHERE USERNAME = :1`,
      [username.toUpperCase()]
    );

    // Debug log
    console.log("Resultado userDesc:", userDesc.rows);

    if (userDesc.rows.length === 0) {
      return res.status(404).send({ message: 'Usuario no encontrado' });
    }

    // Obtener 4 NOMDESC aleatorios diferentes
    const otherOptions = await connection.execute(
      `SELECT NOMDESC 
       FROM (
         SELECT DISTINCT NOMDESC 
         FROM SYSTABREP.SY_USERS_BT 
         WHERE USERNAME != :1 
           AND NOMDESC IS NOT NULL
         ORDER BY DBMS_RANDOM.VALUE
       ) 
       WHERE ROWNUM <= 4`,
      [username.toUpperCase()]
    );

    // Debug log
    console.log("Resultado otherOptions:", otherOptions.rows);

    // Extraer correctamente los valores de las filas
    const userDescValue = userDesc.rows[0][0];  // Cambiado de .NOMDESC a [0]
    const otherValues = otherOptions.rows.map(row => row[0]);  // Cambiado de .NOMDESC a [0]

    let options = [...otherValues, userDescValue].filter(desc => desc != null);

    // Debug log
    console.log("Opciones finales:", options);

    // Verificar que tengamos opciones válidas
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

// Ruta para desbloquear usuario
router.post('/users/unlock', async (req, res) => {
 const { username, email, selectedDesc } = req.body;

 if (!username || !email || !selectedDesc) return res.status(400).send({
   message: "El nombre de usuario, correo y descripción son requeridos"
 });

 let connection;
 try {
   connection = await getConnection();
   
   // Primero verificamos solo la existencia del usuario en la base
   const userExists = await connection.execute(
     `SELECT 1 FROM SYSTABREP.SY_USERS_BT WHERE USERNAME = :1`,
     [username.toUpperCase()]
   );

   if (userExists.rows.length === 0) {
     return res.status(400).send({
       message: 'El usuario no existe en la Base de Datos'
     });
   }

   // Si existe el usuario, verificamos que coincida el correo y la descripción
   const checkUser = await connection.execute(
     `SELECT 1 FROM SYSTABREP.SY_USERS_BT 
      WHERE USERNAME = :1 
      AND CORREO = :2 
      AND NOMDESC = :3`,
     [username.toUpperCase(), email, selectedDesc]
   );

   if (checkUser.rows.length === 0) {
     return res.status(400).send({
       message: 'El correo o la descripción no coinciden con el usuario'
     });
   }

   // Si todo está correcto, procedemos con el desbloqueo
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
       out: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 }
     }
   );
   
   const message = result.outBinds.out || 'Usuario desbloqueado exitosamente';
   res.status(200).send({ message });

 } catch (err) {
   console.error('Error:', err);
   if (err.errorNum) {
     switch (err.errorNum) {
       case 20001:
         return res.status(400).send({
           message: 'El usuario debe renovar sus permisos con SINF, ha superado su fecha de vigencia.'
         });
       case 20002:
         return res.status(400).send({
           message: 'El usuario no está registrado en la Base de Datos de Bantotal'
         });
       default:
         return res.status(500).send({
           message: err.message.split('\n')[0]
         });
     }
   }
   res.status(500).send({ message: "Error desbloqueando usuario" });
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

module.exports = router;