# Orca Shift

Orca Shift is a fork of [Orca](https://github.com/stablyai/orca) that runs each workspace on its own
disposable environment, such as a local Docker container, and makes that flow easier to use. It installs
next to regular Orca and keeps its own data, so you can run both.

## What it adds

- **`orca worktree create --recipe <id>`** creates a workspace from an `environmentRecipes` entry in
  `orca.yaml`, the same way the New Workspace dialog does.
- **Recipes are rows in the Run on picker**, not behind a "Per-Workspace Environment" submenu.
- **Delete Workspace** works for a workspace whose checkout is the environment's own (`provisioned-root`).
- **Run picked tasks automatically** (Settings → Tasks): starting a workspace from a task launches the agent on
  the task link instead of leaving it as a draft you have to send. Off by default.
- **Resume and suspend failures say why**: the recipe script's last lines are shown in the error.
- **`pnpm install:fork`** installs a build after backing up your data, and keeps the previous app for rollback.

The fork is based on upstream `main`, which already includes the managed-server support that recipe
environments need. Released Orca builds before that change cannot run these workspaces.

## Install

Orca Shift is for Apple Silicon Macs.

1. Download `Orca-Shift-<version>-arm64.zip` from this repository's Releases and unzip it.
2. Move `Orca Shift.app` to `/Applications` (or `~/Applications`).
3. The app is not notarized, so macOS blocks it the first time. Clear the quarantine flag once:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Orca Shift.app"
   ```
4. Open it. Its data lives in `~/Library/Application Support/Orca Shift`, separate from Orca's.

Docker recipes also need Docker Desktop running.

## First run

1. Open Settings → Experimental and turn on **Cloud VM**.
2. Add your project. Recipes defined in its `orca.yaml` appear in the **Run on** picker of the New Workspace dialog.
3. The first time you run a recipe, Orca asks you to trust the scripts in the repo.

From a terminal, point the bundled CLI at this app's data folder:

```bash
ORCA_USER_DATA_PATH="$HOME/Library/Application Support/Orca Shift" \
  "/Applications/Orca Shift.app/Contents/Resources/bin/orca" \
  worktree create --repo id:<repoId> --name my-feature --recipe <recipe-id>
```

An alias keeps that short. `--recipe` works with `--repo`, `--name` and `--base-branch` only; flags such as
`--agent` or `--parent-worktree` are refused rather than ignored.

## Known limits

- **Signing.** Builds are ad-hoc signed, so macOS may ask again for permissions (Keychain, folders,
  firewall) after each update.
- **Server platforms.** The bundled managed server covers Linux arm64 only, which is what Docker on Apple
  Silicon runs. Other remote hosts, such as x64 Linux, are not covered.
- **Orca Mobile.** Local-network pairing works only if your network lets the phone reach the Mac (office
  Wi-Fi often blocks it). "Anywhere" pairing needs an Orca account sign-in, which is tied to upstream's app.
- **Updates.** There is no automatic update. Install new releases yourself.

## Updating safely

Quit Orca Shift first. Before replacing the app, copy `~/Library/Application Support/Orca Shift` somewhere safe:
a newer build can migrate your data in a way an older build cannot read. When building from source,
`pnpm install:fork` does the backup and keeps the old app (`pnpm install:fork --rollback` restores it,
`--restore-data <backup>` restores data).

## Building from source

You need Node 24, pnpm 12.8.1, the Xcode command line tools, and Docker.

```bash
pnpm install
# The mobile app is a separate workspace; its generated files are needed to package the app.
(cd mobile && pnpm install --frozen-lockfile --ignore-scripts &&
  node scripts/build-terminal-webview-engine.mjs &&
  node scripts/build-mermaid-webview-engine.mjs &&
  node scripts/build-mermaid-page-engine.mjs &&
  node scripts/build-terminal-document-script.mjs &&
  node scripts/build-rich-markdown-editor-script.mjs)
pnpm build:fork-template   # the Linux arm64 server the app deploys, built in Docker
pnpm build:fork            # dist/mac-arm64/Orca Shift.app
pnpm install:fork          # back up data, install, keep the old app
```

## Staying in sync with upstream

```bash
git remote add upstream https://github.com/stablyai/orca.git
git fetch upstream --tags
```

Rebase the fork's commits onto an upstream release tag rather than a moving `main`, rebuild the server
template with the app (they must come from the same commit), and run
`tests/e2e/ssh-orcad-vm-provisioned-root.spec.ts` and `tests/e2e/ssh-orcad-vm-recipe-cli-create.spec.ts`
before adopting the new base.
