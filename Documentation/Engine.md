# Operation engine boundary

## Source layout

Read the entry points first, then follow the helper for the responsibility you need:

| File | Responsibility |
| --- | --- |
| `Source/Application/Engine.cjs` | Select the operating system adapter. |
| `Source/Application/Desktop/ImagePicker.cjs` | Share the last image folder between modes, persist it, and check overwrite metadata without blocking Electron. |
| `Source/Application/Windows/Engine.cjs` | Adapt the shared confirmation contract. |
| `Source/Application/Windows/Dism.cjs` | Validate requests and translate progress messages. |
| `Source/Application/Windows/EngineProcess.cjs` | Launch PowerShell and manage streams, cancellation, timeouts, and free space. |
| `Source/Application/Windows/Engine.ps1` | Coordinate preflight checks, preparation, execution, and recovery. |
| `Source/Application/Windows/DiskInventory.ps1` | Discover disks and verify identity and protection flags. |
| `Source/Application/Windows/ImageFiles.ps1` | Validate image paths, confirmed replacements, and physical file locations. |
| `Source/Application/Windows/DiskState.ps1` | Prepare disks, verify isolation, and restore state and drive letters. |
| `Source/Application/Windows/Dism.ps1` | Execute DISM, sample throughput, and stop its process tree on failure. |
| `Source/Application/Windows/Capture.ps1` | Create a temporary image, publish it atomically, and remove incomplete files. |
| `Source/Application/Windows/OperationSupport.ps1` | Report messages and detect cancellation. |
| `Source/Application/Windows/VolumeAccess.ps1` | Access native Windows volume controls. |
| `Source/Application/Windows/DiskPerformance.ps1` | Read native disk performance counters. |
| `Source/Interface/App.jsx` | Assemble the page and connect presentation components. |
| `Source/Interface/Hooks/UseWorkflow.js` | Manage selection, operation state, progress, and backend calls. |

PowerShell helpers are dot-sourced into the engine's script scope. They share the current `$request` and `$sessionLog`; loading a helper only defines functions. Native interop helpers are loaded when an operation needs them. Keep these files together when packaging; the existing PowerShell unpack pattern includes every helper.

Use tabs displayed at four columns, explicit control-flow blocks, and one statement per line. Separate logical steps with blank lines and explain each function's purpose in English. Prettier uses a 90-column target and puts JSX attributes on separate lines. Keep related steps together instead of creating a separate file for every small function.

The PowerShell tests parse every Windows helper and extract only the functions under test. They do not run the entry point; OS calls are replaced with simulated devices and harmless processes.

## Adapter contract

`Source/Application/Engine.cjs` selects the implementation for the current operating system. The desktop IPC uses only the selected engine. Windows-specific JavaScript and PowerShell live in `Source/Application/Windows`; unimplemented platforms reject disk operations and report an unavailable environment.

Each implementation exposes three asynchronous methods:

- `environment()` returns `{ windows, admin }`. These fields reflect the current FFU interface and must be generalized before adding support for another platform or image format.
- `listDisks()` returns disk records for selection. Records currently include `number`, `name`, `uniqueId`, `serial`, `size`, `bus`, `style`, `system`, `boot`, `paging`, `offline`, `volumesOffline`, `readOnly`, `removable`, and `accessPaths`. The IPC assigns selection tokens; clients cannot pass arbitrary disk records directly to a clone.
- `clone(request, onProgress, signal)` starts capture or restore. The request contains `mode` (`capture` or `apply`), the selected `disk`, `image`, `confirmed`, `logDirectory`, `version`, and `appPaths`. Restore requires `confirmed: true`. Progress updates can contain `stage`, `percent`, `bytesPerSecond` or `logPath`. A successful result contains `success`; cancellation rejects with `code: 'CANCELLED'` after the operation has stopped. Other failures reject with an error.

The Windows adapter translates the shared confirmation into the existing DISM protocol. The Windows engine remains responsible for validating requests, checking administrator privileges and disk identity, protecting system and paging disks, checking file locations and mode-specific disk preparation, stopping child processes, and cleaning up incomplete captures. These checks must not be replaced by a selection-time check: the disk can change before or during preparation.

Capture brings the source disk and its data volumes online: DISM needs filesystem metadata access before managing capture access, and an offline source produces error 21 (`ERROR_NOT_READY`). Restore takes the target disk or all its non-reserved volumes offline and verifies that state before DISM starts. Both modes recheck disk identity and protection after preparation.

After success, cancellation or failure, the engine rechecks disk identity and restores its initial online/offline state and the recorded partition states where those partition numbers still exist. Failures to restore state are reported. When capture replaces a confirmed existing image, the old file is retained until DISM has produced a complete new image; the selected file is checked again before atomic replacement.

To add a platform, implement the contract and select the adapter in `Engine.cjs`. Define its image formats and capabilities explicitly before enabling them in the interface; the current UI, disk records, FFU selection, Windows privilege checks and error messages are still Windows-specific. Keep platform operations separate, test destructive paths using simulated processes and devices first, and validate on appropriate hardware before deployment.
