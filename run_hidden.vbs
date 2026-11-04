Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "d:\desktop\Outreach"
' Run start_bot.bat completely hidden (0 means hidden window, False means don't wait)
WshShell.Run chr(34) & "d:\desktop\Outreach\start_bot.bat" & Chr(34), 0, False
Set WshShell = Nothing
