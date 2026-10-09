# Start here

Use **[customer-tracker.zip](../fixtures/demo-crud/customer-tracker.zip)** to test project import. It is a customer tracker with a local database and one intentional bug: editing looks successful, but refreshing brings back the old value.

**What works now:** uploading the ZIP and reading the saved project.

**Demo startup and checks now have an opt-in Docker configuration.** Use the command in the [US3/US4 handoff](us3-us4-backend-handoff.md). Its live app/database behavior still needs a laptop test. The ordinary backend command has no startup adapter; importing the ZIP alone does not enable it.

**Still missing:** local model conversation and qualified repair integration.

For the frontend, use the real backend for import, project lookup, and opt-in preparation. Use shared mock data for conversation and later screens while those integrations are pending. Keep mock conversation and confirmation together; their example goal IDs cannot be used on a real imported project.

If Prepare fails with `setup_incomplete`, show **Setup incomplete**. Read its message: the ordinary backend command has no demo startup adapter; the opt-in configuration can instead report a real startup or readiness failure. This error does not mean the framework is unsupported.

The next laptop test is:

**Import the ZIP → start the app and database → open its preview → reproduce the bug → show the check results.**

The model/harness work can continue separately. We do not need to wait for AI repair to build this flow.

For API details, use the [contract reference](../packages/contracts/README.md). For running the demo manually, use its [setup instructions](../fixtures/demo-crud/customer-tracker/README.md). Live Docker and database behavior still need verification on the laptop.
