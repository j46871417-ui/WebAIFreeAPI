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
                    MessageBox.Show("Для установки программы требуются права администратора.", "AI Free Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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

        public InstallerForm()
        {
            targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "AI-Free");

            this.Text = "Установка AI Free";
            this.Size = new Size(550, 315);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;

            try {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            } catch {}

            titleLabel = new Label() {
                Text = "Мастер установки AI Free",
                Font = new Font("Segoe UI", 12, FontStyle.Bold),
                Location = new Point(25, 16),
                AutoSize = true
            };
            this.Controls.Add(titleLabel);

            pathLabel = new Label() {
                Text = "Папка установки:",
                Font = new Font("Segoe UI", 9),
                Location = new Point(25, 52),
                AutoSize = true
            };
            this.Controls.Add(pathLabel);

            pathTextBox = new TextBox() {
                Text = targetDir,
                Font = new Font("Segoe UI", 9),
                Location = new Point(25, 75),
                Size = new Size(390, 24)
            };
            this.Controls.Add(pathTextBox);

            browseButton = new Button() {
                Text = "Обзор...",
                Font = new Font("Segoe UI", 9),
                Location = new Point(423, 73),
                Size = new Size(88, 28)
            };
            browseButton.Click += OnBrowseClick;
            this.Controls.Add(browseButton);

            progressBar = new ProgressBar() {
                Location = new Point(25, 115),
                Size = new Size(486, 22),
                Style = ProgressBarStyle.Continuous,
                Value = 0
            };
            this.Controls.Add(progressBar);

            statusLabel = new Label() {
                Text = "Выберите папку и нажмите «Установить».",
                Font = new Font("Segoe UI", 9),
                Location = new Point(25, 145),
                Size = new Size(486, 32)
            };
            this.Controls.Add(statusLabel);

            launchCheckBox = new CheckBox() {
                Text = "Запустить AI Free сейчас",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(26, 185),
                Size = new Size(300, 24),
                Checked = true,
                Visible = false
            };
            this.Controls.Add(launchCheckBox);

            cancelButton = new Button() {
                Text = "Отмена",
                Font = new Font("Segoe UI", 9),
                Location = new Point(300, 225),
                Size = new Size(100, 32)
            };
            cancelButton.Click += (s, e) => this.Close();
            this.Controls.Add(cancelButton);

            actionButton = new Button() {
                Text = "Установить",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(411, 225),
                Size = new Size(100, 32)
            };
            actionButton.Click += OnActionClick;
            this.Controls.Add(actionButton);
        }

        private void OnBrowseClick(object sender, EventArgs e)
        {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Выберите папку для установки AI Free:";
                fbd.SelectedPath = pathTextBox.Text;
                fbd.ShowNewFolderButton = true;
                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    string selected = fbd.SelectedPath;
                    if (!selected.EndsWith("AI-Free", StringComparison.OrdinalIgnoreCase))
                    {
                        selected = Path.Combine(selected, "AI-Free");
                    }
                    pathTextBox.Text = selected;
                }
            }
        }

        private void OnActionClick(object sender, EventArgs e)
        {
            if (isInstalled)
            {
                // Закрытие формы с учетом чекбокса
                if (launchCheckBox.Checked)
                {
                    try
                    {
                        string vbsPath = Path.Combine(targetDir, "run-silent.vbs");
                        Process.Start("wscript.exe", "\"" + vbsPath + "\"");
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Не удалось запустить: " + ex.Message, "AI Free");
                    }
                }
                this.Close();
                return;
            }

            targetDir = pathTextBox.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("Укажите папку для установки.", "AI Free Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Блокируем настройки и начинаем установку
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
                cancelButton.Text = "Закрыть";
                cancelButton.Enabled = true;
                actionButton.Visible = false;
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

                Finish(true, "Установка успешно завершена! Ярлыки созданы на Рабочем столе.");
            }
            catch (Exception ex)
            {
                Finish(false, "Ошибка установки: " + ex.Message);
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
