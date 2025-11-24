<#
    start-servers.ps1

    Purpose:
    - Check whether the backend server, the FHE HTTP service, and the client dev server are already running (by testing local ports).
    - Start only the services that are NOT already running.
    - Launch each service in a new PowerShell window so logs remain visible.
    - Wait for each started service to report that its port is listening before reporting success.

    Usage examples:
    - Default (uses ports 8000, 3001, 5173 and assumes `server/` and `client/` folders live next to this script):
        .\start-servers.ps1

    - Override ports or root path:
        .\start-servers.ps1 -ServerPort 8000 -FhePort 3001 -ClientPort 5173 -RootPath "C:\programing\Secure Bridge"

    Notes / Assumptions:
    - This script assumes the backend listens on port 8000 by default.
    - MCP / FHE HTTP service is assumed to listen on port 3001 by default (adjust with -FhePort if different).
    - Vite dev server is assumed to run on 5173 by default.
    - Commands run:
        * cd server; npm run start
        * cd server; npm run start:fhe-http
        * cd client; npm run dev
    - The script uses Test-NetConnection to detect a listening port on localhost.
    - If your project uses different ports or different npm scripts, pass them as parameters or edit the script.
#>

param(
    [string]$RootPath = $PSScriptRoot,                      # Base folder (defaults to script location)
    [int]$ServerPort = 8000,                                # Backend server port (default: 8000)
    [int]$FhePort = 3001,                                   # FHE HTTP service port (default: 3001)
    [int]$ClientPort = 5173,                                # Vite dev server port (default: 5173)
    [int]$WaitSeconds = 60                                  # Timeout waiting for port to open
)

function Write-Info($msg) { Write-Host "[INFO]  " $msg -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN]  " $msg -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR] " $msg -ForegroundColor Red }

# Helper: test if a TCP port is listening on localhost
function Test-PortOpen {
    param(
        [int]$Port
    )
    try {
        $res = Test-NetConnection -ComputerName '127.0.0.1' -Port $Port -WarningAction SilentlyContinue
        return [bool]$res.TcpTestSucceeded
    } catch {
        return $false
    }
}

