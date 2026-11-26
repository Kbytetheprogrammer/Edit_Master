using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal sealed class InstallerForm : Form
{
    private readonly Color bg = Color.FromArgb(18, 18, 18);
    private readonly Color panel = Color.FromArgb(28, 28, 28);
    private readonly Color orange = Color.FromArgb(255, 122, 0);
    private readonly Color muted = Color.FromArgb(175, 175, 175);
    private Panel content;
    private Label title, subtitle, body, step;
    private Button back, next, cancel;
    private CheckBox ffmpeg, whisper, launch;
    private TextBox folder;
    private ProgressBar progress;
    private int page = 0;
    private string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Edit Master");
    private bool installing = false;

    public InstallerForm()
    {
        Text = "Edit Master Setup";
        Width = 760; Height = 510;
        MinimumSize = new Size(700, 470);
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = bg;
        Font = new Font("Segoe UI", 10f);
        ShowInTaskbar = true;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        Panel top = new Panel { Dock = DockStyle.Top, Height = 58, BackColor = Color.FromArgb(12,12,12) };
        top.MouseDown += DragWindow;
        Label mark = new Label { Text = "M", ForeColor = Color.Black, BackColor = orange, Font = new Font("Segoe UI", 19, FontStyle.Bold), TextAlign = ContentAlignment.MiddleCenter, Bounds = new Rectangle(20, 10, 38, 38) };
        mark.MouseDown += DragWindow;
        Label brand = new Label { Text = "EDIT MASTER", ForeColor = Color.White, Font = new Font("Segoe UI", 12, FontStyle.Bold), AutoSize = true, Location = new Point(72, 18) };
        brand.MouseDown += DragWindow;
        Button close = MakeButton("×", false); close.Bounds = new Rectangle(Width - 52, 0, 52, 58); close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        close.Click += delegate { if (!installing) Close(); };
        top.Controls.Add(mark); top.Controls.Add(brand); top.Controls.Add(close);
        Controls.Add(top);

        Panel footer = new Panel { Dock = DockStyle.Bottom, Height = 76, BackColor = Color.FromArgb(14,14,14) };
        step = new Label { ForeColor = muted, AutoSize = true, Location = new Point(26, 28), Text = "EDIT MASTER 1.0 BETA OFICIAL" };
        back = MakeButton("VOLTAR", false); back.SetBounds(footer.Width - 330, 17, 94, 42); back.Anchor = AnchorStyles.Right | AnchorStyles.Top; back.Click += delegate { if (page > 0) ShowPage(page - 1); };
        cancel = MakeButton("CANCELAR", false); cancel.SetBounds(footer.Width - 224, 17, 104, 42); cancel.Anchor = AnchorStyles.Right | AnchorStyles.Top; cancel.Click += delegate { if (!installing) Close(); };
        next = MakeButton("PRÓXIMO", true); next.SetBounds(footer.Width - 108, 17, 88, 42); next.Anchor = AnchorStyles.Right | AnchorStyles.Top; next.Click += NextClicked;
        footer.Controls.Add(step); footer.Controls.Add(back); footer.Controls.Add(cancel); footer.Controls.Add(next);
        Controls.Add(footer);

        content = new Panel { Dock = DockStyle.Fill, Padding = new Padding(30, 24, 30, 20), BackColor = bg };
        title = new Label { ForeColor = orange, Font = new Font("Segoe UI", 24, FontStyle.Bold), AutoSize = true, Location = new Point(30, 28) };
        subtitle = new Label { ForeColor = Color.White, Font = new Font("Segoe UI", 14), AutoSize = true, Location = new Point(32, 82) };
        body = new Label { ForeColor = muted, Font = new Font("Segoe UI", 10), AutoSize = false, Location = new Point(32, 132), Size = new Size(620, 55) };
        content.Controls.Add(title); content.Controls.Add(subtitle); content.Controls.Add(body);
        Controls.Add(content);
        ShowPage(0);
    }

    private Button MakeButton(string text, bool primary)
    {
        Button b = new Button { Text = text, FlatStyle = FlatStyle.Flat, BackColor = primary ? orange : Color.FromArgb(43,43,43), ForeColor = primary ? Color.Black : Color.White, Font = new Font("Segoe UI", 9, FontStyle.Bold), Cursor = Cursors.Hand };
        b.FlatAppearance.BorderSize = primary ? 0 : 1;
        b.FlatAppearance.BorderColor = Color.FromArgb(75,75,75);
        b.FlatAppearance.MouseOverBackColor = primary ? Color.FromArgb(255,145,40) : Color.FromArgb(58,58,58);
        return b;
    }

    private void DragWindow(object sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, 0x2, 0); }
    }
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    private void ResetContent()
    {
        for (int i = content.Controls.Count - 1; i >= 3; i--) content.Controls.RemoveAt(i);
        progress = null;
    }
    private void ShowPage(int index)
    {
        page = index; ResetContent();
        back.Visible = page > 0 && page < 3;
        next.Visible = page != 3;
        next.Text = page == 2 ? "INSTALAR" : page == 4 ? "CONCLUIR" : "PRÓXIMO";
        step.Text = "ETAPA " + Math.Min(page + 1, 4) + " DE 4  •  EDIT MASTER 1.0 BETA OFICIAL";
        if (page == 0) {
            title.Text = "Seu próximo projeto começa aqui.";
            subtitle.Text = "EDIT MASTER 1.0 BETA OFICIAL";
            body.Text = "Um editor de vídeo leve, simples e pronto para criar.\r\nEste assistente vai instalar o Edit Master no seu computador.";
        } else if (page == 1) {
            title.Text = "Componentes opcionais";
            subtitle.Text = "Escolha os recursos adicionais";
            body.Text = "Você pode instalar esses componentes agora ou adicioná-los posteriormente.";
            ffmpeg = new CheckBox { Text = "FFmpeg + FFprobe", Checked = true, ForeColor = Color.White, BackColor = bg, AutoSize = true, Location = new Point(34, 210), Font = new Font("Segoe UI", 12, FontStyle.Bold) };
            Label fdesc = new Label { Text = "Exportação, processamento e conversão de mídia", ForeColor = muted, AutoSize = true, Location = new Point(60, 242) };
            whisper = new CheckBox { Text = "Whisper.cpp + modelo Tiny", Checked = true, ForeColor = Color.White, BackColor = bg, AutoSize = true, Location = new Point(34, 290), Font = new Font("Segoe UI", 12, FontStyle.Bold) };
            Label wdesc = new Label { Text = "Transcrição local de áudio para legendas", ForeColor = muted, AutoSize = true, Location = new Point(60, 322) };
            content.Controls.Add(ffmpeg); content.Controls.Add(fdesc); content.Controls.Add(whisper); content.Controls.Add(wdesc);
        } else if (page == 2) {
            title.Text = "Local de instalação";
            subtitle.Text = "Onde deseja instalar o Edit Master?";
            body.Text = "O aplicativo será instalado na pasta selecionada abaixo.";
            folder = new TextBox { Text = installDir, BackColor = Color.FromArgb(38,38,38), ForeColor = Color.White, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 11), Location = new Point(34, 218), Width = 500, Height = 32 };
            Button browse = MakeButton("PROCURAR", false); browse.SetBounds(548, 214, 112, 38);
            browse.Click += delegate { using (FolderBrowserDialog d = new FolderBrowserDialog()) { d.SelectedPath = folder.Text; d.Description = "Selecione a pasta de instalação do Edit Master"; if (d.ShowDialog(this) == DialogResult.OK) folder.Text = d.SelectedPath; } };
            content.Controls.Add(folder); content.Controls.Add(browse);
        } else if (page == 3) {
            title.Text = "Instalando o Edit Master";
            subtitle.Text = "Isso pode levar alguns minutos.";
            body.Text = "Preparando os arquivos e configurando o aplicativo. Não feche esta janela.";
            progress = new ProgressBar { Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 28, Location = new Point(34, 230), Width = 620, Height = 18 };
            content.Controls.Add(progress);
            back.Visible = false; cancel.Visible = false; next.Visible = false;
            installing = true;
            BeginInstall();
        } else {
            title.Text = "Instalação concluída!";
            subtitle.Text = "O Edit Master está pronto para uso.";
            body.Text = "A instalação foi concluída. Você já pode começar seu próximo projeto.";
            launch = new CheckBox { Text = "Abrir Edit Master agora", Checked = true, ForeColor = Color.White, BackColor = bg, AutoSize = true, Location = new Point(34, 230), Font = new Font("Segoe UI", 11, FontStyle.Bold) };
            content.Controls.Add(launch);
            back.Visible = false; cancel.Visible = false; next.Visible = true; next.Text = "CONCLUIR";
        }
    }

    private void NextClicked(object sender, EventArgs e)
    {
        if (page == 2) {
            if (String.IsNullOrWhiteSpace(folder.Text)) { MessageBox.Show(this, "Escolha uma pasta válida.", "Edit Master", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            installDir = folder.Text.Trim();
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

    private async void BeginInstall()
    {
        try {
            string payload = Path.Combine(Path.GetTempPath(), "EditMasterSetup-" + Guid.NewGuid().ToString("N") + ".exe");
            using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream("EditMasterPayload.exe")) {
                if (input == null) throw new InvalidOperationException("O pacote interno de instalação não foi encontrado.");
                using (FileStream output = File.Create(payload)) await input.CopyToAsync(output);
            }
            Directory.CreateDirectory(installDir);
            string args = "/S /EMCUSTOM /EMFFMPEG=" + (ffmpeg.Checked ? "1" : "0") + " /EMWHISPER=" + (whisper.Checked ? "1" : "0") + " /D=\"" + installDir + "\"";
            ProcessStartInfo psi = new ProcessStartInfo(payload, args) { UseShellExecute = true, Verb = "runas" };
            using (Process p = Process.Start(psi)) { await System.Threading.Tasks.Task.Run(delegate { p.WaitForExit(); }); if (p.ExitCode != 0) throw new Exception("O mecanismo de instalação retornou o código " + p.ExitCode + "."); }
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