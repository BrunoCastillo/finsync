import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card, Button, Input } from '../../components/UI';
import { LogIn, UserPlus, LogOut } from 'lucide-react';

export const AuthFeature: React.FC = () => {
  const { currentUser, allUsers, login, logout, register, isLoading } = useAuthStore();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('🐻');
  const [error, setError] = useState('');

  const avatares = ['🐻', '🦊', '🦁', '🐼', '🐨', '🐸', '🐯', '🐙', '🦖', '🦄'];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim()) {
      setError('Por favor, completa todos los campos.');
      return;
    }
    try {
      await register(name.trim(), email.trim(), avatar);
      setName('');
      setEmail('');
    } catch (err: any) {
      setError('Error al registrar usuario: ' + (err.message || err));
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <p>Cargando sesión...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
      {currentUser ? (
        <Card glass>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
            <div
              style={{
                width: '96px',
                height: '96px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--accent-light) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
                border: '2px solid var(--primary)'
              }}
            >
              {currentUser.avatar}
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700 }}>{currentUser.name}</h2>
              <p style={{ color: 'var(--text-secondary)' }}>{currentUser.email}</p>
            </div>
            
            <div style={{ width: '100%', borderTop: '1px solid var(--border-glass)', padding: '16px 0', marginTop: '16px' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Cambiar rápidamente de usuario (Simulación de Dispositivos)
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {allUsers
                  .filter((u) => u.id !== currentUser.id)
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => login(u.id)}
                      className="list-item"
                      style={{
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-glass)'
                      }}
                    >
                      <span>{u.avatar}</span>
                      <span>{u.name}</span>
                    </button>
                  ))}
              </div>
            </div>

            <Button
              variant="danger"
              onClick={logout}
              icon={<LogOut size={16} />}
              style={{ marginTop: '16px' }}
            >
              Cerrar Sesión
            </Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px' }}>Bienvenido a FinSync</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Accede a tus finanzas compartidas y gastos grupales de forma instantánea.
            </p>
          </div>

          <Card glass>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '24px' }}>
              <Button
                variant={!isRegistering ? 'primary' : 'secondary'}
                onClick={() => setIsRegistering(false)}
                icon={<LogIn size={16} />}
              >
                Acceder Demo
              </Button>
              <Button
                variant={isRegistering ? 'primary' : 'secondary'}
                onClick={() => setIsRegistering(true)}
                icon={<UserPlus size={16} />}
              >
                Crear Cuenta
              </Button>
            </div>

            {!isRegistering ? (
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', textAlign: 'center' }}>
                  Selecciona un usuario de prueba para ingresar
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {allUsers.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => login(u.id)}
                      className="list-item"
                      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', padding: '12px 16px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>{u.avatar}</span>
                        <div>
                          <p style={{ fontWeight: 600 }}>{u.name}</p>
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{u.email}</p>
                        </div>
                      </div>
                      <span style={{ color: 'var(--primary)', fontSize: '13px', fontWeight: 600 }}>Entrar &rarr;</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input
                  label="Nombre Completo"
                  placeholder="ej. Ana Gómez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label="Correo Electrónico"
                  type="email"
                  placeholder="ej. ana@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                
                <div className="form-group">
                  <label className="form-label">Elige tu Avatar</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px' }}>
                    {avatares.map((av) => (
                      <button
                        key={av}
                        type="button"
                        onClick={() => setAvatar(av)}
                        style={{
                          width: '40px',
                          height: '40px',
                          fontSize: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: avatar === av ? 'var(--primary-light)' : 'rgba(255,255,255,0.03)',
                          border: avatar === av ? '2px solid var(--primary)' : '1px solid var(--border-glass)',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          transition: 'var(--transition-fast)'
                        }}
                      >
                        {av}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p style={{ color: 'var(--danger)', fontSize: '14px', textAlign: 'center' }}>{error}</p>}

                <Button type="submit" style={{ width: '100%' }}>
                  Crear Cuenta y Entrar
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
