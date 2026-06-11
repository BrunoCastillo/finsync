import React, { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { useUiStore } from './store/uiStore';
import { useSyncStore } from './core/sync/syncEngine';
import { DashboardFeature } from './features/dashboard/DashboardFeature';
import { GroupsFeature } from './features/groups/GroupsFeature';
import { EventDetailFeature } from './features/events/EventDetailFeature';
import { NotificationsFeature } from './features/notifications/NotificationsFeature';
import { AuthFeature } from './features/auth/AuthFeature';
import { PersonalExpensesFeature } from './features/personal/PersonalExpensesFeature';
import { Badge } from './components/UI';
import { LayoutDashboard, Users, Bell, User, Wallet } from 'lucide-react';

const App: React.FC = () => {
  const { currentUser, seedMockUsers, isLoading } = useAuthStore();
  const { activeView, setView } = useUiStore();
  const { isOnline, pendingCount } = useSyncStore();

  // Sembrar usuarios de prueba al montar la aplicación
  useEffect(() => {
    seedMockUsers();
  }, [seedMockUsers]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: 'var(--bg-main)',
          color: 'var(--text-primary)',
          gap: '16px'
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '4px solid var(--primary-light)',
            borderTop: '4px solid var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}
        />
        <p style={{ fontWeight: 600, fontSize: '15px' }}>Iniciando FinSync...</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Si no está autenticado, forzar vista de login/registro
  const renderContent = () => {
    if (!currentUser) {
      return <AuthFeature />;
    }

    switch (activeView) {
      case 'dashboard':
        return <DashboardFeature />;
      case 'personal':
        return <PersonalExpensesFeature />;
      case 'groups':
      case 'group-detail':
        return <GroupsFeature />;
      case 'event-detail':
        return <EventDetailFeature />;
      case 'notifications':
        return <NotificationsFeature />;
      case 'profile':
        return <AuthFeature />;
      default:
        return <DashboardFeature />;
    }
  };

  return (
    <div className="app-container">
      {currentUser && (
        <>
          {/* BARRA LATERAL (Escritorio) */}
          <aside className="sidebar">
            <div className="brand">
              <span>FinSync</span>
            </div>

            <nav style={{ flex: 1 }}>
              <ul className="nav-links">
                <li>
                  <button
                    onClick={() => setView('dashboard')}
                    className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
                    style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  >
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setView('personal')}
                    className={`nav-item ${activeView === 'personal' ? 'active' : ''}`}
                    style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  >
                    <Wallet size={18} />
                    <span>Personal</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setView('groups')}
                    className={`nav-item ${activeView === 'groups' || activeView === 'group-detail' || activeView === 'event-detail' ? 'active' : ''}`}
                    style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  >
                    <Users size={18} />
                    <span>Grupos</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setView('notifications')}
                    className={`nav-item ${activeView === 'notifications' ? 'active' : ''}`}
                    style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  >
                    <Bell size={18} />
                    <span>Notificaciones</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setView('profile')}
                    className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
                    style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  >
                    <User size={18} />
                    <span>Mi Perfil</span>
                  </button>
                </li>
              </ul>
            </nav>

            {/* Estado de conexión en Sidebar */}
            <div
              style={{
                marginTop: 'auto',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-glass)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`status-dot ${isOnline ? 'status-online' : 'status-offline'}`} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {isOnline ? 'En Línea' : 'Sin Conexión'}
                </span>
              </div>
              {pendingCount > 0 && (
                <Badge variant="amber" style={{ fontSize: '10px', padding: '2px 6px' }}>
                  {pendingCount} sync
                </Badge>
              )}
            </div>
          </aside>

          {/* BARRA DE NAVEGACIÓN INFERIOR (Móvil) */}
          <nav className="mobile-nav">
            <button
              onClick={() => setView('dashboard')}
              className={`mobile-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            >
              <LayoutDashboard size={20} />
              <span>Inicio</span>
            </button>
            <button
              onClick={() => setView('personal')}
              className={`mobile-nav-item ${activeView === 'personal' ? 'active' : ''}`}
            >
              <Wallet size={20} />
              <span>Personal</span>
            </button>
            <button
              onClick={() => setView('groups')}
              className={`mobile-nav-item ${activeView === 'groups' || activeView === 'group-detail' || activeView === 'event-detail' ? 'active' : ''}`}
            >
              <Users size={20} />
              <span>Grupos</span>
            </button>
            <button
              onClick={() => setView('notifications')}
              className={`mobile-nav-item ${activeView === 'notifications' ? 'active' : ''}`}
              style={{ position: 'relative' }}
            >
              <Bell size={20} />
              <span>Alertas</span>
              {pendingCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '12px',
                    width: '8px',
                    height: '8px',
                    backgroundColor: 'var(--warning)',
                    borderRadius: '50%'
                  }}
                />
              )}
            </button>
            <button
              onClick={() => setView('profile')}
              className={`mobile-nav-item ${activeView === 'profile' ? 'active' : ''}`}
            >
              <User size={20} />
              <span>Perfil</span>
            </button>
          </nav>
        </>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="main-content" style={!currentUser ? { paddingLeft: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
