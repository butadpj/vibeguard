# Verification

Put the checks that reproduce a bug and verify its fix here. We haven't implemented them yet.

Run the same checks before and after a repair. For the demo, check that the app creates, reads, updates, and deletes records in a real local database. Save evidence for the dashboard to show.

The repair agent must not be able to edit these checks. Enforce that when the runner starts the repair process, using file permissions or container mounts.

Coordinate with whoever builds the runner and [demo app](../fixtures/demo-crud/README.md). Read [the requirements](../context/scope-and-tech-requirements.md) before adding checks.
