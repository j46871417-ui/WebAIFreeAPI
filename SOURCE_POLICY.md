# Source files in Git

Keep code, tests, build recipes and required assets in Git. Put ready-made
packages in Releases. Keep keys, cookies, sessions, databases, logs, build
output, private notes and backup copies out of Git.

Before a commit, run `python tools/check_source_hygiene.py`. To run the
same check on every local commit, use `git config core.hooksPath .githooks`.
The check reads the Git index, so a changed working copy cannot hide a
staged secret. CI also runs Gitleaks on all fetched Git history. Neither
check prints secret values. Duplicate install assets must be listed in
`tools/source-policy.json`; new unexplained copies fail the check.

`.gitignore` does not untrack existing files. Use `git rm --cached` after
review; keep local files if needed. Never force-add a live credential.
Use placeholder values in `.env.example` and secrets in the CI secret store.

If a real key leaks, revoke it. History cleanup cannot revoke access or
remove other people's clones and GitHub's cached views. After a history
rewrite, clone again rather than merging the old history back.

## Shared sources and Windows SDK

Edit shared runtime files at the repository root. Files listed in
`plugin-for-vscode/shared-files.json` are copied by `npm run build` in the
extension, and by the root test/CI commands. Do not force-add those copies.
Platform-specific extension files remain tracked and are not overwritten.
Linux icon install layouts and the extension license are required copies;
they are listed in the source policy rather than treated as spare files.

The Windows GUI build downloads WebView2 1.0.2151.40 from NuGet when needed,
checks its pinned SHA-256 and extracts it locally. SDK files and copied DLLs
are build inputs/output, not project source. The first clean Windows build
needs network access. Run `node scripts/download-webview2.mjs` to prefetch.
