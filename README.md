# FinSync - Finanzas Personales y Gastos Compartidos

PWA **offline-first** para control de gastos personales y liquidación de deudas en grupo.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Dexie (IndexedDB), Zustand, PWA
- **Backend:** FastAPI (sincronización opcional)

## Inicio rápido

### Frontend

```bash
npm install
cp .env.example .env
npm run dev
```

Abre `http://localhost:5173`.

### Backend (opcional)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Build de producción

```bash
npm run build
npm run preview
```

## Datos demo

Al primer arranque se cargan:

- 5 usuarios de prueba (Bruno, Pedro, José, Andrés, Cristian)
- Grupo **Viaje a la Playa** con evento **Fin de semana en Cartagena**
- 3 gastos precargados con divisiones iguales

## Sincronización

1. Los cambios se guardan en IndexedDB y se encolan localmente.
2. Si hay conexión, se intenta enviar a `VITE_API_URL/api/sync/push`.
3. Si la API no responde, se usa fallback en `localStorage` (`FinSync_MockRemoteDB`).

## Estructura

```
src/
  core/          # DB Dexie, sync engine, seed demo
  features/      # Módulos de UI (auth, grupos, gastos, etc.)
  store/         # Zustand stores
backend/         # API FastAPI
public/          # Assets PWA
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación TypeScript + Vite |
| `npm run lint` | ESLint |
| `npm run icons` | Genera iconos PNG PWA |

## Despliegue a producción

### Arquitectura recomendada

| Componente | Plataforma | URL ejemplo |
|------------|------------|-------------|
| Frontend PWA | [Vercel](https://vercel.com) | `https://finsync.vercel.app` |
| API FastAPI | [Render](https://render.com) | `https://finsync-api.onrender.com` |

### 1. Backend (Render)

1. Conecta el repo `BrunoCastillo/finsync` en Render → **New Blueprint**
2. Render detectará `render.yaml` y creará `finsync-api`
3. Variable de entorno:
   - `ALLOWED_ORIGINS=https://tu-frontend.vercel.app`
4. Anota la URL pública del servicio (ej. `https://finsync-api.onrender.com`)

### 2. Frontend (Vercel)

1. Importa el repo en Vercel → framework **Vite**
2. Variable de entorno de build:
   - `VITE_API_URL=https://finsync-api.onrender.com`
3. Deploy automático en cada push a `master`

### Deploy manual rápido

```bash
# Frontend
npm run build
npx vercel --prod

# Backend (requiere Docker + cuenta Render, o local):
cd backend
docker build -t finsync-api .
```

### Verificación post-deploy

- Frontend: abre `/` y comprueba que carga la PWA
- API: `GET https://<api-url>/health` → `{ "status": "ok" }`
- Sync: Dashboard → **Descargar cambios** (debe usar la API, no solo localStorage)
