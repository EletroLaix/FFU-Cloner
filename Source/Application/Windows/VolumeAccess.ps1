# The Storage cmdlets do not reliably report/offline EFI volumes on removable disks.
# Use the volume manager directly; never infer isolation from a missing drive letter.
if (-not ('FfuVolume' -as [type])) {
	Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class FfuVolume {
	const uint DismountVolume = 0x00090020;
	const uint VolumeOffline = 0x0056C00C;
	const uint VolumeIsOffline = 0x00560010;

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint mode, uint flags, IntPtr template);
	[DllImport("kernel32.dll", SetLastError = true)]
	static extern bool DeviceIoControl(SafeFileHandle handle, uint code, IntPtr input, uint inputSize, IntPtr output, uint outputSize, out uint returned, IntPtr overlapped);

	static SafeFileHandle Open(string path, uint access) {
		if (!System.Text.RegularExpressions.Regex.IsMatch(path, @"^\\\\\?\\Volume\{[0-9a-fA-F-]{36}\}\\$"))
			throw new ArgumentException("Invalid volume GUID path.");
		var handle = CreateFile(path.TrimEnd('\\'), access, 7, IntPtr.Zero, 3, 0, IntPtr.Zero);
		if (handle.IsInvalid) {
			int error = Marshal.GetLastWin32Error();
			handle.Dispose();
			throw new Win32Exception(error, "Cannot open volume " + path);
		}
		return handle;
	}
	static bool Control(SafeFileHandle handle, uint code) {
		uint returned;
		return DeviceIoControl(handle, code, IntPtr.Zero, 0, IntPtr.Zero, 0, out returned, IntPtr.Zero);
	}
	public static bool IsOffline(string path) {
		using (var handle = Open(path, 0)) return Control(handle, VolumeIsOffline);
	}
	public static void Offline(string path) {
		using (var handle = Open(path, 0xC0000000)) {
			if (Control(handle, VolumeIsOffline)) return;
			if (!Control(handle, DismountVolume)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot dismount " + path);
			if (!Control(handle, VolumeOffline)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot offline " + path);
			if (!Control(handle, VolumeIsOffline)) throw new InvalidOperationException("Volume is still online: " + path);
		}
	}
}
'@
}
