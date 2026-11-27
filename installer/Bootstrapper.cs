using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

internal sealed class InstallerForm : Form
{
    private readonly Color bg = Color.FromArgb(18, 18, 18);
    private readonly Color panel = Color.FromArgb(30, 30, 30);
    private readonly Color orange = Color.FromArgb(255, 122, 0);
    private readonly Color muted = Color.FromArgb(185, 185, 185);
    private Panel content;
    private Label title, subtitle, body, step;
    private Button back, next, cancel;
    private CheckBox ffmpeg, whisper, launch;
    private TextBox folder;
    private ComboBox mediaDrive;
    private ProgressBar progress;
    private int page = 0;
    private string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Edit Master");
    private string existingInstallDir = "";
    private string existingMediaRoot = "";
    private bool updateMode = false;
    private bool installing = false;
    private ComboBox languagePicker;
    private int language = 0;

    public InstallerForm()
    {
        existingInstallDir = FindExistingInstall();
        existingMediaRoot = ReadMediaToolsRoot();
        updateMode = !String.IsNullOrEmpty(existingInstallDir);
        if (updateMode) installDir = existingInstallDir;

        Text = "Edit Master Setup";
        Width = 800; Height = 560;
        MinimumSize = new Size(760, 520);
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = bg;
        Font = new Font("Segoe UI", 10f);
        ShowInTaskbar = true;
        try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        Panel top = new Panel { Dock = DockStyle.Top, Height = 62, BackColor = Color.FromArgb(12, 12, 12) };
        top.MouseDown += DragWindow;
        Label mark = new Label { Text = "M", ForeColor = Color.Black, BackColor = orange, Font = new Font("Segoe UI", 19, FontStyle.Bold), TextAlign = ContentAlignment.MiddleCenter, Bounds = new Rectangle(22, 11, 40, 40) };
        mark.MouseDown += DragWindow;
        Label brand = new Label { Text = "EDIT MASTER", ForeColor = Color.White, Font = new Font("Segoe UI", 12, FontStyle.Bold), AutoSize = true, Location = new Point(76, 20) };
        brand.MouseDown += DragWindow;
        Button close = MakeButton("×", false); close.Bounds = new Rectangle(Width - 54, 0, 54, 62); close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        close.Click += delegate { if (!installing) Close(); };
        top.Controls.Add(mark); top.Controls.Add(brand); top.Controls.Add(close);
        Panel headerAccent = new Panel { Dock = DockStyle.Bottom, Height = 3, BackColor = orange };
        top.Controls.Add(headerAccent);
        languagePicker = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, BackColor = Color.FromArgb(38, 38, 38), ForeColor = Color.White, Font = new Font("Segoe UI", 9), Location = new Point(570, 17), Size = new Size(170, 30), Anchor = AnchorStyles.Top | AnchorStyles.Right };
        languagePicker.Items.AddRange(new object[] { "Português", "English", "Español" });
        string culture = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        language = culture == "en" ? 1 : culture == "es" ? 2 : 0;
        languagePicker.SelectedIndex = language;
        languagePicker.SelectedIndexChanged += delegate {
            if (languagePicker.SelectedIndex < 0) return;
            language = languagePicker.SelectedIndex;
            if (!installing) ShowPage(page);
        };
        top.Controls.Add(languagePicker);
        Controls.Add(top);

