using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Web.WebView2.Core;

namespace WebAIFreeAPI.Native
{
    public class MainWindow : Window
    {
        private WebView2 webView;
        private string url;

        public MainWindow(string url)
        {
            this.url = url;
            Title = "WebAIFreeAPI";
            Width = 1320;
            Height = 860;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;

            webView = new WebView2();
            Content = webView;

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
                
                webView.Source = new Uri(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Ошибка инициализации WebView2: " + ex.Message);
            }
        }
    }
}
