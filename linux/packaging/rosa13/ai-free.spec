Name:           ai-free
Version:        1.10.0
Release:        0.1.alpha1%{?dist}
Summary:        Free local AI client for DeepSeek, Qwen and ChatGPT with OpenAI-compatible API
Summary(ru):    Локальный ИИ-клиент DeepSeek, Qwen и ChatGPT с поддержкой OpenAI API
License:        MIT
Group:          Development/Tools
URL:            https://github.com/j46871417-ui/WebAIFreeAPI
Source0:        %{name}-1.10.0-alpha.1-linux.tar.gz

BuildArch:      noarch

Requires:       nodejs >= 18.0.0
Requires:       python3
Requires:       xdg-utils

Recommends:     chromium | google-chrome-stable | firefox
Recommends:     python3-pystray
Recommends:     python3-pillow

%description
Free local AI client for DeepSeek, Qwen and ChatGPT with OpenAI-compatible API,
CLI, code agent, memory and skills.

%description -l ru
Локальный ИИ-клиент DeepSeek, Qwen и ChatGPT с поддержкой OpenAI API,
консольным интерфейсом, кодовым агентом, долговременной памятью и навыками.

%prep
%setup -q -n %{name}-1.10.0-alpha.1

%build
# No compilation required for pure JavaScript / Node.js application.

%install
rm -rf %{buildroot}

mkdir -p %{buildroot}/opt/%{name}
mkdir -p %{buildroot}%{_bindir}
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/scalable/apps
mkdir -p %{buildroot}%{_prefix}/lib/systemd/user

# Копирует файлы проекта в %{buildroot}/opt/ai-free/ (исключая .git, tests, src-native, .github)
cp -a . %{buildroot}/opt/%{name}/

# Удаление исключаемых служебных файлов разработки и тестовых директорий
rm -rf %{buildroot}/opt/%{name}/.git
rm -rf %{buildroot}/opt/%{name}/.github
rm -rf %{buildroot}/opt/%{name}/test
rm -rf %{buildroot}/opt/%{name}/tests
rm -rf %{buildroot}/opt/%{name}/src-native
rm -rf %{buildroot}/opt/%{name}/dist
rm -rf %{buildroot}/opt/%{name}/node
rm -rf %{buildroot}/opt/%{name}/webview2-sdk

# Удаление Windows-специфичных бинарников и скриптов
rm -f %{buildroot}/opt/%{name}/bin/*.exe
rm -f %{buildroot}/opt/%{name}/bin/*.dll
rm -f %{buildroot}/opt/%{name}/*.bat
rm -f %{buildroot}/opt/%{name}/*.vbs

# Установка прав на исполняемые файлы
chmod 0755 %{buildroot}/opt/%{name}/linux/bin/%{name}
chmod 0755 %{buildroot}/opt/%{name}/bin/deepseek.mjs
chmod 0755 %{buildroot}/opt/%{name}/bin/launcher.mjs
chmod 0755 %{buildroot}/opt/%{name}/bin/ai-free-browser-mcp.mjs

# Симлинк %{buildroot}%{_bindir}/ai-free -> /opt/ai-free/linux/bin/ai-free
ln -sf /opt/%{name}/linux/bin/%{name} %{buildroot}%{_bindir}/%{name}

# Установка десктоп-файла
install -m 0644 linux/%{name}.desktop %{buildroot}%{_datadir}/applications/%{name}.desktop

# Установка иконки
install -m 0644 linux/%{name}.svg %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/%{name}.svg

# Установка systemd юнита
install -m 0644 linux/%{name}.service %{buildroot}%{_prefix}/lib/systemd/user/%{name}.service

%post
if [ $1 -eq 1 ]; then
    /usr/bin/update-desktop-database &> /dev/null || :
    /bin/touch --no-create %{_datadir}/icons/hicolor &> /dev/null || :
    %{_bindir}/gtk-update-icon-cache %{_datadir}/icons/hicolor &> /dev/null || :
fi

%postun
/usr/bin/update-desktop-database &> /dev/null || :
/bin/touch --no-create %{_datadir}/icons/hicolor &> /dev/null || :
%{_bindir}/gtk-update-icon-cache %{_datadir}/icons/hicolor &> /dev/null || :

%files
%defattr(-,root,root,-)
%license LICENSE
%doc README.md INSTALL.md
/opt/%{name}
%attr(0755,root,root) /opt/%{name}/linux/bin/%{name}
%attr(0755,root,root) /opt/%{name}/bin/deepseek.mjs
%attr(0755,root,root) /opt/%{name}/bin/launcher.mjs
%attr(0755,root,root) /opt/%{name}/bin/ai-free-browser-mcp.mjs
%attr(0755,root,root) %{_bindir}/%{name}
%{_datadir}/applications/%{name}.desktop
%{_datadir}/icons/hicolor/scalable/apps/%{name}.svg
%{_prefix}/lib/systemd/user/%{name}.service

%changelog
* Fri Oct 02 2026 WebAIFreeAPI Packager <packager@ai-free.local> - 1.9.9-1
- Initial packaging for ROSA Linux Fresh 13
- Spec with noarch support, systemd service, desktop launcher, and icon cache integration