        Panel footer = new Panel { Dock = DockStyle.Bottom, Height = 78, BackColor = Color.FromArgb(14, 14, 14) };
        step = new Label { ForeColor = muted, AutoSize = false, TextAlign = ContentAlignment.MiddleLeft, Location = new Point(26, 22), Size = new Size(190, 32), Text = L("ETAPA 1 DE 3", "STEP 1 OF 3", "PASO 1 DE 3") };
        back = MakeButton(L("VOLTAR", "BACK", "VOLVER"), false); back.SetBounds(footer.Width - 348, 17, 96, 44); back.Anchor = AnchorStyles.Right | AnchorStyles.Top; back.Click += delegate { if (page > 0) ShowPage(page - 1); };
        cancel = MakeButton(L("CANCELAR", "CANCEL", "CANCELAR"), false); cancel.SetBounds(footer.Width - 240, 17, 108, 44); cancel.Anchor = AnchorStyles.Right | AnchorStyles.Top; cancel.Click += delegate { if (!installing) Close(); };
        next = MakeButton(L("COMEÇAR", "START", "COMENZAR"), true); next.SetBounds(footer.Width - 120, 17, 104, 44); next.Anchor = AnchorStyles.Right | AnchorStyles.Top; next.Click += NextClicked;
        footer.Controls.Add(step); footer.Controls.Add(back); footer.Controls.Add(cancel); footer.Controls.Add(next);
        Controls.Add(footer);

