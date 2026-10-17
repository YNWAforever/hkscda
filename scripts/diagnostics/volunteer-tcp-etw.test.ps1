$ErrorActionPreference = 'Stop'
$fakeSource = @'
public sealed class FakeTrace : Hkscda.TcpPilot.ITraceDriver {
    public uint StartStatus, EnableStatus, StopStatus;
    public int Starts, Enables, Stops, Waits;
    public long Now, Bytes;
    public bool Requested;
    public ulong StoppedHandle;
    public uint Start(out ulong handle) { Starts++; handle=123; return StartStatus; }
    public uint Enable(ulong handle) { Enables++; return EnableStatus; }
    public uint Stop(ulong handle) { Stops++; StoppedHandle=handle; return StopStatus; }
    public long ElapsedMilliseconds { get { return Now; } }
    public long FileBytes { get { return Bytes; } }
    public bool StopRequested { get { return Requested; } }
    public void Wait() { Waits++; Now+=1000; }
}
'@
Add-Type -TypeDefinition ((Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'volunteer-tcp-etw.cs')) + $fakeSource)
function Assert-True([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
}
$failures = @()
function Test-Case([string]$Name, [scriptblock]$Body) {
    try { & $Body; Write-Output "PASS $Name" } catch {
        $script:failures += $Name
        Write-Output "FAIL $Name : $($_.Exception.Message)"
    }
}
Test-Case 'the native event filter includes exactly the nine approved IDs' {
    $bytes = [Hkscda.TcpPilot.Scope]::InclusionFilter()
    Assert-True ($bytes.Length -eq 22) 'Expected 22-byte inclusion filter'
    Assert-True ($bytes[0] -eq 1 -and $bytes[1] -eq 0) 'Must FilterIn, no reserved flags'
    Assert-True ([BitConverter]::ToUInt16($bytes, 2) -eq 9) 'Expected nine IDs'
    $actual = for ($i=4; $i -lt 22; $i+=2) { [BitConverter]::ToUInt16($bytes, $i) }
    Assert-True (($actual -join ',') -eq '1033,1073,1074,1156,1157,1158,1171,1175,1178') 'Unexpected event scope'
}
Test-Case 'an unsupported filter stops the owned session and never announces ready' {
    $driver = [FakeTrace]::new(); $driver.EnableStatus = 87
    $script:readyCalls = 0
    try { [void][Hkscda.TcpPilot.Capture]::Run($driver, { $script:readyCalls++ }) } catch {}
    Assert-True ($driver.Stops -eq 1 -and $driver.StoppedHandle -eq 123) 'Session leaked when event-ID filter failed'
    Assert-True ($script:readyCalls -eq 0 -and $driver.Enables -eq 1) 'No ready or unfiltered fallback is permitted'
}
Test-Case 'timeout stops without waiting for workload completion' {
    $driver = [FakeTrace]::new()
    $result = [Hkscda.TcpPilot.Capture]::Run($driver, {})
    Assert-True ($driver.Stops -eq 1 -and $driver.Waits -eq 19) 'Expected bounded timeout and stop'
    Assert-True ($result.Reason -eq 'deadline' -and $result.ElapsedMilliseconds -eq 19000) 'Incorrect deadline receipt'
}
Test-Case 'size budget stops early with final-buffer headroom' {
    $driver = [FakeTrace]::new(); $driver.Bytes = 30*1024*1024
    $result = [Hkscda.TcpPilot.Capture]::Run($driver, {})
    Assert-True ($driver.Stops -eq 1 -and $driver.Waits -eq 0 -and $result.Reason -eq 'size') 'Size limit was ignored'
}
Test-Case 'completed workload stops immediately' {
    $driver = [FakeTrace]::new(); $driver.Requested = $true
    $result = [Hkscda.TcpPilot.Capture]::Run($driver, {})
    Assert-True ($driver.Stops -eq 1 -and $result.Reason -eq 'workload') 'Completion marker was ignored'
}
Test-Case 'an exception after enable still stops only its own session' {
    $driver = [FakeTrace]::new()
    try { [void][Hkscda.TcpPilot.Capture]::Run($driver, { throw 'ready write failed' }) } catch {}
    Assert-True ($driver.Stops -eq 1 -and $driver.StoppedHandle -eq 123) 'Exception leaked owned session'
}
Test-Case 'start failure never enables or stops another session' {
    $driver = [FakeTrace]::new(); $driver.StartStatus = 5
    try { [void][Hkscda.TcpPilot.Capture]::Run($driver, {}) } catch {}
    Assert-True ($driver.Starts -eq 1 -and $driver.Enables -eq 0 -and $driver.Stops -eq 0) 'Start failure touched a session'
}
Test-Case 'an exhausted startup budget never enables the provider' {
    $driver = [FakeTrace]::new(); $driver.Now = 19000
    try { [void][Hkscda.TcpPilot.Capture]::Run($driver, {}) } catch {}
    Assert-True ($driver.Enables -eq 0 -and $driver.Stops -eq 1) 'Provider enabled after the capture deadline'
}
Test-Case 'native properties enforce QPC, capped sequential files and no stack or kernel flags without starting' {
    $dir = Join-Path ([IO.Path]::GetTempPath()) ('hkscda-abi-' + [Guid]::NewGuid())
    $driver = [Hkscda.TcpPilot.NativeTraceDriver]::new(('HKSCDA-Tcp-' + [Guid]::NewGuid()),
        (Join-Path $dir 'raw.etl'), (Join-Path $dir 'stop.json'))
    try {
        $p = $driver.PlannedProperties
        Assert-True ($p.Wnode.ClientContext -eq 1 -and $p.Wnode.Flags -eq 0x20000) 'QPC traced GUID required'
        Assert-True ($p.LogFileMode -eq 0x10000001 -and $p.MaximumFileSize -eq 30) 'Sequential 30 MiB cap required'
        Assert-True ($p.EnableFlags -eq 0 -and $p.MaximumBuffers -eq 8 -and $p.BufferSize -eq 64) 'Unexpected kernel flags or buffers'
        Assert-True (!$driver.Started -and !$driver.Enabled) 'Construction must not start capture'
    } finally { $driver.Dispose() }
}
if ($failures.Count) { throw "$($failures.Count) collector safety tests failed (no ETW session was started)" }
Write-Output 'All collector safety tests passed; no ETW session was started.'
