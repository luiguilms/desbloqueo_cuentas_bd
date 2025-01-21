const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');  // Asegúrate de importar cors
const userRoutes = require('./routes/users');

require('dotenv').config();

const app = express();
const PORT = 3000;

// Usar cors para permitir solicitudes desde el frontend
app.use(cors());

// Usar body-parser para poder manejar solicitudes JSON
app.use(bodyParser.json());

// Definir las rutas de la API
app.use('/api', userRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
