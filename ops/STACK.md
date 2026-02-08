# Stack Fijo - Elruso

| Componente        | Tecnología                          |
|-------------------|-------------------------------------|
| Backend API       | Node.js 20+ / TypeScript / Fastify  |
| Worker            | Node.js 20+ / TypeScript            |
| Frontend          | Vite + React + TypeScript + Tailwind|
| Database          | Supabase (PostgreSQL)               |
| Monorepo          | pnpm workspaces                     |
| Deploy API        | Render                              |
| Deploy Worker     | Render                              |
| Deploy Frontend   | Vercel                              |
| CI/CD             | GitHub Actions                      |

## Reglas

- Secrets NUNCA van al repo. Solo `.env.example`.
- Staging automático, prod manual.
- Todo por CLI: `render`, `vercel`, `supabase`.
- Source of truth de stock: nuestro sistema (no Tiendanube).
- No tocar precios, solo stock.
