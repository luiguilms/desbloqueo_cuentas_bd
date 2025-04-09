const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../config/dbConfig');
const { getTempCodesConnection } = require('../config/tempCodesDbConfig');
const nodemailer = require('nodemailer');
const os = require('os');
const { execSync } = require('child_process');

// Función para obtener información del cliente
// Función para obtener información del cliente
function getClientInfo(req) {
  let ipAddress = '0.0.0.0';
  
  try {
    // Enfoque alternativo: usar las interfaces de red directamente
    const networkInterfaces = os.networkInterfaces();
    
    // Buscar una dirección IP que no sea de loopback
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipAddress = iface.address;
          // Una vez encontrada una IP válida, salimos del bucle
          break;
        }
      }
      if (ipAddress !== '0.0.0.0') break;
    }
    
    // Si aún no tenemos IP, intentar con ipconfig
    if (ipAddress === '0.0.0.0' && process.platform === 'win32') {
      // Probar varias posibles salidas de ipconfig (para diferentes idiomas)
      const output = execSync('ipconfig').toString();
      
      // Patrones para diferentes idiomas y versiones
      const patterns = [
        /IPv4 Address[.\s]+: ([^\s]+)/,
        /Dirección IPv4[.\s]+: ([^\s]+)/,  // Español
        /IPv4-Adresse[.\s]+: ([^\s]+)/,    // Alemán
        /Adresse IPv4[.\s]+: ([^\s]+)/,    // Francés
        /IPv4[^:]+: ([^\s]+)/              // Patrón más genérico
      ];
      
      for (const pattern of patterns) {
        const matches = output.match(pattern);
        if (matches && matches.length > 1) {
          ipAddress = matches[1];
          break;
        }
      }
      
      // En caso de fallo, imprimir la salida para diagnóstico
      if (ipAddress === '0.0.0.0') {
        console.log('Salida de ipconfig:', output);
      }
    }
  } catch (error) {
    console.error('Error obteniendo IP de la máquina:', error);
    // Usar la IP de la solicitud como fallback
    ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '0.0.0.0';
  }
  
  // Para depuración, imprimir información detallada
  console.log('IP encontrada:', ipAddress);
  console.log('Usuario Windows:', process.env.USERNAME || process.env.USER || 'unknown');
  console.log('Nombre de máquina:', os.hostname() || 'unknown');
  
  return {
    ipAddress: ipAddress,
    windowsUser: process.env.USERNAME || process.env.USER || 'unknown',
    machineName: os.hostname() || 'unknown'
  };
}

