# Query cumulative device counters directly, without waiting for WMI/Perflib startup.
if (-not ('FfuDiskPerformance' -as [type])) {
	Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct FfuDiskCounters {
	public long BytesRead, BytesWritten, ReadTime, WriteTime, IdleTime;
	public uint ReadCount, WriteCount, QueueDepth, SplitCount;
	public long QueryTime;
	public uint StorageDeviceNumber;
	[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 8)]
	public string StorageManagerName;
}
public static class FfuDiskPerformance {
	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint mode, uint flags, IntPtr template);
	[DllImport("kernel32.dll", SetLastError = true)]
	static extern bool DeviceIoControl(SafeFileHandle handle, uint code, IntPtr input, uint inputSize, out FfuDiskCounters output, uint size, out uint returned, IntPtr overlapped);

	public static FfuDiskCounters Read(int number) {
		if (number < 0) throw new ArgumentException("Invalid disk number.");
		using (var handle = CreateFile(@"\\.\PhysicalDrive" + number, 0, 7, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
			if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
			FfuDiskCounters counters;
			uint returned;
			// IOCTL_DISK_PERFORMANCE: no data is read from or written to disk sectors.
			if (!DeviceIoControl(handle, 0x00070020, IntPtr.Zero, 0, out counters, (uint)Marshal.SizeOf(typeof(FfuDiskCounters)), out returned, IntPtr.Zero))
				throw new Win32Exception(Marshal.GetLastWin32Error());
			return counters;
		}
	}
}
'@
}
