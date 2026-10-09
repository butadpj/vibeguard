# Importable CRUD demo

Import **[customer-tracker.zip](customer-tracker.zip)** into VibeGuard. Its reviewed source is in [customer-tracker/](customer-tracker/README.md).

The fixture matches the handoff: plain JavaScript, vendored `supabase-js`, local Supabase PostgreSQL and PostgREST, reproducible schema, synthetic customers, and an edit that looks saved but disappears after refresh.

Import works now. Automatic preparation still needs the runner's `PrepareEnvironment` adapter. The ZIP does not turn an unfinished backend into a ready environment.

Rebuild the checked-in ZIP after changing its source:

```sh
python3 fixtures/demo-crud/build-zip.py
```

The archive has app files at its root and contains no live database files, downloaded Docker images, protected checks, or production credentials. Synthetic-only demo credentials are included so setup needs no secrets.

See the [short engineer handoff](../../context/us1-us2-backend-handoff.md).
