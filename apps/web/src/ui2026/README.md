# Design System 2026 — El Ruso

## Colores Base

| Token | Hex | Uso |
|-------|-----|-----|
| `bg-deep` | `#0B0F1A` | Fondo base, body |
| `bg-surface` | `#111827` | Cards, sidebar |
| `bg-elevated` | `#1A2236` | Cards hover, inputs |
| `text-accent-primary` | `#6366F1` | Acciones principales |
| `text-accent-secondary` | `#8B5CF6` | Enfasis secundario |
| `text-accent-cyan` | `#06B6D4` | Highlights |

## Clases CSS Custom

| Clase | Efecto |
|-------|--------|
| `.glass` | Glassmorphism (blur 16px + bg translucido + border sutil) |
| `.glass-hover` | Glass con hover mas opaco |
| `.glow-primary` | Box-shadow indigo sutil |
| `.glow-success` | Box-shadow verde sutil |
| `.glow-error` | Box-shadow rojo sutil |
| `.glow-warning` | Box-shadow amarillo sutil |
| `.glow-btn` | Box-shadow fuerte en hover para CTAs |

## Animaciones

| Clase | Efecto |
|-------|--------|
| `animate-fade-in-up` | Fade + slide up (0.2s) |
| `animate-fade-in` | Solo fade (0.2s) |
| `animate-slide-in-left` | Fade + slide left (0.2s) |
| `animate-pulse-glow` | Pulso de glow indigo (3s loop) |

## Border Radius

| Clase | Valor |
|-------|-------|
| `rounded-card` | 10px |
| `rounded-panel` | 14px |
| `rounded-hero` | 20px |

## Componentes

| Componente | Uso |
|-----------|-----|
| `PageContainer` | Wrapper de pagina (padding + max-width + animacion) |
| `HeroPanel` | Header de pagina con gradiente + slot de acciones |
| `GlassCard` | Card con glassmorphism + glow opcional |
| `GlowButton` | Boton con variantes (primary/secondary/danger/ghost) |
| `StatusPill` | Indicador de estado con color automatico |
| `MetricCard` | Card de metrica numerica |
| `SectionBlock` | Wrapper de seccion con titulo |
| `AnimatedFadeIn` | Wrapper de animacion con delay |
| `ActivityFeed2026` | Timeline vertical de actividad |
| `ConsoleBlock2026` | Bloque de codigo/consola con copiar |
| `Tooltip2026` | Tooltip con glassmorphism |
| `Modal2026` | Modal con backdrop blur |
| `Layout2026` | Layout principal (sidebar + topbar + orbs) |
| `Sidebar2026` | Sidebar flotante con iconos |
| `Topbar2026` | Barra superior con badges de status |

## Reglas

1. Toda pagina nueva DEBE usar `PageContainer` como wrapper
2. Toda pagina nueva DEBE importar componentes de `../ui2026`
3. NO usar `bg-gray-800/900/950` — usar `glass`, `bg-surface`, `bg-elevated`
4. NO usar `border-gray-700` — usar `border-[rgba(148,163,184,0.08)]`
5. NO usar CSS inline fuera del sistema
6. Respetar spacing: p-5 (cards), mb-8 (secciones), gap-4 (grids)
7. Transiciones: `transition-all duration-200`
8. Texto: `text-slate-*` para jerarquia (200/300/400/500/600)
