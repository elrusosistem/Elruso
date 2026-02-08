# Arquitectura - Elruso

## Visión General

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  Tiendanube  │────▶│  Elruso API  │────▶│   Supabase DB  │
│  (webhooks)  │     │  (Fastify)   │◀────│  (PostgreSQL)  │
└─────────────┘     └──────┬───────┘     └───────▲────────┘
                           │                      │
                    ┌──────▼───────┐              │
                    │  Elruso Web  │              │
                    │  (React SPA) │              │
                    └──────────────┘              │
                                                  │
                    ┌──────────────┐              │
                    │   Worker     │──────────────┘
                    │  (cron/jobs) │
                    └──────────────┘
```

## Flujo de Stock

### Source of Truth
Nuestro sistema es la fuente de verdad de stock. Nunca leemos stock actual de Tiendanube; solo enviamos actualizaciones.

### Tipos de Movimiento
- **reserve**: Reserva stock (ej: orden creada)
- **release**: Libera reserva (ej: orden cancelada)
- **adjust**: Ajuste manual de stock
- **reconcile**: Reconciliación automática (worker)
- **sync_in**: Carga inicial desde Tiendanube
- **sync_out**: Push de stock a Tiendanube

### Fórmula de Stock
```
available = quantity - reserved
```

### Idempotencia
Todos los webhooks son idempotentes: se registra `event_id` + hash del payload. Si ya existe, se ignora con status `duplicate`.

## Tablas Principales

- `stock_entries`: Stock actual por SKU/variante/warehouse
- `stock_movements`: Log inmutable de todos los movimientos
- `tiendanube_stores`: Tiendas conectadas (OAuth tokens)
- `webhook_events`: Log de webhooks recibidos
- `tasks`: Cola de tareas del worker

## Flujo de Webhooks (Tiendanube)

1. Tiendanube envía POST a `/webhooks/tiendanube`
2. API valida firma + idempotencia (event_id + payload_hash)
3. Si es duplicado → 200 OK, status `duplicate`
4. Si es nuevo → persiste evento, crea task para procesar
5. Worker toma task y ejecuta lógica de stock
6. Worker pushea stock actualizado a Tiendanube via API

## Deploy

| Servicio | Plataforma | Staging            | Prod              |
|----------|------------|--------------------|--------------------|
| API      | Render     | Auto (push/merge)  | Manual (CLI)       |
| Worker   | Render     | Auto (push/merge)  | Manual (CLI)       |
| Web      | Vercel     | Auto (push/merge)  | Manual (CLI)       |
