# FinSync Backend

API FastAPI para sincronización de datos de la PWA FinSync.

## Requisitos

- Python 3.11+

## Instalación

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Ejecución

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servicio |
| POST | `/api/sync/push` | Recibe un cambio de la cola offline |
| GET | `/api/sync/pull` | Devuelve el almacén completo |

Los datos se persisten en `backend/data/store.json`.

## Integración con el frontend

En la raíz del proyecto frontend, crea `.env`:

```env
VITE_API_URL=http://localhost:8000
```

Si la API no está disponible, el cliente usa fallback local (`localStorage`).
