# Shared Desktop and VS Code files

Shared files listed in `plugin-for-vscode/shared-files.json` now have one
tracked source at the repository root. `plugin-for-vscode/build.mjs`
materializes the extension copies for testing and packaging. These outputs
are ignored by Git and refreshed on every build.

Platform-specific files remain tracked. The inventory tool includes both
tracked files and declared generated files, so its parity checks still
cover the packaged extension. Use `npm run check:ci` and `npm test` from a
clean checkout before packaging.
