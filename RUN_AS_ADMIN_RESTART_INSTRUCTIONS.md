# Run as Administrator: Restart the MarinaAI Command Hub service

The validation terminal was **not elevated**, so the Windows service restart
was **not** performed automatically. The local `MarinaAI` service (managed by
NSSM) is still running the previously loaded code. To load the updated
Command Hub server code (policy engine, approval gating, audit trail,
system-action endpoints), run the following in an **Administrator PowerShell**
window:

```powershell
cd C:\Users\linde\Projects\MarinaAI\agent
powershell -NoProfile -ExecutionPolicy Bypass -File .\restart-service.ps1
```

What this does (verified by reading `agent/restart-service.ps1`):

1. Confirms it is running elevated (exits with an error if not).
2. Runs `nssm restart MarinaAI` — stops and starts the `MarinaAI` Windows
   service only. It changes no configuration, deletes no files, and writes no
   state beyond the service's own logs.
3. Waits ~5 seconds and reports the service status.
4. Tests whether port 3000 is reachable (`http://localhost:3000`).

After the restart completes, verify the updated code is live by opening:

- `http://localhost:3000/api/health` — should return JSON with `llm` status.
- `http://localhost:3000/api/system/state` — new endpoint; if it returns JSON
  containing `effectivePermissions`, the updated build is confirmed live.
  If it returns the SPA HTML instead, the service is still on old code.

Notes:

- Do not set `MARINA_ENABLE_EXEC=1`. High-risk execution must stay disabled;
  high/critical model-requested actions are queued in the Approval Queue.
- No Git commit is required for this step; it only reloads already-saved files.