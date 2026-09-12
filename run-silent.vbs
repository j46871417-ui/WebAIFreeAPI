Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
nativeExe = scriptDir & "\bin\WebAIFreeAPI.exe"
trayScript = scriptDir & "\scripts\tray.ps1"

If fso.FileExists(nativeExe) Then
    WshShell.Run """" & nativeExe & """", 1, False
Else
    WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & trayScript & """", 0, False
End If

