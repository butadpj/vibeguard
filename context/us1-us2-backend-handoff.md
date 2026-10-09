# Start here

Use **[customer-tracker.zip](../fixtures/demo-crud/customer-tracker.zip)** to test project import. It is a customer tracker with a local database and one intentional bug: editing looks successful, but refreshing brings back the old value.

**What works now:** uploading the ZIP and reading the saved project.

**What is still missing:** the backend does not automatically start the demo app, open a working preview, talk to the local model, or run real app checks yet. Those connections are still being built. Importing this ZIP will not make those steps work automatically.

For the frontend, use the real backend for import and project lookup. Use the shared mock data in `@vibeguard/contracts/examples` for the later screens, including conversation and goal confirmation. Keep that whole later flow in mock mode for now.

If Prepare fails with `setup_incomplete`, show **Setup incomplete**. It means startup is not connected yet—not that this demo uses an unsupported framework.

Our next job is to make this flow real:

**Import the ZIP → start the app and database → open its preview → reproduce the bug → show the check results.**

The model/harness work can continue separately. We do not need to wait for AI repair to build this flow.

For API details, use the [contract reference](../packages/contracts/README.md). For running the demo manually, use its [setup instructions](../fixtures/demo-crud/customer-tracker/README.md). Live Docker and database behavior still need verification on the laptop.