// Función para registrar en el historial
async function logToHistory(connection, username, email, code, clientInfo) {
  try {
    await connection.execute(
      `INSERT INTO UNLOCK_CODES_HISTORY 
       (USERNAME, EMAIL, CODE, WINDOWS_USER, IP_ADDRESS, MACHINE_NAME) 
       VALUES (:1, :2, :3, :4, :5, :6)`,
      [
        username.toUpperCase(), 
        email, 
        code, 
        clientInfo.windowsUser,
        clientInfo.ipAddress,
        clientInfo.machineName
      ]
    );
    
    await connection.commit();
    console.log('Registro histórico creado para:', username);
  } catch (error) {
    console.error('Error al registrar en historial:', error);
    // No interrumpimos el flujo principal si falla el registro histórico
  }
}

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
  let mainConnection;
  let tempConnection;
  const clientInfo = getClientInfo(req);

  if (!username || !selectedDesc) {
    return res.status(400).send({
      message: "El nombre de usuario y la descripción son requeridos",
    });
  }

  try {
    mainConnection = await getConnection();

    // Verificar si el usuario existe y es tipo 'F'
    const userResult = await mainConnection.execute(
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
    const checkUser = await mainConnection.execute(
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
    tempConnection = await getTempCodesConnection();
    await tempConnection.execute(
      `INSERT INTO TEMP_UNLOCK_CODES (USERNAME, EMAIL, CODE) 
       VALUES (:1, :2, :3)`,
      [username.toUpperCase(), email, code]
    );
    // Registrar también en la tabla de historial
    await logToHistory(
      tempConnection, 
      username, 
      email, 
      code, 
      clientInfo
    );
    
    await transporter.sendMail({
      from: 'igs_llupacca@cajaarequipa.pe',
      to: email,
      subject: 'Código de Desbloqueo',
      text: `Su código de desbloqueo es: ${code}\n\nEste codigo expirará en 5 minutos.\n`
    });

    await tempConnection.commit();
    res.json({ message: 'Código enviado exitosamente' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Error al generar el código' });
  } finally {
    // Cerrar ambas conexiones
    if (mainConnection) {
      try { await mainConnection.close(); } 
      catch (err) { console.error('Error cerrando conexión principal:', err); }
    }
    if (tempConnection) {
      try { await tempConnection.close(); } 
      catch (err) { console.error('Error cerrando conexión temporal:', err); }
    }
  }
});

// Ruta para generar y enviar código (cambio de contraseña)
router.post('/users/generate-code-password', async (req, res) => {
  const { username, email, selectedDesc } = req.body;
  const clientInfo = getClientInfo(req);
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

    // Registrar en historial
    await logToHistory(
      connection, 
      username, 
      email, 
      code, 
      clientInfo
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
  let mainConnection;
  let tempConnection;
  let codeVerified = false;
  try {
    tempConnection = await getTempCodesConnection();

    // Verificar solo el código
    const codeCheck = await tempConnection.execute(
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

    codeVerified = true;

    mainConnection = await getConnection();

    const result = await mainConnection.execute(
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
            message: "El usuario no está registrado en la Base de Datos de Bantotal o no esta habilitado.",
          });
        default:
          return res.status(500).send({
            message: err.message.split("\n")[0],
          });
      }
    }
    res.status(500).send({ message: "Error desbloqueando usuario" });
  } finally {
    // Limpiar código de la tabla si fue verificado, independientemente del resultado
    if (codeVerified && tempConnection) {
      try {
        await tempConnection.execute(
          `DELETE FROM TEMP_UNLOCK_CODES WHERE USERNAME = :1 AND EMAIL = :2 AND CODE = :3`,
          [username.toUpperCase(), email, code]
        );
        await tempConnection.commit();
      } catch (deleteErr) {
        console.error('Error eliminando código temporal:', deleteErr);
      }
    }
    if (mainConnection) {
      try {
        await mainConnection.close();
      } catch (err) {
        console.error('Error cerrando la conexión principal:', err);
      }
    }
    if (tempConnection) {
      try {
        await tempConnection.close();
      } catch (err) {
        console.error('Error cerrando la conexión temporal:', err);
      }
    }}
  });

// Ruta para cambio de contraseña temporal (simplificada)
router.post('/users/change-password', async (req, res) => {
  const { username, email, code } = req.body;
  let mainConnection;
  let tempConnection;
  let codeVerified = false;

  try {
    // Conectar a la BD de códigos temporales
    tempConnection = await getTempCodesConnection();
    
    // Verificar el código
    const codeCheck = await tempConnection.execute(
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
    
    // Marcar código como verificado
    codeVerified = true;
    
    // Conectar a la BD principal
    mainConnection = await getConnection();

    // Ejecutar procedimiento para cambio de contraseña
    const result = await mainConnection.execute(
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

    // Enviar notificación al administrador
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
          message: "El usuario no está registrado en la Base de Datos de Bantotal o no esta habilitado."
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
    // Limpiar código de la tabla si fue verificado, independientemente del resultado
    if (codeVerified && tempConnection) {
      try {
        await tempConnection.execute(
          `DELETE FROM TEMP_UNLOCK_CODES WHERE USERNAME = :1 AND EMAIL = :2 AND CODE = :3`,
          [username.toUpperCase(), email, code]
        );
        await tempConnection.commit();
      } catch (deleteErr) {
        console.error('Error eliminando código temporal:', deleteErr);
      }
    }
    
    // Cerrar conexiones
    if (mainConnection) {
      try {
        await mainConnection.close();
      } catch (err) {
        console.error('Error cerrando la conexión principal:', err);
      }
    }
    if (tempConnection) {
      try {
        await tempConnection.close();
      } catch (err) {
        console.error('Error cerrando la conexión temporal:', err);
      }
    }
  }
});

module.exports = router;