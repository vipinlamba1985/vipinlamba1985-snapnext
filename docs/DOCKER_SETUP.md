# SnapNext Docker setup

This Docker setup packages the existing Next.js application as a portable production container. It does not replace or modify the current Vercel deployment. Vercel remains the live hosting path unless a separate container platform is deliberately configured.

## Files

- `Dockerfile`: multi-stage Node 22 production image using Next.js standalone output.
- `.dockerignore`: excludes local builds, native projects, uploads, archives, and secrets.
- `docker-compose.yml`: local or single-server container runner with a persistent uploads volume.
- `.env.docker.example`: runtime environment template with no real credentials.
- `/api/health`: process-level container health endpoint that does not expose secrets or require database access.

## Local start

1. Install Docker Desktop or Docker Engine with Compose.
2. Create the runtime environment file:

```bash
cp .env.docker.example .env.docker
```

3. Add the required development credentials to `.env.docker`. At minimum, authenticated application flows require MongoDB and Supabase values. Google Drive Smart Sync additionally requires its OAuth client and connector secrets.
4. Build and start:

```bash
docker compose up --build -d
```

5. Open:

```text
http://localhost:3000
```

6. Check container health:

```bash
curl --fail http://localhost:3000/api/health
```

7. View logs or stop:

```bash
docker compose logs -f web
docker compose down
```

Use `docker compose down -v` only when intentionally deleting the local uploads volume.

## Build without Compose

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t snapnext-ai:local .

docker run --rm \
  --env-file .env.docker \
  -p 3000:3000 \
  -v snapnext_uploads:/app/uploads \
  snapnext-ai:local
```

## Public versus private environment variables

`NEXT_PUBLIC_*` values are compiled into the browser bundle during `docker build`. They may be supplied as build arguments, but they must never contain private credentials.

All secrets are supplied only when the container starts, through `--env-file`, the hosting platform's secret manager, or another runtime secret-injection mechanism. Never put these in the Dockerfile, image labels, build arguments, or committed files:

- database connection strings
- Supabase service-role key
- AWS access keys
- Stripe secret and webhook keys
- Google OAuth client secret
- `CLOUD_CONNECTOR_SECRET`
- `CRON_SECRET`
- AI-provider secret keys

## Storage

The default Docker development setting uses local storage at `/app/uploads`. The Compose configuration preserves it in the `snapnext_uploads` named volume.

For production and multiple container replicas, set `STORAGE_PROVIDER=s3` and provide the existing AWS S3 environment variables. Do not rely on a container-local volume for horizontally scaled or ephemeral hosting.

## Container hosting

The image can be used with AWS ECS/App Runner, Google Cloud Run, Azure Container Apps, Railway, DigitalOcean, Kubernetes, or a private server. Configure the platform to:

- expose container port `3000`
- use `/api/health` for health checks
- inject secrets at runtime
- terminate HTTPS at the platform load balancer
- set `NEXT_PUBLIC_APP_URL` and `PUBLIC_APP_URL` to the public HTTPS origin
- use S3 rather than local storage for production
- run only one cron trigger for scheduled Smart Sync work

## Google OAuth when using another domain

The current production callback is:

```text
https://snapnext.ai/api/cloud/google-drive/callback
```

A second container-hosted public domain requires adding that exact HTTPS callback to the same Google OAuth web client and setting the container's public application URL accordingly. Localhost callbacks should be added only to a development OAuth client, not the production client.

## Vercel compatibility

The Docker files are supplemental. Vercel continues to use its normal Next.js Git integration and ignores this container runtime. No Vercel environment variables are copied automatically into Docker; use the target container platform's secret manager.
