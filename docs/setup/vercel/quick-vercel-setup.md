# Quick Vercel Setup (frontend + 8 FastAPI services)

Run the whole app on Vercel and serve it at `https://sports.learning-dev.com`:

- **9 Vercel projects** from this one repo: the frontend plus one per backend service.
- Each FastAPI service runs as a Vercel Python function. Vercel finds `main.py` (which defines `app = FastAPI(...)`) automatically.
- The frontend's `vercel.json` rewrites `/identities/*`, `/departments/*` and so on to the matching service, replacing the nginx gateway. The browser only ever talks to one site, so CORS and `VITE_API_URL` need no changes.
- **Upstash Redis** replaces the Redis container, and **MongoDB Atlas** stays as the database.
- Vercel issues the HTTPS certificate for the custom domain for free.

## Files used from the repo

- `frontend/vercel.json` - Vite build settings, the API rewrites to each service, and the SPA fallback to `index.html`.
- `frontend/.vercelignore`, `*-service/.vercelignore` - keep `.env` files, Dockerfiles and caches out of uploads.
- `*-service/.python-version` - pins Python 3.12, the same as the Dockerfiles.
- `*-service/vercel.json` - runs each service's functions in **Mumbai (`bom1`)**, next to MongoDB Atlas and Upstash. Without it Vercel uses Washington DC (`iad1`), and every database and cache call crosses the world. If your Atlas cluster is in another region, change `bom1` in all 8 files to the closest [Vercel region](https://vercel.com/docs/edge-network/regions).
- `*-service/app/cache.py` + `CACHE_PREFIX` setting - prefixes every cache key with the service name, so all services can share one Upstash Redis database without reading or clearing each other's keys. Empty by default, so Docker Compose behaves exactly as before.

## Limits to know first

- The free **Hobby** plan is for **non-commercial personal use only**. A college or company event needs **Pro** ($20 per member per month).
- Hobby limits are per account and shared by all 9 projects. If they run out, functions pause until the next month. Pro has no such pause.
- Functions shut down when idle. The first request after a quiet period has a **cold start** of a few seconds, longer when one request calls several services.
- Each request and response is limited to **4.5 MB**, so very large Excel exports from the reporting service can fail.

---

## Step 1 - MongoDB Atlas

1. Use your existing cluster or create a free **M0** cluster.
2. Go to **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`). Vercel functions have no fixed IP addresses.
3. Use a database user with a **strong password**, because the cluster is now reachable from anywhere.
4. Copy the connection string (`mongodb+srv://...`).

## Step 2 - Upstash Redis

