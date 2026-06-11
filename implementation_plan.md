# Plan de Implementación: FinSync - Plataforma de Finanzas Personales y Gastos Compartidos

Desarrollar una Progressive Web App (PWA) moderna y de alto impacto visual ("FinSync") basada en los documentos del análisis de requisitos (`Docs/`). La aplicación será "Offline First", permitiendo a los usuarios registrar gastos personales, familiares y compartidos, crear grupos y eventos, y calcular liquidaciones automáticas de deudas. Toda la información se almacenará localmente en IndexedDB usando Dexie.js, y se sincronizará automáticamente con una base de datos remota (Supabase) cuando haya conexión.

Para que la aplicación sea ejecutable de inmediato sin configuraciones previas obligatorias de Supabase, implementaremos un modo híbrido:
1. **Modo Demo (Local-First Autónomo):** Utiliza un backend simulado en memoria/local storage para imitar la sincronización con Supabase. Esto permite probar la sincronización offline-online simulando micro-cortes directamente en la UI.
2. **Modo Producción (Supabase):** Utiliza la integración real con Supabase simplemente rellenando las variables de entorno en el archivo `.env`.

---

## User Review Required

> [!IMPORTANT]
> **Arquitectura Local-First y Sincronización:**
> Implementaremos una cola de sincronización local (`sync_queue`) en IndexedDB. Cada cambio (inserción, actualización, eliminación) se registra localmente e introduce una tarea de sincronización. Cuando se detecta conexión a internet (`navigator.onLine` y eventos `online`/`offline`), un worker de sincronización procesa las tareas pendientes.
> 
> **Diseño Premium y Estética:**
> Diseñaremos la interfaz utilizando Vanilla CSS con variables personalizadas (tokens CSS) en `src/index.css`. Se utilizará un esquema de color moderno (modo oscuro por defecto, HSL fluidos, gradientes elegantes y efecto frosted-glass/glassmorphism). La tipografía utilizará "Outfit" o "Inter" cargada desde Google Fonts.

---

## Open Questions

> [!NOTE]
> **Pregunta 1:** ¿Deseas que la aplicación incluya por defecto algunos usuarios de prueba creados localmente en el "Modo Demo" para que puedas probar los flujos de gastos compartidos y liquidación de deudas inmediatamente sin tener que registrar múltiples cuentas?
> 
> **Pregunta 2:** Para las notificaciones de la aplicación (por ejemplo, invitaciones a grupos o nuevos gastos registrados), ¿está bien si inicialmente las manejamos como notificaciones internas en la UI (con un panel/campana de notificaciones) y notificaciones de la API del navegador (Web Notifications API)?

---

## Proposed Changes

Proponemos crear una aplicación estructurada por características (Feature-Based Structure) y siguiendo principios de Clean Architecture.

### Componente 1: Configuración de Base del Proyecto e Infraestructura PWA

#### [NEW] [vite.config.ts](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/vite.config.ts)
Configuración de Vite con TypeScript y soporte PWA mediante `vite-plugin-pwa`. Configurará el Service Worker para almacenamiento en caché offline de assets.

#### [NEW] [package.json](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/package.json)
Dependencias del proyecto: React, TypeScript, Dexie (IndexedDB), Zustand (estado global), Lucide-react (iconos), y herramientas de desarrollo.

#### [NEW] [index.html](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/index.html)
Archivo HTML principal, cargará la tipografía "Outfit" y definirá los meta tags para SEO y PWA.

---

### Componente 2: Sistema de Diseño y Estilos Globales

#### [NEW] [index.css](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/index.css)
Contendrá el sistema de diseño completo:
- Paleta de colores HSL en variables CSS (Dark mode premium por defecto con tonos grafito, púrpura neón y verde esmeralda para finanzas).
- Clases de utilidad para Glassmorphism (efectos de desenfoque y bordes translúcidos).
- Animaciones suaves para transiciones de páginas y micro-interacciones.

---

### Componente 3: Núcleo de Base de Datos Local (Offline-First)

#### [NEW] [db.ts](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/core/db.ts)
Configuración de Dexie.js definiendo las tablas locales del modelo de datos:
- `users`: `id` (primary key, uuid), `email`, `name`, `avatar`, `created_at`
- `groups`: `id`, `name`, `description`, `created_by`
- `group_members`: `id`, `group_id`, `user_id`, `role`
- `events`: `id`, `group_id`, `name`, `status`, `created_at`
- `expenses`: `id`, `event_id`, `user_id`, `amount`, `description`, `category`, `created_at`
- `expense_shares`: `id`, `expense_id`, `user_id`, `share_amount`
- `settlements`: `id`, `event_id`, `from_user`, `to_user`, `amount`, `status`
- `sync_queue`: `id`, `entity_type`, `entity_id`, `action`, `payload`, `status`, `created_at`
- `notifications`: `id`, `user_id`, `message`, `read`, `created_at`

