const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../config/dbConfig');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: '10.0.200.68',
  port: 25,
  secure: false,
  tls: {
    rejectUnauthorized: false,
  },
});

// Función para enviar correo al administrador
async function sendAdminNotification(username, operationType) {
  const adminEmail = 'igs_llupacca@cajaarequipa.pe';
  const operationText = operationType === 'unlock' ? 'desbloqueo de cuenta' : 'cambio de contraseña temporal';
  
  try {
    await transporter.sendMail({
      from: 'igs_llupacca@cajaarequipa.pe',
      to: adminEmail,
      subject: `Notificación: ${operationText.toUpperCase()} - Usuario ${username}`,
      text: `Se ha realizado una operación de ${operationText} para el usuario ${username} exitosamente.\n\nFecha y hora: ${new Date().toLocaleString()}`
    });
    
    console.log(`Notificación enviada al administrador sobre ${operationText} de ${username}`);
  } catch (error) {
    console.error('Error al enviar correo al administrador:', error);
    // No bloqueamos el flujo principal si falla el envío de la notificación
  }
}

// Ruta para generar y enviar código (desbloqueo)
router.post('/users/generate-code', async (req, res) => {
  const { username, email, selectedDesc } = req.body;
  let connection;

  if (!username || !selectedDesc) {
    return res.status(400).send({
      message: "El nombre de usuario y la descripción son requeridos",
    });
  }

  try {
    connection = await getConnection();

    // Verificar si el usuario existe y es tipo 'F'
    const userResult = await connection.execute(
      `SELECT CORREO FROM SYSTABREP.SY_USERS_BT WHERE USERNAME = :1 AND TIPOUSER = 'F'`,
      [username.toUpperCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).send({
        message: "El usuario no existe en la Base de Datos o no es un usuario físico",
      });
    }

    const userCorreo = userResult.rows[0][0];

    if (userCorreo && !email) {
      return res.status(400).send({
        message: "El correo es obligatorio para este usuario",
      });
    }

    // Verificar si el correo y la descripción coinciden
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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    await connection.execute(
      `INSERT INTO TEMP_UNLOCK_CODES (USERNAME, EMAIL, CODE) 
       VALUES (:1, :2, :3)`,
      [username.toUpperCase(), email, code]
    );
    
    await transporter.sendMail({
      from: 'igs_llupacca@cajaarequipa.pe',
      to: email,
      subject: 'Código de Desbloqueo',
      text: `Su código de desbloqueo es: ${code}\n\nEste codigo expirará en 5 minutos.\n`
    });

    await connection.commit();
    res.json({ message: 'Código enviado exitosamente' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Error al generar el código' });
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

// Ruta para generar y enviar código (cambio de contraseña)
router.post('/users/generate-code-password', async (req, res) => {
  const { username, email, selectedDesc } = req.body;
  let connection;

  if (!username || !selectedDesc) {
    return res.status(400).send({
      message: "El nombre de usuario y la descripción son requeridos",
    });
  }

  try {
    connection = await getConnection();

    // Verificar si el usuario existe y es tipo 'F'
    const userResult = await connection.execute(
      `SELECT CORREO FROM SYSTABREP.SY_USERS_BT WHERE USERNAME = :1 AND TIPOUSER = 'F'`,
      [username.toUpperCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).send({
        message: "El usuario no existe en la Base de Datos o no es un usuario físico",
      });
    }

    const userCorreo = userResult.rows[0][0];

    if (userCorreo && !email) {
      return res.status(400).send({
        message: "El correo es obligatorio para este usuario",
      });
    }

    // Verificar si el correo y la descripción coinciden
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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    await connection.execute(
      `INSERT INTO TEMP_UNLOCK_CODES (USERNAME, EMAIL, CODE) 
       VALUES (:1, :2, :3)`,
      [username.toUpperCase(), email, code]
    );
    
    await transporter.sendMail({
      from: 'igs_llupacca@cajaarequipa.pe',
      to: email,
      subject: 'Código para Cambio de Contraseña',
      text: `Su código para generar una contraseña temporal es: ${code}\n\nEste codigo expirará en 5 minutos.\n`
    });

    await connection.commit();
    res.json({ message: 'Código enviado exitosamente' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Error al generar el código' });
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

// Ruta para obtener opciones de NOMDESC
router.get('/users/user-options/:username', async (req, res) => {
  const { username } = req.params;
  let connection;
  
  try {
    connection = await getConnection();
    
    console.log("Buscando opciones para usuario:", username.toUpperCase());

    const userCheck = await connection.execute(
      `SELECT TIPOUSER, NOMDESC FROM SYSTABREP.SY_USERS_BT WHERE USERNAME = :1`,
      [username.toUpperCase()]
    );

    console.log("Resultado userCheck:", userCheck.rows);

    if (userCheck.rows.length === 0) {
      return res.status(404).send({ message: 'Usuario no encontrado' });
    }
    
    if (userCheck.rows[0][0] !== 'F') {
      return res.status(400).send({ 
        message: 'Este sistema solo está disponible para usuarios físicos' 
      });
    }
    
    const userDescValue = userCheck.rows[0][1];

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

    console.log("Resultado otherOptions:", otherOptions.rows);

    const otherValues = otherOptions.rows.map(row => row[0]);
    let options = [...otherValues, userDescValue].filter(desc => desc != null);

    console.log("Opciones finales:", options);

    if (options.length === 0) {
      return res.status(500).send({ message: 'No se encontraron opciones válidas' });
    }

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

// Ruta para desbloquear usuario (simplificada)
router.post('/users/unlock', async (req, res) => {
  const { username, email, code } = req.body;
  let connection;

  try {
    connection = await getConnection();

    // Verificar solo el código
    const codeCheck = await connection.execute(
      `SELECT 1 FROM TEMP_UNLOCK_CODES 
       WHERE USERNAME = :1 
       AND EMAIL = :2 
       AND CODE = :3 
       AND CREATION_DATE > SYSTIMESTAMP - INTERVAL '5' MINUTE`,
      [username.toUpperCase(), email, code]
    );

    if (codeCheck.rows.length === 0) {
      return res.status(400).send({
        message: "Código inválido o expirado"
      });
    }

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

    await connection.execute(
      `DELETE FROM TEMP_UNLOCK_CODES WHERE USERNAME = :1`,
      [username.toUpperCase()]
    );
    await connection.commit();

    const message = result.outBinds.out || "Usuario desbloqueado exitosamente";

    // Enviar notificación al administrador
    await sendAdminNotification(username.toUpperCase(), 'unlock');
    
    res.status(200).send({ message });
  } catch (err) {
    console.error("Error:", err);
    if (err.errorNum) {
      switch (err.errorNum) {
        case 20001:
          return res.status(400).send({
            message: "El usuario debe renovar sus permisos con SINF, ha superado su fecha de vigencia.",
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
        console.error('Error cerrando la conexión:', err);
      }
    }
  }
});

// Ruta para cambio de contraseña temporal (simplificada)
router.post('/users/change-password', async (req, res) => {
  const { username, email, code } = req.body;
  let connection;

  try {
    connection = await getConnection();

    // Verificar solo el código
    const codeCheck = await connection.execute(
      `SELECT 1 FROM TEMP_UNLOCK_CODES 
       WHERE USERNAME = :1 
       AND EMAIL = :2 
       AND CODE = :3 
       AND CREATION_DATE > SYSTIMESTAMP - INTERVAL '5' MINUTE`,
      [username.toUpperCase(), email, code]
    );

    if (codeCheck.rows.length === 0) {
      return res.status(400).send({
        message: "Código inválido o expirado"
      });
    }

    const result = await connection.execute(
      `DECLARE
         l_line VARCHAR2(32767);
         l_status INTEGER;
       BEGIN
         DBMS_OUTPUT.ENABLE(32767);
         SP_BD_CAMBIO_PASSWD_CUENTA(:username);
         DBMS_OUTPUT.GET_LINE(l_line, l_status);
         :out := l_line;
       END;`,
      {
        username: username.toUpperCase(),
        out: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
      }
    );

    await connection.execute(
      `DELETE FROM TEMP_UNLOCK_CODES WHERE USERNAME = :1`,
      [username.toUpperCase()]
    );
    await connection.commit();
    // Enviar notificación al administrador (mover aquí, fuera del condicional)
    await sendAdminNotification(username.toUpperCase(), 'password');

    const outputMessage = result.outBinds.out;
    if (outputMessage && outputMessage.includes("temporal")) {
      const tempPassword = outputMessage.split(": ")[1];
      res.status(200).send({ 
        message: "Contraseña temporal generada exitosamente",
        temporaryPassword: tempPassword
      });
    } else {
      res.status(200).send({ 
        message: outputMessage || "Contraseña temporal generada exitosamente"
      });
    }
  } catch (err) {
    console.error("Error completo:", err);
    
    if (err.message && err.message.includes("ORA-21000")) {
      if (err.message.includes("-29998")) {
        return res.status(400).send({
          message: "El usuario debe renovar sus permisos con SINF, ha superado su fecha de vigencia."
        });
      }
      if (err.message.includes("-29999")) {
        return res.status(400).send({
          message: "El usuario no está registrado en la Base de Datos de Bantotal"
        });
      }
    }

    if (err.errorNum) {
      return res.status(500).send({
        message: err.message.split("\n")[0]
      });
    }

    res.status(500).send({ 
      message: "Error generando contraseña temporal" 
    });
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