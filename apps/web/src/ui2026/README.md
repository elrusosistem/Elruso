# Design System 2026 — El Ruso

## Como se usa?

Toda pagina nueva importa de `../ui2026` y sigue esta estructura:

```tsx
import { PageContainer, HeroPanel, GlassCard, GlowButton, StatusPill } from "../ui2026";

export function MiPagina() {
  return (
    <PageContainer maxWidth="lg">
      <HeroPanel title="Titulo" subtitle="Descripcion opcional">
        <GlowButton variant="primary">Accion</GlowButton>
      </HeroPanel>

      <SectionBlock title="Seccion">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassCard hover>
            <h3 className="text-sm font-semibold text-white">Item</h3>
            <p className="text-sm text-slate-400">Detalle</p>
            <StatusPill status="ready" />
          </GlassCard>
        </div>
      </SectionBlock>
    </PageContainer>
  );
}
```

### Paso a paso

1. **Envolver en `PageContainer`** — acepta `maxWidth`: `sm`, `md`, `lg`, `xl`, `full`
2. **Header con `HeroPanel`** — `title` + `subtitle` opcionales, slot de `children` para botones
3. **Secciones con `SectionBlock`** — agrupa contenido con titulo y subtitulo
4. **Cards con `GlassCard`** — props: `hover`, `glow` (`primary`/`success`/`error`/`warning`), `onClick`
5. **Botones con `GlowButton`** — variantes: `primary`, `secondary`, `danger`, `ghost`. Tamanos: `sm`, `md`, `lg`
6. **Estados con `StatusPill`** — pasar `status` y el color se resuelve solo
7. **Metricas con `MetricCard`** — `label`, `value`, `sub`, `color`, `icon`
8. **Animaciones con `AnimatedFadeIn`** — `delay` en ms para stagger

### Fondos y estilos

- Usar `glass` para cards con blur (no `bg-gray-800`)
- Usar `bg-surface` para fondos de card solidos
- Usar `bg-elevated` para hover o inputs
- Bordes: `border-[rgba(148,163,184,0.08)]` (no `border-gray-700`)
- Texto: jerarquia con `text-slate-200/300/400/500`
- Transiciones: siempre `transition-all duration-200`
- Spacing: `p-5` cards, `mb-8` secciones, `gap-4` grids

---

## Referencia rapida

### Colores

| Token | Hex | Uso |
|-------|-----|-----|
| `bg-deep` | `#0B0F1A` | Fondo base |
| `bg-surface` | `#111827` | Cards, sidebar |
| `bg-elevated` | `#1A2236` | Hover, inputs |
| `text-accent-primary` | `#6366F1` | Acciones principales |
| `text-accent-secondary` | `#8B5CF6` | Enfasis secundario |
| `text-accent-cyan` | `#06B6D4` | Highlights |

### Clases CSS

| Clase | Efecto |
|-------|--------|
| `.glass` | Glassmorphism (blur 16px + bg translucido + border sutil) |
| `.glass-hover` | Glass con hover mas opaco |
| `.glow-primary` | Box-shadow indigo |
| `.glow-success` | Box-shadow verde |
| `.glow-error` | Box-shadow rojo |
| `.glow-warning` | Box-shadow amarillo |

### Animaciones

| Clase | Efecto |
|-------|--------|
| `animate-fade-in-up` | Fade + slide up (0.2s) |
| `animate-fade-in` | Solo fade (0.2s) |
| `animate-slide-in-left` | Slide left (0.2s) |
| `animate-pulse-glow` | Pulso indigo (3s loop) |

### Componentes

| Componente | Uso |
|-----------|-----|
| `PageContainer` | Wrapper de pagina (padding + max-width + animacion) |
| `HeroPanel` | Header con gradiente + acciones |
| `GlassCard` | Card con glassmorphism + glow opcional |
| `GlowButton` | Boton con variantes y glow hover |
| `StatusPill` | Indicador de estado (color automatico) |
| `MetricCard` | Card de metrica numerica |
| `SectionBlock` | Wrapper de seccion con titulo |
| `AnimatedFadeIn` | Animacion con delay configurable |
| `ActivityFeed2026` | Timeline vertical de actividad |
| `ConsoleBlock2026` | Bloque de codigo/consola con copiar |
| `Tooltip2026` | Tooltip con glassmorphism |
| `Modal2026` | Modal con backdrop blur |
| `Layout2026` | Layout principal (sidebar + topbar + orbs) |
| `Sidebar2026` | Sidebar flotante con iconos |
| `Topbar2026` | Barra superior con badges |
