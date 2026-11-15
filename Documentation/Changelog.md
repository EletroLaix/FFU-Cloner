# FFU Cloner Changelog

## Unreleased

### Features

- None.

### BugFix

- None.

### Resources

- Use explicit merge commits to integrate `Develop` into `Master` for future releases, preserving development history.

### Known issues

- See the latest release for existing limitations.

## Release: 0.1.3

<div class="Subtitle"><strong>Build:</strong> 0.1.3 <strong>Date:</strong> 15/11/2026</div>

### Features

- Open image dialogs on the Desktop initially and remember the last selected folder across capture, restore, and application restarts.

### BugFix

- Keep capture file metadata checks asynchronous, prevent overlapping image dialogs, and discard selections returned after a mode change.
- Show a pending indicator and disable image selection and operation start while the file picker is awaiting a result.
- Restore accessible data partition drive letters after a successful disk restore while respecting hidden and offline volumes.
- Publish MSI release assets with square brackets in their filenames without GitHub CLI interpreting the paths as glob patterns.

### Resources

- Split the Windows engine into focused disk inventory, image validation, disk state, DISM process, capture, and operation support files.
- Separate the interface workflow from the page layout and the PowerShell process lifecycle from DISM request handling.
- Expand source formatting, add English function comments, and adopt a narrower automatic formatting width with one JSX attribute per line.

### Known issues

- Boot validation on an intended target machine is still required.
- The MSI is unsigned, and its standard installer creates a desktop shortcut without asking.
- FFU operations are currently supported only on Windows. Other platforms and image formats are not implemented.

## Release: 0.1.2

<div class="Subtitle"><strong>Build:</strong> 0.1.2 <strong>Date:</strong> 14/11/2026</div>

### Features

- None.

### BugFix

- Reduce the window's outer spacing consistently in both full and compact layouts.
- Keep the window width and its full and compact heights stable throughout selection and operation progress.
- Restore the selected disk's original online or offline state after operations, including cancellation and errors.
- Honor a confirmed existing FFU destination and replace it only after capture succeeds.
- Center the restore confirmation button.
- Install and verify the Electron runtime before starting a Visual Studio Code debug session.
- Explain that FFU capture requires GPT and does not support MBR, instead of leaving the disk lock open to interpretation.
- Bring source volumes online for capture so DISM can read filesystem metadata; keep offline preparation and verification for restore targets. This fixes DISM error 21 on an offline USB source.
- Request administrator elevation when starting an Electron debug session from Visual Studio Code.
- Let the Visual Studio Code preparation task finish after starting elevated Electron, so the debugger can attach and open the app.
- Signal Visual Studio Code when elevated Electron is ready even if Windows keeps the task terminal alive.
- Show the Electron window when starting an elevated debug session.
- Keep modal dialogs out of the draggable title bar so the logs close button responds where it is drawn.
- Allow the installed app to open without administrator privileges; disk operations still require elevation.

### Resources

- Adapt destructive USB integration tests to exactly identified disks of different capacities, with a bounded 512 MiB fixture, real cancellation checks and source-path rejection.
- Remove the README license badge and section; GitHub exposes the root license file.
- Display test, compilation, packaging and deployment as separate release workflow jobs.
- Name the Windows installer `FFU Cloner [version].msi`.
- Refresh the README with a direct release link and document the Develop-to-Master release process.
- Adopt GPL-3.0-only for the project source code.
- Include the complete GPLv3 license in the repository and installed application.
- Remove the obsolete portable launcher diagnostic and its retired runtime references.
- Simplify the README build instructions.

### Known issues

- Boot validation on an intended target machine is still required.
- The MSI is unsigned, and its standard installer creates a desktop shortcut without asking.
- FFU operations are currently supported only on Windows. Other platforms and image formats are not implemented.

## Release: 0.1.1

<div class="Subtitle"><strong>Build:</strong> 0.1.1 <strong>Date:</strong> 14/11/2026</div>

### Features

- First official release of FFU Cloner for Windows.

### BugFix

- None in this release.

### Resources

- Publish the Windows MSI and release notes through the tag-triggered GitHub Actions workflow.

### Known issues

- No physical test disk is currently available; the application has been checked with simulated engines, data and processes.
- The MSI is unsigned, and its standard installer creates a desktop shortcut without asking.
- FFU operations are currently supported only on Windows. Other platforms and image formats are not implemented.

## Release: 0.1.0

<div class="Subtitle"><strong>Build:</strong> 0.1.0 <strong>Date:</strong> 13/11/2026</div>

### Features

- Capture and restore FFU disk images on Windows using DISM, with progress reporting, cancellation and disk safety checks.
- Review operation logs in the application and open the log folder.
- Use the interface in English, Italian, German, French, Spanish or Polish.
- Install the application with a Windows MSI package.

### BugFix

- None for the initial release.

### Resources

- Added a Visual Studio Code debugging configuration.
- Added a GitHub Actions workflow that publishes a release from a version tag on `Master`; tests run locally.
- Documented the platform engine boundary and the use of artificial intelligence during development.

### Known issues

- No physical test disk is currently available; the current build has been checked with simulated engines, data and processes.
- The MSI is unsigned, and its standard installer creates a desktop shortcut without asking.
- FFU operations are currently supported only on Windows. Other platforms and image formats are not implemented.
