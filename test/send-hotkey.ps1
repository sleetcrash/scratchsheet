# Injects the app's global hotkey (Ctrl+Alt+Space) at the OS level to toggle the window.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class KB {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
$VK_CONTROL = 0x11; $VK_MENU = 0x12; $VK_SPACE = 0x20; $KEYUP = 0x2
[KB]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
[KB]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
[KB]::keybd_event($VK_SPACE, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[KB]::keybd_event($VK_SPACE, 0, $KEYUP, [UIntPtr]::Zero)
[KB]::keybd_event($VK_MENU, 0, $KEYUP, [UIntPtr]::Zero)
[KB]::keybd_event($VK_CONTROL, 0, $KEYUP, [UIntPtr]::Zero)
