# Operation engine boundary

`Source/Application/Engine.cjs` selects the implementation for the current operating system. The desktop IPC uses only the selected engine. Windows-specific JavaScript and PowerShell live in `Source/Application/Windows`; unimplemented platforms reject disk operations and report an unavailable environment.

Each implementation exposes three asynchronous methods:

- `environment()` returns `{ windows, admin }`. These fields reflect the current FFU interface and must be generalized before adding support for another platform or image format.
- `listDisks()` returns disk records for selection. Records currently include `number`, `name`, `uniqueId`, `serial`, `size`, `bus`, `style`, `system`, `boot`, `paging`, `offline`, `volumesOffline`, `readOnly`, `removable`, and `accessPaths`. The IPC assigns selection tokens; clients cannot pass arbitrary disk records directly to a clone.
- `clone(request, onProgress, signal)` starts capture or restore. The request contains `mode` (`capture` or `apply`), the selected `disk`, `image`, `confirmed`, `logDirectory`, `version`, and `appPaths`. Restore requires `confirmed: true`. Progress updates can contain `stage`, `percent`, `bytesPerSecond` or `logPath`. A successful result contains `success`; cancellation rejects with `code: 'CANCELLED'` after the operation has stopped. Other failures reject with an error.

The Windows adapter translates the shared confirmation into the existing DISM protocol. The Windows engine remains responsible for validating requests, checking administrator privileges and disk identity, protecting system and paging disks, checking file locations and offline state, stopping child processes, and cleaning up incomplete captures. These checks must not be weakened or replaced by a selection-time check: the disk can change before or during preparation.

To add a platform, implement the contract and select the adapter in `Engine.cjs`. Define its image formats and capabilities explicitly before enabling them in the interface; the current UI, disk records, FFU selection, Windows privilege checks and error messages are still Windows-specific. Keep platform operations separate, test destructive paths using simulated processes and devices first, and validate on appropriate hardware before deployment.
