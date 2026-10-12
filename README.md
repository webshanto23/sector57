# Sector 15

## Docker

Run the full local stack with PostgreSQL, the Nest API, and the Next.js app:

```sh
docker compose up --build
```

The web app is available at <http://localhost:3000>, and the API is available at <http://localhost:4000>. The API container runs Prisma migrations before starting.

Useful one-off commands:

```sh
docker compose run --rm api pnpm --filter @s57/db seed
docker compose run --rm api pnpm --filter @s57/db migrate:deploy
docker compose down
```

The GitHub Actions workflow in `.github/workflows/ci.yml` installs dependencies, generates Prisma, applies migrations against a CI PostgreSQL service, runs `pnpm check`, and validates both Docker image targets.
