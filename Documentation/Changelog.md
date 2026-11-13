# FFU Cloner Changelog

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

- Added a Windows build workflow and a Visual Studio Code debugging configuration.
- Documented the platform engine boundary and the use of artificial intelligence during development.

### Known issues

- No physical test disk is currently available; the current build has been checked with simulated engines, data and processes.
- The MSI is unsigned, and its standard installer creates a desktop shortcut without asking.
- FFU operations are currently supported only on Windows. Other platforms and image formats are not implemented.
