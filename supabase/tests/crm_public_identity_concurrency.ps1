param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

$uri = [Uri]$DatabaseUrl
if ($uri.Scheme -notin @("postgres", "postgresql") -or $uri.Host -notin @("localhost", "127.0.0.1", "::1")) {
  throw "Refusing CRM concurrency test against a non-local PostgreSQL URL"
}
$routingKeys = @("host", "hostaddr", "service")
$query = [Web.HttpUtility]::ParseQueryString($uri.Query)
if ($routingKeys | Where-Object { $query[$_] }) {
  throw "Refusing CRM concurrency test with libpq routing overrides"
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw "psql is required" }

$builder = [UriBuilder]$uri
$builder.Host = "127.0.0.1"
$builder.Query = ""
$localUrl = $builder.Uri.AbsoluteUri
$email = "crm-concurrent-$([guid]::NewGuid().ToString('N'))@example.invalid"
$files = 1..5 | ForEach-Object { [IO.Path]::GetTempFileName() }

function Start-LocalPsql([string]$sqlFile, [string]$stdoutFile, [string]$stderrFile) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = "psql"
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($key in @("PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE")) { $start.Environment.Remove($key) }
  $start.ArgumentList.Add($localUrl)
  $start.ArgumentList.Add("-v")
  $start.ArgumentList.Add("ON_ERROR_STOP=1")
  $start.ArgumentList.Add("-f")
  $start.ArgumentList.Add($sqlFile)
  $process = [Diagnostics.Process]::Start($start)
  return @{ Process = $process; Out = $stdoutFile; Err = $stderrFile }
}

try {
  Set-Content -LiteralPath $files[0] -Value "select public.resolve_public_supporter_identity(jsonb_build_object('name','Claim A','email','$email','phone','11111111','language','en','source','donation_form'));"
  Set-Content -LiteralPath $files[1] -Value "select public.resolve_public_supporter_identity(jsonb_build_object('name','Claim B','email','$email','phone','22222222','language','zh-HK','source','volunteer_registration_form'));"
  $a = Start-LocalPsql $files[0] $files[2] "$($files[2]).err"
  $b = Start-LocalPsql $files[1] $files[3] "$($files[3]).err"
  foreach ($run in @($a, $b)) {
    $run.Process.WaitForExit()
    Set-Content -LiteralPath $run.Out -Value $run.Process.StandardOutput.ReadToEnd()
    Set-Content -LiteralPath $run.Err -Value $run.Process.StandardError.ReadToEnd()
    if ($run.Process.ExitCode -ne 0) { throw "A concurrent identity claim failed" }
  }
  Set-Content -LiteralPath $files[4] -Value "do `$`$ declare n int; begin select count(*) into n from public.supporter where email='$email'; if n <> 1 then raise exception 'expected one supporter, got %', n; end if; end `$`$; delete from public.supporter where email='$email';"
  $verify = Start-LocalPsql $files[4] "$($files[4]).out" "$($files[4]).err"
  $verify.Process.WaitForExit()
  if ($verify.Process.ExitCode -ne 0) { throw "Concurrent identity invariant failed" }
} finally {
  $cleanup = @($files) + ($files | ForEach-Object { "$_.err" }) + @("$($files[4]).out")
  Remove-Item -LiteralPath $cleanup -ErrorAction SilentlyContinue
}
