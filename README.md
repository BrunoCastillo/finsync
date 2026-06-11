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