#### [NEW] [syncEngine.ts](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/core/sync/syncEngine.ts)
Gestor de sincronización que monitorea el estado de red (`navigator.onLine`).
- Registra cambios locales en `sync_queue`.
- Sube los datos pendientes de forma secuencial (FIFO) cuando hay red.
- Obtiene cambios remotos en segundo plano (pull delta) y actualiza Dexie.
- Proporciona un estado de sincronización visual en la UI (Conectado / Sin Conexión / Sincronizando / Errores).

---

### Componente 4: Control de Estado y Lógica de Negocio (Zustand)

#### [NEW] [authStore.ts](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/store/authStore.ts)
Maneja la sesión del usuario actual (autenticado vs invitado) tanto en modo Demo (local) como en modo Supabase real.

#### [NEW] [syncStore.ts](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/store/syncStore.ts)
Monitorea la conectividad de red global, los elementos pendientes en la cola de sincronización y el historial de sincronización.

---

### Componente 5: Módulos de Características (Features)

#### [NEW] [AuthFeature](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/features/auth)
Componentes de Login, Registro y gestión de perfil. Incluirá avatares personalizables y selección de moneda preferida.

#### [NEW] [DashboardFeature](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/features/dashboard)
Dashboard principal con KPIs de gastos mensuales, balances en grupos compartidos, gráficos interactivos SVG de gastos por categoría, y un panel de control rápido para simular caídas de internet (Toggle Online/Offline) para auditorías visuales del funcionamiento local.

#### [NEW] [GroupsFeature](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/features/groups)
Creación y visualización de grupos (Familia, Amigos, Viajes, Oficina). Gestión de miembros y enlaces de invitación rápidos.

#### [NEW] [EventsFeature](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/features/events)
Creación y listado de eventos específicos dentro de un grupo (ej. "Parrillada Sábado", "Viaje a la Playa"). Permite agrupar gastos temporales.

#### [NEW] [ExpensesFeature](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/features/expenses)
Formulario de registro de gastos con:
- Selección de pagador y evento.
- Tipo de división: **Igualitaria**, **Por porcentaje**, **Por participación**, o **Personalizada**.
- Autocompletado inteligente y categorización visual (iconos y colores específicos por categoría).

#### [NEW] [SettlementsFeature](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/features/settlements)
Algoritmo de liquidación óptima de deudas. 
Dada una lista de gastos compartidos en un evento, calcula los saldos netos de todos y genera el número mínimo de transferencias necesarias (ej. "Pedro debe pagar $15 a Bruno").
Incluye interfaz interactiva para marcar deudas como liquidadas (lo que genera un registro de liquidación).

#### [NEW] [NotificationsFeature](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/features/notifications)
Visualizador de alertas de nuevos gastos, invitaciones a grupos o advertencias de límites de presupuesto.

---

### Componente 6: UI Shell y Navegación Responsive

#### [NEW] [App.tsx](file:///c:/Users/ASUS/Documents/Desarrollo/Financia%20Personal/src/App.tsx)
Punto de entrada de la UI. Organiza la barra de navegación lateral (desktop) y barra inferior flotante (mobile), el indicador de conexión global y el renderizado condicional de vistas según la navegación interna.

---

## Verification Plan

### Automated Tests
- Validaremos la consistencia de los datos y el build de producción mediante:
  `npm run build`
- Adicionalmente, crearemos un archivo de pruebas rápidas en la carpeta de pruebas local o ejecutaremos scripts de verificación de TypeScript (`npx tsc --noEmit`).

### Manual Verification
1. **Verificación de UI & Responsividad**:
   - Abrir en escritorio y móvil. Comprobar la visualización del panel flotante, el glassmorphic menu y gráficos interactivos.
2. **Prueba Offline-First en Vivo**:
   - Registrar un gasto en modo Offline (activable mediante el toggle de red en la UI).
   - Verificar en la base de datos local (IndexedDB del navegador a través de DevTools) que el registro se creó y se añadió a la cola de sincronización (`sync_queue`).
   - Reactivar la conexión y comprobar que el estado cambia a "Sincronizado" y se procesa la cola.
3. **Prueba de Caso de Uso de Deudas ("Parrillada Amigos")**:
   - Recrear el caso de uso exacto del documento de requerimientos:
     - Bruno aporta $50
     - Pedro aporta $10
     - José aporta $20
     - Andrés aporta $5
     - Cristian aporta $0
   - Verificar que la liquidación calcula el saldo correcto e indica exactamente quién debe pagar a quién para optimizar transacciones.
