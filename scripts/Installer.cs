using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using System.Threading;
using System.Security.Principal;

namespace AiFreeInstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (!IsAdministrator())
            {
                ProcessStartInfo psi = new ProcessStartInfo()
                {
                    FileName = Application.ExecutablePath,
                    UseShellExecute = true,
                    Verb = "runas"
                };
                try
                {
                    Process.Start(psi);
                }
                catch
                {
                    MessageBox.Show("Для установки в папку Program Files требуются права администратора.", "AI Free Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                return;
            }

            Application.Run(new InstallerForm());
        }

        private static bool IsAdministrator()
        {
            try
            {
                WindowsIdentity identity = WindowsIdentity.GetCurrent();
                WindowsPrincipal principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }
    }

    public class InstallerForm : Form
    {
        private ProgressBar progressBar;
        private Label statusLabel;
        private Label titleLabel;
        private Button actionButton;
        private string targetDir;

        public InstallerForm()
        {
            targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "AI-Free");

            this.Text = "Установка AI Free";
            this.Size = new Size(520, 250);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;

            try {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            } catch {}

            titleLabel = new Label() {
                Text = "Установка AI Free в Program Files",
                Font = new Font("Segoe UI", 12, FontStyle.Bold),
                Location = new Point(25, 20),
                AutoSize = true
            };
            this.Controls.Add(titleLabel);

            statusLabel = new Label() {
                Text = "Подготовка к установке...",
                Font = new Font("Segoe UI", 9),
                Location = new Point(25, 60),
                Size = new Size(455, 35)
            };
            this.Controls.Add(statusLabel);

            progressBar = new ProgressBar() {
                Location = new Point(25, 105),
                Size = new Size(455, 24),
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 25
            };
            this.Controls.Add(progressBar);

            actionButton = new Button() {
                Text = "Отмена",
                Location = new Point(380, 155),
                Size = new Size(100, 32),
                Font = new Font("Segoe UI", 9)
            };
            actionButton.Click += (s, e) => this.Close();
            this.Controls.Add(actionButton);

            this.Shown += (s, e) => {
                ThreadPool.QueueUserWorkItem(DoInstall);
            };
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
            if (success) {
                actionButton.Text = "Запустить";
                actionButton.Click += (s, e) => {
                    try {
                        string vbsPath = Path.Combine(targetDir, "run-silent.vbs");
                        Process.Start("wscript.exe", "\"" + vbsPath + "\"");
                    } catch {}
                    this.Close();
                };
            } else {
                actionButton.Text = "Закрыть";
            }
        }

        private void DoInstall(object state)
        {
            try
            {
                SetStatus("Создание целевой папки " + targetDir + "...");
                if (!Directory.Exists(targetDir)) {
                    Directory.CreateDirectory(targetDir);
                }

                SetStatus("Распаковка файлов приложения в " + targetDir + "...");
                Assembly asm = Assembly.GetExecutingAssembly();
                using (Stream stream = asm.GetManifestResourceStream("ai-free.zip"))
                {
                    if (stream == null) {
                        throw new Exception("Архив ai-free.zip не найден в ресурсах инсталлятора.");
                    }
                    string tempZip = Path.Combine(Path.GetTempPath(), "ai-free-" + Guid.NewGuid().ToString("N") + ".zip");
                    using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                    {
                        stream.CopyTo(fs);
                    }

                    using (ZipArchive archive = ZipFile.OpenRead(tempZip))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destPath = Path.Combine(targetDir, entry.FullName);
                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(destPath);
                            }
                            else
                            {
                                string parent = Path.GetDirectoryName(destPath);
                                if (!Directory.Exists(parent)) Directory.CreateDirectory(parent);
                                entry.ExtractToFile(destPath, true);
                            }
                        }
                    }

                    try { File.Delete(tempZip); } catch {}
                }

                SetStatus("Создание ярлыков на Рабочем столе...");
                CreateShortcuts();

                SetStatus("Настройка конфигурации OpenCode Desktop...");
                RunSetupScript();

                Finish(true, "Установка успешно завершена в Program Files! Ярлыки созданы на Рабочем столе.");
            }
            catch (Exception ex)
            {
                Finish(false, "Ошибка: " + ex.Message);
            }
        }

        private void CreateShortcuts()
        {
            string nodeExe = Path.Combine(targetDir, "node", "node.exe");
            string shortcutScript = Path.Combine(targetDir, "scripts", "create-shortcuts.mjs");
            if (File.Exists(nodeExe) && File.Exists(shortcutScript))
            {
                ProcessStartInfo psi = new ProcessStartInfo()
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\" \"{1}\"", shortcutScript, targetDir),
                    WorkingDirectory = targetDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process p = Process.Start(psi);
                p.WaitForExit(30000);
            }
        }

        private void RunSetupScript()
        {
            string nodeExe = Path.Combine(targetDir, "node", "node.exe");
            string setupScript = Path.Combine(targetDir, "scripts", "setup-opencode.mjs");
            if (File.Exists(nodeExe) && File.Exists(setupScript))
            {
                ProcessStartInfo psi = new ProcessStartInfo()
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\" \"{1}\"", setupScript, targetDir),
                    WorkingDirectory = targetDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process p = Process.Start(psi);
                p.WaitForExit(30000);
            }
        }
    }
}
