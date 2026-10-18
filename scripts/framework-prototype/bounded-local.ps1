param(
  [Parameter(Mandatory=$true)][string]$Spec,
  [Parameter(Mandatory=$true)][string]$Node,
  [Parameter(Mandatory=$true)][string]$Output,
  [int]$Seconds = 1200,
  [ValidateRange(2,8)][int]$MemoryGiB = 6,
  [ValidateRange(1,3)][int]$CpuCores = 3
)
$ErrorActionPreference = 'Stop'
# The launcher waits for job assignment before it can spawn any work.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OrnigamiBuildJob {
 [StructLayout(LayoutKind.Sequential)] public struct Basic {
  public long ProcessTime, JobTime; public uint Flags; public UIntPtr Min, Max;
  public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling;
 }
 [StructLayout(LayoutKind.Sequential)] public struct Io { public ulong A,B,C,D,E,F; }
 [StructLayout(LayoutKind.Sequential)] public struct Extended {
  public Basic Limits; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
 }
 [StructLayout(LayoutKind.Sequential)] public struct Cpu { public uint Flags, Rate; }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr a,string name);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr j,int c,IntPtr p,uint s);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool QueryInformationJobObject(IntPtr j,int c,out Extended p,uint s,IntPtr r);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll")] public static extern bool TerminateJobObject(IntPtr j,uint e);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
 public static void Set<T>(IntPtr job,int cls,T value) {
  int n=Marshal.SizeOf(typeof(T)); IntPtr p=Marshal.AllocHGlobal(n);
  try { Marshal.StructureToPtr(value,p,false); if(!SetInformationJobObject(job,cls,p,(uint)n)) throw new System.ComponentModel.Win32Exception(); }
  finally { Marshal.FreeHGlobal(p); }
 }
}
'@
$outPath = [IO.Path]::GetFullPath($Output)
[IO.Directory]::CreateDirectory($outPath) | Out-Null
$specPath = [IO.Path]::GetFullPath($Spec)
$specConfig = Get-Content -LiteralPath $specPath -Raw | ConvertFrom-Json
$effectiveNodeOptions = '--max-old-space-size=4096'
if ($specConfig.env -and $specConfig.env.PSObject.Properties['NODE_OPTIONS']) { $effectiveNodeOptions = [string]$specConfig.env.NODE_OPTIONS }
$heapMatches = [regex]::Matches($effectiveNodeOptions, '(?:^|\s)--max-old-space-size(?:=|\s+)(\d+)(?=\s|$)')
$configuredHeapMiB = $null
if ($heapMatches.Count -gt 0) { $configuredHeapMiB = [int]$heapMatches[$heapMatches.Count - 1].Groups[1].Value }
$nodePath = (Resolve-Path -LiteralPath $Node).Path
$gatePath = Join-Path $outPath 'job-assigned'
if (Test-Path -LiteralPath $gatePath) { throw 'Use a new output directory for each attempt.' }
$initialOs = Get-CimInstance Win32_OperatingSystem
$initialFree = [long]$initialOs.FreePhysicalMemory * 1024
$initialDisk = (Get-PSDrive C).Free
if ($initialFree -lt (($MemoryGiB + 3) * 1GB)) { throw 'Admission requires job limit plus 3 GiB available physical memory.' }
if ($initialDisk -lt 40GB) { throw 'Admission requires at least 40 GiB free disk.' }
$logical = [Environment]::ProcessorCount
$cpuRate = [uint32][Math]::Floor(10000 * [Math]::Min($CpuCores,$logical) / $logical)
$job = [OrnigamiBuildJob]::CreateJobObject([IntPtr]::Zero,$null)
if ($job -eq [IntPtr]::Zero) { throw 'Cannot create bounded build job.' }
$limits = New-Object OrnigamiBuildJob+Extended
$limits.Limits.Flags = 0x2200 # JOB_MEMORY + KILL_ON_JOB_CLOSE
$limits.JobMemory = [UIntPtr]::new([uint64]($MemoryGiB * 1GB))
[OrnigamiBuildJob]::Set($job,9,$limits)
$cpu = New-Object OrnigamiBuildJob+Cpu
$cpu.Flags = 5 # ENABLE + HARD_CAP
$cpu.Rate = $cpuRate
[OrnigamiBuildJob]::Set($job,15,$cpu)
$started = [DateTime]::UtcNow
$stopReason = $null
$peak = 0L
$minimumFree = $initialFree
$peakDiskDelta = 0L
$process = $null
try {
 $launcher = Join-Path $PSScriptRoot 'bounded-launcher.mjs'
 $process = Start-Process -FilePath $nodePath -ArgumentList @('"'+$launcher+'"','"'+$specPath+'"','"'+$gatePath+'"','"'+$outPath+'"') -PassThru -WindowStyle Hidden
 if (![OrnigamiBuildJob]::AssignProcessToJobObject($job,$process.Handle)) { throw 'Job assignment failed; launcher remains gated.' }
 [IO.File]::WriteAllText($gatePath,'assigned')
 while (!$process.HasExited) {
  Start-Sleep -Milliseconds 500
  $info = New-Object OrnigamiBuildJob+Extended
  if (![OrnigamiBuildJob]::QueryInformationJobObject($job,9,[ref]$info,[Runtime.InteropServices.Marshal]::SizeOf($info),[IntPtr]::Zero)) { throw 'Cannot query job memory.' }
  $peak = [Math]::Max($peak,[long]$info.PeakJobMemory.ToUInt64())
  $free = [long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024
  $minimumFree = [Math]::Min($minimumFree,$free)
  $delta = $initialDisk - (Get-PSDrive C).Free
  $peakDiskDelta = [Math]::Max($peakDiskDelta,$delta)
  if ($free -lt 3GB) { $stopReason = 'available-system-memory-below-3GiB' }
  if ($delta -gt 20GB) { $stopReason = 'disk-growth-above-20GiB' }
  if (([DateTime]::UtcNow - $started).TotalSeconds -gt $Seconds) { $stopReason = 'wall-time-limit' }
  if ($stopReason) { [OrnigamiBuildJob]::TerminateJobObject($job,137) | Out-Null; break }
  $process.Refresh()
 }
 $process.WaitForExit()
 $process.Refresh()
 $exitCode = $process.ExitCode
} finally {
 $info = New-Object OrnigamiBuildJob+Extended
 if ([OrnigamiBuildJob]::QueryInformationJobObject($job,9,[ref]$info,[Runtime.InteropServices.Marshal]::SizeOf($info),[IntPtr]::Zero)) { $peak = [Math]::Max($peak,[long]$info.PeakJobMemory.ToUInt64()) }
 [OrnigamiBuildJob]::CloseHandle($job) | Out-Null
 if (!$process -or !$process.HasExited) { if ($process) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }; $stopReason = 'supervisor-failure' }
 $receipt = [ordered]@{
  startedAtUtc=$started.ToString('o'); endedAtUtc=[DateTime]::UtcNow.ToString('o');
  initialFreeBytes=$initialFree; minimumFreeBytes=$minimumFree;
  memoryLimitBytes=($MemoryGiB * 1GB); peakJobCommittedBytes=$peak; cpuLimitCores=$CpuCores; nodeHeapMiB=$configuredHeapMiB;
  nodeOptions=$effectiveNodeOptions; nodeHeapEvidence='configured NODE_OPTIONS; command-line overrides require separate assessment';
  wallLimitSeconds=$Seconds; durationSeconds=([DateTime]::UtcNow-$started).TotalSeconds;
  diskGrowthLimitBytes=20GB; observedSystemDiskGrowthPeakBytes=$peakDiskDelta;
  exitCode=$exitCode; stopReason=$stopReason;
  oomCounters='Linux cgroup OOM counters unavailable on Windows; hard job commit limit enforced. Nonzero exits require log review, not a zero-OOM claim.'
 }
 $receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outPath 'resources.json') -Encoding utf8
}
if ($stopReason) { throw "Bounded work stopped: $stopReason" }
if ($exitCode -ne 0) { throw "Bounded work failed with exit $exitCode; preserve logs." }
