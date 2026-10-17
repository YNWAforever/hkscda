<#
One explicitly approved local TCPIP metadata pilot. Does not elevate itself.
Validate is read-only and never calls StartTrace. Capture requires a separate
administrator process; the workload remains an ordinary-user process.
Raw ETL and its unfiltered decoded metadata must stay in .local-policy-test.
#>
[CmdletBinding()]
param(
    [ValidateSet('Validate','Capture','Decode')][string]$Mode = 'Validate',
    [Parameter(Mandatory)][string]$Directory
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$privateRoot = [IO.Path]::GetFullPath((Join-Path $repo '.local-policy-test'))
$captureDir = [IO.Path]::GetFullPath($Directory)
if (!$captureDir.StartsWith($privateRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Output must stay inside this worktree .local-policy-test'
}
$ancestor = $captureDir
while ($ancestor.Length -ge $repo.Length) {
    if ((Test-Path -LiteralPath $ancestor) -and
        ((Get-Item -Force -LiteralPath $ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Refuse output through a reparse point'
    }
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
}
if (!(Test-Path -LiteralPath $captureDir)) { throw 'Ordinary-user coordinator must create the private directory first' }
$session = 'HKSCDA-Tcp-' + [IO.Path]::GetFileName($captureDir)
$captureId = [Guid]::Empty
if (![Guid]::TryParse([IO.Path]::GetFileName($captureDir), [ref]$captureId)) { throw 'Capture directory must be a UUID' }
Add-Type -Path (Join-Path $PSScriptRoot 'volunteer-tcp-etw.cs')
$ids = @(1033,1073,1074,1156,1157,1158,1171,1175,1178)
function Write-Receipt([string]$Name, $Value) {
    $path = Join-Path $captureDir $Name
    $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath ($path + '.tmp') -Encoding utf8NoBOM
    Move-Item -LiteralPath ($path + '.tmp') -Destination $path
}
if ($Mode -eq 'Decode') {
    # ETL remains local; decoding cannot expand the original capture.
    $etl = Join-Path $captureDir 'raw.etl'
    if ((Get-Item -LiteralPath $etl).Length -gt 32MB) { throw 'ETL exceeded approved cap; retain without exporting' }
    $captureReceipt = Get-Content -Raw -LiteralPath (Join-Path $captureDir 'collector-receipt.json') | ConvertFrom-Json
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $etl).Hash.ToLowerInvariant() -cne $captureReceipt.etlSha256) {
        throw 'Raw ETL differs from the owned collector receipt'
    }
    $writer = [IO.StreamWriter]::new((Join-Path $captureDir 'metadata-private.jsonl'), $false, [Text.UTF8Encoding]::new($false))
    $counts = @{}; $unexpected = 0; $total = 0
    try {
        Get-WinEvent -Path $etl -Oldest -ErrorAction Stop | ForEach-Object {
            if ($_.ProviderId -eq [Hkscda.TcpPilot.Scope]::Provider) {
                if ($ids -notcontains $_.Id) { $unexpected++; throw 'Unexpected TCPIP event ID; do not export' }
                [xml]$xml = $_.ToXml()
                $data = [ordered]@{}
                foreach ($field in $xml.Event.EventData.Data) { $data[[string]$field.Name] = [string]$field.'#text' }
                $row = [ordered]@{ id=$_.Id; version=$_.Version; utcTicks=$_.TimeCreated.ToUniversalTime().Ticks;
                    headerPid=$_.ProcessId; threadId=$_.ThreadId; data=$data }
                $writer.WriteLine(($row | ConvertTo-Json -Compress -Depth 8))
                $total++; $key = [string]$_.Id
                if (!$counts.ContainsKey($key)) { $counts[$key]=0 }; $counts[$key]++
            }
        }
    } finally { $writer.Dispose() }
    Write-Receipt 'decode-receipt.json' @{ events=$total; counts=$counts; unexpected=$unexpected; rawStaysLocal=$true;
        captureTransportComplete=($captureReceipt.complete -eq $true); correlationVerified=$false }
    return
}
$provider = Get-WinEvent -ListProvider 'Microsoft-Windows-TCPIP'
if ($provider.Id -ne [Hkscda.TcpPilot.Scope]::Provider) { throw 'Provider GUID mismatch' }
$events = @($provider.Events | Where-Object { $ids -contains $_.Id } | Sort-Object Id,Version)
$expectedFile = Join-Path $privateRoot 'perf-5ed-residual-20261017/continuation-preflight/tcpip-event-schema.json'
$expected = (Get-Content -Raw -LiteralPath $expectedFile | ConvertFrom-Json).events | Sort-Object id,version
if ($events.Count -ne 11 -or $expected.Count -ne 11) { throw 'Expected all 11 approved event schema versions' }
$schemas = for ($i=0; $i -lt $events.Count; $i++) {
    $event = $events[$i]; $baseline = $expected[$i]
    if ($event.Id -ne $baseline.id -or $event.Version -ne $baseline.version -or $event.Template -cne $baseline.template) {
        throw "Schema drift for $($event.Id)/$($event.Version); no capture"
    }
    [xml]$template = $event.Template
    foreach ($field in $template.template.data) {
        $numeric = @('win:UInt32','win:UInt64','win:Pointer') -contains [string]$field.inType
        $address = $field.inType -eq 'win:Binary' -and $field.outType -eq 'win:SocketAddress' -and
            @('LocalAddress','RemoteAddress') -contains [string]$field.name
        if (!$numeric -and !$address) { throw 'Unapproved string, binary payload or field type; no capture' }
    }
    @{ id=$event.Id; version=$event.Version; template=$event.Template }
}
$schemaJson = $schemas | ConvertTo-Json -Depth 12 -Compress
$schemaHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($schemaJson))).ToLowerInvariant()
$validation = @{ at=[DateTime]::UtcNow.ToString('o'); provider=[string]$provider.Id; events=$ids;
    versions=$events.Count; schemaHash=$schemaHash; filterType='0x80000200'; filterIn=$true;
    filterBytes=[Convert]::ToHexString([Hkscda.TcpPilot.Scope]::InclusionFilter()); keywords='0x700000000';
    qpcFrequency=[Hkscda.TcpPilot.NativeTraceDriver]::QpcFrequency; maxSeconds=20; internalDeadlineSeconds=19;
    maxBytes=32MB; sequentialFileCapBytes=30MB; noStack=$true; noHttpPayload=$true; noFileIO=$true; mode=$Mode }
