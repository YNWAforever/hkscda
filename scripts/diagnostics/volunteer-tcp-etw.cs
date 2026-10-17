// Local, explicitly approved diagnostic only. This file does not run a session on load.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Globalization;

namespace Hkscda.TcpPilot
{
    public interface ITraceDriver
    {
        uint Start(out ulong handle);
        uint Enable(ulong handle);
        uint Stop(ulong handle);
        long ElapsedMilliseconds { get; }
        long FileBytes { get; }
        bool StopRequested { get; }
        void Wait();
    }

    public sealed class CaptureResult
    {
        public uint StartCode, EnableCode, StopCode;
        public bool Started, Enabled, Stopped;
        public long ElapsedMilliseconds;
        public string Reason;
    }

    public static class Scope
    {
        public static bool IsReadinessFresh(object timestamp, DateTimeOffset now)
        {
            DateTimeOffset parsed;
            if (timestamp is DateTimeOffset)
                parsed = (DateTimeOffset)timestamp;
            else if (timestamp is DateTime)
            {
                var date = (DateTime)timestamp;
                if (date.Kind == DateTimeKind.Unspecified) return false;
                parsed = new DateTimeOffset(date);
            }
            else if (!(timestamp is string) || !DateTimeOffset.TryParse((string)timestamp,
                CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed))
                return false;
            double age = (now - parsed).TotalSeconds;
            return age >= 0 && age <= 120;
        }
        public static readonly Guid Provider = new Guid("2f07e2ee-15db-40f1-90ef-9d7ba282188a");
        public static readonly ushort[] EventIds = { 1033, 1073, 1074, 1156, 1157, 1158, 1171, 1175, 1178 };
        public const ulong Keywords = 0x700000000;
        public const uint EventIdFilter = 0x80000200;
        public const long StopAfterMilliseconds = 19000; // one second safety margin within the approved 20s
        public const long StopAtBytes = 30L * 1024 * 1024; // leave room for final buffers within 32 MiB
        public static byte[] InclusionFilter()
        {
            var bytes = new byte[4 + EventIds.Length * 2];
            bytes[0] = 1;
            Array.Copy(BitConverter.GetBytes((ushort)EventIds.Length), 0, bytes, 2, 2);
            for (int i = 0; i < EventIds.Length; i++)
                Array.Copy(BitConverter.GetBytes(EventIds[i]), 0, bytes, 4 + 2 * i, 2);
            return bytes;
        }
        public static bool CaptureComplete(bool enabled, bool stopped, double elapsedMs, long fileBytes, TraceProperties statistics)
        {
            return enabled && stopped && elapsedMs > 0 && elapsedMs <= 20000 &&
                fileBytes > 0 && fileBytes <= 32L * 1024 * 1024 &&
                statistics.EventsLost == 0 && statistics.LogBuffersLost == 0 && statistics.RealTimeBuffersLost == 0;
        }
    }

