using System;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using System.Threading;

namespace AiFreeInstaller
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            bool isSilent = false;
            string customDir = null;

            foreach (var arg in args)
            {
                string a = arg.Trim();
                if (a.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                    a.Equals("/update", StringComparison.OrdinalIgnoreCase) ||
                    a.Equals("/s", StringComparison.OrdinalIgnoreCase) ||
                    a.Equals("-s", StringComparison.OrdinalIgnoreCase) ||
                    a.Equals("--silent", StringComparison.OrdinalIgnoreCase))
                {
                    isSilent = true;
                }
                else if (a.StartsWith("/dir=", StringComparison.OrdinalIgnoreCase) ||
                         a.StartsWith("-dir=", StringComparison.OrdinalIgnoreCase) ||
                         a.StartsWith("/target=", StringComparison.OrdinalIgnoreCase) ||
                         a.StartsWith("--dir=", StringComparison.OrdinalIgnoreCase))
                {
                    int eq = a.IndexOf('=');
                    customDir = a.Substring(eq + 1).Trim('"', '\'');
                }
            }

            if (isSilent)
            {
                return RunSilent(customDir);
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm(customDir));
            return 0;
        }

        static int RunSilent(string targetDir)
        {
            try
            {
                if (string.IsNullOrEmpty(targetDir))
                {
                    targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WebAIFreeAPI");
                }

                // Wait 1.5 seconds for previous node instance to release files if restarting
                Thread.Sleep(1500);

                InstallerForm.KillRunningProcesses(targetDir);

                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                Assembly asm = Assembly.GetExecutingAssembly();
                using (Stream stream = asm.GetManifestResourceStream("ai-free.zip"))
                {
                    if (stream == null) return 1;

                    string tempZip = Path.Combine(Path.GetTempPath(), "ai-free-" + Guid.NewGuid().ToString("N") + ".zip");
                    try
                    {
                        using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                        {
                            stream.CopyTo(fs);
                        }

                        InstallerForm.ExtractArchiveFiles(tempZip, targetDir);
                    }
                    finally
                    {
                        try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch {}
                    }
                }

                InstallerForm.CreateDesktopShortcuts(targetDir);
                InstallerForm.RunSetup(targetDir);
                InstallerForm.LaunchInstalledApp(targetDir);
                return 0;
            }
            catch
            {
                return 2;
            }
        }
    }

    public class InstallerForm : Form
    {
        private Label titleLabel;
        private Label pathLabel;
        private TextBox pathTextBox;
        private Button browseButton;
        private ProgressBar progressBar;
        private Label statusLabel;
        private CheckBox launchCheckBox;
        private Button actionButton;
        private Button cancelButton;

        private bool isInstalled = false;
        private string targetDir;

        public InstallerForm(string initialDir = null)
        {
            if (!string.IsNullOrEmpty(initialDir))
                targetDir = initialDir;
            else
                targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WebAIFreeAPI");

            this.Text = "Установка WebAIFreeAPI v1.6.2";
            this.Size = new Size(540, 320);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;

            try {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            } catch {}

            titleLabel = new Label() {
                Text = "Мастер установки WebAIFreeAPI v1.6.2",
                Font = new Font("Segoe UI", 12, FontStyle.Bold),
                Location = new Point(25, 18),
                AutoSize = true
            };
            this.Controls.Add(titleLabel);

            pathLabel = new Label() {
                Text = "Папка установки:",
                Font = new Font("Segoe UI", 9),
                Location = new Point(25, 55),
                AutoSize = true
            };
            this.Controls.Add(pathLabel);

            pathTextBox = new TextBox() {
                Text = targetDir,
                Font = new Font("Segoe UI", 9),
                Location = new Point(25, 78),
                Size = new Size(385, 24)
            };
            this.Controls.Add(pathTextBox);

            browseButton = new Button() {
                Text = "Обзор...",
                Font = new Font("Segoe UI", 9),
                Location = new Point(418, 76),
                Size = new Size(88, 28)
            };
            browseButton.Click += OnBrowseClick;
            this.Controls.Add(browseButton);

            progressBar = new ProgressBar() {
                Location = new Point(25, 118),
                Size = new Size(480, 22),
                Style = ProgressBarStyle.Continuous,
                Value = 0
            };
            this.Controls.Add(progressBar);

            statusLabel = new Label() {
                Text = "Выберите папку и нажмите «Установить».",
                Font = new Font("Segoe UI", 9),
                Location = new Point(25, 148),
                Size = new Size(480, 36)
            };
            this.Controls.Add(statusLabel);

            launchCheckBox = new CheckBox() {
                Text = "Запустить WebAIFreeAPI сейчас",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(26, 188),
                Size = new Size(320, 24),
                Checked = true,
                Visible = false
            };
            this.Controls.Add(launchCheckBox);

            cancelButton = new Button() {
                Text = "Отмена",
                Font = new Font("Segoe UI", 9),
                Location = new Point(295, 230),
                Size = new Size(100, 32)
            };
            cancelButton.Click += (s, e) => this.Close();
            this.Controls.Add(cancelButton);

            actionButton = new Button() {
                Text = "Установить",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(405, 230),
                Size = new Size(100, 32)
            };
            actionButton.Click += OnActionClick;
            this.Controls.Add(actionButton);
        }

        private void OnBrowseClick(object sender, EventArgs e)
        {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Выберите папку для установки WebAIFreeAPI:";
                fbd.SelectedPath = pathTextBox.Text;
                fbd.ShowNewFolderButton = true;
                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    string selected = fbd.SelectedPath;
                    if (!selected.EndsWith("WebAIFreeAPI", StringComparison.OrdinalIgnoreCase))
                    {
                        selected = Path.Combine(selected, "WebAIFreeAPI");
                    }
                    pathTextBox.Text = selected;
                }
            }
        }

        private void OnActionClick(object sender, EventArgs e)
        {
            if (isInstalled)
            {
                if (launchCheckBox.Checked)
                {
                    LaunchInstalledApp(targetDir);
                }
                this.Close();
                return;
            }

            targetDir = pathTextBox.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("Укажите папку для установки.", "WebAIFreeAPI Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            pathTextBox.Enabled = false;
            browseButton.Enabled = false;
            actionButton.Enabled = false;
            cancelButton.Enabled = false;
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 25;

            ThreadPool.QueueUserWorkItem(DoInstall);
        }

        private void SetStatus(string text)
        {
            if (this.InvokeRequired) {
                this.BeginInvoke(new Action(() => SetStatus(text)));
                return;
            }
            statusLabel.Text = text;
        }

        private void Finish(bool success, string msg)
        {
            if (this.InvokeRequired) {
                this.BeginInvoke(new Action(() => Finish(success, msg)));
                return;
            }
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Value = success ? 100 : 0;
            statusLabel.Text = msg;

            if (success)
            {
                isInstalled = true;
                launchCheckBox.Visible = true;
                cancelButton.Visible = false;
                actionButton.Text = "Закрыть";
                actionButton.Enabled = true;
                actionButton.Focus();
            }
            else
            {
                pathTextBox.Enabled = true;
                browseButton.Enabled = true;
                actionButton.Enabled = true;
                actionButton.Text = "Повторить";
                cancelButton.Enabled = true;
                cancelButton.Text = "Отмена";
                MessageBox.Show(msg, "Ошибка установки", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public static void KillRunningProcesses(string dir)
        {
            try
            {
                foreach (var p in Process.GetProcessesByName("node"))
                {
                    try
                    {
                        string pPath = p.MainModule.FileName;
                        if (pPath.StartsWith(dir, StringComparison.OrdinalIgnoreCase))
                        {
                            p.Kill();
                            p.WaitForExit(1500);
                        }
                    }
                    catch {}
                }
            }
            catch {}
        }

        private void DoInstall(object state)
        {
            try
            {
                SetStatus("Подготовка к установке...");
                KillRunningProcesses(targetDir);

                if (!Directory.Exists(targetDir)) {
                    Directory.CreateDirectory(targetDir);
                }

                SetStatus("Распаковка файлов приложения...");
                Assembly asm = Assembly.GetExecutingAssembly();
                using (Stream stream = asm.GetManifestResourceStream("ai-free.zip"))
                {
                    if (stream == null) {
                        throw new Exception("Архив ai-free.zip не найден в ресурсах инсталлятора.");
                    }

                    string tempZip = Path.Combine(Path.GetTempPath(), "ai-free-" + Guid.NewGuid().ToString("N") + ".zip");
                    try
                    {
                        using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                        {
                            stream.CopyTo(fs);
                        }

                        ExtractArchiveFiles(tempZip, targetDir);
                    }
                    finally
                    {
                        try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch {}
                    }
                }

                SetStatus("Создание ярлыков на Рабочем столе...");
                CreateDesktopShortcuts(targetDir);

                SetStatus("Настройка конфигурации OpenCode Desktop...");
                RunSetup(targetDir);

                Finish(true, "Установка успешно завершена! Ярлыки созданы на Рабочем столе.");
            }
            catch (Exception ex)
            {
                Finish(false, "Ошибка: " + ex.Message);
            }
        }

        public static void ExtractArchiveFiles(string zipPath, string destDir)
        {
            string tarExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "tar.exe");
            if (File.Exists(tarExe))
            {
                ProcessStartInfo psi = new ProcessStartInfo()
                {
                    FileName = tarExe,
                    Arguments = string.Format("-xf \"{0}\" -C \"{1}\"", zipPath, destDir),
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false,
                    RedirectStandardError = true
                };
                using (Process p = Process.Start(psi))
                {
                    string err = p.StandardError.ReadToEnd();
                    p.WaitForExit();
                    if (p.ExitCode != 0)
                    {
                        throw new Exception("Ошибка tar.exe: " + err);
                    }
                }
                return;
            }

            ProcessStartInfo psiPs = new ProcessStartInfo()
            {
                FileName = "powershell.exe",
                Arguments = string.Format("-ExecutionPolicy Bypass -NoProfile -Command \"Expand-Archive -Path '{0}' -DestinationPath '{1}' -Force\"", zipPath, destDir),
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = false,
                RedirectStandardError = true
            };
            using (Process p = Process.Start(psiPs))
            {
                string err = p.StandardError.ReadToEnd();
                p.WaitForExit();
                if (p.ExitCode != 0)
                {
                    throw new Exception("Ошибка Expand-Archive: " + err);
                }
            }
        }

        public static void CreateDesktopShortcuts(string dir)
        {
            string nodeExe = Path.Combine(dir, "node", "node.exe");
            string shortcutScript = Path.Combine(dir, "scripts", "create-shortcuts.mjs");
            if (File.Exists(nodeExe) && File.Exists(shortcutScript))
            {
                ProcessStartInfo psi = new ProcessStartInfo()
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\" \"{1}\"", shortcutScript, dir),
                    WorkingDirectory = dir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(30000);
                }
            }
        }

        public static void RunSetup(string dir)
        {
            string nodeExe = Path.Combine(dir, "node", "node.exe");
            string setupScript = Path.Combine(dir, "scripts", "setup-opencode.mjs");
            if (File.Exists(nodeExe) && File.Exists(setupScript))
            {
                ProcessStartInfo psi = new ProcessStartInfo()
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\" \"{1}\"", setupScript, dir),
                    WorkingDirectory = dir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(30000);
                }
            }
        }

        public static void LaunchInstalledApp(string dir)
        {
            try
            {
                string exePath = Path.Combine(dir, "bin", "WebAIFreeAPI.exe");
                string vbsPath = Path.Combine(dir, "run-silent.vbs");
                string trayPs1 = Path.Combine(dir, "scripts", "tray.ps1");

                if (File.Exists(exePath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo(exePath)
                    {
                        WorkingDirectory = dir,
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                }
                else if (File.Exists(vbsPath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo("wscript.exe", "\"" + vbsPath + "\"")
                    {
                        WorkingDirectory = dir,
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                }
                else if (File.Exists(trayPs1))
                {
                    ProcessStartInfo psi = new ProcessStartInfo("powershell.exe", "-ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + trayPs1 + "\"")
                    {
                        WorkingDirectory = dir,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    Process.Start(psi);
                }
            }
            catch {}
        }
    }
}
