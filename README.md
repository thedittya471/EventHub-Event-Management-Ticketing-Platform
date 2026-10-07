# Event Management

React/Vite frontend and Express/Prisma backend in a pnpm + Turborepo workspace.
The existing `client/` and `server/` directories are workspace packages.

## Setup

Use Node.js 20.19+ (20.x), or 22.12+; pnpm 11.5.3; and Docker with Compose.
Docker Desktop/the Docker daemon must be running before starting development.

Install the pinned pnpm version using your preferred package-manager setup,
then run from the repository root:

```sh
pnpm install --frozen-lockfile
cp server/.env.sample server/.env
pnpm dev
```

Copy the environment sample only on first setup; preserve an existing `.env`.
If using the provided Docker database from your host, its port is **5433**.
The API reads `server/.env`; frontend Vite configuration belongs in `client/.env`.

`pnpm dev` starts PostgreSQL and waits for its health check, generates Prisma
Client, applies committed migrations, and runs frontend/backend through Turbo.
It never creates migrations or resets the database. If a setup step fails,
the apps are not launched.

- Frontend: <http://localhost:5173> (Vite reports another port if occupied).
- Backend: <http://localhost:8000> by default; routes are still being implemented.
- PostgreSQL: `localhost:5433`, database `event_management`.

Ctrl+C stops the frontend and backend. PostgreSQL remains running;
`pnpm db:down` removes the Compose containers/network but preserves its named volume.
Do not use `down -v` unless you intentionally want to delete local database data.

## Root commands

| Command                              | Purpose                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `pnpm dev`                           | Start database, prepare Prisma/migrations, run both apps          |
| `pnpm dev:client`                    | Frontend only                                                     |
| `pnpm dev:server`                    | Start database, prepare Prisma/migrations, run backend only       |
| `pnpm build`                         | Build frontend and validate/generate backend Prisma Client        |
| `pnpm lint`                          | Run configured workspace lint tasks (currently frontend only)     |
| `pnpm test`                          | Run configured tests; backend currently has a failing placeholder |
| `pnpm format`                        | Format repository files                                           |
| `pnpm format:check`                  | Check repository formatting                                       |
| `pnpm db:up`                         | Start PostgreSQL and wait for readiness                           |
| `pnpm db:down`                       | Stop/remove Compose containers, retain database volume            |
| `pnpm db:logs`                       | Follow PostgreSQL logs                                            |
| `pnpm db:generate`                   | Generate Prisma Client                                            |
| `pnpm db:validate`                   | Validate Prisma schema                                            |
| `pnpm db:migrate --name change_name` | Create/apply a local development migration                        |
| `pnpm db:deploy`                     | Apply committed migrations without creating new ones              |
| `pnpm db:studio`                     | Open Prisma Studio                                                |

## Team workflow

Install dependencies from the root and commit **one root `pnpm-lock.yaml`**.
Do not generate npm/yarn lockfiles or install separately inside each package.

```sh
pnpm --filter server add dependency-name
pnpm --filter client add dependency-name
pnpm add -Dw development-tool-name
```

Only reviewed dependency build scripts are permitted in `pnpm-workspace.yaml`.
New dependencies with install scripts require reviewing their build policy.

Coordinate Prisma schema/migration changes with the database owner. Everyone uses
their own local database; deployment migrations are applied separately from
development startup. Turbo caches frontend builds/lint, but dev, backend
generation, and tests are not cached. No shared-package scaffolding is required yet.
