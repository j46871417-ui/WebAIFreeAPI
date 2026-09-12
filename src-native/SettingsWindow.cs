using System;
using System.Collections;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace WebAIFreeAPI.Native
{
    public class SettingsWindow : Window
    {
        private readonly ApiClient apiClient;
        private TextBox txtDeepSeekKey;
        private TextBox txtQwenKey;
        private TextBox txtChatGPTKey;
        private CheckBox chkShell;
        private CheckBox chkPython;
        private CheckBox chkDestructive;
        private CheckBox chkExternalWrites;
        private TextBlock txtStatus;

        public SettingsWindow(ApiClient client)
        {
            this.apiClient = client;

            Title = "WebAIFreeAPI — Настройки";
            Width = 560;
            Height = 520;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#18181b"));
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4f4f5"));
            FontFamily = new FontFamily("Segoe UI, -apple-system, sans-serif");
            FontSize = 13;

            BuildUI();
            Loaded += async (s, e) => await LoadSettingsAsync();
        }

        private void BuildUI()
        {
            var mainGrid = new Grid();
            mainGrid.Margin = new Thickness(24);
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Header
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // Content
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Status & Buttons

            // Header
            var header = new TextBlock
            {
                Text = "⚙ Параметры и API-ключи",
                FontSize = 18,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#fafafa")),
                Margin = new Thickness(0, 0, 0, 16)
            };
            Grid.SetRow(header, 0);
            mainGrid.Children.Add(header);

            // Scrollable content
            var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            var panel = new StackPanel();

            // API Keys Section
            var secKeys = new TextBlock
            {
                Text = "Локальные OpenAI-совместимые API ключи",
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa")),
                Margin = new Thickness(0, 4, 0, 8)
            };
            panel.Children.Add(secKeys);

            panel.Children.Add(CreateLabel("DeepSeek API Key (Local):"));
            txtDeepSeekKey = CreateTextBox();
            panel.Children.Add(txtDeepSeekKey);

            panel.Children.Add(CreateLabel("Qwen API Key (Local):"));
            txtQwenKey = CreateTextBox();
            panel.Children.Add(txtQwenKey);

            panel.Children.Add(CreateLabel("ChatGPT API Key (Local):"));
            txtChatGPTKey = CreateTextBox();
            panel.Children.Add(txtChatGPTKey);

            // Permissions Section
            var secPerms = new TextBlock
            {
                Text = "Безопасность и разрешения Code Agent",
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa")),
                Margin = new Thickness(0, 16, 0, 8)
            };
            panel.Children.Add(secPerms);

            chkShell = CreateCheckBox("Разрешить запуск команд оболочки (cmd/powershell)", false);
            panel.Children.Add(chkShell);

            chkPython = CreateCheckBox("Разрешить выполнение Python и динамический eval", false);
            panel.Children.Add(chkPython);

            chkDestructive = CreateCheckBox("Разрешить операции удаления и перезаписи файлов", false);
            panel.Children.Add(chkDestructive);

            chkExternalWrites = CreateCheckBox("Разрешить запись файлов вне рабочей папки проекта", false);
            panel.Children.Add(chkExternalWrites);

            scroll.Content = panel;
            Grid.SetRow(scroll, 1);
            mainGrid.Children.Add(scroll);

            // Bottom bar
            var bottomGrid = new Grid { Margin = new Thickness(0, 16, 0, 0) };
            bottomGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            bottomGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            bottomGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            txtStatus = new TextBlock
            {
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa")),
                TextTrimming = TextTrimming.CharacterEllipsis
            };
            Grid.SetColumn(txtStatus, 0);
            bottomGrid.Children.Add(txtStatus);

            var btnCancel = new Button
            {
                Content = "Отмена",
                Width = 90,
                Height = 32,
                Margin = new Thickness(0, 0, 10, 0),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4f4f5")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3f3f46")),
                BorderThickness = new Thickness(1),
                Cursor = System.Windows.Input.Cursors.Hand
            };
            btnCancel.Click += (s, e) => Close();
            Grid.SetColumn(btnCancel, 1);
            bottomGrid.Children.Add(btnCancel);

            var btnSave = new Button
            {
                Content = "Сохранить",
                Width = 110,
                Height = 32,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2563eb")),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                BorderThickness = new Thickness(0),
                Cursor = System.Windows.Input.Cursors.Hand
            };
            btnSave.Click += async (s, e) => await SaveSettingsAsync();
            Grid.SetColumn(btnSave, 2);
            bottomGrid.Children.Add(btnSave);

            Grid.SetRow(bottomGrid, 2);
            mainGrid.Children.Add(bottomGrid);

            Content = mainGrid;
        }

        private TextBlock CreateLabel(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#d4d4d8")),
                Margin = new Thickness(0, 6, 0, 4)
            };
        }

        private TextBox CreateTextBox()
        {
            return new TextBox
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4f4f5")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3f3f46")),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 6, 8, 6),
                Margin = new Thickness(0, 0, 0, 8)
            };
        }

        private CheckBox CreateCheckBox(string text, bool isChecked)
        {
            return new CheckBox
            {
                Content = text,
                IsChecked = isChecked,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e4e4e7")),
                Margin = new Thickness(0, 4, 0, 4)
            };
        }

        private async System.Threading.Tasks.Task LoadSettingsAsync()
        {
            try
            {
                txtStatus.Text = "Загрузка настроек...";
                var data = await apiClient.GetSettingsAsync();
                if (data == null)
                {
                    txtStatus.Text = "Не удалось получить настройки.";
                    return;
                }

                if (data.ContainsKey("openAICompat"))
                {
                    var compat = data["openAICompat"] as Dictionary<string, object>;
                    if (compat != null && compat.ContainsKey("apiKeys"))
                    {
                        var keys = compat["apiKeys"] as Dictionary<string, object>;
                        if (keys != null)
                        {
                            txtDeepSeekKey.Text = keys.ContainsKey("deepseek") && keys["deepseek"] != null ? keys["deepseek"].ToString() : "";
                            txtQwenKey.Text = keys.ContainsKey("qwen") && keys["qwen"] != null ? keys["qwen"].ToString() : "";
                            txtChatGPTKey.Text = keys.ContainsKey("chatgpt") && keys["chatgpt"] != null ? keys["chatgpt"].ToString() : "";
                        }
                    }
                }

                if (data.ContainsKey("commandPermissions"))
                {
                    var perms = data["commandPermissions"] as Dictionary<string, object>;
                    if (perms != null)
                    {
                        chkShell.IsChecked = perms.ContainsKey("allowShell") && true.Equals(perms["allowShell"]);
                        chkPython.IsChecked = perms.ContainsKey("allowPythonModuleAndEval") && true.Equals(perms["allowPythonModuleAndEval"]);
                        chkDestructive.IsChecked = perms.ContainsKey("allowDestructiveActions") && true.Equals(perms["allowDestructiveActions"]);
                        chkExternalWrites.IsChecked = perms.ContainsKey("allowExternalWrites") && true.Equals(perms["allowExternalWrites"]);
                    }
                }

                txtStatus.Text = "";
            }
            catch (Exception ex)
            {
                txtStatus.Text = "Ошибка: " + ex.Message;
            }
        }

        private async System.Threading.Tasks.Task SaveSettingsAsync()
        {
            try
            {
                txtStatus.Text = "Сохранение...";
                var current = await apiClient.GetSettingsAsync();
                if (current == null) current = new Dictionary<string, object>();

                var perms = new Dictionary<string, object>
                {
                    { "allowShell", chkShell.IsChecked == true },
                    { "allowPythonModuleAndEval", chkPython.IsChecked == true },
                    { "allowDestructiveActions", chkDestructive.IsChecked == true },
                    { "allowExternalWrites", chkExternalWrites.IsChecked == true }
                };

                current["commandPermissions"] = perms;

                await apiClient.SaveSettingsAsync(current);
                txtStatus.Text = "Сохранено успешно!";
                await System.Threading.Tasks.Task.Delay(600);
                Close();
            }
            catch (Exception ex)
            {
                txtStatus.Text = "Ошибка сохранения: " + ex.Message;
            }
        }
    }
}