    public static class Capture
    {
        public static CaptureResult Run(ITraceDriver driver, Action ready)
        {
            ulong handle;
            var result = new CaptureResult();
            result.StartCode = driver.Start(out handle);
            result.Started = result.StartCode == 0;
            if (!result.Started) throw new InvalidOperationException("StartTrace: " + result.StartCode);
            try
            {
                if (driver.ElapsedMilliseconds >= Scope.StopAfterMilliseconds)
                    throw new TimeoutException("Startup exhausted the capture deadline; no provider enabled");
                result.EnableCode = driver.Enable(handle);
                if (result.EnableCode != 0)
                    throw new InvalidOperationException("EnableTraceEx2 with required event-ID inclusion filter: " + result.EnableCode);
                result.Enabled = true;
                ready();
                while (true)
                {
                    if (driver.ElapsedMilliseconds >= Scope.StopAfterMilliseconds) { result.Reason = "deadline"; break; }
                    if (driver.FileBytes >= Scope.StopAtBytes) { result.Reason = "size"; break; }
                    if (driver.StopRequested) { result.Reason = "workload"; break; }
                    driver.Wait();
                }
                return result;
            }
            finally
            {
                result.StopCode = driver.Stop(handle);
                result.Stopped = result.StopCode == 0;
                result.ElapsedMilliseconds = driver.ElapsedMilliseconds;
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct WnodeHeader
    {
        public uint BufferSize, ProviderId;
        public ulong HistoricalContext;
        public long TimeStamp;
        public Guid Guid;
        public uint ClientContext, Flags;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct TraceProperties
    {
        public WnodeHeader Wnode;
        public uint BufferSize, MinimumBuffers, MaximumBuffers, MaximumFileSize, LogFileMode, FlushTimer, EnableFlags;
        public int AgeLimit;
        public uint NumberOfBuffers, FreeBuffers, EventsLost, BuffersWritten, LogBuffersLost, RealTimeBuffersLost;
        public IntPtr LoggerThreadId;
        public uint LogFileNameOffset, LoggerNameOffset;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct FilterDescriptor
    {
        public ulong Ptr;
        public uint Size, Type;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct EnableParameters
    {
        public uint Version, EnableProperty, ControlFlags;
        public Guid SourceId;
        public IntPtr EnableFilterDesc;
        public uint FilterDescCount;
    }

    // Uses the Windows SDK 10.0.26100.0 ABI. Never enables on construction or in tests.
    public sealed class NativeTraceDriver : ITraceDriver, IDisposable
    {
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, EntryPoint = "StartTraceW")]
        private static extern uint StartTrace(out ulong handle, string name, IntPtr properties);
        [DllImport("advapi32.dll")]
        private static extern uint EnableTraceEx2(ulong handle, ref Guid provider, uint control, byte level,
            ulong anyKeyword, ulong allKeyword, uint timeout, ref EnableParameters parameters);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, EntryPoint = "ControlTraceW")]
        private static extern uint ControlTrace(ulong handle, string name, IntPtr properties, uint control);

        private readonly string name, etl, stopFile;
        private readonly IntPtr properties;
        private readonly Stopwatch clock = new Stopwatch();
        private readonly object gate = new object();
        private ulong ownedHandle;
        private Timer watchdog;
        private bool disposed;
        public uint StartCode, EnableCode, StopCode = UInt32.MaxValue;
        public bool Started, Enabled, Stopped, WatchdogStopped;
        public long StartQpc, StopQpc, StartUtcTicks, StopUtcTicks;
        public static long QpcFrequency { get { return Stopwatch.Frequency; } }
        public TraceProperties FinalProperties;

        public NativeTraceDriver(string sessionName, string etlPath, string stopPath)
        {
            if (IntPtr.Size != 8 || Marshal.SizeOf(typeof(WnodeHeader)) != 48 ||
                Marshal.SizeOf(typeof(TraceProperties)) != 120 ||
                Marshal.SizeOf(typeof(EnableParameters)) != 48 ||
                Marshal.SizeOf(typeof(FilterDescriptor)) != 16)
                throw new InvalidOperationException("Unsupported ETW ABI; no capture");
            Guid id;
            if (!sessionName.StartsWith("HKSCDA-Tcp-", StringComparison.Ordinal) ||
                !Guid.TryParse(sessionName.Substring(11), out id))
                throw new ArgumentException("A unique owned UUID session is required");
            if (!Path.IsPathFullyQualified(etlPath) || File.Exists(etlPath) || !Path.IsPathFullyQualified(stopPath))
                throw new ArgumentException("Fresh absolute local output paths are required");
            name = sessionName; etl = etlPath; stopFile = stopPath;
            int size = Marshal.SizeOf(typeof(TraceProperties));
            byte[] logger = Encoding.Unicode.GetBytes(name + "\0"), file = Encoding.Unicode.GetBytes(etl + "\0");
            var p = new TraceProperties {
                Wnode = new WnodeHeader { BufferSize = (uint)(size + logger.Length + file.Length),
                    Guid = id, ClientContext = 1, Flags = 0x00020000 },
                BufferSize = 64, MinimumBuffers = 2, MaximumBuffers = 8,
                MaximumFileSize = 30, LogFileMode = 0x10000001, FlushTimer = 1,
                LoggerNameOffset = (uint)size, LogFileNameOffset = (uint)(size + logger.Length)
            };
            properties = Marshal.AllocHGlobal((int)p.Wnode.BufferSize);
            Marshal.Copy(new byte[p.Wnode.BufferSize], 0, properties, (int)p.Wnode.BufferSize);
            Marshal.StructureToPtr(p, properties, false);
            Marshal.Copy(logger, 0, IntPtr.Add(properties, size), logger.Length);
            Marshal.Copy(file, 0, IntPtr.Add(properties, size + logger.Length), file.Length);
        }

        public TraceProperties PlannedProperties { get { return Marshal.PtrToStructure<TraceProperties>(properties); } }
        public long ElapsedMilliseconds { get { return clock.ElapsedMilliseconds; } }
        public long FileBytes { get { return File.Exists(etl) ? new FileInfo(etl).Length : 0; } }
        public bool StopRequested { get { return File.Exists(stopFile) || Stopped; } }
        public void Wait() { Thread.Sleep(10); }
        public uint Start(out ulong handle)
        {
            if (disposed) throw new ObjectDisposedException("NativeTraceDriver");
            if (Started || clock.IsRunning) throw new InvalidOperationException("One attempt only");
            StartUtcTicks = DateTime.UtcNow.Ticks; StartQpc = Stopwatch.GetTimestamp(); clock.Start();
            StartCode = StartTrace(out handle, name, properties);
            if (StartCode != 0) return StartCode;
            ownedHandle = handle; Started = true;
            watchdog = new Timer(delegate {
                WatchdogStopped = true; Stop(ownedHandle);
            }, null, (int)Math.Max(1, Scope.StopAfterMilliseconds - clock.ElapsedMilliseconds), Timeout.Infinite);
            return StartCode;
        }
        public uint Enable(ulong handle)
        {
            lock (gate)
            {
                if (!Started || handle != ownedHandle || Stopped) throw new InvalidOperationException("No owned session");
                if (clock.ElapsedMilliseconds >= Scope.StopAfterMilliseconds)
                    throw new TimeoutException("Refuse to enable after the capture deadline");
                byte[] bytes = Scope.InclusionFilter();
                IntPtr data = Marshal.AllocHGlobal(bytes.Length), descriptor = Marshal.AllocHGlobal(16);
                try
                {
                    Marshal.Copy(bytes, 0, data, bytes.Length);
                    Marshal.StructureToPtr(new FilterDescriptor { Ptr = (ulong)data.ToInt64(),
                        Size = (uint)bytes.Length, Type = Scope.EventIdFilter }, descriptor, false);
                    var parameters = new EnableParameters { Version = 2, SourceId = Guid.NewGuid(),
                        EnableFilterDesc = descriptor, FilterDescCount = 1, EnableProperty = 0, ControlFlags = 0 };
                    Guid provider = Scope.Provider;
                    EnableCode = EnableTraceEx2(handle, ref provider, 1, 5, Scope.Keywords, 0, 1000, ref parameters);
                    Enabled = EnableCode == 0;
                    return EnableCode;
                }
                finally { Marshal.FreeHGlobal(descriptor); Marshal.FreeHGlobal(data); }
            }
        }
        public uint Stop(ulong handle)
        {
            lock (gate)
            {
                // A queued watchdog callback can run after Timer.Dispose.
                // Never pass freed properties to ControlTrace in that case.
                if (disposed) return StopCode;
                if (!Started || handle != ownedHandle) throw new InvalidOperationException("Refuse to stop unowned session");
                if (Stopped) return StopCode;
                StopCode = ControlTrace(handle, null, properties, 1);
                Stopped = StopCode == 0;
                StopQpc = Stopwatch.GetTimestamp(); StopUtcTicks = DateTime.UtcNow.Ticks;
                FinalProperties = Marshal.PtrToStructure<TraceProperties>(properties);
                return StopCode;
            }
        }
        public void Dispose()
        {
            if (watchdog != null) watchdog.Dispose();
            lock (gate)
            {
                if (disposed) return;
                if (Started && !Stopped) Stop(ownedHandle);
                disposed = true;
                Marshal.FreeHGlobal(properties);
            }
        }
    }
}
