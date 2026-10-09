# Customer tracker demo

An ordinary JavaScript CRUD app with a real local database. All customers and credentials here are synthetic. No production connection is needed.

## Run a separate test copy

Install Docker Compose. From this app directory:

```sh
docker compose -p customer-demo pull
docker compose -p customer-demo up -d --wait
```

Open **http://127.0.0.1:4400**. The page uses the vendored `supabase-js` bundle; no browser CDN request is required. During setup, Docker downloads Supabase PostgreSQL, PostgREST, and Nginx images. After those images are present, start with `--pull never` for the offline trial. External network blocking still needs a laptop rehearsal.

Only the web port is published, on host loopback. Nginx serves the app and forwards `/rest/v1` to PostgREST. Authentication, storage, realtime, and cloud services are unused. This is the local Supabase data stack the app needs, rather than the full Supabase dashboard/service suite. [Supabase Docker service definitions](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml) document the upstream components.

`database/schema.sql` creates the customer table, restricted demo roles, row access policy, and two synthetic customers. A named Compose volume retains saved records. Schema setup runs before the REST service starts.

Use Node 22.12+ to check the preview and database create/read/delete actions:

```sh
node scripts/health.mjs
```

A static `/health` response alone only proves the web server is alive. The script exercises the application and rereads saved data. Full edit behavior is checked by the baseline.

## Reproduce the intentional bug

1. Create a customer, or edit Alex Example.
2. Change their name and press **Save customer**.
3. The table shows the new name and “Customer saved.”
4. Refresh customers or reload the page: the old name returns.

The reported goal is: **Customer edits should survive refreshing.** The application update action is in `customers.js`. Create, read, and delete use the real database.

## Run the protected baseline

From the VibeGuard repository root, with this test app running:

```sh
VIBEGUARD_TARGET_DIR="$PWD/fixtures/demo-crud/customer-tracker" node verification/demo-crud/baseline.mjs
```

It calls the same application actions as the browser and independently checks saved PostgreSQL-backed data through Supabase's REST API. It prints shared `CheckResult[]`: create/read/delete should pass; update/goal should fail on this intentional bug. Exit 0 means passed, 1 means failed checks, and 2 means inconclusive/setup failure. The suite removes its own synthetic customer and has a 60-second limit. These expected live results have not yet been observed here.

Protected checks stay outside this import ZIP. The runner/verification owner must mount them outside the agent's writable scope and wire this entry point into `BaselineChecks`. Agent-written tests may supplement them.

## Environment ownership

For each runner copy, choose a unique Compose project name and free loopback web port. Set `DEMO_PORT` for Compose and `VIBEGUARD_DEMO_URL` for the scripts when using a port other than 4400. Project-scoped volumes keep separate copies' data apart. Set `DEMO_UID` and `DEMO_GID` to the editable copy's owner (defaults 1000:1000) so the web service can read private runner copies without widening their permissions. Start services from the editable copy, never the imported original. The runner must own process cleanup and Docker access; the agent must not receive the Docker socket.

Stop this example while retaining its synthetic data:

```sh
docker compose -p customer-demo down
```

To discard only this example's test data and reseed it next time:

```sh
docker compose -p customer-demo down -v
```

Docker startup, readiness, database persistence across restart, bug reproduction, and offline operation still need verification on a machine with Docker access. Importing this ZIP works independently of that verification; automatic Prepare is not wired yet.
