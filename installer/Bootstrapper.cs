using System;
using System.Collections.Generic;
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
    private Panel progressTrack, progressFill;
    private Label progressPercent, progressStatus;
    private System.Windows.Forms.Timer progressTimer;
    private int progressValue = 0;
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

    private bool HasInstalledExecutable(string location, RegistryKey item)
    {
        if (String.IsNullOrWhiteSpace(location) || !Directory.Exists(location)) return false;
        try {
            if (item != null) {
                string registeredBinary = Convert.ToString(item.GetValue("MainBinaryName", "")).Trim().Trim('"');
                if (!String.IsNullOrWhiteSpace(registeredBinary) &&
                    File.Exists(Path.Combine(location, Path.GetFileName(registeredBinary)))) return true;
            }
        } catch { }
        // Current Cargo package name is edit-master; keep the legacy display-name
        // executable as a fallback for installations created by older builds.
        string[] candidates = new string[] { "edit-master.exe", "Edit Master.exe", "Edit-Master.exe" };
        foreach (string candidate in candidates) {
            if (File.Exists(Path.Combine(location, candidate))) return true;
        }
        return false;
    }

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
                                    HasInstalledExecutable(location, item)) return location;
                            }
                        }
                    }
                } catch { }
            }
            try {
                using (RegistryKey item = hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\UninstallEdit Master")) {
                    if (item != null) {
                        string location = Convert.ToString(item.GetValue("InstallLocation", "")).Trim().Trim('"');
                        if (HasInstalledExecutable(location, item)) return location;
                    }
                }
            } catch { }
        }
        string programFiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Edit Master");
        if (HasInstalledExecutable(programFiles, null)) return programFiles;
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
        if (progressTimer != null) { progressTimer.Stop(); progressTimer.Dispose(); progressTimer = null; }
        for (int i = content.Controls.Count - 1; i >= 3; i--) content.Controls.RemoveAt(i);
        progressTrack = progressFill = null;
        progressPercent = progressStatus = null;
        progressValue = 0;
    }

    private void AddCardLabel(Panel card, string heading, string description, int y)
    {
        Label h = new Label { Text = heading, ForeColor = Color.White, Font = new Font("Segoe UI", 11, FontStyle.Bold), AutoSize = true, Location = new Point(58, y + 7) };
        Label d = new Label { Text = description, ForeColor = muted, Font = new Font("Segoe UI", 9), AutoSize = true, Location = new Point(58, y + 31) };
        card.Controls.Add(h); card.Controls.Add(d);
    }


    private Panel CreateHeroArt(bool done)
    {
        Panel p = new Panel { BackColor = Color.FromArgb(22,22,22), Bounds = new Rectangle(32,188,670,150) };
        p.Paint += delegate(object sender, PaintEventArgs e) {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            Rectangle r = p.ClientRectangle;
            using (GraphicsPath rounded = new GraphicsPath()) {
                rounded.AddArc(0,0,18,18,180,90); rounded.AddArc(r.Width-18,0,18,18,270,90);
                rounded.AddArc(r.Width-18,r.Height-18,18,18,0,90); rounded.AddArc(0,r.Height-18,18,18,90,90);
                rounded.CloseFigure();
                using (LinearGradientBrush bgBrush = new LinearGradientBrush(r, Color.FromArgb(48,28,18), Color.FromArgb(13,19,26), 0f))
                    g.FillPath(bgBrush, rounded);
            }
            using (Pen grid = new Pen(Color.FromArgb(20,255,255,255),1f)) {
                for(int x=12;x<670;x+=24) g.DrawLine(grid,x,0,x,150);
                for(int y=12;y<150;y+=24) g.DrawLine(grid,0,y,670,y);
            }
            using (SolidBrush accent = new SolidBrush(Color.FromArgb(255,122,0))) g.FillRectangle(accent,0,0,4,150);

            // Cinematic preview window with a warm sunset and layered landscape.
            Rectangle preview = new Rectangle(20,16,326,94);
            using (LinearGradientBrush sky = new LinearGradientBrush(preview, Color.FromArgb(255,122,40), Color.FromArgb(24,35,53), 90f)) g.FillRectangle(sky,preview);
            using (SolidBrush sunGlow = new SolidBrush(Color.FromArgb(70,255,180,75))) g.FillEllipse(sunGlow,250,32,42,42);
            using (SolidBrush sun = new SolidBrush(Color.FromArgb(255,205,116))) g.FillEllipse(sun,263,43,17,17);
            using (SolidBrush farMountain = new SolidBrush(Color.FromArgb(70,64,72))) g.FillPolygon(farMountain,new Point[]{new Point(20,88),new Point(78,49),new Point(118,78),new Point(170,43),new Point(224,82),new Point(274,55),new Point(346,90),new Point(346,110),new Point(20,110)});
            using (SolidBrush nearMountain = new SolidBrush(Color.FromArgb(28,39,45))) g.FillPolygon(nearMountain,new Point[]{new Point(20,91),new Point(73,70),new Point(119,89),new Point(173,67),new Point(218,91),new Point(270,70),new Point(346,94),new Point(346,110),new Point(20,110)});
            using (LinearGradientBrush water = new LinearGradientBrush(new Rectangle(20,91,326,19),Color.FromArgb(181,85,39),Color.FromArgb(17,30,39),90f)) g.FillRectangle(water,20,91,326,19);
            using (Pen reflection = new Pen(Color.FromArgb(145,255,143,74),1.3f)) {
                g.DrawLine(reflection,230,96,300,96); g.DrawLine(reflection,245,101,285,101); g.DrawLine(reflection,215,106,308,106);
            }
            using (Pen frame = new Pen(Color.FromArgb(125,255,255,255),1f)) g.DrawRectangle(frame,preview);

            // Editing timeline cards and audio waveform.
            using (SolidBrush panelBrush = new SolidBrush(Color.FromArgb(105,8,12,17))) g.FillRectangle(panelBrush,360,16,288,94);
            using (Pen divider = new Pen(Color.FromArgb(75,255,255,255),1f)) {
                g.DrawLine(divider,360,48,648,48); g.DrawLine(divider,360,83,648,83);
            }
            for(int i=0;i<4;i++) {
                int x=370+i*67;
                Rectangle clip=new Rectangle(x,25,59,18);
                using (LinearGradientBrush clipBrush = new LinearGradientBrush(clip, i==1?Color.FromArgb(255,122,0):Color.FromArgb(67,91,106), Color.FromArgb(27,37,46), 0f)) g.FillRectangle(clipBrush,clip);
                using (Pen clipBorder = new Pen(Color.FromArgb(130,255,255,255),1f)) g.DrawRectangle(clipBorder,clip);
                for(int w=0;w<8;w++) {
                    int h=3+(int)((Math.Sin((w+i)*1.35)+1)*5);
                    using (SolidBrush wave = new SolidBrush(Color.FromArgb(190,255,145,55))) g.FillRectangle(wave,x+4+w*6,92-h,3,h);
                }
            }
            using (Pen playhead = new Pen(Color.FromArgb(255,122,0),2f)) g.DrawLine(playhead,500,20,500,105);
            using (SolidBrush playheadHead = new SolidBrush(Color.FromArgb(255,122,0))) g.FillPolygon(playheadHead,new Point[]{new Point(493,18),new Point(507,18),new Point(500,27)});

            using (SolidBrush logoBack = new SolidBrush(Color.FromArgb(255,122,0))) g.FillEllipse(logoBack,606,116,28,28);
            using (SolidBrush logoText = new SolidBrush(Color.FromArgb(18,18,18)))
            using (Font logo = new Font("Segoe UI",14f,FontStyle.Bold)) g.DrawString("M",logo,logoText,611,116);
            using (SolidBrush headline = new SolidBrush(Color.White))
            using (SolidBrush sub = new SolidBrush(Color.FromArgb(195,210,210,210)))
            using (SolidBrush tag = new SolidBrush(Color.FromArgb(255,145,45))) {
                using(Font h = new Font("Segoe UI",10.5f,FontStyle.Bold)) g.DrawString(done?L("PRONTO PARA CRIAR.","READY TO CREATE.","LISTO PARA CREAR."):L("CRIE. EDITE. TRANSFORME.","CREATE. EDIT. TRANSFORM.","CREA. EDITA. TRANSFORMA."),h,headline,22,117);
                using(Font small = new Font("Segoe UI",7.5f)) g.DrawString(done?L("Instalação finalizada com sucesso.","Installation completed successfully.","Instalación completada correctamente."):L("Suas ideias ganham vida com o Edit Master.","Bring your ideas to life with Edit Master.","Tus ideas cobran vida con Edit Master."),small,sub,24,136);
                using(Font tagFont = new Font("Segoe UI",7f,FontStyle.Bold)) g.DrawString("EDIT MASTER  •  1.0 BETA",tagFont,tag,430,120);
            }
            if(done) {
                using (Pen check = new Pen(Color.FromArgb(255,145,45),5f)) { check.StartCap=LineCap.Round; check.EndCap=LineCap.Round; g.DrawLines(check,new Point[]{new Point(560,128),new Point(570,137),new Point(590,115)}); }
            }
        };
        return p;
    }

    private void SetInstallProgress(int value, string status)
    {
        progressValue = Math.Max(0, Math.Min(100, value));
        if (progressFill != null && progressTrack != null) {
            int available = Math.Max(1, progressTrack.ClientSize.Width - 4);
            progressFill.Width = Math.Max(progressValue == 0 ? 0 : 4, available * progressValue / 100);
        }
        if (progressPercent != null) progressPercent.Text = progressValue.ToString() + "%";
        if (progressStatus != null) progressStatus.Text = status;
        if (progressTrack != null) progressTrack.Refresh();
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
            Label progressHeading = new Label { Text = L("PROGRESSO DA INSTALAÇÃO", "INSTALLATION PROGRESS", "PROGRESO DE INSTALACIÓN"), ForeColor = orange, Font = new Font("Segoe UI", 9, FontStyle.Bold), AutoSize = true, Location = new Point(34, 205) };
            progressPercent = new Label { Text = "0%", ForeColor = Color.White, Font = new Font("Segoe UI", 10, FontStyle.Bold), TextAlign = ContentAlignment.MiddleRight, Location = new Point(630, 201), Size = new Size(64, 24) };
            progressTrack = new Panel { BackColor = Color.FromArgb(48,48,48), Location = new Point(34, 238), Size = new Size(660, 12) };
            progressFill = new Panel { BackColor = orange, Location = new Point(2, 2), Size = new Size(0, 8) };
            progressFill.Paint += delegate(object sender, PaintEventArgs e) {
                Rectangle rr = progressFill.ClientRectangle;
                if (rr.Width > 0 && rr.Height > 0) using (LinearGradientBrush glow = new LinearGradientBrush(rr, Color.FromArgb(255,170,65), Color.FromArgb(255,100,0), 0f)) e.Graphics.FillRectangle(glow, rr);
            };
            progressTrack.Controls.Add(progressFill);
            progressStatus = new Label { Text = L("Preparando os arquivos...", "Preparing files...", "Preparando archivos..."), ForeColor = muted, Font = new Font("Segoe UI", 9), AutoSize = false, Location = new Point(34, 258), Size = new Size(660, 26) };
            content.Controls.Add(progressHeading); content.Controls.Add(progressPercent); content.Controls.Add(progressTrack); content.Controls.Add(progressStatus);
            progressTimer = new System.Windows.Forms.Timer { Interval = 450 };
            progressTimer.Tick += delegate { if (progressValue < 72) SetInstallProgress(progressValue + 1, L("Instalando arquivos do aplicativo...", "Installing application files...", "Instalando archivos de la aplicación...")); };
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
                string item = drive.Name + " | " + free.ToString("0.0") + L(" GB livres", " GB free", " GB libres");
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
            if (String.IsNullOrWhiteSpace(folder.Text)) { MessageBox.Show(this, L("Escolha uma pasta válida.", "Choose a valid folder.", "Elige una carpeta válida."), "Edit Master", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            installDir = folder.Text.Trim();
            if (ffmpeg.Checked || whisper.Checked) {
                string root = SelectedMediaRoot();
                if (String.IsNullOrEmpty(root)) { MessageBox.Show(this, L("Selecione uma unidade disponível para os componentes.", "Select an available drive for the components.", "Selecciona una unidad disponible para los componentes."), "Edit Master", MessageBoxButtons.OK, MessageBoxIcon.Warning); ShowPage(1); return; }
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
        // Resolve resources safely, one directory at a time. Directory.GetFiles(...,
        // AllDirectories) aborts the entire search if just one nested folder is inaccessible.
        if (String.IsNullOrWhiteSpace(installDir) || !Directory.Exists(installDir)) return "";
        Stack<string> pending = new Stack<string>();
        HashSet<string> visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        pending.Push(installDir);
        string best = "";
        while (pending.Count > 0) {
            string current = pending.Pop();
            if (!visited.Add(current)) continue;
            try {
                foreach (string match in Directory.GetFiles(current, fileName, SearchOption.TopDirectoryOnly)) {
                    if (String.IsNullOrEmpty(best) || match.Length < best.Length) best = match;
                }
            } catch { }
            try {
                foreach (string directory in Directory.GetDirectories(current)) {
                    try {
                        // Do not follow junctions/symlinks; they can create loops or leave the install tree.
                        if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) == 0)
                            pending.Push(directory);
                    } catch { }
                }
            } catch { }
        }
        return best;
    }

    private void CopyMediaFile(string source, string destination, string component)
    {
        try {
            if (String.IsNullOrWhiteSpace(source) || !File.Exists(source))
                throw new FileNotFoundException("Arquivo de origem não encontrado.", source);
            string directory = Path.GetDirectoryName(destination);
            if (String.IsNullOrWhiteSpace(directory))
                throw new IOException("Pasta de destino inválida para " + component + ": " + destination);
            Directory.CreateDirectory(directory);
            if (File.Exists(destination)) {
                try { File.SetAttributes(destination, FileAttributes.Normal); } catch { }
            }
            using (FileStream input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (FileStream output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None)) {
                input.CopyTo(output);
            }
        } catch (Exception ex) {
            throw new IOException("Falha ao copiar " + component + ". Origem: " + source + ". Destino: " + destination + ". Detalhe: " + ex.Message, ex);
        }
    }

    private void CopyAdjacentDlls(string sourceFile, string destination)
    {
        string sourceDirectory = Path.GetDirectoryName(sourceFile);
        if (String.IsNullOrEmpty(sourceDirectory) || !Directory.Exists(sourceDirectory)) return;
        foreach (string dll in Directory.GetFiles(sourceDirectory, "*.dll")) {
            string target = Path.Combine(destination, Path.GetFileName(dll));
            CopyMediaFile(dll, target, "biblioteca " + Path.GetFileName(dll));
        }
    }

    private void DeleteDirectoryWithNormalizedAttributes(string path)
    {
        if (String.IsNullOrWhiteSpace(path) || !Directory.Exists(path)) return;
        foreach (string file in Directory.GetFiles(path, "*", SearchOption.AllDirectories)) {
            try { File.SetAttributes(file, FileAttributes.Normal); } catch { }
        }
        foreach (string directory in Directory.GetDirectories(path, "*", SearchOption.AllDirectories)) {
            try { File.SetAttributes(directory, FileAttributes.Directory); } catch { }
        }
        try { File.SetAttributes(path, FileAttributes.Directory); } catch { }
        Directory.Delete(path, true);
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
            if (Directory.Exists(destinationRoot)) DeleteDirectoryWithNormalizedAttributes(destinationRoot);
            Directory.CreateDirectory(destinationRoot);

            if (useFfmpeg) {
                string target = Path.Combine(destinationRoot, "ffmpeg");
                Directory.CreateDirectory(target);
                CopyMediaFile(ffmpegExe, Path.Combine(target, "ffmpeg.exe"), "FFmpeg");
                CopyMediaFile(ffprobeExe, Path.Combine(target, "ffprobe.exe"), "FFprobe");
                CopyAdjacentDlls(ffmpegExe, target);
                CopyAdjacentDlls(ffprobeExe, target);
            }

            if (useWhisper) {
                string target = Path.Combine(destinationRoot, "whisper");
                Directory.CreateDirectory(target);
                CopyMediaFile(whisperExe, Path.Combine(target, "whisper-cli.exe"), "Whisper CLI");
                CopyMediaFile(whisperModel, Path.Combine(target, "ggml-tiny.bin"), "modelo Whisper Tiny");
                CopyAdjacentDlls(whisperExe, target);
                CopyAdjacentDlls(whisperModel, target);
            }

            string common = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Edit Master");
            Directory.CreateDirectory(common);
            File.WriteAllText(Path.Combine(common, "MediaTools.ini"), "[MediaTools]\r\nPath=" + destinationRoot + "\r\n");
        } else {
            if (!String.IsNullOrEmpty(previousRoot) && Directory.Exists(previousRoot)) DeleteDirectoryWithNormalizedAttributes(previousRoot);
            string config = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Edit Master", "MediaTools.ini");
            if (File.Exists(config)) File.Delete(config);
        }

        // Remove only the temporary resource payloads after successful external installation.
        string bundledResources = Path.Combine(installDir, "resources");
        string bundledFfmpeg = Path.Combine(bundledResources, "ffmpeg");
        string bundledWhisper = Path.Combine(bundledResources, "whisper");
        if (Directory.Exists(bundledFfmpeg)) DeleteDirectoryWithNormalizedAttributes(bundledFfmpeg);
        if (Directory.Exists(bundledWhisper)) DeleteDirectoryWithNormalizedAttributes(bundledWhisper);

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
            SetInstallProgress(5, L("Preparando o pacote de instalação...", "Preparing the installation package...", "Preparando el paquete de instalación..."));
            string payload = Path.Combine(Path.GetTempPath(), "EditMasterSetup-" + Guid.NewGuid().ToString("N") + ".exe");
            string installMarker = Path.Combine(Path.GetTempPath(), "EditMasterInstall-" + Guid.NewGuid().ToString("N") + ".ini");
            using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream("EditMasterPayload.exe")) {
                if (input == null) throw new InvalidOperationException("O pacote interno de instalação não foi encontrado.");
                using (FileStream output = File.Create(payload)) await input.CopyToAsync(output);
            }
            // NSIS writes its final $INSTDIR to this unique marker. Do not infer
            // the path from stale uninstall registry entries after an update.
            string args = "/S " + (updateMode ? "/UPDATE " : "") +
                "/EMFFMPEG=" + (useFfmpeg ? "1" : "0") +
                " /EMWHISPER=" + (useWhisper ? "1" : "0") +
                " /EMMARKER=\"" + installMarker + "\"" +
                " /D=" + installDir; // NSIS /D= must be the final argument and its path must not be quoted; it consumes the remainder of the command line.
            SetInstallProgress(12, L("Pacote preparado. Iniciando a instalação...", "Package ready. Starting installation...", "Paquete listo. Iniciando la instalación..."));
            ProcessStartInfo psi = new ProcessStartInfo(payload, args) { UseShellExecute = true, Verb = "runas" };
            using (Process p = Process.Start(psi)) {
                if (progressTimer != null) progressTimer.Start();
                await System.Threading.Tasks.Task.Run(delegate { p.WaitForExit(); });
                if (progressTimer != null) progressTimer.Stop();
                SetInstallProgress(78, L("Aplicativo instalado. Configurando componentes...", "Application installed. Configuring components...", "Aplicación instalada. Configurando componentes..."));
                if (p.ExitCode != 0) throw new Exception("O mecanismo de instalação retornou o código " + p.ExitCode + ".");
            }
            if (File.Exists(installMarker)) {
                string actualInstall = "";
                foreach (string line in File.ReadAllLines(installMarker)) {
                    if (line.StartsWith("Path=", StringComparison.OrdinalIgnoreCase)) {
                        actualInstall = line.Substring(5).Trim().Trim('"');
                        break;
                    }
                }
                try { File.Delete(installMarker); } catch { }
                if (!String.IsNullOrWhiteSpace(actualInstall)) installDir = actualInstall;
            }
            if (!Directory.Exists(installDir))
                throw new Exception("O NSIS terminou, mas a pasta de destino informada não existe: " + installDir +
                    ". Verifique se o instalador realmente concluiu a cópia dos arquivos.");
            if (useFfmpeg || useWhisper) FinalizeMediaTools(useFfmpeg, useWhisper, destinationRoot, previousRoot);
            else FinalizeMediaTools(false, false, "", previousRoot);
            SetInstallProgress(96, L("Finalizando atalhos e configurações...", "Finishing shortcuts and settings...", "Finalizando accesos directos y configuración..."));
            try { File.Delete(payload); } catch { }
            if (progressTimer != null) progressTimer.Stop();
            SetInstallProgress(100, L("Instalação concluída!", "Installation complete!", "¡Instalación completada!"));
            installing = false;
            ShowPage(4);
        } catch (Exception ex) {
            installing = false;
            MessageBox.Show(this, L("Não foi possível concluir a instalação.\r\n\r\n", "The installation could not be completed.\r\n\r\n", "No se pudo completar la instalación.\r\n\r\n") + ex.Message, "Edit Master Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
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