# Panel Fix Report

## Raiz del problema

**Vercel apunta al repo equivocado.**

- Render: `https://github.com/elrusosistem/Elruso` (correcto)
- Vercel: `github.com/abisaieg/Elruso` (no existe — 404)
- Git remote local: `github.com/elrusosistem/Elruso`

Los pushes a `elrusosistem/Elruso` nunca triggerean auto-deploy en Vercel porque Vercel escucha un repo fantasma (`abisaieg/Elruso`).

## Solucion permanente (requiere accion del humano)

1. Ir a https://github.com/apps/vercel
2. Instalar la Vercel GitHub App para la org `elrusosistem`
3. En Vercel Dashboard > Project `elruso` > Settings > Git
4. Reconectar al repo `elrusosistem/Elruso`, branch `main`
5. A partir de ahi, cada push a main auto-deploya

## Solucion temporal (aplicada)

- Deploy manual via Vercel CLI (`vercel --prod`)
- Anti-cache headers en `vercel.json` para `/` y `/index.html`
- Build version visible en footer del panel (commit SHA + build time)

## Cambios realizados

| Archivo | Cambio |
|---------|--------|
| `vercel.json` | Agregados headers anti-cache para index.html |
| `apps/web/vite.config.ts` | Inject `__BUILD_COMMIT__` y `__BUILD_TIME__` al build |
| `apps/web/src/vite-env.d.ts` | Declaracion de globals para TypeScript |
| `apps/web/src/App.tsx` | Footer con version visible (commit + build time) |

## Como verificar visualmente (sin curl)

1. Abrir https://elruso.vercel.app
2. En el **footer** debe verse: `Build: <commit_sha> | <fecha>`
3. En la **navbar** debe verse:
   - Boton "Sistema ACTIVO/PAUSADO" (verde/rojo)
   - Badge "API: healthy" (verde)
4. Pestanas visibles: Runs, Tasks, Runners, Directivas, Requests, Setup
5. Pestaña **Directivas**: lista con botones Aprobar/Rechazar/Aplicar
6. Pestaña **Runners**: lista auto-refresh cada 15s
