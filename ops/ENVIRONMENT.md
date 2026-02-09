# Variables de Entorno - El Ruso

## Todas las variables

| Variable | Servicio | Requerido | Descripcion |
|----------|----------|-----------|-------------|
| `PORT` | API | No (default 3001) | Puerto del servidor |
| `HOST` | API | No (default 0.0.0.0) | Host del servidor |
| `SUPABASE_URL` | API, Worker | Si | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | API, Web | Si | Clave anonima de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | API, Worker | Si | Clave de servicio de Supabase |
| `API_URL` | API | Si | URL publica de la API (para callbacks) |
| `WEB_URL` | API | Si | URL del panel web (para CORS) |
| `RENDER_API_TOKEN` | CI/CD | Si | Token de API de Render |
| `VERCEL_TOKEN` | CI/CD | Si | Token de Vercel |
| `DATABASE_URL` | Migraciones | Si | Connection string PostgreSQL directa para psql |
| `POLL_INTERVAL_MS` | Worker | No (default 5000) | Intervalo de polling del worker |

## Donde configurar

- **Local**: `.env` en cada app (nunca commitear)
- **Render**: Environment Groups o variables por servicio
- **Vercel**: Project Settings > Environment Variables
- **GitHub Actions**: Repository Secrets
