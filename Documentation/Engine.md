# Operation engine boundary

`Source/Application/Engine.cjs` selects the implementation for the current operating system. The desktop IPC uses only the selected engine. Windows-specific JavaScript and PowerShell live in `Source/Application/Windows`; unimplemented platforms reject disk operations and report an unavailable environment.

Each implementation exposes three asynchronous methods:

- `environment()` returns `{ windows, admin }`. These fields reflect the current FFU interface and must be generalized before adding support for another platform or image format.
- `listDisks()` returns disk records for selection. Records currently include `number`, `name`, `uniqueId`, `serial`, `size`, `bus`, `style`, `system`, `boot`, `paging`, `offline`, `volumesOffline`, `readOnly`, `removable`, and `accessPaths`. The IPC assigns selection tokens; clients cannot pass arbitrary disk records directly to a clone.
- `clone(request, onProgress, signal)` starts capture or restore. The request contains `mode` (`capture` or `apply`), the selected `disk`, `image`, `confirmed`, `logDirectory`, `version`, and `appPaths`. Restore requires `confirmed: true`. Progress updates can contain `stage`, `percent`, `bytesPerSecond` or `logPath`. A successful result contains `success`; cancellation rejects with `code: 'CANCELLED'` after the operation has stopped. Other failures reject with an error.

The Windows adapter translates the shared confirmation into the existing DISM protocol. The Windows engine remains responsible for validating requests, checking administrator privileges and disk identity, protecting system and paging disks, checking file locations and mode-specific disk preparation, stopping child processes, and cleaning up incomplete captures. These checks must not be replaced by a selection-time check: the disk can change before or during preparation.

Capture brings the source disk and its data volumes online: DISM needs filesystem metadata access before managing capture access, and an offline source produces error 21 (`ERROR_NOT_READY`). Restore takes the target disk or all its non-reserved volumes offline and verifies that state before DISM starts. Both modes recheck disk identity and protection after preparation.

After success, cancellation or failure, the engine rechecks disk identity and restores its initial online/offline state and the recorded partition states where those partition numbers still exist. Failures to restore state are reported. When capture replaces a confirmed existing image, the old file is retained until DISM has produced a complete new image; the selected file is checked again before atomic replacement.

To add a platform, implement the contract and select the adapter in `Engine.cjs`. Define its image formats and capabilities explicitly before enabling them in the interface; the current UI, disk records, FFU selection, Windows privilege checks and error messages are still Windows-specific. Keep platform operations separate, test destructive paths using simulated processes and devices first, and validate on appropriate hardware before deployment.
