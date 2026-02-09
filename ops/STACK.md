# Stack Fijo - El Ruso

> Sistema orquestador GPT <-> Claude Code

| Componente        | Tecnologia                           |
|-------------------|--------------------------------------|
| Backend API       | Node.js 22 / TypeScript / Fastify    |
| Worker            | Node.js 22 / TypeScript              |
| Frontend          | Vite + React + TypeScript + Tailwind |
| Database          | Supabase (PostgreSQL)                |
| Monorepo          | pnpm workspaces                      |
| Deploy API        | Render                               |
| Deploy Worker     | Render                               |
| Deploy Frontend   | Vercel                               |
| CI/CD             | GitHub Actions                       |

## Reglas

- Secrets NUNCA van al repo. Solo `.env.example`.
- Staging automatico, prod manual.
- Todo por CLI: scripts reproducibles.
- GPT define, Claude ejecuta, Humano aprueba.