        content = new Panel { Dock = DockStyle.Fill, Padding = new Padding(30, 22, 30, 18), BackColor = bg };
        title = new Label { ForeColor = orange, Font = new Font("Segoe UI", 22, FontStyle.Bold), AutoSize = false, AutoEllipsis = true, TextAlign = ContentAlignment.MiddleLeft, Location = new Point(30, 20), Size = new Size(680, 42) };
        subtitle = new Label { ForeColor = Color.White, Font = new Font("Segoe UI", 13, FontStyle.Regular), AutoSize = false, Location = new Point(32, 72), Size = new Size(670, 30) };
        body = new Label { ForeColor = muted, Font = new Font("Segoe UI", 10), AutoSize = false, Location = new Point(32, 112), Size = new Size(670, 58) };
        content.Controls.Add(title); content.Controls.Add(subtitle); content.Controls.Add(body);
        Controls.Add(content);
        ShowPage(0);
    }

    private string L(string pt, string en, string es) { return language == 1 ? en : language == 2 ? es : pt; }

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
        if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, 0x2, 0); }
    }
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    private string FindExistingInstall()
    {
        string[] roots = new string[] {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        };
        RegistryKey[] hives = new RegistryKey[] { Registry.LocalMachine, Registry.CurrentUser };
        foreach (RegistryKey hive in hives)
        {
            foreach (string root in roots)
            {
                try {
                    using (RegistryKey parent = hive.OpenSubKey(root)) {
                        if (parent == null) continue;
                        foreach (string name in parent.GetSubKeyNames()) {
                            using (RegistryKey item = parent.OpenSubKey(name)) {
                                if (item == null) continue;
                                string display = Convert.ToString(item.GetValue("DisplayName", ""));
                                string location = Convert.ToString(item.GetValue("InstallLocation", "")).Trim().Trim('"');
                                if (display.IndexOf("Edit Master", StringComparison.OrdinalIgnoreCase) >= 0 &&
                                    !String.IsNullOrWhiteSpace(location) &&
                                    File.Exists(Path.Combine(location, "Edit Master.exe"))) return location;
                            }
                        }
                    }
                } catch { }
            }
            try {
                using (RegistryKey item = hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\UninstallEdit Master")) {
                    if (item != null) {
                        string location = Convert.ToString(item.GetValue("InstallLocation", "")).Trim().Trim('"');
                        if (!String.IsNullOrWhiteSpace(location) && File.Exists(Path.Combine(location, "Edit Master.exe"))) return location;
                    }
                }
            } catch { }
        }
        string programFiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Edit Master");
        if (File.Exists(Path.Combine(programFiles, "Edit Master.exe"))) return programFiles;
        return "";
    }

    private string ReadMediaToolsRoot()
    {
        try {
            string file = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Edit Master", "MediaTools.ini");
            if (!File.Exists(file)) return "";
            foreach (string line in File.ReadAllLines(file)) {
                if (line.StartsWith("Path=", StringComparison.OrdinalIgnoreCase)) return line.Substring(5).Trim();
            }
        } catch { }
        return "";
    }

    private void ResetContent()
    {
        for (int i = content.Controls.Count - 1; i >= 3; i--) content.Controls.RemoveAt(i);
        progress = null;
    }

    private void AddCardLabel(Panel card, string heading, string description, int y)
    {
        Label h = new Label { Text = heading, ForeColor = Color.White, Font = new Font("Segoe UI", 11, FontStyle.Bold), AutoSize = true, Location = new Point(58, y + 7) };
        Label d = new Label { Text = description, ForeColor = muted, Font = new Font("Segoe UI", 9), AutoSize = true, Location = new Point(58, y + 31) };
        card.Controls.Add(h); card.Controls.Add(d);
    }


    private Panel CreateHeroArt(bool done)
    {
        Panel p = new Panel { BackColor = Color.FromArgb(25,25,25), Bounds = new Rectangle(32,188,670,150) };
        p.Paint += delegate(object sender, PaintEventArgs e) {
            Graphics g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = p.ClientRectangle;
            using (LinearGradientBrush b = new LinearGradientBrush(r, Color.FromArgb(48,32,23), Color.FromArgb(17,23,29), 0f)) g.FillRectangle(b,r);
            using (Pen grid = new Pen(Color.FromArgb(24,255,255,255))) {
                for(int x=15;x<670;x+=28) g.DrawLine(grid,x,0,x,150);
                for(int y=15;y<150;y+=28) g.DrawLine(grid,0,y,670,y);
            }
            using (SolidBrush white = new SolidBrush(Color.White))
            using (SolidBrush mutedBrush = new SolidBrush(Color.FromArgb(195,210,210,210)))
            using (SolidBrush orangeBrush = new SolidBrush(Color.FromArgb(255,122,0))) {
                using(Font h = new Font("Segoe UI", done?19f:17f, FontStyle.Bold)) g.DrawString(done?"PRONTO PARA CRIAR.":"CRIE. EDITE. TRANSFORME.",h,white,28,35);
                using(Font sub = new Font("Segoe UI",9.5f)) g.DrawString(done?"Seu próximo projeto começa agora.":"Suas ideias ganham vida com o Edit Master.",sub,mutedBrush,30,73);
                using(Font tag = new Font("Segoe UI",8f,FontStyle.Bold)) g.DrawString(done?"INSTALAÇÃO FINALIZADA":"EDIT MASTER  •  1.0 BETA",tag,orangeBrush,30,106);
                for(int i=0;i<5;i++) {
                    Rectangle f = new Rectangle(376+i*48,48+(i%2)*5,40,31);
                    using(SolidBrush fb = new SolidBrush(i==2?Color.FromArgb(255,122,0):Color.FromArgb(65,75,82))) g.FillRectangle(fb,f);
                    using(Pen fp = new Pen(Color.FromArgb(170,255,255,255))) g.DrawRectangle(fp,f);
                }
                using(Pen track = new Pen(Color.FromArgb(130,255,255,255),2f)) g.DrawLine(track,370,118,630,118);
                if(done) {
                    using(Pen check = new Pen(Color.FromArgb(255,122,0),7f)) { check.StartCap=LineCap.Round; check.EndCap=LineCap.Round; g.DrawLines(check,new Point[]{new Point(510,91),new Point(528,108),new Point(560,72)}); }
                    using(Font pct = new Font("Segoe UI",8f,FontStyle.Bold)) g.DrawString("100%",pct,white,579,84);
                } else {
                    g.FillEllipse(orangeBrush,490,82,34,34);
                    using(SolidBrush play = new SolidBrush(Color.FromArgb(25,25,25))) g.FillPolygon(play,new Point[]{new Point(503,91),new Point(503,107),new Point(516,99)});
                }
                using(Font logo = new Font("Segoe UI",23f,FontStyle.Bold)) g.DrawString("M",logo,white,625,10);
            }
        };
        return p;
    }

    private void ShowPage(int index)
    {
        page = index; ResetContent();
        back.Visible = page > 0 && page < 3;
        cancel.Visible = page < 3;
        next.Visible = page != 3;
        next.Text = page == 0 ? (updateMode ? L("ATUALIZAR", "UPDATE", "ACTUALIZAR") : L("COMEÇAR", "START", "COMENZAR")) : page == 1 ? L("CONTINUAR", "CONTINUE", "CONTINUAR") : page == 2 ? (updateMode ? L("ATUALIZAR", "UPDATE", "ACTUALIZAR") : L("INSTALAR", "INSTALL", "INSTALAR")) : L("CONCLUIR", "FINISH", "FINALIZAR");
        step.Text = page < 3 ? L("ETAPA ", "STEP ", "PASO ") + (page + 1) + L(" DE 3", " OF 3", " DE 3") : page == 3 ? L("PREPARANDO", "PREPARING", "PREPARANDO") : L("CONCLUÍDO", "COMPLETED", "COMPLETADO");

        if (page == 0) {
            title.Text = updateMode ? L("Vamos atualizar seu Edit Master.", "Let’s update Edit Master.", "Vamos a actualizar Edit Master.") : L("Seu próximo projeto começa aqui.", "Your next project starts here.", "Tu próximo proyecto empieza aquí.");
            subtitle.Text = updateMode ? L("Encontramos uma instalação existente.", "We found an existing installation.", "Encontramos una instalación existente.") : L("EDIT MASTER 1.0 BETA OFICIAL", "EDIT MASTER 1.0 OFFICIAL BETA", "EDIT MASTER 1.0 BETA OFICIAL");
            body.Text = updateMode
                ? L("Vamos substituir os arquivos do aplicativo pela nova versão, mantendo a mesma pasta e os componentes escolhidos. Seus projetos e preferências serão preservados.", "We’ll replace the application files with the new version, keeping the same folder and selected components. Your projects and preferences will be preserved.", "Reemplazaremos los archivos de la aplicación por la nueva versión, manteniendo la misma carpeta y los componentes seleccionados. Tus proyectos y preferencias se conservarán.")
                : L("Um editor de vídeo leve, simples e pronto para criar.\r\nEste assistente vai preparar tudo para você.", "A lightweight, simple video editor, ready to create.\r\nThis assistant will prepare everything for you.", "Un editor de vídeo ligero y sencillo, listo para crear.\r\nEste asistente preparará todo por ti.");
            content.Controls.Add(CreateHeroArt(false));
            if (updateMode) {
                Panel info = new Panel { BackColor = panel, Bounds = new Rectangle(32, 350, 670, 58) };
                Label accent = new Label { BackColor = orange, Bounds = new Rectangle(0, 0, 5, 58) };
                Label heading = new Label { Text = L("ATUALIZAÇÃO DISPONÍVEL", "UPDATE AVAILABLE", "ACTUALIZACIÓN DISPONIBLE"), ForeColor = orange, Font = new Font("Segoe UI", 9, FontStyle.Bold), AutoSize = true, Location = new Point(22, 5) };
                Label path = new Label { Text = installDir, ForeColor = Color.White, Font = new Font("Segoe UI", 8), AutoSize = false, AutoEllipsis = true, Location = new Point(22, 28), Size = new Size(625, 22) };
                info.Controls.Add(accent); info.Controls.Add(heading); info.Controls.Add(path); content.Controls.Add(info);
            }
        } else if (page == 1) {
            title.Text = L("Escolha seus recursos.", "Choose your components.", "Elige tus componentes.");
            subtitle.Text = L("O que você quer ter instalado?", "What would you like to install?", "¿Qué quieres instalar?");
            body.Text = L("FFmpeg e Whisper podem ficar fora do SSD do sistema. Escolha uma unidade com espaço livre; os dois ficarão juntos nela.", "FFmpeg and Whisper can be stored outside your system SSD. Choose a drive with free space; both components will be stored there.", "FFmpeg y Whisper pueden guardarse fuera del SSD del sistema. Elige una unidad con espacio libre; ambos componentes se guardarán allí.");
            ffmpeg = new CheckBox { Text = "FFmpeg + FFprobe", Checked = updateMode ? ExistingComponent("ffmpeg") : true, ForeColor = Color.White, BackColor = panel, AutoSize = true, Location = new Point(18, 12), Font = new Font("Segoe UI", 11, FontStyle.Bold) };
            whisper = new CheckBox { Text = "Whisper.cpp + modelo Tiny", Checked = updateMode ? ExistingComponent("whisper") : true, ForeColor = Color.White, BackColor = panel, AutoSize = true, Location = new Point(18, 12), Font = new Font("Segoe UI", 11, FontStyle.Bold) };
            Panel fcard = new Panel { BackColor = panel, Bounds = new Rectangle(32, 180, 670, 62) };
            ffmpeg.Location = new Point(18, 6); fcard.Controls.Add(ffmpeg);
            Label fdesc = new Label { Text = L("Exportação, conversão e processamento de mídia", "Exporting, converting and processing media", "Exportación, conversión y procesamiento multimedia"), ForeColor = muted, AutoSize = true, Location = new Point(42, 34) }; fcard.Controls.Add(fdesc);
            Panel wcard = new Panel { BackColor = panel, Bounds = new Rectangle(32, 250, 670, 62) };
            whisper.Location = new Point(18, 6); wcard.Controls.Add(whisper);
            Label wdesc = new Label { Text = L("Legendas automáticas com transcrição local e offline", "Automatic subtitles with local, offline transcription", "Subtítulos automáticos con transcripción local y sin conexión"), ForeColor = muted, AutoSize = true, Location = new Point(42, 34) }; wcard.Controls.Add(wdesc);
            Label driveLabel = new Label { Text = L("UNIDADE PARA OS COMPONENTES", "COMPONENTS DRIVE", "UNIDAD PARA LOS COMPONENTES"), ForeColor = orange, Font = new Font("Segoe UI", 9, FontStyle.Bold), AutoSize = true, Location = new Point(34, 326) };
            mediaDrive = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, BackColor = Color.FromArgb(38, 38, 38), ForeColor = Color.White, Font = new Font("Segoe UI", 10), Location = new Point(34, 350), Width = 360, Height = 30 };
            PopulateDrives();
            ffmpeg.CheckedChanged += ComponentsChanged; whisper.CheckedChanged += ComponentsChanged;
            content.Controls.Add(fcard); content.Controls.Add(wcard); content.Controls.Add(driveLabel); content.Controls.Add(mediaDrive);
        } else if (page == 2) {
            title.Text = updateMode ? L("Tudo pronto para atualizar.", "Ready to update.", "Todo listo para actualizar.") : L("Onde instalar o aplicativo?", "Where should the app be installed?", "¿Dónde instalar la aplicación?");
            subtitle.Text = updateMode ? L("Vamos manter a pasta atual do Edit Master.", "We’ll keep the current Edit Master folder.", "Mantendremos la carpeta actual de Edit Master.") : L("Escolha a pasta do Edit Master.", "Choose the Edit Master folder.", "Elige la carpeta de Edit Master.");
            body.Text = updateMode ? L("A localização atual será mantida para que a atualização substitua os arquivos sem criar outra instalação.", "The current location will be kept so the update replaces files without creating another installation.", "Se mantendrá la ubicación actual para que la actualización reemplace los archivos sin crear otra instalación.") : L("Os componentes opcionais serão guardados na unidade escolhida na etapa anterior.", "Optional components will be stored on the drive selected in the previous step.", "Los componentes opcionales se guardarán en la unidad elegida en el paso anterior.");
            folder = new TextBox { Text = installDir, BackColor = Color.FromArgb(38, 38, 38), ForeColor = Color.White, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 10), Location = new Point(34, 218), Width = 510, Height = 34, ReadOnly = updateMode };
            Button browse = MakeButton(L("PROCURAR", "BROWSE", "EXAMINAR"), false); browse.SetBounds(556, 215, 112, 40); browse.Enabled = !updateMode;
            browse.Click += delegate { using (FolderBrowserDialog d = new FolderBrowserDialog()) { d.SelectedPath = folder.Text; d.Description = L("Selecione a pasta de instalação do Edit Master", "Select the Edit Master installation folder", "Selecciona la carpeta de instalación de Edit Master"); if (d.ShowDialog(this) == DialogResult.OK) folder.Text = d.SelectedPath; } };
            content.Controls.Add(folder); content.Controls.Add(browse);
        } else if (page == 3) {
            title.Text = updateMode ? L("Atualizando o Edit Master", "Updating Edit Master", "Actualizando Edit Master") : L("Instalando o Edit Master", "Installing Edit Master", "Instalando Edit Master");
            subtitle.Text = L("Só mais um momento.", "Just a moment.", "Un momento.");
            body.Text = L("Estamos organizando os arquivos e configurando seus componentes. Não feche esta janela.", "We’re organizing files and setting up your components. Please don’t close this window.", "Estamos organizando los archivos y configurando tus componentes. No cierres esta ventana.");
            progress = new ProgressBar { Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 28, Location = new Point(34, 230), Width = 660, Height = 18 };
            content.Controls.Add(progress);
            back.Visible = false; cancel.Visible = false; next.Visible = false;
            installing = true;
            BeginInstall();
        } else {
            title.Text = updateMode ? L("Atualização concluída!", "Update complete!", "¡Actualización completada!") : L("Instalação concluída!", "Installation complete!", "¡Instalación completada!");
            subtitle.Text = L("O Edit Master está pronto para você.", "Edit Master is ready for you.", "Edit Master está listo para ti.");
            body.Text = L("Tudo certo! Seus componentes foram organizados na unidade escolhida e o aplicativo está pronto para abrir.", "All done! Your components are in the selected drive and the app is ready to launch.", "¡Listo! Tus componentes están en la unidad seleccionada y la aplicación está lista para abrir.");
            content.Controls.Add(CreateHeroArt(true));
            launch = new CheckBox { Text = L("Abrir Edit Master agora", "Launch Edit Master now", "Abrir Edit Master ahora"), Checked = true, ForeColor = Color.White, BackColor = bg, AutoSize = true, Location = new Point(34, 360), Font = new Font("Segoe UI", 11, FontStyle.Bold) };
            content.Controls.Add(launch);
            back.Visible = false; cancel.Visible = false; next.Visible = true; next.Text = L("CONCLUIR", "FINISH", "FINALIZAR");
        }
    }

    private bool ExistingComponent(string name)
    {
        if (!String.IsNullOrEmpty(existingMediaRoot) && Directory.Exists(Path.Combine(existingMediaRoot, name))) return true;
        return !String.IsNullOrEmpty(existingInstallDir) && Directory.Exists(Path.Combine(existingInstallDir, "resources", name));
    }

    private void PopulateDrives()
    {
        if (mediaDrive == null) return;
        string preferred = !String.IsNullOrEmpty(existingMediaRoot) ? Path.GetPathRoot(existingMediaRoot) : Path.GetPathRoot(installDir);
        foreach (DriveInfo drive in DriveInfo.GetDrives()) {
            try {
                if (!drive.IsReady || drive.DriveType != DriveType.Fixed) continue;
                double free = drive.AvailableFreeSpace / 1073741824.0;
                string item = drive.Name + " | " + free.ToString("0.0") + " GB livres";
                int idx = mediaDrive.Items.Add(item);
                if (String.Equals(drive.Name, preferred, StringComparison.OrdinalIgnoreCase)) mediaDrive.SelectedIndex = idx;
            } catch { }
        }
        if (mediaDrive.Items.Count > 0 && mediaDrive.SelectedIndex < 0) mediaDrive.SelectedIndex = 0;
        mediaDrive.Enabled = ffmpeg.Checked || whisper.Checked;
    }

    private void ComponentsChanged(object sender, EventArgs e)
    {
        if (mediaDrive != null) mediaDrive.Enabled = ffmpeg.Checked || whisper.Checked;
    }

    private string SelectedMediaRoot()
    {
        if (mediaDrive == null || mediaDrive.SelectedIndex < 0) return "";
        string item = mediaDrive.SelectedItem.ToString();
        string drive = item.Substring(0, 3);
        return Path.Combine(drive, "Edit Master", "MediaTools");
    }

    private void NextClicked(object sender, EventArgs e)
    {
        if (page == 2) {
            if (String.IsNullOrWhiteSpace(folder.Text)) { MessageBox.Show(this, "Escolha uma pasta válida.", "Edit Master", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            installDir = folder.Text.Trim();
            if (ffmpeg.Checked || whisper.Checked) {
                string root = SelectedMediaRoot();
                if (String.IsNullOrEmpty(root)) { MessageBox.Show(this, "Selecione uma unidade disponível para os componentes.", "Edit Master", MessageBoxButtons.OK, MessageBoxIcon.Warning); ShowPage(1); return; }
            }
        }
        if (page == 4) {
            bool run = launch != null && launch.Checked;
            string exe = Path.Combine(installDir, "Edit Master.exe");
            Close();
            if (run && File.Exists(exe)) Process.Start(exe);
            return;
        }
        ShowPage(page + 1);
    }

    private void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (string file in Directory.GetFiles(source)) {
            string target = Path.Combine(destination, Path.GetFileName(file));
            File.Copy(file, target, true);
        }
        foreach (string directory in Directory.GetDirectories(source)) {
            CopyDirectory(directory, Path.Combine(destination, Path.GetFileName(directory)));
        }
    }

    private string FindBundledFile(string fileName)
    {
        // Tauri/NSIS can place bundled resources at different relative depths.
        // Search the complete application install tree instead of assuming resources/<tool>/.
        try {
            string[] matches = Directory.GetFiles(installDir, fileName, SearchOption.AllDirectories);
            string best = "";
            foreach (string match in matches) {
                if (String.IsNullOrEmpty(best) || match.Length < best.Length) best = match;
            }
            return best;
        } catch {
            return "";
        }
    }

    private void CopyAdjacentDlls(string sourceFile, string destination)
    {
        string sourceDirectory = Path.GetDirectoryName(sourceFile);
        if (String.IsNullOrEmpty(sourceDirectory) || !Directory.Exists(sourceDirectory)) return;
        foreach (string dll in Directory.GetFiles(sourceDirectory, "*.dll")) {
            string target = Path.Combine(destination, Path.GetFileName(dll));
            File.Copy(dll, target, true);
        }
    }

    private void FinalizeMediaTools(bool useFfmpeg, bool useWhisper, string destinationRoot, string previousRoot)
    {
        // Validate every selected component before deleting or replacing an existing tool folder.
        string ffmpegExe = useFfmpeg ? FindBundledFile("ffmpeg.exe") : "";
        string ffprobeExe = useFfmpeg ? FindBundledFile("ffprobe.exe") : "";
        string whisperExe = useWhisper ? FindBundledFile("whisper-cli.exe") : "";
        string whisperModel = useWhisper ? FindBundledFile("ggml-tiny.bin") : "";

        if (useFfmpeg && (String.IsNullOrEmpty(ffmpegExe) || String.IsNullOrEmpty(ffprobeExe)))
            throw new Exception("FFmpeg/FFprobe não foram encontrados dentro do pacote instalado. O instalador procurou os executáveis em toda a pasta do Edit Master.");
        if (useWhisper && (String.IsNullOrEmpty(whisperExe) || String.IsNullOrEmpty(whisperModel)))
            throw new Exception("Whisper.cpp ou o modelo Tiny não foram encontrados dentro do pacote instalado.");

        if (useFfmpeg || useWhisper) {
            if (Directory.Exists(destinationRoot)) Directory.Delete(destinationRoot, true);
            Directory.CreateDirectory(destinationRoot);

            if (useFfmpeg) {
                string target = Path.Combine(destinationRoot, "ffmpeg");
                Directory.CreateDirectory(target);
                File.Copy(ffmpegExe, Path.Combine(target, "ffmpeg.exe"), true);
                File.Copy(ffprobeExe, Path.Combine(target, "ffprobe.exe"), true);
                CopyAdjacentDlls(ffmpegExe, target);
                CopyAdjacentDlls(ffprobeExe, target);
            }

            if (useWhisper) {
                string target = Path.Combine(destinationRoot, "whisper");
                Directory.CreateDirectory(target);
                File.Copy(whisperExe, Path.Combine(target, "whisper-cli.exe"), true);
                File.Copy(whisperModel, Path.Combine(target, "ggml-tiny.bin"), true);
                CopyAdjacentDlls(whisperExe, target);
                CopyAdjacentDlls(whisperModel, target);
            }

            string common = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Edit Master");
            Directory.CreateDirectory(common);
            File.WriteAllText(Path.Combine(common, "MediaTools.ini"), "[MediaTools]\r\nPath=" + destinationRoot + "\r\n");
        } else {
            if (!String.IsNullOrEmpty(previousRoot) && Directory.Exists(previousRoot)) Directory.Delete(previousRoot, true);
            string config = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Edit Master", "MediaTools.ini");
            if (File.Exists(config)) File.Delete(config);
        }

        // Remove only the temporary resource payloads after successful external installation.
        string bundledResources = Path.Combine(installDir, "resources");
        string bundledFfmpeg = Path.Combine(bundledResources, "ffmpeg");
        string bundledWhisper = Path.Combine(bundledResources, "whisper");
        if (Directory.Exists(bundledFfmpeg)) Directory.Delete(bundledFfmpeg, true);
        if (Directory.Exists(bundledWhisper)) Directory.Delete(bundledWhisper, true);

        if (!String.IsNullOrEmpty(previousRoot) && !String.IsNullOrEmpty(destinationRoot) &&
            !String.Equals(Path.GetFullPath(previousRoot).TrimEnd('\\'), Path.GetFullPath(destinationRoot).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) &&
            Directory.Exists(previousRoot))
            Directory.Delete(previousRoot, true);
    }

    private async void BeginInstall()
    {
        bool useFfmpeg = ffmpeg.Checked;
        bool useWhisper = whisper.Checked;
        string destinationRoot = (useFfmpeg || useWhisper) ? SelectedMediaRoot() : "";
        string previousRoot = existingMediaRoot;
        try {
            string payload = Path.Combine(Path.GetTempPath(), "EditMasterSetup-" + Guid.NewGuid().ToString("N") + ".exe");
            using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream("EditMasterPayload.exe")) {
                if (input == null) throw new InvalidOperationException("O pacote interno de instalação não foi encontrado.");
                using (FileStream output = File.Create(payload)) await input.CopyToAsync(output);
            }
            string args = "/S " + (updateMode ? "/UPDATE " : "") +
                "/EMFFMPEG=" + (useFfmpeg ? "1" : "0") +
                " /EMWHISPER=" + (useWhisper ? "1" : "0") +
                " /D=\"" + installDir + "\"";
            ProcessStartInfo psi = new ProcessStartInfo(payload, args) { UseShellExecute = true, Verb = "runas" };
            using (Process p = Process.Start(psi)) {
                await System.Threading.Tasks.Task.Run(delegate { p.WaitForExit(); });
                if (p.ExitCode != 0) throw new Exception("O mecanismo de instalação retornou o código " + p.ExitCode + ".");
            }
            if (useFfmpeg || useWhisper) FinalizeMediaTools(useFfmpeg, useWhisper, destinationRoot, previousRoot);
            else FinalizeMediaTools(false, false, "", previousRoot);
            try { File.Delete(payload); } catch { }
            installing = false;
            ShowPage(4);
        } catch (Exception ex) {
            installing = false;
            MessageBox.Show(this, "Não foi possível concluir a instalação.\r\n\r\n" + ex.Message, "Edit Master Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }
}

internal static class Program
{
    [STAThread] private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerForm());
    }
}