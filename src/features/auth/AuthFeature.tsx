import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card, Button, Input, Badge } from '../../components/UI';
import { validatePassword, validateRegisterInput, validateLoginInput, validateProfileName } from '../../core/validation';
import { LogIn, UserPlus, LogOut, KeyRound, Save } from 'lucide-react';

type AuthTab = 'login' | 'register';

export const AuthFeature: React.FC = () => {
  const {
    currentUser,
    loginWithCredentials,
    registerWithCredentials,
    updateProfile,
    changePassword,
    logout,
    isLoading
  } = useAuthStore();

  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatar, setAvatar] = useState('🐻');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('🐻');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const avatares = ['🐻', '🦊', '🦁', '🐼', '🐨', '🐸', '🐯', '🐙', '🦖', '🦄'];

  useEffect(() => {
    if (!currentUser) return;
    setProfileName(currentUser.name);
    setProfileAvatar(currentUser.avatar);
  }, [currentUser]);

  const resetForm = () => {
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const passwordValidation = validatePassword({ password });
    if (!passwordValidation.is_valid) {
      setError(passwordValidation.error);
      setIsSubmitting(false);
      return;
    }

    const emailValidation = validateLoginInput({ email });
    if (!emailValidation.is_valid) {
      setError(emailValidation.error);
      setIsSubmitting(false);
      return;
    }

    try {
      await loginWithCredentials(emailValidation.normalized_email, password);
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const loginHint =
        message.includes('incorrectos')
          ? ' Si te registraste antes, es posible que la cuenta se haya perdido en un despliegue anterior: prueba registrarte de nuevo con el mismo correo.'
          : '';
      setError((message || 'No se pudo iniciar sesión.') + loginHint);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const validation = validateRegisterInput({ name, email });
    if (!validation.is_valid) {
      setError(validation.error);
      setIsSubmitting(false);
      return;
    }

    const passwordValidation = validatePassword({ password });
    if (!passwordValidation.is_valid) {
      setError(passwordValidation.error);
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      setIsSubmitting(false);
      return;
    }

    try {
      await registerWithCredentials(
        validation.normalized_name,
        validation.normalized_email,
        password,
        avatar
      );
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Error al registrar usuario.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError('');
    setProfileMessage('');

    const validation = validateProfileName({ name: profileName });
    if (!validation.is_valid) {
      setProfileError(validation.error);
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateProfile(validation.normalized_name, profileAvatar);
      setProfileMessage('Perfil actualizado correctamente.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setProfileError(message || 'No se pudo actualizar el perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    const currentValidation = validatePassword({ password: currentPassword });
    if (!currentValidation.is_valid) {
      setPasswordError('La contraseña actual no es válida.');
      return;
    }

    const newValidation = validatePassword({ password: newPassword });
    if (!newValidation.is_valid) {
      setPasswordError(newValidation.error);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordMessage('Contraseña actualizada correctamente.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPasswordError(message || 'No se pudo cambiar la contraseña.');
    } finally {
      setIsSavingPassword(false);
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
              <div style={{ marginTop: '10px' }}>
                <Badge variant="emerald">Cuenta verificada</Badge>
              </div>
            </div>

            <form
              onSubmit={handleSaveProfile}
              style={{
                width: '100%',
                borderTop: '1px solid var(--border-glass)',
                paddingTop: '20px',
                marginTop: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                textAlign: 'left'
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Editar perfil</h3>
              <Input
                label="Nombre"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                required
              />
              <div className="form-group">
                <label className="form-label">Avatar</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px' }}>
                  {avatares.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setProfileAvatar(item)}
                      style={{
                        width: '40px',
                        height: '40px',
                        fontSize: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: profileAvatar === item ? 'var(--primary-light)' : 'rgba(255,255,255,0.03)',
                        border: profileAvatar === item ? '2px solid var(--primary)' : '1px solid var(--border-glass)',
                        borderRadius: '50%',
                        cursor: 'pointer'
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              {profileError && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{profileError}</p>}
              {profileMessage && <p style={{ color: 'var(--secondary)', fontSize: '13px' }}>{profileMessage}</p>}
              <Button type="submit" icon={<Save size={16} />} disabled={isSavingProfile}>
                {isSavingProfile ? 'Guardando...' : 'Guardar perfil'}
              </Button>
            </form>

            <form
              onSubmit={handleChangePassword}
              style={{
                width: '100%',
                borderTop: '1px solid var(--border-glass)',
                paddingTop: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                textAlign: 'left'
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={16} />
                Cambiar contraseña
              </h3>
              <Input
                label="Contraseña actual"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <Input
                label="Nueva contraseña"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <Input
                label="Confirmar nueva contraseña"
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                required
              />
              {passwordError && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{passwordError}</p>}
              {passwordMessage && <p style={{ color: 'var(--secondary)', fontSize: '13px' }}>{passwordMessage}</p>}
              <Button type="submit" variant="secondary" disabled={isSavingPassword}>
                {isSavingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
              </Button>
            </form>

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
              Inicia sesión o crea una cuenta para gestionar tus finanzas personales y gastos compartidos.
            </p>
          </div>

          <Card glass>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                marginBottom: '24px'
              }}
            >
              <Button
                variant={activeTab === 'login' ? 'primary' : 'secondary'}
                onClick={() => {
                  setActiveTab('login');
                  resetForm();
                }}
                icon={<LogIn size={16} />}
              >
                Entrar
              </Button>
              <Button
                variant={activeTab === 'register' ? 'primary' : 'secondary'}
                onClick={() => {
                  setActiveTab('register');
                  resetForm();
                }}
                icon={<UserPlus size={16} />}
              >
                Registro
              </Button>
            </div>

            {activeTab === 'login' && (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input
                  label="Correo Electrónico"
                  type="email"
                  placeholder="ej. ana@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <Input
                  label="Contraseña"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                {error && <p style={{ color: 'var(--danger)', fontSize: '14px', textAlign: 'center' }}>{error}</p>}
                <Button type="submit" style={{ width: '100%' }} disabled={isSubmitting}>
                  {isSubmitting ? 'Ingresando...' : 'Iniciar Sesión'}
                </Button>
              </form>
            )}

            {activeTab === 'register' && (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input
                  label="Nombre Completo"
                  placeholder="ej. Ana Gómez"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <Input
                  label="Correo Electrónico"
                  type="email"
                  placeholder="ej. ana@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <Input
                  label="Contraseña"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <Input
                  label="Confirmar Contraseña"
                  type="password"
                  placeholder="Repite tu contraseña"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />

                <div className="form-group">
                  <label className="form-label">Elige tu Avatar</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px' }}>
                    {avatares.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAvatar(item)}
                        style={{
                          width: '40px',
                          height: '40px',
                          fontSize: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: avatar === item ? 'var(--primary-light)' : 'rgba(255,255,255,0.03)',
                          border: avatar === item ? '2px solid var(--primary)' : '1px solid var(--border-glass)',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          transition: 'var(--transition-fast)'
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p style={{ color: 'var(--danger)', fontSize: '14px', textAlign: 'center' }}>{error}</p>}

                <Button type="submit" style={{ width: '100%' }} disabled={isSubmitting}>
                  {isSubmitting ? 'Creando cuenta...' : 'Crear Cuenta'}
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
