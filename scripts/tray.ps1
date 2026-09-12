# AI Free - Windows System Tray Manager
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$appDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $appDir "bin\deepseek.mjs"))) {
    $appDir = Join-Path $env:ProgramFiles "AI-Free"
}
Set-Location $appDir

$nodeExe = Join-Path $appDir "node\node.exe"
if (-not (Test-Path $nodeExe)) {
    $nodeExe = "node"
}
$entryScript = Join-Path $appDir "bin\deepseek.mjs"
$iconPath = Join-Path $appDir "ai-free.ico"
$url = "http://127.0.0.1:4317"

$script:serverProcess = $null

function Start-ServerProcess {
    try {
        $req = [System.Net.WebRequest]::Create("$url/health")
        $req.Timeout = 1500
        $res = $req.GetResponse()
        $res.Close()
        return
    } catch {}

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $nodeExe
    $psi.Arguments = "`"$entryScript`" --no-window"
    $psi.WorkingDirectory = $appDir
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false

    $script:serverProcess = [System.Diagnostics.Process]::Start($psi)
}

function Stop-ServerProcess {
    if ($script:serverProcess -and -not $script:serverProcess.HasExited) {
        try {
            $script:serverProcess.Kill()
        } catch {}
    }
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*deepseek.mjs*" } | ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }
}

function Open-AppWindow {
    Start-ServerProcess
    Start-Sleep -Milliseconds 400

    $chromePaths = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )

    $browserExe = $null
    foreach ($p in $chromePaths) {
        if (Test-Path $p) {
            $browserExe = $p
            break
        }
    }

    if ($browserExe) {
        Start-Process $browserExe -ArgumentList "--app=$url", "--window-size=1320,860"
    } else {
        Start-Process $url
    }
}

function Open-OpenCode {
    $opencodePaths = @(
        "$env:LOCALAPPDATA\Programs\OpenCode\OpenCode.exe",
        "$env:LOCALAPPDATA\Programs\opencode\OpenCode.exe",
        "$env:ProgramFiles\OpenCode\OpenCode.exe"
    )
    foreach ($p in $opencodePaths) {
        if (Test-Path $p) {
            Start-Process $p
            return
        }
    }
    Start-Process "cmd.exe" -ArgumentList "/c opencode" -WindowStyle Hidden
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $iconPath) {
    $notifyIcon.Icon = New-Object System.Drawing.Icon($iconPath)
} else {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$notifyIcon.Text = "AI Free (127.0.0.1:4317)"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$itemOpen = $contextMenu.Items.Add("Открыть AI Free")
$itemOpen.Font = New-Object System.Drawing.Font($itemOpen.Font, [System.Drawing.FontStyle]::Bold)
$itemOpen.add_Click({ Open-AppWindow })

$itemOpenCode = $contextMenu.Items.Add("Открыть OpenCode Desktop")
$itemOpenCode.add_Click({ Open-OpenCode })

$itemTelegram = $contextMenu.Items.Add("Telegram сообщество")
$itemTelegram.add_Click({
    Start-Process "https://t.me/+8qU7020rMF84OWNi"
})

$itemCheckUpdates = $contextMenu.Items.Add("Проверить обновления")
$itemCheckUpdates.add_Click({
    Start-Process "https://github.com/j46871417-ui/ai-free/releases/latest"
})

$contextMenu.Items.Add("-") | Out-Null

$itemRestart = $contextMenu.Items.Add("Перезапустить сервер")
$itemRestart.add_Click({
    Stop-ServerProcess
    Start-Sleep -Milliseconds 600
    Start-ServerProcess
    $notifyIcon.ShowBalloonTip(2000, "AI Free", "Сервер успешно перезапущен на порту 4317", [System.Windows.Forms.ToolTipIcon]::Info)
})

$itemLogs = $contextMenu.Items.Add("Показать логи")
$itemLogs.add_Click({
    $logPath = "$env:USERPROFILE\.ai-free\logs\ai-free.log"
    if (Test-Path $logPath) {
        Start-Process "notepad.exe" $logPath
    } else {
        [System.Windows.Forms.MessageBox]::Show("Файл логов пока не создан.", "AI Free")
    }
})

$contextMenu.Items.Add("-") | Out-Null

$itemExit = $contextMenu.Items.Add("Выход из AI Free")
$itemExit.add_Click({
    Stop-ServerProcess
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$notifyIcon.ContextMenuStrip = $contextMenu

$notifyIcon.add_DoubleClick({ Open-AppWindow })
$notifyIcon.add_Click({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        Open-AppWindow
    }
})

Start-ServerProcess
Start-Sleep -Milliseconds 800
Open-AppWindow

$notifyIcon.ShowBalloonTip(3000, "AI Free активен", "Сервер работает в фоне. При закрытии окна сервис остается в трее возле часов.", [System.Windows.Forms.ToolTipIcon]::Info)

[System.Windows.Forms.Application]::Run()
