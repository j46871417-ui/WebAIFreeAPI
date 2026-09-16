using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace WebAIFreeAPI.Native
{
    public class MainWindow : Form
    {
        private WebView2 webView;
        private string url;

        public MainWindow(string url)
        {
            this.url = url;
            Text = "WebAIFreeAPI v1.9.7";
            Width = 1320;
            Height = 860;
            StartPosition = FormStartPosition.CenterScreen;

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            Controls.Add(webView);

            InitializeAsync();
        }

        private async void InitializeAsync()
        {
            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string profileDir = Path.Combine(localAppData, @"WebAIFreeAPI\WebView2Profile");
                Directory.CreateDirectory(profileDir);

                var env = await CoreWebView2Environment.CreateAsync(null, profileDir, null);
                await webView.EnsureCoreWebView2Async(env);
                
                // Remove some default WebView2 features
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

                webView.CoreWebView2.DocumentTitleChanged += (sender, args) =>
                {
                    if (!string.IsNullOrEmpty(webView.CoreWebView2.DocumentTitle))
                    {
                        Text = webView.CoreWebView2.DocumentTitle;
                    }
                };

                webView.CoreWebView2.ScriptDialogOpening += (sender, args) =>
                {
                    if (args.Kind == CoreWebView2ScriptDialogKind.Alert)
                    {
                        MessageBox.Show(args.Message, "WebAIFreeAPI", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        args.Accept();
                    }
                    else if (args.Kind == CoreWebView2ScriptDialogKind.Confirm)
                    {
                        var res = MessageBox.Show(args.Message, "WebAIFreeAPI", MessageBoxButtons.OKCancel, MessageBoxIcon.Question);
                        if (res == DialogResult.OK) args.Accept();
                    }
                };
                
                webView.Source = new Uri(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Ошибка инициализации WebView2: " + ex.Message);
            }
        }
    }
}
