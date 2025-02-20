import React, { useState, useEffect } from 'react';
import '../styles/UnlockForm.css';

function CodeVerificationModal({ isOpen, onClose, onVerify, isPasswordMode }) {
  const [code, setCode] = useState('');
  useEffect(() => {
    if (!isOpen) {
      setCode('');
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onVerify(code);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Verificación de Código</h3>
        <p>Ingrese el código enviado a su correo para {isPasswordMode ? 'generar una contraseña temporal' : 'desbloquear su cuenta'}</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ingrese el código"
            maxLength="6"
            required
          />
          <div className="modal-buttons">
            <button type="submit">Verificar</button>
            <button type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UnlockForm() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [descOptions, setDescOptions] = useState([]);
  const [selectedDesc, setSelectedDesc] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [inputError, setInputError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [tempUsername, setTempUsername] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [isPasswordMode, setIsPasswordMode] = useState(false);

  useEffect(() => {
    if (username) {
      loadDescOptions(username);
    }
  }, [username]);

  const loadDescOptions = async (username) => {
    try {
      setInputError('');
      const response = await fetch(`http://localhost:3000/api/users/user-options/${username}`);
      const data = await response.json();
      
      if (!response.ok) {
        setInputError(data.message);
        setDescOptions([]);
        return;
      }

      if (Array.isArray(data.options)) {
        setDescOptions(data.options);
        setInputError('');
      } else {
        setDescOptions([]);
      }
    } catch (err) {
      console.error('Error cargando opciones:', err);
      setDescOptions([]);
      setInputError('Error de conexión al servidor');
    }
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    setSelectedDesc('');
    setInputError('');
  };

  const handleGenerateCode = async (isPassword = false) => {
    if (!username || !selectedDesc) {
      setError('Usuario y descripción son requeridos');
      return;
    }

    try {
      setTempUsername(username);
      setTempEmail(email);
      setTempDesc(selectedDesc);
      setIsPasswordMode(isPassword);

      const endpoint = isPassword ? 
        'http://localhost:3000/api/users/generate-code-password' : 
        'http://localhost:3000/api/users/generate-code';

      const response = await fetch(endpoint, {
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
        setShowModal(true);
        setError('');
      } else {
        setError(data.message);
        setMessage('');
      }
    } catch (err) {
      setError('Error de conexión al servidor');
      setMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    handleGenerateCode(false);
  };

  const handlePasswordGeneration = () => {
    handleGenerateCode(true);
  };

  const handleVerifyCode = async (code) => {
    try {
      const endpoint = isPasswordMode ? 
        'http://localhost:3000/api/users/change-password' : 
        'http://localhost:3000/api/users/unlock';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: tempUsername,
          email: tempEmail,
          selectedDesc: tempDesc,
          code
        }),
      });

      const data = await response.json();
      setShowModal(false);
      if (response.ok) {
        setMessage(data.message);
        setError('');
        // Limpiar formulario
        setUsername('');
        setEmail('');
        setSelectedDesc('');
        setDescOptions([]);
        setTempUsername('');
        setTempEmail('');
        setTempDesc('');
        setIsPasswordMode(false);
      } else {
        setError(data.message);
      }
    } catch (err) {
      // Cerrar el modal también en caso de error de conexión
    setShowModal(false);
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
            {inputError && <div className="message error input-error">{inputError}</div>}
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
              disabled={inputError !== ''}
            >
              <option value="">Seleccione su descripción...</option>
              {descOptions.map((desc, index) => (
                <option key={index} value={desc}>
                  {desc}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={inputError !== ''}>
            Desbloquear Usuario
          </button>
          <button 
            type="button" 
            className="secondary-button" 
            onClick={handlePasswordGeneration}
            disabled={inputError !== ''}
          >
            Generar contraseña Temporal
          </button>
        </form>
        
        {message && <div className="message success">{message}</div>}
        {error && <div className="message error">{error}</div>}
      </div>

      <CodeVerificationModal 
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onVerify={handleVerifyCode}
        isPasswordMode={isPasswordMode}
      />
    </div>
  );
}

export default UnlockForm;