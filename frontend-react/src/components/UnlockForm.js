import React, { useState, useEffect } from 'react';
import '../styles/UnlockForm.css';

function UnlockForm() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [descOptions, setDescOptions] = useState([]);
  const [selectedDesc, setSelectedDesc] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (username) {
      loadDescOptions(username);
    }
  }, [username]);

  const loadDescOptions = async (username) => {
    try {
      const response = await fetch(`http://localhost:3000/api/users/user-options/${username}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data.options)) {
        setDescOptions(data.options);
      } else {
        setDescOptions([]);
      }
    } catch (err) {
      console.error('Error cargando opciones:', err);
      setDescOptions([]);
    }
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    setSelectedDesc('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username || !selectedDesc) {
      setError('Usuario y descripción son requeridos');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/users/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email: email || null,
          selectedDesc
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage(data.message);
        setError('');
        // Limpiar formulario
        setUsername('');
        setEmail('');
        setSelectedDesc('');
        setDescOptions([]);
      } else {
        setError(data.message);
        setMessage('');
      }
    } catch (err) {
      setError('Error de conexión al servidor');
      setMessage('');
    }
  };

  return (
    <div className="unlock-form">
      <div className="header">
        <h1>Sistema de Desbloqueo de Usuarios</h1>
      </div>
      <div className="form-container">
        <h2>Desbloqueo de Usuarios</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Usuario:</label>
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Ingrese nombre de usuario"
              required
            />
          </div>
          <div className="form-group">
            <label>Correo:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ingrese su correo registrado"
            />
          </div>
          <div className="form-group">
            <label>Descripción:</label>
            <select
              value={selectedDesc}
              onChange={(e) => setSelectedDesc(e.target.value)}
              required
            >
              <option value="">Seleccione su descripción...</option>
              {descOptions.map((desc, index) => (
                <option key={index} value={desc}>
                  {desc}
                </option>
              ))}
            </select>
          </div>
          <button type="submit">Desbloquear Usuario</button>
        </form>
        
        {message && <div className="message success">{message}</div>}
        {error && <div className="message error">{error}</div>}
      </div>
    </div>
  );
}

export default UnlockForm;