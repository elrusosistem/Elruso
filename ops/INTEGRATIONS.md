# Integraciones - Elruso

## Tiendanube

### OAuth
- **Flow**: Authorization Code
- **Scopes necesarios**: `read_products`, `write_products`, `read_orders`, `write_orders`
- **Callback URL**: `{API_URL}/auth/tiendanube/callback`
- **Token storage**: Tabla `tiendanube_stores` (encriptado en reposo)

### API Endpoints Usados
| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/products/{id}/variants/{id}` | PUT | Actualizar stock de variante |
| `/products/{id}` | GET | Leer producto (sync inicial) |
| `/products` | GET | Listar productos (sync inicial) |
| `/orders/{id}` | GET | Leer orden (referencia) |
| `/webhooks` | POST | Registrar webhooks |

### Webhooks Recibidos
| Evento | Acción |
|--------|--------|
| `order/created` | Reservar stock |
| `order/paid` | Confirmar reserva |
| `order/cancelled` | Liberar stock |
| `order/fulfilled` | Descontar stock definitivo |
| `product/created` | Sync producto nuevo |
| `product/updated` | Sync cambios de variantes |

### Payload Ejemplo (order/created)
```json
{
  "store_id": 123456,
  "event": "order/created",
  "id": 789,
  "body": {
    "id": 789,
    "products": [
      {
        "product_id": 111,
        "variant_id": 222,
        "quantity": 2
      }
    ]
  }
}
```

### Rate Limits
- Tiendanube API: ~120 requests/min por tienda
- Implementar backoff exponencial en el worker

### Notas
- Solo tocamos stock, NUNCA precios
- Stock se pushea unidireccionalmente: Elruso → Tiendanube
- Tiendanube no es source of truth; solo receptor