1. Go to **Vercel → Storage → Marketplace → Upstash for Redis → Create**, choose the free plan and the same region as your functions (Mumbai, to match `bom1` in the services' `vercel.json`).
2. Copy the **TCP URL**. It starts with `rediss://` and contains the password.

All services share this one database. `CACHE_PREFIX` keeps their keys apart.

## Step 3 - Create the 8 backend projects

For each service, go to **Vercel → Add New → Project → Import** this GitHub repo and set:

| Project name | Root Directory | `DATABASE_NAME` | `CACHE_PREFIX` |
|---|---|---|---|
| `annual-sports-identity` | `identity-service` | `as-local-identity` | `identity:` |
| `annual-sports-enrollment` | `enrollment-service` | `as-local-enrollment` | `enrollment:` |
| `annual-sports-department` | `department-service` | `as-local-department` | `department:` |
| `annual-sports-sports-participation` | `sports-participation-service` | `as-local-sports-part` | `sports-participation:` |
| `annual-sports-event-configuration` | `event-configuration-service` | `as-local-event-config` | `event-configuration:` |
| `annual-sports-scheduling` | `scheduling-service` | `as-local-scheduling` | `scheduling:` |
| `annual-sports-scoring` | `scoring-service` | `as-local-scoring` | `scoring:` |
| `annual-sports-reporting` | `reporting-service` | `as-local-reporting` | - (no cache) |

- **Framework Preset:** FastAPI (or Other). Leave the build and install commands empty; Vercel installs `requirements.txt`.
- Use the database names above to keep the same data as Docker Compose, or change them to keep Vercel's data separate.

**Environment variables for every backend project** (Settings → Environment Variables, Production):

| Variable | Value |
|---|---|
| `MONGODB_URI` | Atlas connection string from step 1 |
| `JWT_SECRET` | **The same value in all 8 projects.** Create one with `openssl rand -hex 32`. |
| `DATABASE_NAME` | From the table above |
| `REDIS_URL` | Upstash `rediss://` URL from step 2 |
| `CACHE_PREFIX` | From the table above |
| `APP_ENV` | `production` |
| `LOG_LEVEL` | `INFO` |
| `ADMIN_REG_NUMBER` | `admin` |
| `JWT_EXPIRES_IN` | `24h` |
| `IDENTITY_URL` | `https://annual-sports-identity.vercel.app` |
| `ENROLLMENT_URL` | `https://annual-sports-enrollment.vercel.app` |
| `DEPARTMENT_URL` | `https://annual-sports-department.vercel.app` |
| `SPORTS_PARTICIPATION_URL` | `https://annual-sports-sports-participation.vercel.app` |
| `EVENT_CONFIGURATION_URL` | `https://annual-sports-event-configuration.vercel.app` |
| `SCHEDULING_URL` | `https://annual-sports-scheduling.vercel.app` |
| `SCORING_URL` | `https://annual-sports-scoring.vercel.app` |
| `REPORTING_URL` | `https://annual-sports-reporting.vercel.app` |

The services call each other, so each one needs the other services' URLs. Setting all 8 everywhere is simplest. To avoid typing the shared values 8 times, create them once as **Shared Environment Variables** in your team settings and link them to all 8 projects.

**Identity service only** - email for password resets. Set `EMAIL_PROVIDER` (`gmail`, `sendgrid`, `resend` or `smtp`) and that provider's variables, for example `GMAIL_USER`, `GMAIL_APP_PASSWORD` and `EMAIL_FROM`. See [../env-setup.md](../env-setup.md).

Click **Deploy** for each project. Environment variables only apply to new deployments, so if you add or change one later, redeploy that project (**Deployments → ⋯ → Redeploy**).

## Step 4 - Check each service's URL

Vercel uses `<project-name>.vercel.app` only if that name is free. Open each project's **Domains** and note its real URL. If any differ from the table, update:

- the `*_URL` variables in all 8 backend projects, then redeploy them;
- the matching `destination` entries in `frontend/vercel.json`, then commit and push.

Check that each service responds (it should print `{"status":"ok"}`):

```bash
curl https://annual-sports-identity.vercel.app/health
```

If you see a Vercel login page or a 401 instead, go to the project's **Settings → Deployment Protection** and turn off **Vercel Authentication** for production. The frontend and the other services must be able to call it without logging in.

## Step 5 - Create the frontend project

**Add New → Project → Import** the same repo and set:

- Project name: `annual-sports` (any name works)
- Root Directory: `frontend`
- Framework Preset: Vite. The build command and output folder come from `frontend/vercel.json`.
- Environment variables: none. `VITE_API_URL` defaults to `/`, so the browser calls the same site and the rewrites forward to the services.

Click **Deploy**, open the project's `.vercel.app` URL, and log in to check that the pages load data.

## Step 6 - Custom domain `sports.learning-dev.com`

1. In the **frontend** project, go to **Settings → Domains → Add** and enter `sports.learning-dev.com`. Vercel shows the DNS record to create, usually a **CNAME** to `cname.vercel-dns.com`.
2. In **Route 53 → Hosted zones → learning-dev.com**:
   - delete the existing `sports` **A** record (the one pointing at EC2), because a name can't have both an A and a CNAME record;
   - create record `sports`, type **CNAME**, value as shown by Vercel, TTL `300`.
3. Wait until Vercel shows the domain as **Valid Configuration**. It then issues the HTTPS certificate automatically.
4. Open `https://sports.learning-dev.com`.

When it works, you can stop the EC2 instance and **release its Elastic IP** so neither keeps costing money.

---

## Updating the app

Push to the repo's production branch (`main`). Each project redeploys automatically when files in its Root Directory change.

## Running locally

Nothing changes locally. `docker compose up` still uses its own Redis databases with an empty `CACHE_PREFIX`.

## Troubleshooting

- **Pages load but every API call returns 404:** a `destination` in `frontend/vercel.json` does not match the service's real URL (step 4).
- **401/403 on every request after login:** the backend projects have different `JWT_SECRET` values, or a variable was added without redeploying.
- **Requests return a Vercel login page:** Deployment Protection is on for that service (step 4).
- **MongoDB timeout errors in a function's logs:** Atlas Network Access does not allow `0.0.0.0/0`, or `MONGODB_URI` is wrong.
- **"Python entrypoint not found" during build:** the project's Root Directory is wrong. It must be the service folder that contains `main.py`.
- **Every page is slow, not just the first request:** check where the functions run. `curl -sI https://annual-sports-identity.vercel.app/health | grep -i x-vercel-id` should look like `bom1::bom1::...` (the second name is where the function ran). If it shows `bom1::iad1::...`, the service was deployed without its `vercel.json` region; redeploy it from the latest commit. Also check that Atlas and Upstash are in the same region.
- **Slow first request:** this is a cold start. Requests are fast again while traffic keeps the functions warm.
- **Function logs:** open the project → **Logs** (or **Deployments → the deployment → Functions**).
