# Windows helper for the kiosk launcher (launcher.ts), which starts it attached to its own console window.
# Started with -ParentPid <launcher pid>; runs until the launcher exits, then undoes its changes.
# - Removes the console window's close button and hides it: closing it would end the launcher (the watchdog).
# - Blocks Alt+Tab, Alt+F4, Alt+Esc, Alt+Space, the Windows keys, Ctrl+Esc and Ctrl+Shift+Esc with a low-level
#   keyboard hook (on its own thread with a message loop); Windows removes the hook when this process exits.
#   Ctrl+Alt+Del can't be blocked by any program.
# - Switches off the Sticky/Filter/Toggle Keys shortcuts (Shift x5, holding right Shift, holding Num Lock), whose
#   popups link to Settings, for this session only (not saved), and restores them on exit.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
param([Parameter(Mandatory = $true)][int]$ParentPid)

try {
  Add-Type -Namespace Kiosk -Name Win -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern IntPtr GetSystemMenu(IntPtr hWnd, bool bRevert);
[DllImport("user32.dll")] public static extern bool DeleteMenu(IntPtr hMenu, uint uPosition, uint uFlags);
'@
} catch {}

try {
  Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class KioskKeys {
  delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr extraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, HookProc fn, IntPtr hMod, uint threadId);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

  // STICKYKEYS and TOGGLEKEYS share this layout.
  [StructLayout(LayoutKind.Sequential)] struct KEYSFLAGS { public uint cbSize, dwFlags; }
  [StructLayout(LayoutKind.Sequential)] struct FILTERKEYS { public uint cbSize, dwFlags, iWaitMSec, iDelayMSec, iRepeatMSec, iBounceMSec; }
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, ref KEYSFLAGS v, uint winIni);
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, ref FILTERKEYS v, uint winIni);
  const uint SPI_GETFILTERKEYS = 0x32, SPI_SETFILTERKEYS = 0x33, SPI_GETTOGGLEKEYS = 0x34, SPI_SETTOGGLEKEYS = 0x35;
  const uint SPI_GETSTICKYKEYS = 0x3A, SPI_SETSTICKYKEYS = 0x3B;
  const uint HOTKEYACTIVE = 0x4, CONFIRMHOTKEY = 0x8; // same bit for SKF_/FKF_/TKF_
  static KEYSFLAGS sticky, toggle;
  static FILTERKEYS filter;
  static bool saved;

  const int WH_KEYBOARD_LL = 13;
  const uint LLKHF_ALTDOWN = 0x20;
  const uint VK_TAB = 0x09, VK_ESCAPE = 0x1B, VK_SPACE = 0x20, VK_F4 = 0x73, VK_LWIN = 0x5B, VK_RWIN = 0x5C;
  static readonly HookProc proc = OnKey; // kept in a field so the GC doesn't collect the callback
  static IntPtr hook;

  static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

  static IntPtr OnKey(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      KBDLLHOOKSTRUCT k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
      bool alt = (k.flags & LLKHF_ALTDOWN) != 0, ctrl = Down(0x11);
      if ((alt && (k.vkCode == VK_TAB || k.vkCode == VK_F4 || k.vkCode == VK_ESCAPE || k.vkCode == VK_SPACE))
          || k.vkCode == VK_LWIN || k.vkCode == VK_RWIN
          || (ctrl && k.vkCode == VK_ESCAPE)) {
        return (IntPtr)1;
      }
    }
    return CallNextHookEx(hook, nCode, wParam, lParam);
  }

  public static void Start() {
    Thread t = new Thread(() => {
      hook = SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName), 0);
      MSG msg;
      while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { }
    });
    t.IsBackground = true;
    t.Start();
  }

  // winIni = 0: changed for this session only, never written to the user profile.
  public static void DisableAccessibilityHotkeys() {
    sticky.cbSize = toggle.cbSize = 8;
    filter.cbSize = 24;
    if (!SystemParametersInfo(SPI_GETSTICKYKEYS, 8, ref sticky, 0)
        || !SystemParametersInfo(SPI_GETTOGGLEKEYS, 8, ref toggle, 0)
        || !SystemParametersInfo(SPI_GETFILTERKEYS, 24, ref filter, 0)) return;
    saved = true;
    KEYSFLAGS s = sticky, t = toggle;
    FILTERKEYS f = filter;
    s.dwFlags &= ~(HOTKEYACTIVE | CONFIRMHOTKEY);
    t.dwFlags &= ~(HOTKEYACTIVE | CONFIRMHOTKEY);
    f.dwFlags &= ~(HOTKEYACTIVE | CONFIRMHOTKEY);
    SystemParametersInfo(SPI_SETSTICKYKEYS, 8, ref s, 0);
    SystemParametersInfo(SPI_SETTOGGLEKEYS, 8, ref t, 0);
    SystemParametersInfo(SPI_SETFILTERKEYS, 24, ref f, 0);
  }

  public static void RestoreAccessibilityHotkeys() {
    if (!saved) return;
    SystemParametersInfo(SPI_SETSTICKYKEYS, 8, ref sticky, 0);
    SystemParametersInfo(SPI_SETTOGGLEKEYS, 8, ref toggle, 0);
    SystemParametersInfo(SPI_SETFILTERKEYS, 24, ref filter, 0);
  }
}
'@
} catch {}

try { [void][Kiosk.Win]::DeleteMenu([Kiosk.Win]::GetSystemMenu([Kiosk.Win]::GetConsoleWindow(), $false), 0xF060, 0) } catch {}
try { [void][Kiosk.Win]::ShowWindow([Kiosk.Win]::GetConsoleWindow(), 0) } catch {}
try { [KioskKeys]::Start() } catch { Write-Host '  Could not block Alt+Tab / Alt+F4 / Windows key.' }
try { [KioskKeys]::DisableAccessibilityHotkeys() } catch {}
try {
  while (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }
}
finally {
  try { [KioskKeys]::RestoreAccessibilityHotkeys() } catch {}
}
