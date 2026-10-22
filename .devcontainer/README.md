# HeavenzFire Codespaces workspace

This repository now defines a repeatable development container for GitHub Codespaces.

## Create or open the workspace

1. Open the repository's [Codespaces creation page](https://github.com/codespaces/new?repo=875204738&ref=main).
2. Choose the `main` branch and the default `.devcontainer/devcontainer.json` configuration.
3. Create the codespace. The container installs Python 3.12, Node.js 20, and GitHub CLI, then runs the repository's unit tests.
4. Keep project work under the repository workspace directory and push meaningful changes to GitHub.

## Persistence boundaries

GitHub Codespaces preserves repository files in `/workspaces` across stop/start and container rebuild. A codespace itself is not an always-on server: it can stop on idle timeout, and stopped codespaces can be deleted according to account/organization retention settings. Push commits for durable source history. Do not store credentials in committed files.

## Port policy

Gateway, orchestrator, and agent-health ports are configured as **private** forwarded ports. Do not switch them to public visibility without reviewing authentication and threat exposure. This configuration does not automatically start those services.

## Cost and availability

Creating or running a codespace may consume the account's included usage or incur charges. Select the machine size and idle timeout appropriate for your account and workload. The configuration is committed; an actual codespace still has to be created through GitHub's Codespaces UI or GitHub CLI.
