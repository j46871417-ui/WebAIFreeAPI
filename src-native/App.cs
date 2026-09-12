using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;

namespace WebAIFreeAPI.Native
{
    public class App : Application
    {
        private static Process backgroundNodeProcess = null;
        private static Mutex appMutex = null;

        [STAThread]
        public static void Main(string[] args)
        {
            bool isNewInstance = false;
            appMutex = new Mutex(true, "WebAIFreeAPI_Native_SingleInstance_Mutex", out isNewInstance);
            if (!isNewInstance)
            {
                // Already running
                return;
            }

            var app = new App();
            app.ShutdownMode = ShutdownMode.OnMainWindowClose;

            var apiClient = new ApiClient("http://127.0.0.1:4317");

            // Ensure engine is running
            if (!apiClient.CheckHealth())
            {
                StartBackgroundEngine();

                // Wait up to 15s for engine to start
                bool ready = apiClient.WaitForReadyAsync(15).GetAwaiter().GetResult();
                if (!ready)
                {
                    // If still not ready, we will still show MainWindow so user can see status or retry
                }
            }

            var mainWindow = new MainWindow(apiClient);
            app.Exit += (s, e) => Cleanup();

            app.Run(mainWindow);
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

                if (string.IsNullOrEmpty(nodePath))
                {
                    nodePath = "node"; // fallback to system PATH
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
                // Engine start attempt failed, app will attempt to connect to existing or display error
            }
        }

        private static void Cleanup()
        {
            try
            {
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
