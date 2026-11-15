# Working rules

- Complete agreed changes before running a final test session.
- Group commits by topic without interrupting work for repeated tests.
- After completing work, commit each distinct topic separately and push `Develop` to `origin`.
- Make development commits on `Develop` only. Keep `Master` unchanged until the user explicitly requests a release; then merge `Develop` into `Master` with an explicit merge commit (`git merge --no-ff Develop`) and tag that merge commit. Preserve development history; do not squash or rebase releases.
- Keep source code, comments, logs and documentation in English; preserve localized user-interface translations.
- Write simple, readable code without unnecessary frameworks or layers.
- Prefer explicit multiline control flow, one statement per line, and blank lines between logical steps. Keep function comments concise and explain purpose or constraints.
- Split files by responsibility when they mix unrelated concerns; keep entry points focused on coordination and UI components focused on presentation.
- Indent with tabs displayed at four columns; use spaces where a format requires them.
- Remove obsolete sources and unused files; history remains in Git.
- Use complete folder and project source file names with an initial capital letter. Preserve conventional tool-defined names such as `node_modules`, `package.json`, `index.html`, locale codes and test suffixes.
- Store generated builds, caches and test output in `Output`, excluded from Git.
- Maintain one changelog in `Documentation/Changelog.md`, newest releases first, with Features, BugFix, Resources and Known issues sections.
- A sacrificial USB test disk is available. Verify its exact identity and exclude system, boot, paging and project disks before destructive tests.
- Do not commit validation reports, checksums or test results. Keep generated output in `Output` and change history in the changelog.
- Place source code in `Source/Application` and `Source/Interface`, and translations, images and fonts under `Source/Resources`.
- Keep the project license in the repository root. Generate dependency notices during the build without dedicated source copies.