# Helper: wait until a port is open or timeout
function Wait-ForPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )
    $start = Get-Date
    while ((Get-Date) -lt $start.AddSeconds($TimeoutSeconds)) {
        if (Test-PortOpen -Port $Port) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

# Helper: wait for any port in a range and return the first open port number, or $null on timeout
function Wait-ForPortRange {
    param(
        [int]$StartPort,
        [int]$Count = 10,
        [int]$TimeoutSeconds = 60
    )
    $endPort = $StartPort + ($Count - 1)
    $start = Get-Date
    while ((Get-Date) -lt $start.AddSeconds($TimeoutSeconds)) {
        for ($p = $StartPort; $p -le $endPort; $p++) {
            if (Test-PortOpen -Port $p) { return $p }
        }
        Start-Sleep -Seconds 1
    }
    return $null
}

# Normalize paths
$RootPath = (Resolve-Path -Path $RootPath).Path
$ServerDir = Join-Path $RootPath 'server'
$ClientDir = Join-Path $RootPath 'client'

Write-Info "RootPath: $RootPath"
Write-Info "Server directory: $ServerDir"
Write-Info "Client directory: $ClientDir"

# Validate directories
$missing = @()
if (-not (Test-Path $ServerDir)) { $missing += $ServerDir }
if (-not (Test-Path $ClientDir)) { $missing += $ClientDir }
if ($missing.Count -gt 0) {
    Write-Err "Missing folders:"
    $missing | ForEach-Object { Write-Host "  $_" }
    Write-Err "Make sure you run this script from the repository root or pass -RootPath to the correct folder." 
    exit 2
}

# Define the services to check and start
$services = @(
    @{ Name = 'Backend (server)'; Port = $ServerPort;  WorkDir = $ServerDir;  Command = 'npm run start' },
    @{ Name = 'FHE HTTP (server:start:fhe-http)'; Port = $FhePort;    WorkDir = $ServerDir;  Command = 'npm run start:fhe-http' },
    @{ Name = 'Client (Vite)'; Port = $ClientPort;  WorkDir = $ClientDir;  Command = 'npm run dev' }
)

# Check each service and start only those not running
$started = @()
$skipped = @()
$failed = @()

foreach ($svc in $services) {
    $name = $svc.Name
    $port = [int]$svc.Port
    $workdir = $svc.WorkDir
    $cmd = $svc.Command

    Write-Info "Checking $name (port $port) ..."

    # For the client (Vite) allow detection on a small port range so we skip starting if Vite
    # has already auto-incremented to a nearby port (e.g. 5174).
    if ($name -match 'Client') {
        $foundPort = $null
        for ($p = $port; $p -le ($port + 10); $p++) {
            if (Test-PortOpen -Port $p) { $foundPort = $p; break }
        }
        if ($foundPort) {
            Write-Info ("{0} already listening on port {1}. Skipping start." -f $name, $foundPort)
            $skipped += $name
            continue
        }
    } else {
        if (Test-PortOpen -Port $port) {
            Write-Info "$name already listening on port $port. Skipping start."
            $skipped += $name
            continue
        }
    }

    # Launch the command in a new PowerShell window so logs remain visible
    # Build the argument list as an array to avoid complicated escaping/quoting
    # Use a command block that sets the working directory safely (single-quoted path inside) and runs the npm command.
    # Use & { Set-Location -Path 'C:\path with spaces'; npm run dev } style so Set-Location receives the path as one argument.
    $commandString = "& { Set-Location -Path '$workdir'; $cmd }"
    $argList = @('-NoExit', '-Command', $commandString)

    Write-Info ("Starting {0}: {1} in {2}" -f $name, $cmd, $workdir)

    try {
        Start-Process -FilePath 'pwsh' -ArgumentList $argList -WorkingDirectory $workdir -WindowStyle Normal | Out-Null
    } catch {
        $err = $_
        Write-Err (("Failed to start process for {0}: {1}") -f $name, $err)
        $failed += $name
        continue
    }

    # Wait for the port to become available. For the client (Vite) we accept the primary port or the next few ports
    Write-Info "Waiting up to $WaitSeconds seconds for $name to listen on port $port ..."
    if ($name -match 'Client') {
        # Vite may auto-increment the port if the default is in use; check a small range
        $found = Wait-ForPortRange -StartPort $port -Count 11 -TimeoutSeconds $WaitSeconds
        if ($null -ne $found) {
            Write-Info ("{0} is now listening on port {1}." -f $name, $found)
            $started += $name
        } else {
            Write-Warn ("{0} did not start and listen on ports {1}-{2} within {3} seconds. Check logs in the new window." -f $name, $port, $port+10, $WaitSeconds)
            $failed += $name
        }
    } else {
        if (Wait-ForPort -Port $port -TimeoutSeconds $WaitSeconds) {
            Write-Info ("{0} is now listening on port {1}." -f $name, $port)
            $started += $name
        } else {
            Write-Warn ("{0} did not start and listen on port {1} within {2} seconds. Check logs in the new window." -f $name, $port, $WaitSeconds)
            $failed += $name
        }
    }
}

# Summary
Write-Host ""; Write-Host "========== Start Summary =========="
if ($started.Count -gt 0) {
    Write-Host "Started: " -NoNewline; $started -join ', ' | Write-Host
} else {
    Write-Host "Started: none"
}
if ($skipped.Count -gt 0) {
    Write-Host "Skipped (already running): " -NoNewline; $skipped -join ', ' | Write-Host
} else {
    Write-Host "Skipped: none"
}
if ($failed.Count -gt 0) {
    Write-Host "Failed to start: " -NoNewline; $failed -join ', ' | Write-Host
    exit 3
}
Write-Host "All done."
exit 0
