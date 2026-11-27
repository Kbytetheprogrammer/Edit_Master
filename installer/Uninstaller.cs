using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal sealed class UninstallerForm : Form
{
    private readonly Color bg = Color.FromArgb(18, 18, 18);
    private readonly Color orange = Color.FromArgb(255, 122, 0);
    private readonly Color muted = Color.FromArgb(185, 185, 185);
    private Panel content;
    private Label title, subtitle, body, step, progressFill, progressStatus, progressPercent;
    private Button back, next, cancel;
    private CheckBox deleteData;
    private ComboBox languagePicker;
    private int language;
    private int page;
    private int progress;
    private System.Windows.Forms.Timer timer;
    private bool working;

    private string L(string pt, string en, string es)
    {
        return language == 1 ? en : language == 2 ? es : pt;
    }

    public UninstallerForm()
    {
        Text = "Edit Master - Uninstaller";
        Width = 800;
        Height = 560;
        MinimumSize = new Size(760, 520);
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = bg;
        Font = new Font("Segoe UI", 10f);
        ShowInTaskbar = true;
        try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        Panel top = new Panel { Dock = DockStyle.Top, Height = 65, BackColor = Color.FromArgb(12, 12, 12) };
        top.MouseDown += DragWindow;
        Label mark = new Label { Text = "M", ForeColor = Color.Black, BackColor = orange, Font = new Font("Segoe UI", 19, FontStyle.Bold), TextAlign = ContentAlignment.MiddleCenter, Bounds = new Rectangle(22, 11, 40, 40) };
        mark.MouseDown += DragWindow;
        Label brand = new Label { Text = "EDIT MASTER", ForeColor = Color.White, Font = new Font("Segoe UI", 12, FontStyle.Bold), AutoSize = true, Location = new Point(76, 20) };
        brand.MouseDown += DragWindow;
        Button close = MakeButton("×", false);
        close.Bounds = new Rectangle(Width - 54, 0, 54, 62);
        close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        close.Click += delegate { if (!working) Close(); };
        languagePicker = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, BackColor = Color.FromArgb(38, 38, 38), ForeColor = Color.White, Font = new Font("Segoe UI", 9), Location = new Point(570, 17), Size = new Size(170, 30), Anchor = AnchorStyles.Top | AnchorStyles.Right };
        languagePicker.Items.AddRange(new object[] { "Português", "English", "Español" });
        string culture = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        language = culture == "en" ? 1 : culture == "es" ? 2 : 0;
        languagePicker.SelectedIndex = language;
        languagePicker.SelectedIndexChanged += delegate {
            if (languagePicker.SelectedIndex >= 0 && !working) {
                language = languagePicker.SelectedIndex;
                ShowPage(page);
            }
        };
        Panel accent = new Panel { Dock = DockStyle.Bottom, Height = 3, BackColor = orange };
        top.Controls.Add(mark);
        top.Controls.Add(brand);
        top.Controls.Add(close);
        top.Controls.Add(languagePicker);
        top.Controls.Add(accent);
        Controls.Add(top);

        Panel footer = new Panel { Dock = DockStyle.Bottom, Height = 78, BackColor = Color.FromArgb(14, 14, 14) };
        step = new Label { ForeColor = muted, AutoSize = false, TextAlign = ContentAlignment.MiddleLeft, Location = new Point(26, 22), Size = new Size(190, 32) };
        back = MakeButton("VOLTAR", false);
        back.SetBounds(footer.Width - 348, 17, 96, 44);
        back.Anchor = AnchorStyles.Right | AnchorStyles.Top;
        back.Click += delegate { if (page > 0 && !working) ShowPage(page - 1); };
        cancel = MakeButton("CANCELAR", false);
        cancel.SetBounds(footer.Width - 240, 17, 108, 44);
        cancel.Anchor = AnchorStyles.Right | AnchorStyles.Top;
        cancel.Click += delegate { if (!working) Close(); };
        next = MakeButton("CONTINUAR", true);
        next.SetBounds(footer.Width - 120, 17, 104, 44);
        next.Anchor = AnchorStyles.Right | AnchorStyles.Top;
        next.Click += NextClicked;
        footer.Controls.Add(step);
        footer.Controls.Add(back);
        footer.Controls.Add(cancel);
        footer.Controls.Add(next);
        Controls.Add(footer);

        content = new Panel { Dock = DockStyle.Fill, Padding = new Padding(30, 22, 30, 18), BackColor = bg };
        title = new Label { ForeColor = orange, Font = new Font("Segoe UI", 22, FontStyle.Bold), AutoSize = false, AutoEllipsis = true, TextAlign = ContentAlignment.MiddleLeft, Location = new Point(30, 20), Size = new Size(680, 48) };
        subtitle = new Label { ForeColor = Color.White, Font = new Font("Segoe UI", 13), AutoSize = false, Location = new Point(32, 78), Size = new Size(670, 32) };
        body = new Label { ForeColor = muted, Font = new Font("Segoe UI", 10), AutoSize = false, Location = new Point(32, 122), Size = new Size(670, 70) };
        content.Controls.Add(title);
        content.Controls.Add(subtitle);
        content.Controls.Add(body);
        Controls.Add(content);
        FormClosed += delegate { if (page == 3) ScheduleSelfDelete(); };
        ShowPage(0);
    }

    private Button MakeButton(string text, bool primary)
    {
        Button b = new Button { Text = text, FlatStyle = FlatStyle.Flat, BackColor = primary ? orange : Color.FromArgb(43, 43, 43), ForeColor = primary ? Color.Black : Color.White, Font = new Font("Segoe UI", 9, FontStyle.Bold), Cursor = Cursors.Hand };
        b.FlatAppearance.BorderSize = primary ? 0 : 1;
        b.FlatAppearance.BorderColor = Color.FromArgb(75, 75, 75);
        b.FlatAppearance.MouseOverBackColor = primary ? Color.FromArgb(255, 145, 40) : Color.FromArgb(58, 58, 58);
        return b;
    }

    private void DragWindow(object sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left) {
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 0x2, 0);
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    private void ResetPage()
    {
        if (timer != null) { timer.Stop(); timer.Dispose(); timer = null; }
        for (int i = content.Controls.Count - 1; i >= 3; i--) content.Controls.RemoveAt(i);
        progressFill = null;
        progressStatus = null;
        progressPercent = null;
    }

    private void ShowPage(int index)
    {
        page = index;
        ResetPage();
        back.Visible = page == 1;
        cancel.Visible = page < 2;
        next.Visible = page != 2;
        next.Text = page == 0 ? L("CONTINUAR", "CONTINUE", "CONTINUAR") :
                    page == 1 ? L("DESINSTALAR", "UNINSTALL", "DESINSTALAR") :
                    L("CONCLUIR", "FINISH", "FINALIZAR");
        step.Text = page == 0 ? L("ETAPA 1 DE 2", "STEP 1 OF 2", "PASO 1 DE 2") :
                    page == 1 ? L("ETAPA 2 DE 2", "STEP 2 OF 2", "PASO 2 DE 2") :
                    page == 3 ? L("CONCLUÍDO", "COMPLETED", "COMPLETADO") :
                    L("PROCESSANDO", "PROCESSING", "PROCESANDO");

        if (page == 0) {
            title.Text = L("Que pena que você partiu...", "We're sorry to see you go...", "Qué pena que te vayas...");
            subtitle.Text = L("O Edit Master agradece por ter feito parte dos seus projetos.", "Thank you for letting Edit Master be part of your projects.", "Gracias por permitir que Edit Master formara parte de tus proyectos.");
            body.Text = L("Esperamos encontrar você novamente no futuro! Na próxima etapa, você poderá escolher se deseja manter ou apagar os dados locais do aplicativo.", "We hope to see you again! On the next step, you can choose whether to keep or remove the app's local data.", "¡Esperamos verte de nuevo! En el siguiente paso podrás elegir si deseas conservar o borrar los datos locales de la aplicación.");
        } else if (page == 1) {
            title.Text = L("Antes de você partir...", "Before you go...", "Antes de que te vayas...");
            subtitle.Text = L("Confirme a desinstalação do Edit Master.", "Confirm the uninstallation of Edit Master.", "Confirma la desinstalación de Edit Master.");
            body.Text = L("Seus vídeos originais e arquivos exportados não serão apagados.", "Your original videos and exported files will not be deleted.", "Tus videos originales y archivos exportados no serán eliminados.");
            deleteData = new CheckBox { Text = L("Também apagar configurações e dados locais do Edit Master", "Also remove Edit Master's settings and local data", "También borrar la configuración y los datos locales de Edit Master"), Checked = false, ForeColor = Color.White, BackColor = bg, AutoSize = false, Location = new Point(34, 220), Size = new Size(650, 38), Font = new Font("Segoe UI", 10, FontStyle.Bold) };
            content.Controls.Add(deleteData);
            Label note = new Label { Text = L("Se deixar esta opção desmarcada, suas preferências serão mantidas para uma instalação futura.", "If unchecked, your preferences will be kept for a future installation.", "Si no marcas esta opción, tus preferencias se conservarán para una futura instalación."), ForeColor = muted, Font = new Font("Segoe UI", 9), AutoSize = false, Location = new Point(52, 264), Size = new Size(630, 44) };
            content.Controls.Add(note);
        } else if (page == 2) {
            title.Text = L("Desinstalando o Edit Master", "Uninstalling Edit Master", "Desinstalando Edit Master");
            subtitle.Text = L("Só mais um momento.", "Just a moment.", "Un momento.");
            body.Text = L("Estamos removendo os arquivos do aplicativo. Não feche esta janela.", "We're removing the application files. Please don't close this window.", "Estamos eliminando los archivos de la aplicación. No cierres esta ventana.");
            Label heading = new Label { Text = L("PROGRESSO DA DESINSTALAÇÃO", "UNINSTALL PROGRESS", "PROGRESO DE DESINSTALACIÓN"), ForeColor = orange, Font = new Font("Segoe UI", 9, FontStyle.Bold), AutoSize = true, Location = new Point(34, 220) };
            progressPercent = new Label { Text = "0%", ForeColor = Color.White, Font = new Font("Segoe UI", 10, FontStyle.Bold), TextAlign = ContentAlignment.MiddleRight, Location = new Point(630, 216), Size = new Size(64, 24) };
            Panel track = new Panel { BackColor = Color.FromArgb(48, 48, 48), Location = new Point(34, 252), Size = new Size(660, 12) };
            progressFill = new Label { BackColor = orange, Location = new Point(2, 2), Size = new Size(0, 8) };
            track.Controls.Add(progressFill);
            progressStatus = new Label { Text = L("Preparando a remoção...", "Preparing removal...", "Preparando la eliminación..."), ForeColor = muted, Font = new Font("Segoe UI", 9), AutoSize = false, Location = new Point(34, 274), Size = new Size(660, 26) };
            content.Controls.Add(heading);
            content.Controls.Add(progressPercent);
            content.Controls.Add(track);
            content.Controls.Add(progressStatus);
            back.Visible = false;
            cancel.Visible = false;
            next.Visible = false;
            working = true;
            StartUninstall();
        } else {
            title.Text = L("Desinstalação concluída!", "Uninstallation complete!", "¡Desinstalación completada!");
            subtitle.Text = L("Obrigado por ter usado o Edit Master.", "Thank you for using Edit Master.", "Gracias por usar Edit Master.");
            body.Text = L("O aplicativo foi removido do computador. Seus vídeos originais permaneceram intactos.", "The application has been removed. Your original videos have been left untouched.", "La aplicación se ha eliminado. Tus videos originales permanecen intactos.");
            back.Visible = false;
            cancel.Visible = false;
            next.Visible = true;
            next.Text = L("CONCLUIR", "FINISH", "FINALIZAR");
        }
    }

    private void SetProgress(int value, string status)
    {
        progress = Math.Max(0, Math.Min(100, value));
        if (progressFill != null) progressFill.Width = Math.Max(0, 656 * progress / 100);
        if (progressPercent != null) progressPercent.Text = progress.ToString() + "%";
        if (progressStatus != null) progressStatus.Text = status;
    }

    private void NextClicked(object sender, EventArgs e)
    {
        if (page == 0) { ShowPage(1); return; }
        if (page == 1) { ShowPage(2); return; }
        if (page == 3) Close();
    }

    private void StartUninstall()
    {
        SetProgress(5, L("Localizando o desinstalador...", "Locating the uninstaller...", "Buscando el desinstalador..."));
        timer = new System.Windows.Forms.Timer { Interval = 500 };
        timer.Tick += delegate {
            if (progress < 88) SetProgress(progress + 2, L("Removendo arquivos do aplicativo...", "Removing application files...", "Eliminando archivos de la aplicación..."));
        };
        timer.Start();

        ThreadPool.QueueUserWorkItem(delegate {
            int exitCode = -1;
            string error = null;
            try {
                bool removeLocalData = deleteData != null && deleteData.Checked;
                string installDir = FindInstallDirectory();
                // The branded UI is installed in ProgramData; the NSIS engine remains in
                // the application directory and performs the actual file/registry cleanup.
                string nsisUninstaller = Path.Combine(installDir, "uninstall.exe");
                if (!File.Exists(nsisUninstaller)) throw new FileNotFoundException("O mecanismo interno de desinstalação não foi encontrado.", nsisUninstaller);
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nsisUninstaller;
                psi.Arguments = "/S /EMDELETEAPPDATA=" + (removeLocalData ? "1" : "0");
                psi.UseShellExecute = true;
                psi.Verb = "runas";
                using (Process p = Process.Start(psi)) {
                    p.WaitForExit();
                    exitCode = p.ExitCode;
                }
                if (exitCode != 0) throw new Exception("O mecanismo interno retornou o código " + exitCode + ".");
            } catch (Exception ex) { error = ex.Message; }

            if (IsDisposed || !IsHandleCreated) return;
            BeginInvoke((MethodInvoker)delegate {
                working = false;
                if (timer != null) { timer.Stop(); timer.Dispose(); timer = null; }
                if (error != null) {
                    MessageBox.Show(this, L("Não foi possível concluir a desinstalação.\r\n\r\n", "The uninstallation could not be completed.\r\n\r\n", "No se pudo completar la desinstalación.\r\n\r\n") + error, "Edit Master", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Close();
                    return;
                }
                SetProgress(100, L("Desinstalação concluída!", "Uninstallation complete!", "¡Desinstalación completada!"));
                ShowPage(3);
            });
        });
    }


    private string FindInstallDirectory()
    {
        string[] keys = new string[] {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Edit Master",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Edit Master"
        };
        RegistryKey[] roots = new RegistryKey[] { Registry.LocalMachine, Registry.CurrentUser };
        foreach (RegistryKey root in roots) {
            foreach (string key in keys) {
                try {
                    using (RegistryKey item = root.OpenSubKey(key)) {
                        if (item == null) continue;
                        string location = Convert.ToString(item.GetValue("InstallLocation", "")).Trim().Trim('"');
                        if (!String.IsNullOrWhiteSpace(location) && File.Exists(Path.Combine(location, "uninstall.exe")))
                            return location;
                    }
                } catch { }
            }
        }
        string[] fallbacks = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Edit Master"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Edit Master")
        };
        foreach (string candidate in fallbacks)
            if (File.Exists(Path.Combine(candidate, "uninstall.exe"))) return candidate;
        throw new DirectoryNotFoundException("A pasta de instalação do Edit Master não foi encontrada no registro do Windows.");
    }

    private void ScheduleSelfDelete()
    {
        try {
            string exe = Application.ExecutablePath;
            string command = "/c timeout /t 3 /nobreak >nul & del /f /q \"" + exe + "\"";
            Process.Start(new ProcessStartInfo {
                FileName = Environment.GetEnvironmentVariable("ComSpec"),
                Arguments = command,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
        } catch { }
    }
}

internal static class UninstallerProgram
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new UninstallerForm());
    }
}