if ($Mode -eq 'Validate') {
    Write-Receipt ('validation-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '.json') $validation
    $validation | ConvertTo-Json -Depth 8
    return
}
$admin = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (!$admin) { throw 'Capture requires an explicitly launched administrator collector; no self elevation' }
if (Test-Path -LiteralPath (Join-Path $captureDir 'stop.json')) { throw 'Stop marker already exists; no capture' }
$workloadProof = Get-Content -Raw -LiteralPath (Join-Path $captureDir 'ordinary-user-ready.json') | ConvertFrom-Json
if ($workloadProof.admin -ne $false -or $workloadProof.cohort.admin -ne 408 -or
    ![Hkscda.TcpPilot.Scope]::IsReadinessFresh($workloadProof.at, [DateTimeOffset]::UtcNow)) {
    throw 'Fresh ordinary-user workload and fixed cohort proof are required'
}
$prepared = Get-Content -Raw -LiteralPath (Join-Path $captureDir 'prepared.json') | ConvertFrom-Json
foreach ($source in $prepared.collectorSources) {
    if (@('scripts/diagnostics/volunteer-tcp-etw.cs','scripts/diagnostics/volunteer-tcp-etw.ps1') -notcontains $source.file) {
        throw 'Unexpected prepared collector source'
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $source.file)).Hash.ToLowerInvariant() -cne $source.sha256) {
        throw 'Collector source changed after preparation; no capture'
    }
}
if ($prepared.collectorSources.Count -ne 2) { throw 'Both collector source seals are required' }
# CreateNew is the one-shot guard. Capture errors do not permit automatic retry.
$once = [IO.File]::Open((Join-Path $captureDir 'attempt-once.json'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($validation | ConvertTo-Json -Depth 8))
    $once.Write($bytes,0,$bytes.Length)
} finally { $once.Dispose() }
Write-Receipt 'schema.json' @{ provider=[string]$provider.Id; hash=$schemaHash; events=$schemas }
$driver = [Hkscda.TcpPilot.NativeTraceDriver]::new($session, (Join-Path $captureDir 'raw.etl'), (Join-Path $captureDir 'stop.json'))
$result = $null; $failure = $null
try {
    $result = [Hkscda.TcpPilot.Capture]::Run($driver, {
        Write-Receipt 'ready.json' @{ session=$session; collectorPid=$PID; admin=$true;
            startQpc=$driver.StartQpc; startUtcTicks=$driver.StartUtcTicks; qpcFrequency=[Hkscda.TcpPilot.NativeTraceDriver]::QpcFrequency;
            filterEnabled=$driver.Enabled; at=[DateTime]::UtcNow.ToString('o') }
    })
} catch { $failure = $_.Exception.ToString() }
finally {
    $driver.Dispose()
    $etl = Join-Path $captureDir 'raw.etl'; $fileBytes = 0; $hash = $null
    if (Test-Path -LiteralPath $etl) {
        $fileBytes = (Get-Item -LiteralPath $etl).Length; $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $etl).Hash.ToLowerInvariant()
    }
    $durationMs = if ($driver.Stopped) { ($driver.StopQpc-$driver.StartQpc)*1000.0/[Hkscda.TcpPilot.NativeTraceDriver]::QpcFrequency } else { $null }
    $stats = $driver.FinalProperties
    $complete = !$failure -and $null -ne $durationMs -and [Hkscda.TcpPilot.Scope]::CaptureComplete(
        $driver.Enabled,$driver.Stopped,$durationMs,$fileBytes,$stats)
    Write-Receipt 'collector-receipt.json' @{ session=$session; admin=$admin; startCode=$driver.StartCode; enableCode=$driver.EnableCode;
        stopCode=$driver.StopCode; started=$driver.Started; enabled=$driver.Enabled; stopped=$driver.Stopped;
        startQpc=$driver.StartQpc; stopQpc=$driver.StopQpc; startUtcTicks=$driver.StartUtcTicks; stopUtcTicks=$driver.StopUtcTicks;
        qpcFrequency=[Hkscda.TcpPilot.NativeTraceDriver]::QpcFrequency; durationMs=$durationMs; result=$result;
        watchdogStopped=$driver.WatchdogStopped; eventsLost=$stats.EventsLost; logBuffersLost=$stats.LogBuffersLost;
        realtimeBuffersLost=$stats.RealTimeBuffersLost; buffersWritten=$stats.BuffersWritten; bufferCount=$stats.NumberOfBuffers;
        etlBytes=$fileBytes; etlSha256=$hash; failure=$failure; rawStaysLocal=$true;
        complete=$complete; completeScope='bounded stopped collector transport with no reported lost events; excludes workload, decoded event scope and flow correlation';
        withinLimits=($null -ne $durationMs -and $durationMs -le 20000 -and $fileBytes -le 32MB) }
}
if (!$complete) { throw 'Capture incomplete; inspect the private receipt; no retry' }
