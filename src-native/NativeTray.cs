using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace WebAIFreeAPI.Native
{
    public class NativeTray : IDisposable
    {
        private readonly Action onOpenApp;
        private readonly Action onOpenSettings;
        private readonly Action onOpenTerminal;
        private readonly Action onExit;
        private NotifyIcon notifyIcon;

        public NativeTray(Action onOpenApp, Action onOpenSettings, Action onOpenTerminal, Action onExit)
        {
            this.onOpenApp = onOpenApp;
            this.onOpenSettings = onOpenSettings;
            this.onOpenTerminal = onOpenTerminal;
            this.onExit = onExit;

            InitializeTray();
        }

        public NativeTray(System.Windows.Window mainWindow, Action onOpenSettings, Action onOpenTerminal, Action onExit)
        {
            this.onOpenApp = () =>
            {
                if (mainWindow != null)
                {
                    mainWindow.Dispatcher.Invoke((Action)(() =>
                    {
                        if (mainWindow.WindowState == System.Windows.WindowState.Minimized)
                        {
                            mainWindow.WindowState = System.Windows.WindowState.Normal;
                        }
                        mainWindow.Show();
                        mainWindow.Activate();
                    }));
                }
            };
            this.onOpenSettings = onOpenSettings;
            this.onOpenTerminal = onOpenTerminal;
            this.onExit = onExit;

            InitializeTray();
        }

        private void InitializeTray()
        {
            notifyIcon = new NotifyIcon();
            notifyIcon.Text = "WebAIFreeAPI v1.9.1";

            try
            {
                string exePath = Process.GetCurrentProcess().MainModule.FileName;
                string dir = Path.GetDirectoryName(exePath);
                string icoPath = Path.Combine(dir, "ai-free.ico");

                if (File.Exists(icoPath))
                {
                    notifyIcon.Icon = new Icon(icoPath);
                }
                else
                {
                    string parentIco = Path.Combine(dir, "..", "ai-free.ico");
                    if (File.Exists(parentIco))
                    {
                        notifyIcon.Icon = new Icon(parentIco);
                    }
                    else
                    {
                        notifyIcon.Icon = Icon.ExtractAssociatedIcon(exePath) ?? SystemIcons.Application;
                    }
                }
            }
            catch
            {
                notifyIcon.Icon = SystemIcons.Application;
            }

            var menu = new ContextMenuStrip();
            var itemOpen = new ToolStripMenuItem("Открыть WebAIFreeAPI", null, (s, e) => { if (onOpenApp != null) onOpenApp(); });
            var itemTerminal = new ToolStripMenuItem("⚡ Консоль PowerShell", null, (s, e) => { if (onOpenTerminal != null) onOpenTerminal(); });
            var itemSettings = new ToolStripMenuItem("Настройки...", null, (s, e) => { if (onOpenSettings != null) onOpenSettings(); });
            var itemExit = new ToolStripMenuItem("Выход", null, (s, e) => { if (onExit != null) onExit(); });

            menu.Items.Add(itemOpen);
            menu.Items.Add(itemTerminal);
            menu.Items.Add(itemSettings);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(itemExit);

            notifyIcon.ContextMenuStrip = menu;
            notifyIcon.DoubleClick += (s, e) => { if (onOpenApp != null) onOpenApp(); };
            notifyIcon.Visible = true;
        }

        public void ShowNotification(string title, string message, ToolTipIcon icon = ToolTipIcon.Info)
        {
            try
            {
                if (notifyIcon != null)
                {
                    notifyIcon.ShowBalloonTip(3000, title, message, icon);
                }
            }
            catch {}
        }

        public void Dispose()
        {
            if (notifyIcon != null)
            {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
                notifyIcon = null;
            }
        }
    }
}
