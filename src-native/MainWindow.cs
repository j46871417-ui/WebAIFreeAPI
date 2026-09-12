using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace WebAIFreeAPI.Native
{
    public class MainWindow : Window
    {
        private readonly ApiClient apiClient;
        private NativeTray tray;

        // State
        private string activeConversationId;
        private string currentWorkspace = Directory.GetCurrentDirectory();
        private List<Dictionary<string, object>> conversations = new List<Dictionary<string, object>>();
        private CancellationTokenSource streamCts;
        private bool isSending = false;

        // UI Controls
        private StackPanel chatListPanel;
        private StackPanel messagesPanel;
        private ScrollViewer messagesScroll;
        private TextBox txtInput;
        private Button btnSend;
        private Button btnStop;
        private ComboBox cmbModel;
        private ComboBox cmbMode;
        private TextBlock txtStatus;
        private TextBlock txtWorkspace;
        private Border currentStreamingCard;
        private TextBlock currentStreamingTextBlock;

        public MainWindow(ApiClient client)
        {
            this.apiClient = client;

            Title = "WebAIFreeAPI — AI Desktop v1.6.2";
            Width = 1120;
            Height = 740;
            MinWidth = 860;
            MinHeight = 560;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0f0f12"));
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4f4f5"));
            FontFamily = new FontFamily("Segoe UI, -apple-system, sans-serif");
            FontSize = 13;

            BuildUI();

            Loaded += async (s, e) =>
            {
                InitializeTray();
                await RefreshStateAsync();
            };

            Closing += (s, e) =>
            {
                if (tray != null) tray.Dispose();
            };
        }

        private void InitializeTray()
        {
            tray = new NativeTray(
                this,
                onOpenSettings: () => OpenSettings(),
                onOpenTerminal: () => OpenTerminal(),
                onExit: () =>
                {
                    if (tray != null) tray.Dispose();
                    Application.Current.Shutdown();
                }
            );
        }

        private void BuildUI()
        {
            var rootGrid = new Grid();
            rootGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(270) }); // Left Sidebar
            rootGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Main Area

            // ================= LEFT SIDEBAR =================
            var sidebar = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#18181c")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                BorderThickness = new Thickness(0, 0, 1, 0)
            };

            var sidebarGrid = new Grid();
            sidebarGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Header & New Chat button
            sidebarGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // Chat list
            sidebarGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Workspace info

            // Sidebar Header
            var sbHeader = new StackPanel { Margin = new Thickness(14, 16, 14, 12) };

            var brandPanel = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 14) };
            var brandTitle = new TextBlock
            {
                Text = "WebAIFreeAPI",
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center
            };
            var brandTag = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2563eb")),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(5, 1, 5, 1),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock
                {
                    Text = "v1.6.2",
                    FontSize = 10,
                    FontWeight = FontWeights.Bold,
                    Foreground = Brushes.White
                }
            };
            brandPanel.Children.Add(brandTitle);
            brandPanel.Children.Add(brandTag);
            sbHeader.Children.Add(brandPanel);

            var btnNewChat = new Button
            {
                Content = "+ Новый чат",
                Height = 36,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2563eb")),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand
            };
            btnNewChat.Click += async (s, e) => await CreateNewChatAsync();
            sbHeader.Children.Add(btnNewChat);

            Grid.SetRow(sbHeader, 0);
            sidebarGrid.Children.Add(sbHeader);

            // Chat list scroll
            var chatScroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Margin = new Thickness(6, 0, 6, 0)
            };
            chatListPanel = new StackPanel();
            chatScroll.Content = chatListPanel;
            Grid.SetRow(chatScroll, 1);
            sidebarGrid.Children.Add(chatScroll);

            // Sidebar Footer: Workspace
            var sbFooter = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#131316")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(12, 10, 12, 10)
            };
            var sbFooterPanel = new StackPanel();
            var wsHeader = new TextBlock
            {
                Text = "Рабочая папка:",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#71717a"))
            };
            txtWorkspace = new TextBlock
            {
                Text = currentWorkspace,
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#d4d4d8")),
                TextTrimming = TextTrimming.CharacterEllipsis,
                Margin = new Thickness(0, 2, 0, 6)
            };

            var btnChangeWs = new Button
            {
                Content = "📁 Выбрать папку...",
                Height = 26,
                FontSize = 11,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e4e4e7")),
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand
            };
            btnChangeWs.Click += (s, e) => ChangeWorkspaceDialog();

            sbFooterPanel.Children.Add(wsHeader);
            sbFooterPanel.Children.Add(txtWorkspace);
            sbFooterPanel.Children.Add(btnChangeWs);
            sbFooter.Child = sbFooterPanel;

            Grid.SetRow(sbFooter, 2);
            sidebarGrid.Children.Add(sbFooter);

            sidebar.Child = sidebarGrid;
            Grid.SetColumn(sidebar, 0);
            rootGrid.Children.Add(sidebar);

            // ================= RIGHT MAIN AREA =================
            var mainGrid = new Grid();
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Header (Models, Modes, Settings)
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // Messages feed
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Composer / Input

            // Header Bar
            var topBar = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#18181c")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(16, 10, 16, 10)
            };
            var topGrid = new Grid();
            topGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Model & Mode
            topGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Status
            topGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Actions

            var leftTopPanel = new StackPanel { Orientation = Orientation.Horizontal };

            var lblModel = new TextBlock
            {
                Text = "Модель:",
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa"))
            };
            cmbModel = new ComboBox
            {
                Width = 170,
                Height = 28,
                Margin = new Thickness(0, 0, 16, 0),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = Brushes.Black,
                Cursor = Cursors.Hand
            };
            cmbModel.Items.Add("deepseek-chat");
            cmbModel.Items.Add("deepseek-reasoner");
            cmbModel.Items.Add("qwen3.7-max");
            cmbModel.Items.Add("qwen3.7-plus");
            cmbModel.Items.Add("chatgpt-4o");
            cmbModel.SelectedIndex = 0;

            var lblMode = new TextBlock
            {
                Text = "Режим:",
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa"))
            };
            cmbMode = new ComboBox
            {
                Width = 120,
                Height = 28,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = Brushes.Black,
                Cursor = Cursors.Hand
            };
            cmbMode.Items.Add("Чат");
            cmbMode.Items.Add("Кодер");
            cmbMode.Items.Add("Агент");
            cmbMode.SelectedIndex = 0;

            leftTopPanel.Children.Add(lblModel);
            leftTopPanel.Children.Add(cmbModel);
            leftTopPanel.Children.Add(lblMode);
            leftTopPanel.Children.Add(cmbMode);
            Grid.SetColumn(leftTopPanel, 0);
            topGrid.Children.Add(leftTopPanel);

            // Status label in center
            txtStatus = new TextBlock
            {
                Text = "🟢 Подключено",
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#22c55e")),
                FontSize = 12
            };
            Grid.SetColumn(txtStatus, 1);
            topGrid.Children.Add(txtStatus);

            // Right header buttons: Terminal & Settings
            var rightTopPanel = new StackPanel { Orientation = Orientation.Horizontal };

            var btnTerm = new Button
            {
                Content = "⚡ Терминал",
                Height = 28,
                Padding = new Thickness(10, 0, 10, 0),
                Margin = new Thickness(0, 0, 8, 0),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e4e4e7")),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3f3f46")),
                Cursor = Cursors.Hand
            };
            btnTerm.Click += (s, e) => OpenTerminal();

            var btnSettings = new Button
            {
                Content = "⚙ Настройки",
                Height = 28,
                Padding = new Thickness(10, 0, 10, 0),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e4e4e7")),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3f3f46")),
                Cursor = Cursors.Hand
            };
            btnSettings.Click += (s, e) => OpenSettings();

            rightTopPanel.Children.Add(btnTerm);
            rightTopPanel.Children.Add(btnSettings);
            Grid.SetColumn(rightTopPanel, 2);
            topGrid.Children.Add(rightTopPanel);

            topBar.Child = topGrid;
            Grid.SetRow(topBar, 0);
            mainGrid.Children.Add(topBar);

            // Center Messages feed
            messagesScroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Padding = new Thickness(20)
            };
            messagesPanel = new StackPanel();
            messagesScroll.Content = messagesPanel;
            Grid.SetRow(messagesScroll, 1);
            mainGrid.Children.Add(messagesScroll);

            // Bottom Composer / Input
            var composerBorder = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#18181c")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(16, 10, 16, 14)
            };
            var composerGrid = new Grid();
            composerGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Quick pills
            composerGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Input + buttons

            // Quick action pills
            var pillsPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 8)
            };
            pillsPanel.Children.Add(CreatePillButton("⚡ /ps", "/ps "));
            pillsPanel.Children.Add(CreatePillButton("💻 /terminal", "/terminal "));
            pillsPanel.Children.Add(CreatePillButton("📄 /file", () => PickAndInsertFile()));
            pillsPanel.Children.Add(CreatePillButton("📁 /folder", () => ChangeWorkspaceDialog()));
            pillsPanel.Children.Add(CreatePillButton("🛠 /code", "/code "));
            Grid.SetRow(pillsPanel, 0);
            composerGrid.Children.Add(pillsPanel);

            // Input Row
            var inputGrid = new Grid();
            inputGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            inputGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            txtInput = new TextBox
            {
                MinHeight = 44,
                MaxHeight = 150,
                AcceptsReturn = true,
                TextWrapping = TextWrapping.Wrap,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#232328")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4f4f5")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3f3f46")),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 8, 10, 8),
                FontSize = 14
            };
            txtInput.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter && (Keyboard.Modifiers & ModifierKeys.Shift) == 0 && (Keyboard.Modifiers & ModifierKeys.Control) == 0)
                {
                    e.Handled = true;
                    SendMessage();
                }
            };
            Grid.SetColumn(txtInput, 0);
            inputGrid.Children.Add(txtInput);

            var btnsPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(10, 0, 0, 0)
            };

            btnSend = new Button
            {
                Content = "➤ Отправить",
                Height = 44,
                Padding = new Thickness(16, 0, 16, 0),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2563eb")),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand
            };
            btnSend.Click += (s, e) => SendMessage();

            btnStop = new Button
            {
                Content = "⏹ Стоп",
                Height = 44,
                Padding = new Thickness(14, 0, 14, 0),
                Margin = new Thickness(6, 0, 0, 0),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#dc2626")),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                BorderThickness = new Thickness(0),
                Visibility = Visibility.Collapsed,
                Cursor = Cursors.Hand
            };
            btnStop.Click += (s, e) => StopStreaming();

            btnsPanel.Children.Add(btnSend);
            btnsPanel.Children.Add(btnStop);
            Grid.SetColumn(btnsPanel, 1);
            inputGrid.Children.Add(btnsPanel);

            Grid.SetRow(inputGrid, 1);
            composerGrid.Children.Add(inputGrid);

            composerBorder.Child = composerGrid;
            Grid.SetRow(composerBorder, 2);
            mainGrid.Children.Add(composerBorder);

            Grid.SetColumn(mainGrid, 1);
            rootGrid.Children.Add(mainGrid);

            Content = rootGrid;
        }

        private Button CreatePillButton(string label, string insertText)
        {
            return CreatePillButton(label, () =>
            {
                txtInput.Text = insertText + txtInput.Text;
                txtInput.Focus();
                txtInput.CaretIndex = txtInput.Text.Length;
            });
        }

        private Button CreatePillButton(string label, Action onClick)
        {
            var btn = new Button
            {
                Content = label,
                Height = 24,
                Padding = new Thickness(8, 0, 8, 0),
                Margin = new Thickness(0, 0, 6, 0),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3f3f46")),
                BorderThickness = new Thickness(1),
                FontSize = 11,
                Cursor = Cursors.Hand
            };
            btn.Click += (s, e) => onClick();
            return btn;
        }

        private void PickAndInsertFile()
        {
            var ofd = new Microsoft.Win32.OpenFileDialog
            {
                Title = "Выберите файл для добавления в запрос",
                InitialDirectory = currentWorkspace
            };
            if (ofd.ShowDialog() == true)
            {
                txtInput.Text += " " + ofd.FileName;
                txtInput.Focus();
                txtInput.CaretIndex = txtInput.Text.Length;
            }
        }

        private void ChangeWorkspaceDialog()
        {
            using (var fbd = new System.Windows.Forms.FolderBrowserDialog())
            {
                fbd.SelectedPath = currentWorkspace;
                fbd.Description = "Выберите рабочую папку проекта для WebAIFreeAPI";
                if (fbd.ShowDialog() == System.Windows.Forms.DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
                {
                    currentWorkspace = fbd.SelectedPath;
                    txtWorkspace.Text = currentWorkspace;
                }
            }
        }

        private void OpenSettings()
        {
            var wnd = new SettingsWindow(apiClient);
            wnd.Owner = this;
            wnd.ShowDialog();
        }

        private async void OpenTerminal()
        {
            txtStatus.Text = "Запуск терминала...";
            bool ok = await apiClient.OpenTerminalAsync(currentWorkspace, "powershell");
            txtStatus.Text = ok ? "🟢 Терминал запущен" : "🔴 Ошибка запуска терминала";
        }

        public async Task RefreshStateAsync()
        {
            try
            {
                txtStatus.Text = "Синхронизация...";
                var state = await apiClient.GetStateAsync();
                if (state == null)
                {
                    txtStatus.Text = "🔴 Нет связи с движком";
                    return;
                }

                txtStatus.Text = "🟢 Подключено";

                if (state.ContainsKey("workspaceRoot") && state["workspaceRoot"] != null)
                {
                    currentWorkspace = state["workspaceRoot"].ToString();
                    txtWorkspace.Text = currentWorkspace;
                }

                conversations.Clear();
                if (state.ContainsKey("conversations"))
                {
                    var convList = state["conversations"] as IList;
                    if (convList != null)
                    {
                        foreach (var item in convList)
                        {
                            var dict = item as Dictionary<string, object>;
                            if (dict != null)
                            {
                                conversations.Add(dict);
                            }
                        }
                    }
                }

                string activeId = state.ContainsKey("activeConversationId") && state["activeConversationId"] != null
                    ? state["activeConversationId"].ToString()
                    : null;
                RenderConversationList(activeId);

                if (!string.IsNullOrEmpty(activeId))
                {
                    await SelectConversationAsync(activeId);
                }
                else if (conversations.Count > 0)
                {
                    string firstId = conversations[0].ContainsKey("id") && conversations[0]["id"] != null
                        ? conversations[0]["id"].ToString()
                        : null;
                    if (!string.IsNullOrEmpty(firstId))
                    {
                        await SelectConversationAsync(firstId);
                    }
                }
                else
                {
                    ShowEmptyChatState();
                }
            }
            catch (Exception ex)
            {
                txtStatus.Text = "Ошибка: " + ex.Message;
            }
        }

        private void RenderConversationList(string activeId)
        {
            chatListPanel.Children.Clear();
            activeConversationId = activeId;

            foreach (var conv in conversations)
            {
                string id = conv.ContainsKey("id") && conv["id"] != null ? conv["id"].ToString() : "";
                string title = conv.ContainsKey("title") && conv["title"] != null ? conv["title"].ToString() : "Без названия";
                string provider = conv.ContainsKey("provider") && conv["provider"] != null ? conv["provider"].ToString() : "deepseek";
                bool isActive = (id == activeId);

                var itemBorder = new Border
                {
                    Background = isActive
                        ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a"))
                        : Brushes.Transparent,
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(10, 8, 8, 8),
                    Margin = new Thickness(0, 2, 0, 2),
                    Cursor = Cursors.Hand
                };

                var itemGrid = new Grid();
                itemGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                itemGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                var textPanel = new StackPanel();
                var titleBlock = new TextBlock
                {
                    Text = title,
                    FontWeight = isActive ? FontWeights.SemiBold : FontWeights.Normal,
                    Foreground = isActive ? Brushes.White : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#d4d4d8")),
                    TextTrimming = TextTrimming.CharacterEllipsis,
                    FontSize = 12
                };
                var subBlock = new TextBlock
                {
                    Text = provider.ToUpper(),
                    FontSize = 10,
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#71717a")),
                    Margin = new Thickness(0, 2, 0, 0)
                };
                textPanel.Children.Add(titleBlock);
                textPanel.Children.Add(subBlock);
                Grid.SetColumn(textPanel, 0);
                itemGrid.Children.Add(textPanel);

                // Delete button
                var btnDel = new Button
                {
                    Content = "✕",
                    Width = 20,
                    Height = 20,
                    FontSize = 10,
                    Background = Brushes.Transparent,
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#71717a")),
                    BorderThickness = new Thickness(0),
                    Cursor = Cursors.Hand
                };
                btnDel.Click += async (s, e) =>
                {
                    e.Handled = true;
                    await DeleteChatAsync(id);
                };
                Grid.SetColumn(btnDel, 1);
                itemGrid.Children.Add(btnDel);

                itemBorder.Child = itemGrid;
                itemBorder.MouseDown += async (s, e) =>
                {
                    if (e.ChangedButton == MouseButton.Left)
                    {
                        await SelectConversationAsync(id);
                    }
                };

                chatListPanel.Children.Add(itemBorder);
            }
        }

        private async Task SelectConversationAsync(string id)
        {
            activeConversationId = id;
            RenderConversationList(id);

            var conv = conversations.FirstOrDefault(c => c.ContainsKey("id") && c["id"] != null && c["id"].ToString() == id);
            if (conv == null) return;

            messagesPanel.Children.Clear();

            if (conv.ContainsKey("messages"))
            {
                var msgList = conv["messages"] as IList;
                if (msgList != null)
                {
                    foreach (var m in msgList)
                    {
                        var msgDict = m as Dictionary<string, object>;
                        if (msgDict != null)
                        {
                            string role = msgDict.ContainsKey("role") && msgDict["role"] != null ? msgDict["role"].ToString() : "assistant";
                            string content = msgDict.ContainsKey("content") && msgDict["content"] != null ? msgDict["content"].ToString() : "";
                            AddMessageCard(role, content);
                        }
                    }
                }
            }

            messagesScroll.ScrollToEnd();
            await Task.Yield();
        }

        private async Task CreateNewChatAsync()
        {
            string provider = "deepseek";
            string selectedModel = cmbModel.SelectedItem != null ? cmbModel.SelectedItem.ToString() : "deepseek-chat";
            if (selectedModel.Contains("qwen")) provider = "qwen";
            else if (selectedModel.Contains("chatgpt")) provider = "chatgpt";

            string mode = "chat";
            int modeIdx = cmbMode.SelectedIndex;
            if (modeIdx == 1) mode = "code";
            else if (modeIdx == 2) mode = "agent";

            var res = await apiClient.CreateConversationAsync(
                title: "Новый чат",
                provider: provider,
                mode: mode,
                workspace: currentWorkspace,
                roleId: "developer"
            );

            await RefreshStateAsync();
        }

        private async Task DeleteChatAsync(string id)
        {
            if (MessageBox.Show("Удалить этот диалог?", "Подтверждение", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
            {
                await apiClient.DeleteConversationAsync(id);
                await RefreshStateAsync();
            }
        }

        private void ShowEmptyChatState()
        {
            messagesPanel.Children.Clear();
            var empty = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#18181c")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(32),
                Margin = new Thickness(40),
                HorizontalAlignment = HorizontalAlignment.Center
            };
            var panel = new StackPanel();
            panel.Children.Add(new TextBlock
            {
                Text = "⚡ WebAIFreeAPI готов к работе",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center
            });
            panel.Children.Add(new TextBlock
            {
                Text = "Создайте новый чат или начните вводить запрос ниже.\nДоступны команды: /ps, /terminal, /file, /code",
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa")),
                Margin = new Thickness(0, 10, 0, 0),
                TextAlignment = TextAlignment.Center
            });
            empty.Child = panel;
            messagesPanel.Children.Add(empty);
        }

        private void AddMessageCard(string role, string content)
        {
            bool isUser = role == "user";

            var card = new Border
            {
                Background = isUser
                    ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e293b"))
                    : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#18181c")),
                BorderBrush = isUser
                    ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#334155"))
                    : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(14, 12, 14, 12),
                Margin = new Thickness(isUser ? 60 : 0, 6, isUser ? 0 : 60, 6)
            };

            var cardPanel = new StackPanel();

            // Header of message
            var header = new TextBlock
            {
                Text = isUser ? "👤 Вы" : "🤖 WebAIFreeAPI",
                FontWeight = FontWeights.SemiBold,
                FontSize = 11,
                Foreground = isUser
                    ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#93c5fd"))
                    : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa")),
                Margin = new Thickness(0, 0, 0, 8)
            };
            cardPanel.Children.Add(header);

            // Body rendering (split by code blocks)
            RenderFormattedText(cardPanel, content);

            card.Child = cardPanel;
            messagesPanel.Children.Add(card);
        }

        private void RenderFormattedText(StackPanel targetPanel, string content)
        {
            if (string.IsNullOrEmpty(content)) return;

            // Simple parser for ```code blocks```
            var parts = content.Split(new string[] { "```" }, StringSplitOptions.None);
            for (int i = 0; i < parts.Length; i++)
            {
                string part = parts[i];
                bool isCode = (i % 2 == 1);

                if (isCode)
                {
                    string lang = "code";
                    string code = part;
                    int nl = part.IndexOf('\n');
                    if (nl > 0 && nl < 20)
                    {
                        lang = part.Substring(0, nl).Trim();
                        code = part.Substring(nl + 1);
                    }

                    var codeBorder = new Border
                    {
                        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#09090b")),
                        BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                        BorderThickness = new Thickness(1),
                        CornerRadius = new CornerRadius(6),
                        Margin = new Thickness(0, 6, 0, 6)
                    };
                    var codeGrid = new Grid();
                    codeGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Header with Copy button
                    codeGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Code text

                    var codeHeaderBorder = new Border
                    {
                        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#131316")),
                        Padding = new Thickness(10, 4, 10, 4)
                    };
                    var codeHeader = new Grid();
                    codeHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    codeHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                    var langLabel = new TextBlock
                    {
                        Text = string.IsNullOrEmpty(lang) ? "code" : lang,
                        FontSize = 10,
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#71717a")),
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    Grid.SetColumn(langLabel, 0);
                    codeHeader.Children.Add(langLabel);

                    var btnCopy = new Button
                    {
                        Content = "Копировать",
                        FontSize = 10,
                        Padding = new Thickness(6, 2, 6, 2),
                        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e4e4e7")),
                        BorderThickness = new Thickness(0),
                        Cursor = Cursors.Hand
                    };
                    string codeToCopy = code.Trim();
                    btnCopy.Click += async (s, e) =>
                    {
                        Clipboard.SetText(codeToCopy);
                        btnCopy.Content = "✓ Скопировано";
                        await Task.Delay(1500);
                        btnCopy.Content = "Копировать";
                    };
                    Grid.SetColumn(btnCopy, 1);
                    codeHeader.Children.Add(btnCopy);

                    codeHeaderBorder.Child = codeHeader;
                    Grid.SetRow(codeHeaderBorder, 0);
                    codeGrid.Children.Add(codeHeaderBorder);

                    var txtCode = new TextBox
                    {
                        Text = codeToCopy,
                        IsReadOnly = true,
                        FontFamily = new FontFamily("Consolas, Cascadia Code, Courier New"),
                        FontSize = 12,
                        Background = Brushes.Transparent,
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#93c5fd")),
                        BorderThickness = new Thickness(0),
                        Padding = new Thickness(10),
                        AcceptsReturn = true,
                        TextWrapping = TextWrapping.Wrap
                    };
                    Grid.SetRow(txtCode, 1);
                    codeGrid.Children.Add(txtCode);

                    codeBorder.Child = codeGrid;
                    targetPanel.Children.Add(codeBorder);
                }
                else
                {
                    string text = part.Trim();
                    if (!string.IsNullOrEmpty(text))
                    {
                        var tb = new TextBox
                        {
                            Text = text,
                            IsReadOnly = true,
                            Background = Brushes.Transparent,
                            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4f4f5")),
                            BorderThickness = new Thickness(0),
                            Padding = new Thickness(0),
                            Margin = new Thickness(0, 2, 0, 2),
                            AcceptsReturn = true,
                            TextWrapping = TextWrapping.Wrap,
                            FontSize = 13
                        };
                        targetPanel.Children.Add(tb);
                    }
                }
            }
        }

        private async void SendMessage()
        {
            if (isSending) return;

            string prompt = txtInput.Text.Trim();
            if (string.IsNullOrEmpty(prompt)) return;

            // If no active chat, create one first
            if (string.IsNullOrEmpty(activeConversationId))
            {
                await CreateNewChatAsync();
            }

            if (string.IsNullOrEmpty(activeConversationId)) return;

            txtInput.Text = "";
            isSending = true;
            btnSend.Visibility = Visibility.Collapsed;
            btnStop.Visibility = Visibility.Visible;

            // Add user message to UI immediately
            AddMessageCard("user", prompt);

            // Create streaming assistant message card
            var streamCard = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#18181c")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27272a")),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(14, 12, 14, 12),
                Margin = new Thickness(0, 6, 60, 6)
            };
            var streamPanel = new StackPanel();
            var streamHeader = new TextBlock
            {
                Text = "🤖 WebAIFreeAPI (ответ...)",
                FontWeight = FontWeights.SemiBold,
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#a1a1aa")),
                Margin = new Thickness(0, 0, 0, 8)
            };
            streamPanel.Children.Add(streamHeader);

            currentStreamingTextBlock = new TextBlock
            {
                Text = "…",
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4f4f5")),
                TextWrapping = TextWrapping.Wrap,
                FontSize = 13
            };
            streamPanel.Children.Add(currentStreamingTextBlock);
            streamCard.Child = streamPanel;
            messagesPanel.Children.Add(streamCard);
            currentStreamingCard = streamCard;
            messagesScroll.ScrollToEnd();

            streamCts = new CancellationTokenSource();
            string finalContent = "";

            try
            {
                await apiClient.SendMessageStreamingAsync(
                    activeConversationId,
                    prompt,
                    onDelta: (deltaText) =>
                    {
                        Dispatcher.Invoke(() =>
                        {
                            finalContent = deltaText;
                            if (currentStreamingTextBlock != null)
                            {
                                currentStreamingTextBlock.Text = deltaText;
                                messagesScroll.ScrollToEnd();
                            }
                        });
                    },
                    onComplete: (doneObj) =>
                    {
                        Dispatcher.Invoke(() =>
                        {
                            FinishStreaming(finalContent);
                        });
                    },
                    onError: (err) =>
                    {
                        Dispatcher.Invoke(() =>
                        {
                            FinishStreaming("Ошибка: " + err);
                        });
                    },
                    ct: streamCts.Token
                );
            }
            catch (Exception ex)
            {
                FinishStreaming("Ошибка отправки: " + ex.Message);
            }
        }

        private void FinishStreaming(string finalContent)
        {
            isSending = false;
            btnSend.Visibility = Visibility.Visible;
            btnStop.Visibility = Visibility.Collapsed;

            // Re-render the streaming card with code block highlighting
            if (currentStreamingCard != null && messagesPanel.Children.Contains(currentStreamingCard))
            {
                messagesPanel.Children.Remove(currentStreamingCard);
                currentStreamingCard = null;
                currentStreamingTextBlock = null;

                if (!string.IsNullOrEmpty(finalContent))
                {
                    AddMessageCard("assistant", finalContent);
                    messagesScroll.ScrollToEnd();
                }
            }
        }

        private void StopStreaming()
        {
            try
            {
                if (streamCts != null) streamCts.Cancel();
                if (!string.IsNullOrEmpty(activeConversationId))
                {
                    Task.Run(() => apiClient.StopConversationAsync(activeConversationId));
                }
            }
            catch {}

            FinishStreaming(currentStreamingTextBlock != null ? currentStreamingTextBlock.Text : "");
        }
    }
}
