# FinSync Backend

API FastAPI para autenticación y sincronización de la PWA FinSync.

## Requisitos

- Python 3.11+

## Instalación

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `JWT_SECRET` | Secreto para firmar tokens JWT (obligatorio en producción) |
| `JWT_EXPIRE_DAYS` | Días de validez del token (default: `7`) |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos (ej. `https://finsync-tau.vercel.app`) |

## Ejecución

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Estado del servicio |
| POST | `/api/auth/register` | No | Registro con email y contraseña |
| POST | `/api/auth/login` | No | Inicio de sesión |
| GET | `/api/auth/me` | Bearer | Perfil del usuario autenticado |
| POST | `/api/groups/join` | Bearer | Unirse a un grupo con código de invitación |
| POST | `/api/sync/push` | Bearer | Recibe un cambio de la cola offline |
| GET | `/api/sync/pull` | Bearer | Devuelve datos visibles para el usuario |

Los datos se persisten en:

- `backend/data/store.json` — entidades de la app
- `backend/data/auth.json` — cuentas con hash de contraseña

## Integración con el frontend

En la raíz del proyecto frontend, crea `.env`:

```env
VITE_API_URL=http://localhost:8000
```

El frontend envía `Authorization: Bearer <token>` en sync cuando el usuario inicia sesión con cuenta real.

Si no hay token (modo demo), el cliente usa fallback local (`localStorage`).
