# Variables de Entorno - Elruso

## Todas las variables

| Variable | Servicio | Requerido | Descripción |
|----------|----------|-----------|-------------|
| `PORT` | API | No (default 3001) | Puerto del servidor |
| `HOST` | API | No (default 0.0.0.0) | Host del servidor |
| `SUPABASE_URL` | API, Worker | Sí | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | API, Web | Sí | Clave anónima de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | API, Worker | Sí | Clave de servicio de Supabase |
| `TIENDANUBE_CLIENT_ID` | API | Sí (Fase 2) | OAuth client ID de Tiendanube |
| `TIENDANUBE_CLIENT_SECRET` | API | Sí (Fase 2) | OAuth client secret |
| `TIENDANUBE_WEBHOOK_SECRET` | API | Sí (Fase 2) | Secret para validar webhooks |
| `API_URL` | API | Sí | URL pública de la API (para callbacks) |
| `WEB_URL` | API | Sí | URL del panel web (para CORS) |
| `RENDER_API_TOKEN` | CI/CD | Sí | Token de API de Render |
| `VERCEL_TOKEN` | CI/CD | Sí | Token de Vercel |
| `POLL_INTERVAL_MS` | Worker | No (default 5000) | Intervalo de polling del worker |

## Dónde configurar

- **Local**: `.env` en cada app (nunca commitear)
- **Render**: Environment Groups o variables por servicio
- **Vercel**: Project Settings > Environment Variables
- **GitHub Actions**: Repository Secrets
