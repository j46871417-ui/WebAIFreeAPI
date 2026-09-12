using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace WebAIFreeAPI.Native
{
    public static class App
    {
        private static Process backgroundNodeProcess = null;
        private static Process appWindowProcess = null;
        private static Mutex appMutex = null;
        private static NativeTray tray = null;
        private static readonly ApiClient apiClient = new ApiClient("http://127.0.0.1:4317");

        [STAThread]
        public static void Main(string[] args)
        {
            bool isNewInstance = false;
            appMutex = new Mutex(true, "WebAIFreeAPI_Native_SingleInstance_Mutex", out isNewInstance);
            if (!isNewInstance)
            {
                // Already running - activate or reopen app window
                LaunchAppWindow("http://127.0.0.1:4317");
                return;
            }

            // Ensure server engine is running
            if (!apiClient.CheckHealth())
            {
                StartBackgroundEngine();

                // Wait up to 25s for engine to be completely ready
                bool ready = apiClient.WaitForReadyAsync(25).GetAwaiter().GetResult();
                if (!ready)
                {
                    MessageBox.Show(
                        "Не удалось дождаться ответа локального сервера WebAIFreeAPI на порту 4317.\nПроверьте, что порт не занят другим приложением.",
                        "WebAIFreeAPI — Запуск сервера",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                }
            }

            // Launch the full-featured desktop window
            LaunchAppWindow("http://127.0.0.1:4317");

            // Setup tray icon
            tray = new NativeTray(
                onOpenApp: () => LaunchAppWindow("http://127.0.0.1:4317"),
                onOpenSettings: () => LaunchAppWindow("http://127.0.0.1:4317"),
                onOpenTerminal: () =>
                {
                    Task.Run(() => apiClient.OpenTerminalAsync(Directory.GetCurrentDirectory(), "powershell"));
                },
                onExit: () =>
                {
                    Cleanup();
                    Application.Exit();
                }
            );

            // Message loop
            Application.Run();
        }

        public static Process LaunchAppWindow(string url)
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

            string[] candidates = new string[]
            {
                Path.Combine(programFilesX86, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(programFiles, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(programFiles, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(programFilesX86, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(localAppData, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe")
            };

            string browserExe = null;
            foreach (var p in candidates)
            {
                if (File.Exists(p))
                {
                    browserExe = p;
                    break;
                }
            }

            string profileDir = Path.Combine(localAppData, @"WebAIFreeAPI\Profile");
            try { Directory.CreateDirectory(profileDir); } catch {}

            try
            {
                if (browserExe != null)
                {
                    string arguments = string.Format(
                        "--app=\"{0}\" --window-size=1320,860 --user-data-dir=\"{1}\" --disable-features=Translate,OptimizationHints --disable-blink-features=AutomationControlled --no-first-run --no-default-browser-check",
                        url,
                        profileDir
                    );

                    var psi = new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = arguments,
                        UseShellExecute = false
                    };
                    appWindowProcess = Process.Start(psi);
                    return appWindowProcess;
                }
                else
                {
                    // Fallback to default browser
                    var psi = new ProcessStartInfo("cmd.exe", "/c start \"\" \"" + url + "\"")
                    {
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    return Process.Start(psi);
                }
            }
            catch
            {
                return null;
            }
        }

        private static void StartBackgroundEngine()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                // Find node.exe
                string nodePath = null;
                string[] possibleNodePaths = new string[]
                {
                    Path.Combine(baseDir, "node", "node.exe"),
                    Path.Combine(baseDir, "..", "node", "node.exe"),
                    Path.Combine(baseDir, "node.exe")
                };

                foreach (var p in possibleNodePaths)
                {
                    if (File.Exists(p))
                    {
                        nodePath = Path.GetFullPath(p);
                        break;
                    }
                }

                // Find bin/deepseek.mjs
                string scriptPath = null;
                string[] possibleScriptPaths = new string[]
                {
                    Path.Combine(baseDir, "bin", "deepseek.mjs"),
                    Path.Combine(baseDir, "..", "bin", "deepseek.mjs"),
                    Path.Combine(baseDir, "deepseek.mjs")
                };

                foreach (var p in possibleScriptPaths)
                {
                    if (File.Exists(p))
                    {
                        scriptPath = Path.GetFullPath(p);
                        break;
                    }
                }

                if (string.IsNullOrEmpty(scriptPath))
                {
                    MessageBox.Show(
                        "В установке отсутствует bundled runtime WebAIFreeAPI (node\\node.exe или bin\\deepseek.mjs). Переустановите приложение из полного offline-инсталлятора.",
                        "WebAIFreeAPI — Ошибка runtime",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                if (string.IsNullOrEmpty(nodePath))
                {
                    MessageBox.Show(
                        "В установке отсутствует bundled Node.js runtime. Системный Node.js не используется. Переустановите приложение из полного offline-инсталлятора.",
                        "WebAIFreeAPI — Ошибка runtime",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                string workingDir = Path.GetDirectoryName(Path.GetDirectoryName(scriptPath));
                if (!Directory.Exists(workingDir))
                {
                    workingDir = baseDir;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "\"" + scriptPath + "\" --no-window",
                    WorkingDirectory = workingDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                backgroundNodeProcess = Process.Start(psi);
            }
            catch
            {
            }
        }

        private static void Cleanup()
        {
            try
            {
                // Request graceful shutdown via API
                try
                {
                    var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:4317/api/shutdown");
                    req.Method = "POST";
                    req.Timeout = 1500;
                    using (var res = req.GetResponse()) {}
                }
                catch {}

                if (backgroundNodeProcess != null && !backgroundNodeProcess.HasExited)
                {
                    backgroundNodeProcess.Kill();
                    backgroundNodeProcess.Dispose();
                    backgroundNodeProcess = null;
                }
            }
            catch {}

            try
            {
                if (tray != null)
                {
                    tray.Dispose();
                    tray = null;
                }
            }
            catch {}

            try
            {
                if (appMutex != null)
                {
                    appMutex.ReleaseMutex();
                    appMutex.Dispose();
                    appMutex = null;
                }
            }
            catch {}
        }
    }
}
