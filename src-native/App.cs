using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Windows;

namespace WebAIFreeAPI.Native
{
    public static class App
    {
        private static Process backgroundNodeProcess = null;
        private static MainWindow mainWindow = null;
        private static Mutex appMutex = null;
        private static NativeTray tray = null;
        private static readonly ApiClient apiClient = new ApiClient("http://127.0.0.1:4317");

        [STAThread]
        public static void Main(string[] args)
        {
            System.Windows.Forms.Application.EnableVisualStyles();
            System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);

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
                    System.Windows.Forms.MessageBox.Show(
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
                    System.Windows.Forms.Application.Exit();
                }
            );

            // Message loop
            System.Windows.Forms.Application.Run();
        }

        public static MainWindow LaunchAppWindow(string url)
        {
            if (mainWindow == null || mainWindow.IsDisposed)
            {
                mainWindow = new MainWindow(url);
                mainWindow.FormClosed += (s, e) => mainWindow = null;
                mainWindow.Show();
            }
            else
            {
                if (mainWindow.WindowState == FormWindowState.Minimized)
                {
                    mainWindow.WindowState = FormWindowState.Normal;
                }
                mainWindow.Show();
                mainWindow.Activate();
            }
            return mainWindow;
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
                    Path.Combine(baseDir, "bin", "backend.bundle.mjs"),
                    Path.Combine(baseDir, "..", "bin", "backend.bundle.mjs"),
                    Path.Combine(baseDir, "backend.bundle.mjs")
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
                    System.Windows.Forms.MessageBox.Show(
                        "В установке отсутствует bundled runtime WebAIFreeAPI (node\\node.exe или bin\\deepseek.mjs). Переустановите приложение из полного offline-инсталлятора.",
                        "WebAIFreeAPI — Ошибка runtime",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                if (string.IsNullOrEmpty(nodePath))
                {
                    System.Windows.Forms.MessageBox.Show(
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
