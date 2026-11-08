use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Instant;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::process::Command;

use reqwest::blocking::{multipart, Client};
use reqwest::redirect::Policy;
use base64::Engine;
use url::Url;
use uuid::Uuid;
use serde_json::{json, Value};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct LocalUpdateManifest {
    product: String,
    version: String,
    installer: String,
    sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalUpdateInfo {
    current_version: String,
    version: String,
    installer_name: String,
    installer_path: String,
    sha256: String,
}

#[derive(Debug, Serialize)]
struct DuplicateVideoFile {
    path: String,
    name: String,
    size_bytes: u64,
    modified_unix: u64,
    sha256: String,
}

#[derive(Debug, Serialize)]
struct DuplicateVideoGroup {
    key: String,
    sha256: String,
    size_bytes: u64,
    files: Vec<DuplicateVideoFile>,
}

#[derive(Debug, Serialize)]
struct DuplicateScanResult {
    groups: Vec<DuplicateVideoGroup>,
    scanned_video_files: usize,
    skipped_items: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaDescriptor {
    path: String,
    name: String,
    media_type: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CopiedMediaDescriptor {
    source_path: String,
    path: String,
    name: String,
    media_type: String,
    size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMediaInput {
    id: String,
    name: String,
    #[serde(rename = "type")]
    media_type: String,
    size: u64,
    #[serde(default)]
    duration: f64,
    source_path: String,
    #[serde(default)] source_provider: Option<String>,
    #[serde(default)] source_page_url: Option<String>,
    #[serde(default)] source_author: Option<String>,
    #[serde(default)] source_license: Option<String>,
    #[serde(default)] source_license_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectKeyframe {
    time: f64,
    #[serde(default)] x: Option<f64>,
    #[serde(default)] y: Option<f64>,
    #[serde(default)] scale: Option<f64>,
    #[serde(default)] rotation: Option<f64>,
    #[serde(default)] opacity: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectSubtitle {
    id: String,
    media_id: String,
    start: f64,
    end: f64,
    text: String,
    #[serde(default)]
    kind: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectClip {
    clip_id: String,
    media_id: String,
    name: String,
    #[serde(rename = "type")]
    media_type: String,
    duration: f64,
    start: f64,
    end: f64,
    #[serde(default)]
    duration_pending: bool,
    #[serde(default)]
    audio_gain: Option<f64>,
    #[serde(default)]
    audio_fade_in: Option<f64>,
    #[serde(default)]
    audio_fade_out: Option<f64>,
    #[serde(default)]
    audio_muted: Option<bool>,
    #[serde(default)]
    overlay_x: Option<f64>,
    #[serde(default)]
    overlay_y: Option<f64>,
    #[serde(default)]
    overlay_scale: Option<f64>,
    #[serde(default)]
    overlay_opacity: Option<f64>,
    #[serde(default)]
    overlay_rotation: Option<f64>,
    #[serde(default)]
    playback_speed: Option<f64>,
    #[serde(default)]
    color_brightness: Option<f64>,
    #[serde(default)]
    color_contrast: Option<f64>,
    #[serde(default)]
    color_saturation: Option<f64>,
    #[serde(default)]
    color_warmth: Option<f64>,
    #[serde(default)]
    keyframes: Vec<ProjectKeyframe>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSaveInput {
    name: String,
    media: Vec<ProjectMediaInput>,
    clips: Vec<ProjectClip>,
    #[serde(default)]
    subtitles: Vec<ProjectSubtitle>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedMediaLocation {
    id: String,
    path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedProjectMedia {
    id: String,
    name: String,
    #[serde(rename = "type")]
    media_type: String,
    size: u64,
    duration: f64,
    relative_path: String,
    #[serde(default)] source_provider: Option<String>,
    #[serde(default)] source_page_url: Option<String>,
    #[serde(default)] source_author: Option<String>,
    #[serde(default)] source_license: Option<String>,
    #[serde(default)] source_license_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedProject {
    app: String,
    version: String,
    name: String,
    media: Vec<SavedProjectMedia>,
    clips: Vec<ProjectClip>,
    #[serde(default)]
    subtitles: Vec<ProjectSubtitle>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedProjectMedia {
    id: String,
    name: String,
    #[serde(rename = "type")]
    media_type: String,
    size: u64,
    duration: f64,
    source_path: String,
    #[serde(default)] source_provider: Option<String>,
    #[serde(default)] source_page_url: Option<String>,
    #[serde(default)] source_author: Option<String>,
    #[serde(default)] source_license: Option<String>,
    #[serde(default)] source_license_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedProject {
    name: String,
    media: Vec<LoadedProjectMedia>,
    clips: Vec<ProjectClip>,
    subtitles: Vec<ProjectSubtitle>,
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Não foi possível abrir o arquivo: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|error| format!("Falha ao ler o instalador: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    let digest = hasher.finalize();
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn is_valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn collect_update_manifest_directories(
    current: &Path,
    root: &Path,
    depth: usize,
    visited_entries: &mut usize,
    output: &mut Vec<PathBuf>,
) {
    const MAX_DEPTH: usize = 6;
    const MAX_ENTRIES: usize = 20_000;
    const MAX_DIRECTORIES: usize = 2_000;
    if depth >= MAX_DEPTH || *visited_entries >= MAX_ENTRIES || output.len() >= MAX_DIRECTORIES {
        return;
    }
    let entries = match fs::read_dir(current) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries {
        if *visited_entries >= MAX_ENTRIES || output.len() >= MAX_DIRECTORIES { break; }
        *visited_entries += 1;
        let entry = match entry { Ok(entry) => entry, Err(_) => continue };
        let file_type = match entry.file_type() { Ok(file_type) => file_type, Err(_) => continue };
        // Never follow symlinks/junctions: the scan must remain inside the folder selected by the user.
        if !file_type.is_dir() || file_type.is_symlink() { continue; }
        let child = match entry.path().canonicalize() { Ok(child) => child, Err(_) => continue };
        if !child.starts_with(root) { continue; }
        output.push(child.clone());
        collect_update_manifest_directories(&child, root, depth + 1, visited_entries, output);
    }
}

fn is_supported_video(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "mp4" | "m4v" | "mkv" | "mov" | "avi" | "webm" | "wmv"
                    | "mpeg" | "mpg" | "3gp" | "flv" | "ts" | "mts" | "m2ts"
            )
        })
        .unwrap_or(false)
}

fn supported_media_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    if is_supported_video(path) {
        return Some("video");
    }
    if matches!(extension.as_str(), "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac" | "wma" | "aiff" | "aif") {
        return Some("audio");
    }
    if matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tif" | "tiff") {
        return Some("image");
    }
    None
}

#[tauri::command]
fn register_media_paths(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<MediaDescriptor>, String> {
    let scope = app.asset_protocol_scope();
    let mut media = Vec::new();
    for raw_path in paths {
        let path = PathBuf::from(raw_path)
            .canonicalize()
            .map_err(|error| format!("Não foi possível acessar um dos arquivos selecionados: {error}"))?;
        if !path.is_file() {
            continue;
        }
        let Some(media_type) = supported_media_type(&path) else {
            continue;
        };
        scope.allow_file(&path)
            .map_err(|error| format!("Não foi possível liberar a prévia deste arquivo: {error}"))?;
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("Não foi possível ler os detalhes de um arquivo: {error}"))?;
        let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("Mídia sem nome").to_string();
        media.push(MediaDescriptor {
            path: path.to_string_lossy().into_owned(),
            name,
            media_type: media_type.to_string(),
            size_bytes: metadata.len(),
        });
    }
    Ok(media)
}

fn unique_media_destination(folder: &Path, file_name: &str) -> PathBuf {
    let original = Path::new(file_name);
    let stem = original.file_stem().and_then(|value| value.to_str()).unwrap_or("media");
    let extension = original.extension().and_then(|value| value.to_str());
    let first = folder.join(file_name);
    if !first.exists() {
        return first;
    }
    for index in 2..=10_000 {
        let candidate_name = match extension {
            Some(extension) => format!("{stem} ({index}).{extension}"),
            None => format!("{stem} ({index})"),
        };
        let candidate = folder.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    folder.join(format!("{}_{}.{}", stem, Uuid::new_v4(), extension.unwrap_or("bin")))
}

#[tauri::command]
fn copy_media_to_folder(
    app: tauri::AppHandle,
    paths: Vec<String>,
    folder_path: String,
) -> Result<Vec<CopiedMediaDescriptor>, String> {
    let requested_folder = PathBuf::from(folder_path);
    fs::create_dir_all(&requested_folder)
        .map_err(|error| format!("Não foi possível criar a pasta de mídia escolhida: {error}"))?;
    let folder = requested_folder.canonicalize()
        .map_err(|error| format!("Não foi possível acessar a pasta de mídia escolhida: {error}"))?;
    if !folder.is_dir() {
        return Err("Escolha uma pasta válida para armazenar as mídias.".into());
    }

    let scope = app.asset_protocol_scope();
    let mut copied = Vec::new();
    for raw_path in paths {
        let source = PathBuf::from(raw_path).canonicalize()
            .map_err(|error| format!("Não foi possível acessar um dos arquivos selecionados: {error}"))?;
        if !source.is_file() {
            continue;
        }
        let Some(media_type) = supported_media_type(&source) else {
            continue;
        };
        let file_name = source.file_name().and_then(|value| value.to_str())
            .ok_or("Não foi possível identificar o nome de um arquivo de mídia.")?;
        let destination = if source.parent() == Some(folder.as_path()) {
            source.clone()
        } else {
            let target = unique_media_destination(&folder, file_name);
            fs::copy(&source, &target)
                .map_err(|error| format!("Não foi possível copiar '{}': {error}", file_name))?;
            target
        };
        scope.allow_file(&destination)
            .map_err(|error| format!("Não foi possível liberar a prévia de '{}': {error}", file_name))?;
        let metadata = fs::metadata(&destination)
            .map_err(|error| format!("Não foi possível ler os detalhes de '{}': {error}", file_name))?;
        let name = destination.file_name().and_then(|value| value.to_str())
            .unwrap_or(file_name).to_string();
        copied.push(CopiedMediaDescriptor {
            source_path: source.to_string_lossy().into_owned(),
            path: destination.to_string_lossy().into_owned(),
            name,
            media_type: media_type.to_string(),
            size_bytes: metadata.len(),
        });
    }
    Ok(copied)
}

#[tauri::command]
fn move_media_to_recycle_bin(file_path: String) -> Result<(), String> {
    let file = PathBuf::from(file_path)
        .canonicalize()
        .map_err(|error| format!("Não foi possível acessar o arquivo selecionado: {error}"))?;

    if !file.is_file() || supported_media_type(&file).is_none() {
        return Err("O caminho selecionado não é um arquivo de mídia compatível.".into());
    }

    trash::delete(&file)
        .map_err(|error| format!("O Windows não conseguiu enviar a mídia à Lixeira: {error}"))
}

fn safe_asset_folder_name(stem: &str) -> String {
    let cleaned = stem.chars()
        .map(|character| if character.is_ascii_alphanumeric() || character == '-' || character == '_' { character } else { '_' })
        .collect::<String>();
    format!("{}_assets", if cleaned.is_empty() { "projeto" } else { &cleaned })
}

#[tauri::command]
fn save_project_bundle(file_path: String, project: ProjectSaveInput) -> Result<serde_json::Value, String> {
    let destination = PathBuf::from(&file_path);
    let parent = destination.parent().ok_or("Escolha uma pasta válida para salvar o projeto.")?;
    fs::create_dir_all(parent).map_err(|error| format!("Não foi possível criar a pasta do projeto: {error}"))?;
    let stem = destination.file_stem().and_then(|value| value.to_str()).unwrap_or("projeto");
    let assets_name = safe_asset_folder_name(stem);
    let assets_dir = parent.join(&assets_name);
    fs::create_dir_all(&assets_dir).map_err(|error| format!("Não foi possível criar a pasta de mídia do projeto: {error}"))?;

    let mut saved_media = Vec::with_capacity(project.media.len());
    let mut saved_locations = Vec::with_capacity(project.media.len());
    for (index, media) in project.media.iter().enumerate() {
        let source = PathBuf::from(&media.source_path).canonicalize()
            .map_err(|error| format!("A mídia '{}' não está mais acessível: {error}", media.name))?;
        if !source.is_file() {
            return Err(format!("A mídia '{}' não é um arquivo válido.", media.name));
        }
        if supported_media_type(&source).is_none() {
            return Err(format!("O formato da mídia '{}' não é compatível.", media.name));
        }
        let extension = source.extension().and_then(|value| value.to_str()).unwrap_or("bin");
        let safe_id = media.id.chars().map(|character| if character.is_ascii_alphanumeric() || character == '-' { character } else { '_' }).collect::<String>();
        let asset_name = format!("media_{:04}_{}.{}", index + 1, safe_id, extension);
        let asset_path = assets_dir.join(&asset_name);
        let same_file = asset_path
            .canonicalize()
            .map(|existing_path| existing_path.as_path() == source.as_path())
            .unwrap_or(false);
        if !same_file {
            fs::copy(&source, &asset_path)
                .map_err(|error| format!("Não foi possível copiar '{}': {error}", media.name))?;
        }
        saved_locations.push(SavedMediaLocation {
            id: media.id.clone(),
            path: asset_path.to_string_lossy().into_owned(),
        });
        saved_media.push(SavedProjectMedia {
            id: media.id.clone(),
            name: media.name.clone(),
            media_type: media.media_type.clone(),
            size: media.size,
            duration: media.duration,
            relative_path: PathBuf::from(&assets_name).join(asset_name).to_string_lossy().replace('\\', "/"),
            source_provider: media.source_provider.clone(),
            source_page_url: media.source_page_url.clone(),
            source_author: media.source_author.clone(),
            source_license: media.source_license.clone(),
            source_license_url: media.source_license_url.clone(),
        });
    }

    let saved = SavedProject {
        app: "Edit Master".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        name: project.name,
        media: saved_media,
        clips: project.clips,
        subtitles: project.subtitles,
    };
    let json = serde_json::to_vec_pretty(&saved)
        .map_err(|error| format!("Não foi possível montar o arquivo do projeto: {error}"))?;
    fs::write(&destination, json)
        .map_err(|error| format!("Não foi possível gravar o arquivo .emproj: {error}"))?;

    Ok(serde_json::json!({
        "mediaCount": saved.media.len(),
        "projectPath": destination.to_string_lossy(),
        "mediaPaths": saved_locations,
    }))
}

#[tauri::command]
fn load_project_bundle(app: tauri::AppHandle, file_path: String) -> Result<LoadedProject, String> {
    let project_file = PathBuf::from(file_path).canonicalize()
        .map_err(|error| format!("Não foi possível abrir o arquivo do projeto: {error}"))?;
    if project_file.extension().and_then(|value| value.to_str()).map(|value| !value.eq_ignore_ascii_case("emproj")).unwrap_or(true) {
        return Err("Selecione um arquivo .emproj do Edit Master.".into());
    }
    let parent = project_file.parent().ok_or("Não foi possível localizar a pasta do projeto.")?.to_path_buf();
    let bytes = fs::read(&project_file).map_err(|error| format!("Não foi possível ler o projeto: {error}"))?;
    let saved: SavedProject = serde_json::from_slice(&bytes)
        .map_err(|error| format!("O arquivo do projeto está inválido: {error}"))?;
    if !saved.app.eq_ignore_ascii_case("Edit Master") {
        return Err("Este arquivo não foi criado pelo Edit Master.".into());
    }

    let scope = app.asset_protocol_scope();
    let mut loaded_media = Vec::with_capacity(saved.media.len());
    for media in saved.media {
        let relative = PathBuf::from(&media.relative_path);
        if relative.is_absolute() || relative.components().any(|component| matches!(component, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_))) {
            return Err(format!("O caminho salvo para '{}' não é seguro.", media.name));
        }
        let path = parent.join(relative).canonicalize()
            .map_err(|error| format!("A mídia '{}' do projeto não foi encontrada. Verifique se a pasta _assets está ao lado do projeto: {error}", media.name))?;
        if !path.starts_with(&parent) || !path.is_file() {
            return Err(format!("A mídia '{}' aponta para um local inválido.", media.name));
        }
        scope.allow_file(&path)
            .map_err(|error| format!("Não foi possível preparar a prévia de '{}': {error}", media.name))?;
        loaded_media.push(LoadedProjectMedia {
            id: media.id,
            name: media.name,
            media_type: media.media_type,
            size: media.size,
            duration: media.duration,
            source_path: path.to_string_lossy().into_owned(),
            source_provider: media.source_provider,
            source_page_url: media.source_page_url,
            source_author: media.source_author,
            source_license: media.source_license,
            source_license_url: media.source_license_url,
        });
    }

    Ok(LoadedProject { name: saved.name, media: loaded_media, clips: saved.clips, subtitles: saved.subtitles })
}

#[tauri::command]
fn read_srt_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(file_path).canonicalize()
        .map_err(|error| format!("Não foi possível acessar o arquivo de legendas: {error}"))?;
    if path.extension().and_then(|value| value.to_str()).map(|value| !value.eq_ignore_ascii_case("srt")).unwrap_or(true) {
        return Err("Selecione um arquivo de legendas .srt.".into());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("Não foi possível ler os detalhes do SRT: {error}"))?;
    if !metadata.is_file() || metadata.len() > 8 * 1024 * 1024 {
        return Err("O arquivo SRT precisa ser um arquivo de até 8 MB.".into());
    }
    fs::read_to_string(&path).map_err(|error| format!("Não foi possível ler o texto UTF-8 do SRT: {error}"))
}

#[tauri::command]
fn scan_duplicate_videos(folder_path: String) -> Result<DuplicateScanResult, String> {
    let root = PathBuf::from(folder_path)
        .canonicalize()
        .map_err(|error| format!("Não foi possível acessar a pasta escolhida: {error}"))?;
    if !root.is_dir() {
        return Err("Escolha uma pasta válida para procurar vídeos.".into());
    }
    if root.parent().is_none() {
        return Err("Escolha uma pasta específica de vídeos; por segurança, a análise não percorre a raiz inteira do disco.".into());
    }

    // First group by size so we only hash files that could actually be identical.
    // Symlinks are ignored to avoid following paths outside the selected folder.
    let mut folders = vec![root.clone()];
    let mut by_size: BTreeMap<u64, Vec<PathBuf>> = BTreeMap::new();
    let mut scanned_video_files = 0usize;
    let mut skipped_items = 0usize;

    while let Some(folder) = folders.pop() {
        let entries = match fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(_) => {
                skipped_items += 1;
                continue;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    skipped_items += 1;
                    continue;
                }
            };
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => {
                    skipped_items += 1;
                    continue;
                }
            };
            if file_type.is_symlink() {
                continue;
            }

            let path = entry.path();
            if file_type.is_dir() {
                folders.push(path);
                continue;
            }
            if !file_type.is_file() || !is_supported_video(&path) {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => {
                    skipped_items += 1;
                    continue;
                }
            };
            let size = metadata.len();
            if size == 0 {
                continue;
            }
            scanned_video_files += 1;
            by_size.entry(size).or_default().push(path);
        }
    }

    let mut by_content: HashMap<(u64, String), Vec<DuplicateVideoFile>> = HashMap::new();
    for (size, paths) in by_size.into_iter().filter(|(_, paths)| paths.len() > 1) {
        for path in paths {
            let canonical = match path.canonicalize() {
                Ok(path) if path.starts_with(&root) => path,
                _ => {
                    skipped_items += 1;
                    continue;
                }
            };
            let metadata = match fs::metadata(&canonical) {
                Ok(metadata) if metadata.is_file() => metadata,
                _ => {
                    skipped_items += 1;
                    continue;
                }
            };
            let hash = match sha256_file(&canonical) {
                Ok(hash) => hash,
                Err(_) => {
                    skipped_items += 1;
                    continue;
                }
            };
            let modified_unix = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or(0);
            let name = canonical
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Vídeo sem nome")
                .to_string();
            by_content.entry((size, hash.clone())).or_default().push(DuplicateVideoFile {
                path: canonical.to_string_lossy().into_owned(),
                name,
                size_bytes: size,
                modified_unix,
                sha256: hash,
            });
        }
    }

    let mut groups = by_content
        .into_iter()
        .filter_map(|((size_bytes, sha256), mut files)| {
            if files.len() < 2 {
                return None;
            }
            // Keep the newest copy at the top as a sensible default, but the UI
            // still asks the user which exact path should be preserved.
            files.sort_by(|left, right| right.modified_unix.cmp(&left.modified_unix));
            Some(DuplicateVideoGroup {
                key: format!("{size_bytes}:{sha256}"),
                sha256,
                size_bytes,
                files,
            })
        })
        .collect::<Vec<_>>();
    groups.sort_by(|left, right| right.size_bytes.cmp(&left.size_bytes));

    Ok(DuplicateScanResult {
        groups,
        scanned_video_files,
        skipped_items,
    })
}

#[tauri::command]
fn move_duplicate_to_recycle_bin(
    folder_path: String,
    file_path: String,
    expected_sha256: String,
) -> Result<(), String> {
    if !is_valid_sha256(&expected_sha256) {
        return Err("O identificador SHA-256 do arquivo é inválido.".into());
    }

    let root = PathBuf::from(folder_path)
        .canonicalize()
        .map_err(|error| format!("Não foi possível acessar a pasta analisada: {error}"))?;
    if !root.is_dir() {
        return Err("A pasta analisada não está mais disponível.".into());
    }

    let file = PathBuf::from(file_path)
        .canonicalize()
        .map_err(|error| format!("O vídeo selecionado não está mais disponível: {error}"))?;
    if !file.starts_with(&root) || !file.is_file() || !is_supported_video(&file) {
        return Err("O arquivo não pertence à pasta analisada ou não é um vídeo compatível.".into());
    }

    // Re-hash immediately before moving the file to the Recycle Bin. If it has
    // changed since the scan, leave it untouched and ask the user to scan again.
    let actual_sha256 = sha256_file(&file)?;
    if !actual_sha256.eq_ignore_ascii_case(&expected_sha256) {
        return Err("O vídeo mudou desde a análise. Faça uma nova busca antes de removê-lo.".into());
    }

    trash::delete(&file)
        .map_err(|error| format!("O Windows não conseguiu enviar o vídeo à Lixeira: {error}"))
}

#[tauri::command]
fn check_local_update(
    app: tauri::AppHandle,
    folder_path: String,
) -> Result<Option<LocalUpdateInfo>, String> {
    let folder = PathBuf::from(folder_path).canonicalize()
        .map_err(|error| format!("Não foi possível acessar a pasta de atualizações: {error}"))?;
    if !folder.is_dir() { return Err("O local escolhido não é uma pasta.".into()); }

    let current_version = app.package_info().version.to_string();
    let installed = semver::Version::parse(&current_version)
        .map_err(|error| format!("Versão instalada inválida ({current_version}): {error}"))?;

    // Search nested Downloads folders safely, with depth/entry limits and without following links.
    let mut manifest_folders = vec![folder.clone()];
    let mut visited_entries = 0usize;
    collect_update_manifest_directories(&folder, &folder, 0, &mut visited_entries, &mut manifest_folders);

    let mut best: Option<(semver::Version, LocalUpdateInfo)> = None;
    let mut first_error: Option<String> = None;
    for candidate_folder in manifest_folders {
        let manifest_path = candidate_folder.join("edit-master-update.json");
        if !manifest_path.is_file() { continue; }
        let candidate = (|| -> Result<(semver::Version, LocalUpdateInfo), String> {
            let manifest_bytes = fs::read(&manifest_path)
                .map_err(|error| format!("Não foi possível ler {}: {error}", manifest_path.display()))?;
            let manifest: LocalUpdateManifest = serde_json::from_slice(&manifest_bytes)
                .map_err(|error| format!("Manifesto inválido em {}: {error}", manifest_path.display()))?;
            if !manifest.product.eq_ignore_ascii_case("Edit Master") { return Err("O manifesto não pertence ao Edit Master.".into()); }
            if !is_valid_sha256(&manifest.sha256) { return Err("O manifesto contém um SHA-256 inválido.".into()); }
            let installer_name = Path::new(&manifest.installer).file_name().and_then(|name| name.to_str())
                .ok_or("O nome do instalador no manifesto é inválido.")?;
            if installer_name != manifest.installer || Path::new(installer_name).extension().and_then(|ext| ext.to_str()).map(|ext| !ext.eq_ignore_ascii_case("exe")).unwrap_or(true) {
                return Err("O manifesto deve apontar para um .exe dentro da pasta do manifesto.".into());
            }
            let installer = candidate_folder.join(installer_name).canonicalize()
                .map_err(|error| format!("Instalador não encontrado: {error}"))?;
            if installer.parent() != Some(candidate_folder.as_path()) || !installer.is_file() {
                return Err("O instalador precisa estar diretamente na pasta do manifesto.".into());
            }
            let installer_hash = sha256_file(&installer)?;
            if !installer_hash.eq_ignore_ascii_case(&manifest.sha256) {
                return Err("O SHA-256 do instalador não corresponde ao manifesto.".into());
            }
            let available = semver::Version::parse(&manifest.version)
                .map_err(|error| format!("Versão no manifesto inválida: {error}"))?;
            let info = LocalUpdateInfo {
                current_version: current_version.clone(),
                version: manifest.version,
                installer_name: installer_name.to_string(),
                installer_path: installer.to_string_lossy().into_owned(),
                sha256: installer_hash,
            };
            Ok((available, info))
        })();

        match candidate {
            Ok((version, info)) if version > installed => {
                if best.as_ref().map(|(best_version, _)| version > *best_version).unwrap_or(true) {
                    best = Some((version, info));
                }
            }
            Ok(_) => {},
            Err(error) => if first_error.is_none() { first_error = Some(error); },
        }
    }
    if let Some((_, info)) = best { return Ok(Some(info)); }
    if let Some(error) = first_error { return Err(error); }
    Ok(None)
}

#[tauri::command]
fn launch_uninstaller(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let dir = exe.parent().ok_or("Não foi possível localizar a pasta do aplicativo")?;
        let candidates = ["uninstall.exe", "uninstaller.exe", "unins000.exe"];
        let path = candidates.iter().map(|name| dir.join(name)).find(|p| p.is_file())
            .ok_or("O desinstalador não foi encontrado nesta pasta. Esta pode ser uma execução de desenvolvimento ou uma instalação MSI.")?;
        Command::new(path).spawn().map_err(|e| format!("Falha ao iniciar o desinstalador: {e}"))?;
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(700));
            app.exit(0);
        });
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("A desinstalação pelo aplicativo está configurada apenas para Windows nesta versão.".into())
    }
}

#[tauri::command]
fn launch_local_update(
    app: tauri::AppHandle,
    installer_path: String,
    expected_sha256: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let selected_path = PathBuf::from(installer_path);
        if selected_path.extension().and_then(|ext| ext.to_str()).map(|ext| !ext.eq_ignore_ascii_case("exe")).unwrap_or(true) {
            return Err("Selecione um instalador do Windows com extensão .exe.".into());
        }
        if !selected_path.is_file() {
            return Err("O arquivo selecionado não existe ou não pode ser acessado.".into());
        }
        let installer = selected_path.canonicalize().map_err(|e| format!("Não foi possível acessar o instalador: {e}"))?;
        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        if let (Ok(current), Ok(selected)) = (current_exe.canonicalize(), installer.canonicalize()) {
            if current == selected {
                return Err("O arquivo selecionado é o próprio aplicativo, não um instalador.".into());
            }
        }
        if let Some(expected_hash) = expected_sha256 {
            if !is_valid_sha256(&expected_hash) {
                return Err("O hash de verificação informado é inválido.".into());
            }
            let actual_hash = sha256_file(&installer)?;
            if !actual_hash.eq_ignore_ascii_case(&expected_hash) {
                return Err("O instalador mudou desde a verificação. Faça uma nova busca na pasta de atualizações.".into());
            }
        }
        let working_dir = installer.parent().ok_or("Não foi possível localizar a pasta do instalador.")?;
        Command::new(&installer)
            .current_dir(working_dir)
            .spawn()
            .map_err(|e| format!("Falha ao iniciar o instalador selecionado: {e}"))?;

        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(900));
            app.exit(0);
        });
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, installer_path, expected_sha256);
        Err("A instalação de atualizações locais está disponível apenas no Windows nesta versão.".into())
    }
}


fn validate_ai_provider(provider: &str) -> Result<(), String> {
    match provider {
        "gpt" | "gemini" | "claude" => Ok(()),
        _ => Err("Provedor de IA desconhecido.".into()),
    }
}

#[tauri::command]
fn save_ai_provider_key(provider: String, api_key: String) -> Result<(), String> {
    validate_ai_provider(&provider)?;
    let key = api_key.trim();
    if key.len() < 12 || key.len() > 16_384 {
        return Err("A chave informada parece vazia ou tem um tamanho inválido.".into());
    }
    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new("EditMaster.AI", &provider)
            .map_err(|error| format!("Não foi possível abrir o Cofre de Credenciais do Windows: {error}"))?;
        entry.set_password(key)
            .map_err(|error| format!("Não foi possível salvar a chave no Cofre de Credenciais do Windows: {error}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = key;
        Err("O armazenamento seguro de chaves está configurado para o Windows nesta versão.".into())
    }
}

#[tauri::command]
fn ai_provider_key_status(provider: String) -> Result<bool, String> {
    validate_ai_provider(&provider)?;
    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new("EditMaster.AI", &provider)
            .map_err(|error| format!("Não foi possível consultar o Cofre de Credenciais do Windows: {error}"))?;
        match entry.get_password() {
            Ok(value) => Ok(!value.is_empty()),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(error) => Err(format!("Não foi possível consultar a chave salva: {error}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("O armazenamento seguro de chaves está configurado para o Windows nesta versão.".into())
    }
}

#[tauri::command]
fn remove_ai_provider_key(provider: String) -> Result<(), String> {
    validate_ai_provider(&provider)?;
    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new("EditMaster.AI", &provider)
            .map_err(|error| format!("Não foi possível abrir o Cofre de Credenciais do Windows: {error}"))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("Não foi possível remover a chave salva: {error}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("O armazenamento seguro de chaves está configurado para o Windows nesta versão.".into())
    }
}

#[cfg(target_os = "windows")]
fn read_ai_provider_key(provider: &str) -> Result<String, String> {
    validate_ai_provider(provider)?;
    let entry = keyring::Entry::new("EditMaster.AI", provider)
        .map_err(|error| format!("Não foi possível abrir o Cofre de Credenciais do Windows: {error}"))?;
    entry.get_password().map_err(|error| match error {
        keyring::Error::NoEntry => format!("A chave do provedor {} ainda não foi configurada no AI Hub.", provider),
        other => format!("Não foi possível ler a chave salva: {other}"),
    })
}

fn mime_type_for_audio(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "mp3" | "mpga" | "mpeg" => "audio/mpeg",
        "m4a" | "mp4" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "webm" => "audio/webm",
        "aac" => "audio/aac",
        _ => "application/octet-stream",
    }
}

fn is_whisper_native_audio(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),
        "wav" | "mp3" | "ogg" | "flac"
    )
}

fn ffmpeg_extract_wav(input_path: &Path, ffmpeg_path: Option<&str>) -> Result<PathBuf, String> {
    if !input_path.is_file() {
        return Err("O arquivo de mídia não existe ou não está acessível.".into());
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let wav_path = std::env::temp_dir().join(format!("edit-master-audio-{}-{stamp}.wav", std::process::id()));
    let executable = ffmpeg_path.filter(|value| !value.trim().is_empty()).unwrap_or("ffmpeg");
    let output = Command::new(executable)
        .args(["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i"])
        .arg(input_path)
        .args(["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"])
        .arg(&wav_path)
        .output()
        .map_err(|error| format!("Não foi possível executar o FFmpeg. Selecione ffmpeg.exe no AI Hub ou adicione-o ao PATH do Windows: {error}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(&wav_path);
        let details = String::from_utf8_lossy(&output.stderr);
        return Err(format!("O FFmpeg não conseguiu extrair o áudio: {}", details.trim()));
    }
    Ok(wav_path)
}

fn srt_timestamp(seconds: f64) -> String {
    let total_ms = (seconds.max(0.0) * 1000.0).round() as u64;
    let hours = total_ms / 3_600_000;
    let minutes = (total_ms / 60_000) % 60;
    let secs = (total_ms / 1_000) % 60;
    let millis = total_ms % 1_000;
    format!("{hours:02}:{minutes:02}:{secs:02},{millis:03}")
}

fn approximate_srt_from_text(text: &str, duration: f64) -> String {
    let cleaned = text.replace("```srt", "").replace("```", "").trim().to_string();
    if cleaned.contains("-->") {
        return cleaned;
    }
    let mut chunks: Vec<String> = Vec::new();
    for sentence in cleaned.split(|character| matches!(character, '.' | '?' | '!' | '\n')) {
        let sentence = sentence.split_whitespace().collect::<Vec<_>>();
        if sentence.is_empty() { continue; }
        for part in sentence.chunks(8) {
            chunks.push(part.join(" "));
        }
    }
    if chunks.is_empty() { return String::new(); }
    let total_words: usize = chunks.iter().map(|chunk| chunk.split_whitespace().count()).sum();
    let total_duration = if duration.is_finite() && duration > 0.2 { duration } else { (chunks.len() as f64 * 1.8).max(2.0) };
    let mut cursor = 0.0_f64;
    let mut output = String::new();
    for (index, chunk) in chunks.iter().enumerate() {
        let words = chunk.split_whitespace().count().max(1);
        let mut span = total_duration * words as f64 / total_words.max(1) as f64;
        span = span.max(0.65);
        let start = cursor.min(total_duration);
        let end = if index + 1 == chunks.len() { total_duration.max(start + 0.35) } else { (start + span).min(total_duration) };
        output.push_str(&format!("{}\n{} --> {}\n{}\n\n", index + 1, srt_timestamp(start), srt_timestamp(end), chunk));
        cursor = end;
    }
    output.trim().to_string()
}

fn value_number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_str().and_then(|raw| raw.parse::<f64>().ok()))
}

fn srt_from_segment_json(value: &Value) -> Option<String> {
    let segments = value.get("segments").and_then(Value::as_array).or_else(|| value.as_array())?;
    let mut output = String::new();
    let mut index = 0_usize;
    for segment in segments {
        let start = segment.get("start").or_else(|| segment.get("start_time")).and_then(value_number)?;
        let end = segment.get("end").or_else(|| segment.get("end_time")).and_then(value_number)?;
        let text = segment.get("text").and_then(Value::as_str)?.trim();
        if end <= start || text.is_empty() { continue; }
        index += 1;
        output.push_str(&format!("{index}\n{} --> {}\n{text}\n\n", srt_timestamp(start), srt_timestamp(end)));
    }
    if index == 0 { None } else { Some(output.trim().to_string()) }
}

fn extract_gemini_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    value.get("output")?.as_array()?.iter().find_map(|item| {
        item.get("text").and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| item.get("content").and_then(Value::as_array).and_then(|content| {
                content.iter().find_map(|part| part.get("text").and_then(Value::as_str).map(str::to_string))
            }))
    })
}

fn checked_response(response: reqwest::blocking::Response, provider: &str) -> Result<Value, String> {
    let status = response.status();
    let body = response.text().map_err(|error| format!("Não foi possível ler a resposta de {provider}: {error}"))?;
    if !status.is_success() {
        let details = serde_json::from_str::<Value>(&body).ok()
            .and_then(|value| value.pointer("/error/message").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| body.chars().take(700).collect());
        return Err(format!("{provider} respondeu HTTP {}: {}", status.as_u16(), details));
    }
    serde_json::from_str(&body).map_err(|error| format!("Resposta inválida de {provider}: {error}"))
}

fn prepare_provider_audio(
    media_path: &Path,
    media_type: &str,
    provider: &str,
    ffmpeg_path: Option<&str>,
) -> Result<(PathBuf, bool), String> {
    if !media_path.is_file() {
        return Err("O arquivo de mídia não foi encontrado. Reimporte o vídeo/áudio pelo seletor do Edit Master.".into());
    }
    let ext = media_path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let supported_gpt = matches!(ext.as_str(), "mp3" | "mp4" | "mpeg" | "mpga" | "m4a" | "wav" | "webm" | "ogg" | "flac");
    let supported_audio = matches!(ext.as_str(), "mp3" | "wav" | "ogg" | "flac" | "m4a" | "aac" | "webm");
    let needs_extract = if provider == "local" { media_type == "video" || !is_whisper_native_audio(media_path) }
        else if provider == "gemini" { media_type == "video" || !supported_audio }
        else { media_type == "video" && !supported_gpt || !supported_gpt };
    if needs_extract {
        let wav = ffmpeg_extract_wav(media_path, ffmpeg_path)?;
        Ok((wav, true))
    } else {
        Ok((media_path.to_path_buf(), false))
    }
}

#[tauri::command]
async fn transcribe_media_with_ai(
    provider: String,
    media_path: String,
    media_type: String,
    duration: f64,
    language: String,
    ffmpeg_path: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transcribe_media_with_ai_blocking(provider, media_path, media_type, duration, language, ffmpeg_path)
    })
    .await
    .map_err(|error| format!("A tarefa de transcrição foi interrompida: {error}"))?
}

fn transcribe_media_with_ai_blocking(
    provider: String,
    media_path: String,
    media_type: String,
    duration: f64,
    language: String,
    ffmpeg_path: Option<String>,
) -> Result<String, String> {
    if !matches!(provider.as_str(), "gpt" | "gemini") {
        return Err("Escolha GPT ou Gemini para gerar uma transcrição em nuvem. Claude revisa textos existentes e Whisper funciona localmente.".into());
    }
    #[cfg(target_os = "windows")]
    let api_key = read_ai_provider_key(&provider)?;
    #[cfg(not(target_os = "windows"))]
    return Err("As integrações protegidas do AI Hub estão disponíveis no instalador Windows nesta versão.".into());

    #[cfg(target_os = "windows")]
    {
        let source = PathBuf::from(&media_path);
        let (audio_path, temporary) = prepare_provider_audio(&source, &media_type, &provider, ffmpeg_path.as_deref())?;
        let result = (|| {
            let metadata = fs::metadata(&audio_path).map_err(|error| format!("Não foi possível ler o arquivo de áudio: {error}"))?;
            let limit = if provider == "gpt" { 25 * 1024 * 1024 } else { 100 * 1024 * 1024 };
            if metadata.len() > limit {
                return Err(format!("O arquivo preparado excede o limite desta integração ({} MB). Use um arquivo menor ou reduza o áudio.", limit / 1024 / 1024));
            }
            let bytes = fs::read(&audio_path).map_err(|error| format!("Não foi possível abrir o áudio: {error}"))?;
            let client = Client::builder().timeout(std::time::Duration::from_secs(240)).build()
                .map_err(|error| format!("Não foi possível iniciar o cliente de rede: {error}"))?;
            if provider == "gpt" {
                let file_name = audio_path.file_name().and_then(|value| value.to_str()).unwrap_or("audio.wav").to_string();
                let mime = mime_type_for_audio(&audio_path);
                let part = multipart::Part::bytes(bytes).file_name(file_name).mime_str(mime)
                    .map_err(|error| format!("Tipo de áudio inválido: {error}"))?;
                let mut form = multipart::Form::new().text("model", "gpt-transcribe").text("response_format", "json").part("file", part);
                let language_code = language.split('-').next().unwrap_or("pt").trim();
                if !language_code.is_empty() && !language_code.eq_ignore_ascii_case("auto") {
                    form = form.text("languages[]", language_code.to_string());
                }
                let response = client.post("https://api.openai.com/v1/audio/transcriptions")
                    .bearer_auth(&api_key).multipart(form).send()
                    .map_err(|error| format!("Falha ao conectar à OpenAI: {error}"))?;
                let value = checked_response(response, "OpenAI")?;
                let transcript = value.get("text").and_then(Value::as_str).unwrap_or("");
                if transcript.trim().is_empty() { return Err("A OpenAI não retornou texto de transcrição.".into()); }
                Ok(approximate_srt_from_text(transcript, duration))
            } else {
                // The Gemini Interactions API expects an uploaded File URI for recorded audio.
                // Use the resumable Files API flow rather than embedding base64 in the interaction.
                let file_name = audio_path.file_name().and_then(|value| value.to_str()).unwrap_or("edit-master-audio.wav").to_string();
                let mime = mime_type_for_audio(&audio_path);
                let upload_start = client.post("https://generativelanguage.googleapis.com/upload/v1beta/files")
                    .header("x-goog-api-key", &api_key)
                    .header("X-Goog-Upload-Protocol", "resumable")
                    .header("X-Goog-Upload-Command", "start")
                    .header("X-Goog-Upload-Header-Content-Length", bytes.len().to_string())
                    .header("X-Goog-Upload-Header-Content-Type", mime)
                    .header("Content-Type", "application/json")
                    .body(json!({"file":{"display_name":file_name}}).to_string())
                    .send()
                    .map_err(|error| format!("Falha ao iniciar o envio de áudio ao Gemini: {error}"))?;
                let upload_url = upload_start.headers().get("x-goog-upload-url")
                    .and_then(|header| header.to_str().ok()).map(str::to_string)
                    .ok_or_else(|| "O Gemini não retornou o endereço da sessão de envio de áudio.".to_string())?;
                if !upload_start.status().is_success() {
                    let _ = checked_response(upload_start, "Gemini Files API")?;
                    return Err("O Gemini recusou iniciar o envio do arquivo.".into());
                }
                let upload_response = client.post(upload_url)
                    .header("X-Goog-Upload-Offset", "0")
                    .header("X-Goog-Upload-Command", "upload, finalize")
                    .header("Content-Type", mime)
                    .body(bytes)
                    .send()
                    .map_err(|error| format!("Falha ao enviar o áudio ao Gemini: {error}"))?;
                let uploaded = checked_response(upload_response, "Gemini Files API")?;
                let file_uri = uploaded.pointer("/file/uri").or_else(|| uploaded.get("uri"))
                    .and_then(Value::as_str).ok_or_else(|| "O Gemini não retornou um URI de arquivo válido.".to_string())?.to_string();
                let file_resource = uploaded.pointer("/file/name").or_else(|| uploaded.get("name"))
                    .and_then(Value::as_str).map(str::to_string);
                let prompt = format!("Transcreva o áudio fielmente no idioma {}. Retorne apenas JSON válido no formato {{\"segments\":[{{\"start\":0.0,\"end\":1.2,\"text\":\"fala\"}}]}}. Os tempos devem ser segundos desde o início. Não invente falas nem palavras.", language);
                let payload = json!({
                    "model": "gemini-3.5-transcribe",
                    "input": [
                        { "type": "text", "text": prompt },
                        { "type": "audio", "uri": file_uri, "mime_type": mime }
                    ],
                    "generation_config": {
                        "transcription_config": {
                            "mode": { "type": "verbatim", "timestamp_granularities": ["word"] }
                        }
                    }
                });
                let interaction_response = client.post("https://generativelanguage.googleapis.com/v1beta/interactions")
                    .header("x-goog-api-key", &api_key).json(&payload).send()
                    .map_err(|error| format!("Falha ao conectar ao Gemini: {error}"));
                // Delete the temporary cloud file after the interaction attempt to minimize retention.
                if let Some(resource_name) = file_resource {
                    let delete_url = format!("https://generativelanguage.googleapis.com/v1beta/{resource_name}");
                    let _ = client.delete(delete_url).header("x-goog-api-key", &api_key).send();
                }
                let interaction_response = interaction_response?;
                let value = checked_response(interaction_response, "Gemini")?;
                let text = extract_gemini_text(&value).unwrap_or_default();
                if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                    if let Some(srt) = srt_from_segment_json(&parsed) { return Ok(srt); }
                }
                Ok(approximate_srt_from_text(&text, duration))
            }
        })();
        if temporary { let _ = fs::remove_file(&audio_path); }
        result
    }
}

#[tauri::command]
async fn refine_subtitles_with_claude(srt_text: String, operation: String, target_language: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        refine_subtitles_with_claude_blocking(srt_text, operation, target_language)
    })
    .await
    .map_err(|error| format!("A tarefa de revisão foi interrompida: {error}"))?
}

fn refine_subtitles_with_claude_blocking(srt_text: String, operation: String, target_language: String) -> Result<String, String> {
    if srt_text.trim().is_empty() || srt_text.len() > 120_000 {
        return Err("O arquivo de legendas está vazio ou excede 120 KB de texto.".into());
    }
    if !matches!(operation.as_str(), "correct" | "translate") {
        return Err("Operação de revisão inválida.".into());
    }
    #[cfg(target_os = "windows")]
    let api_key = read_ai_provider_key("claude")?;
    #[cfg(not(target_os = "windows"))]
    return Err("A integração do Claude está disponível no instalador Windows nesta versão.".into());

    #[cfg(target_os = "windows")]
    {
        let instruction = if operation == "translate" {
            format!("Traduza somente o texto das legendas para {}.", target_language)
        } else {
            "Revise ortografia, pontuação e segmentação das falas sem mudar o significado.".to_string()
        };
        let system = format!("Você é um revisor de legendas SRT. {instruction} Preserve exatamente os números, as linhas de timestamp e a ordem dos blocos. Retorne somente o SRT completo, sem Markdown, sem explicações e sem alterar tempos.");
        let body = json!({
            "model": "claude-sonnet-5",
            "max_tokens": 8192,
            "system": system,
            "messages": [{ "role": "user", "content": srt_text }]
        });
        let client = Client::builder().timeout(std::time::Duration::from_secs(180)).build()
            .map_err(|error| format!("Não foi possível iniciar a conexão com Claude: {error}"))?;
        let response = client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body).send()
            .map_err(|error| format!("Falha ao conectar à Anthropic: {error}"))?;
        let value = checked_response(response, "Claude")?;
        let text = value.get("content").and_then(Value::as_array)
            .and_then(|items| items.iter().find_map(|item| item.get("text").and_then(Value::as_str)))
            .unwrap_or("").trim();
        if !text.contains("-->") { return Err("Claude não retornou um SRT válido. As legendas originais foram mantidas.".into()); }
        Ok(text.trim_matches('`').trim().to_string())
    }
}

#[tauri::command]
async fn transcribe_local_whisper(
    media_path: String,
    media_type: String,
    whisper_executable: String,
    model_path: String,
    ffmpeg_path: Option<String>,
    language: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transcribe_local_whisper_blocking(media_path, media_type, whisper_executable, model_path, ffmpeg_path, language)
    })
    .await
    .map_err(|error| format!("A transcrição local foi interrompida: {error}"))?
}

fn transcribe_local_whisper_blocking(
    media_path: String,
    media_type: String,
    whisper_executable: String,
    model_path: String,
    ffmpeg_path: Option<String>,
    language: String,
) -> Result<String, String> {
    let executable = PathBuf::from(whisper_executable);
    let model = PathBuf::from(model_path);
    if !executable.is_file() { return Err("Selecione um whisper-cli.exe válido no AI Hub.".into()); }
    if !model.is_file() { return Err("Selecione um modelo Whisper .bin válido no AI Hub.".into()); }
    let source = PathBuf::from(media_path);
    let (audio_path, temporary) = if media_type == "video" || !is_whisper_native_audio(&source) {
        (ffmpeg_extract_wav(&source, ffmpeg_path.as_deref())?, true)
    } else {
        if !source.is_file() { return Err("O arquivo de áudio não foi encontrado.".into()); }
        (source, false)
    };
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let output_base = std::env::temp_dir().join(format!("edit-master-caption-{}-{stamp}", std::process::id()));
    let language_code = if language.trim().is_empty() { "auto" } else { language.trim() };
    let output = Command::new(&executable)
        .arg("-m").arg(&model)
        .arg("-f").arg(&audio_path)
        .arg("-osrt").arg("-of").arg(&output_base)
        .arg("-l").arg(language_code)
        .arg("-t").arg("4")
        .output()
        .map_err(|error| format!("Não foi possível iniciar whisper-cli.exe: {error}"));
    if temporary { let _ = fs::remove_file(&audio_path); }
    let output = output?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Whisper não conseguiu transcrever o áudio: {}", details.trim()));
    }
    let srt_path = output_base.with_extension("srt");
    let content = fs::read_to_string(&srt_path)
        .map_err(|error| format!("Whisper terminou, mas não foi possível ler o SRT gerado: {error}"));
    let _ = fs::remove_file(&srt_path);
    content
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StockMediaItem {
    id: String,
    provider: String,
    media_type: String,
    name: String,
    author: String,
    page_url: String,
    preview_url: String,
    download_url: String,
    license: String,
    license_url: String,
    width: Option<u64>,
    height: Option<u64>,
    duration: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadedStockMedia {
    path: String,
    name: String,
    media_type: String,
    size_bytes: u64,
    provider: String,
    page_url: String,
    author: String,
    license: String,
    license_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportMediaInput {
    id: String,
    source_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportClipInput {
    media_id: String,
    #[serde(rename = "type")]
    media_type: String,
    duration: f64,
    start: f64,
    end: f64,
    #[serde(default)] audio_gain: Option<f64>,
    #[serde(default)] audio_fade_in: Option<f64>,
    #[serde(default)] audio_fade_out: Option<f64>,
    #[serde(default)] audio_muted: Option<bool>,
    #[serde(default)] playback_speed: Option<f64>,
    #[serde(default)] color_brightness: Option<f64>,
    #[serde(default)] color_contrast: Option<f64>,
    #[serde(default)] color_saturation: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportTimelineRequest {
    ffmpeg_path: String,
    output_path: String,
    media: Vec<ExportMediaInput>,
    clips: Vec<ExportClipInput>,
    #[serde(default = "default_export_width")] width: u32,
    #[serde(default = "default_export_height")] height: u32,
    #[serde(default = "default_export_fps")] fps: u32,
    #[serde(default = "default_export_crf")] crf: u32,
}

fn default_export_width() -> u32 { 1920 }
fn default_export_height() -> u32 { 1080 }
fn default_export_fps() -> u32 { 60 }
fn default_export_crf() -> u32 { 20 }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractAudioRequest {
    ffmpeg_path: String,
    input_path: String,
    output_path: String,
    format: String,
}

fn audio_codec_args(format: &str) -> Result<Vec<&'static str>, String> {
    match format {
        "mp3" => Ok(vec!["-c:a", "libmp3lame", "-b:a", "192k"]),
        "wav" => Ok(vec!["-c:a", "pcm_s16le"]),
        "flac" => Ok(vec!["-c:a", "flac"]),
        "aac" => Ok(vec!["-c:a", "aac", "-b:a", "192k"]),
        "ogg" => Ok(vec!["-c:a", "libvorbis", "-q:a", "5"]),
        _ => Err("Formato não suportado. Escolha MP3, WAV, FLAC, AAC ou OGG.".into()),
    }
}

fn extract_audio_blocking(request: ExtractAudioRequest) -> Result<String, String> {
    let ffmpeg = PathBuf::from(&request.ffmpeg_path);
    if !ffmpeg.is_file() { return Err("Selecione um ffmpeg.exe válido.".into()); }
    let input = PathBuf::from(&request.input_path);
    if !input.is_file() { return Err("O arquivo de origem não foi encontrado.".into()); }
    let format = request.format.trim().to_ascii_lowercase();
    let codec_args = audio_codec_args(&format)?;
    let output = PathBuf::from(&request.output_path);
    let extension = output.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if extension != format { return Err("A extensão do arquivo de destino não corresponde ao formato escolhido.".into()); }
    if let (Ok(source), Ok(destination)) = (input.canonicalize(), output.canonicalize()) {
        if source == destination { return Err("O arquivo de destino não pode substituir o arquivo original.".into()); }
    }
    if output.exists() {
        return Err("O arquivo de destino já existe. Escolha outro nome para evitar sobrescrever um áudio existente.".into());
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Não foi possível criar a pasta de destino: {error}"))?;
    }
    let mut command = Command::new(&ffmpeg);
    command.args(["-hide_banner", "-nostdin", "-n", "-i"])
        .arg(&input)
        .args(["-map", "0:a:0", "-vn"])
        .args(codec_args)
        .arg(&output);
    let result = command.output().map_err(|error| format!("Não foi possível iniciar o FFmpeg: {error}"))?;
    if !result.status.success() {
        let details = String::from_utf8_lossy(&result.stderr);
        return Err(format!("O FFmpeg não conseguiu extrair uma faixa de áudio: {}", details.chars().rev().take(900).collect::<String>().chars().rev().collect::<String>()));
    }
    if !output.is_file() || output.metadata().map(|meta| meta.len() == 0).unwrap_or(true) {
        return Err("O FFmpeg terminou sem produzir um arquivo de áudio válido.".into());
    }
    Ok(output.to_string_lossy().into_owned())
}

#[tauri::command]
async fn extract_audio_file(request: ExtractAudioRequest) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output_path = extract_audio_blocking(request)?;
        Ok(serde_json::json!({ "outputPath": output_path }))
    }).await.map_err(|error| format!("A extração de áudio foi interrompida: {error}"))?
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    output_path: String,
    duration_seconds: f64,
    video_segments: usize,
    audio_segments: usize,
}

fn validate_stock_provider(provider: &str) -> Result<(), String> {
    match provider {
        "pexels" | "pixabay" | "freesound" => Ok(()),
        _ => Err("Provedor de mídia stock desconhecido.".into()),
    }
}

#[cfg(target_os = "windows")]
fn read_stock_provider_key(provider: &str) -> Result<String, String> {
    validate_stock_provider(provider)?;
    let entry = keyring::Entry::new("EditMaster.Stock", provider)
        .map_err(|error| format!("Não foi possível acessar o Cofre de Credenciais: {error}"))?;
    entry.get_password().map_err(|error| match error {
        keyring::Error::NoEntry => format!("Configure a chave de API de {provider} no Media Hub."),
        other => format!("Não foi possível ler a credencial de {provider}: {other}"),
    })
}

#[tauri::command]
fn save_stock_provider_key(provider: String, api_key: String) -> Result<(), String> {
    validate_stock_provider(&provider)?;
    let value = api_key.trim();
    if value.len() < 8 || value.len() > 16_384 {
        return Err("A chave de API está vazia ou tem tamanho inválido.".into());
    }
    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new("EditMaster.Stock", &provider)
            .map_err(|error| format!("Não foi possível acessar o Cofre de Credenciais: {error}"))?;
        entry.set_password(value).map_err(|error| format!("Não foi possível salvar a chave: {error}"))
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = value; Err("O armazenamento seguro das chaves do Media Hub está disponível no Windows.".into()) }
}

#[tauri::command]
fn stock_provider_key_status(provider: String) -> Result<bool, String> {
    validate_stock_provider(&provider)?;
    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new("EditMaster.Stock", &provider)
            .map_err(|error| format!("Não foi possível acessar o Cofre de Credenciais: {error}"))?;
        match entry.get_password() {
            Ok(value) => Ok(!value.is_empty()),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(error) => Err(format!("Não foi possível consultar a credencial: {error}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    { Err("O armazenamento seguro das chaves do Media Hub está disponível no Windows.".into()) }
}

#[tauri::command]
fn remove_stock_provider_key(provider: String) -> Result<(), String> {
    validate_stock_provider(&provider)?;
    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new("EditMaster.Stock", &provider)
            .map_err(|error| format!("Não foi possível acessar o Cofre de Credenciais: {error}"))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("Não foi possível remover a credencial: {error}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    { Err("O armazenamento seguro das chaves do Media Hub está disponível no Windows.".into()) }
}

fn stock_item_string(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(text) = value.pointer(key).and_then(Value::as_str) {
            if !text.trim().is_empty() { return text.to_string(); }
        }
    }
    String::new()
}

fn stock_item_number(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(Value::as_u64)
}

fn search_stock_media_blocking(provider: String, query: String, media_type: String) -> Result<Vec<StockMediaItem>, String> {
    validate_stock_provider(&provider)?;
    let query = query.trim();
    if query.is_empty() || query.len() > 100 { return Err("Digite uma busca entre 1 e 100 caracteres.".into()); }
    match (provider.as_str(), media_type.as_str()) {
        ("pexels", "image" | "video") | ("pixabay", "image" | "video") | ("freesound", "audio") => {},
        ("freesound", _) => return Err("Freesound oferece áudio nesta integração. Escolha Áudio.".into()),
        ("pexels" | "pixabay", "audio") => return Err("Escolha Pexels ou Pixabay para imagens e vídeos; Freesound para áudio.".into()),
        _ => return Err("Tipo de mídia não suportado por este provedor.".into()),
    }
    #[cfg(not(target_os = "windows"))]
    { return Err("O Media Hub com credenciais protegidas está habilitado para Windows nesta versão.".into()); }
    #[cfg(target_os = "windows")]
    {
        let key = read_stock_provider_key(&provider)?;
        let client = Client::builder().timeout(std::time::Duration::from_secs(45)).build()
            .map_err(|error| format!("Não foi possível iniciar a conexão do Media Hub: {error}"))?;
        let value = match (provider.as_str(), media_type.as_str()) {
            ("pexels", "image") => {
                let response = client.get("https://api.pexels.com/v1/search")
                    .header("Authorization", &key).query(&[("query", query), ("per_page", "24")]).send()
                    .map_err(|error| format!("Falha ao buscar imagens no Pexels: {error}"))?;
                checked_response(response, "Pexels")?
            }
            ("pexels", "video") => {
                let response = client.get("https://api.pexels.com/v1/videos/search")
                    .header("Authorization", &key).query(&[("query", query), ("per_page", "18")]).send()
                    .map_err(|error| format!("Falha ao buscar vídeos no Pexels: {error}"))?;
                checked_response(response, "Pexels")?
            }
            ("pixabay", "image") => {
                let response = client.get("https://pixabay.com/api/")
                    .query(&[("key", key.as_str()), ("q", query), ("image_type", "photo"), ("per_page", "24"), ("safesearch", "true")]).send()
                    .map_err(|error| format!("Falha ao buscar imagens no Pixabay: {error}"))?;
                checked_response(response, "Pixabay")?
            }
            ("pixabay", "video") => {
                let response = client.get("https://pixabay.com/api/videos/")
                    .query(&[("key", key.as_str()), ("q", query), ("per_page", "18"), ("safesearch", "true")]).send()
                    .map_err(|error| format!("Falha ao buscar vídeos no Pixabay: {error}"))?;
                checked_response(response, "Pixabay")?
            }
            ("freesound", "audio") => {
                let response = client.get("https://freesound.org/apiv2/search/text/")
                    .query(&[("query", query), ("fields", "id,name,description,previews,username,license,url,duration"), ("page_size", "24"), ("token", key.as_str())]).send()
                    .map_err(|error| format!("Falha ao buscar áudios no Freesound: {error}"))?;
                checked_response(response, "Freesound")?
            }
            _ => return Err("Combinação de provedor e mídia inválida.".into()),
        };
        let mut output = Vec::new();
        match (provider.as_str(), media_type.as_str()) {
            ("pexels", "image") => if let Some(items) = value.get("photos").and_then(Value::as_array) {
                for item in items {
                    let src = item.get("src").cloned().unwrap_or(Value::Null);
                    let page = item.get("url").and_then(Value::as_str).unwrap_or("").to_string();
                    let preview = src.get("medium").and_then(Value::as_str).or_else(|| src.get("large").and_then(Value::as_str)).unwrap_or("").to_string();
                    let download = src.get("large2x").and_then(Value::as_str).or_else(|| src.get("original").and_then(Value::as_str)).or_else(|| src.get("large").and_then(Value::as_str)).unwrap_or("").to_string();
                    if download.is_empty() { continue; }
                    output.push(StockMediaItem { id: item.get("id").map(|v| v.to_string()).unwrap_or_default(), provider: provider.clone(), media_type: media_type.clone(), name: format!("Foto {}", item.get("id").map(|v| v.to_string()).unwrap_or_default()), author: item.get("photographer").and_then(Value::as_str).unwrap_or("Fotógrafo Pexels").to_string(), page_url: page, preview_url: preview, download_url: download, license: "Licença Pexels".into(), license_url: "https://www.pexels.com/license/".into(), width: stock_item_number(item, "width"), height: stock_item_number(item, "height"), duration: None });
                }
            },
            ("pexels", "video") => if let Some(items) = value.get("videos").and_then(Value::as_array) {
                for item in items {
                    let files = item.get("video_files").and_then(Value::as_array);
                    let best = files.and_then(|list| list.iter().filter(|f| f.get("file_type").and_then(Value::as_str).map(|s| s.contains("mp4")).unwrap_or(false)).max_by_key(|f| f.get("width").and_then(Value::as_u64).unwrap_or(0)));
                    let Some(file) = best else { continue; };
                    let download = file.get("link").and_then(Value::as_str).unwrap_or("").to_string();
                    if download.is_empty() { continue; }
                    let user = item.get("user").cloned().unwrap_or(Value::Null);
                    output.push(StockMediaItem { id: item.get("id").map(|v| v.to_string()).unwrap_or_default(), provider: provider.clone(), media_type: media_type.clone(), name: format!("Vídeo {}", item.get("id").map(|v| v.to_string()).unwrap_or_default()), author: user.get("name").and_then(Value::as_str).unwrap_or("Criador Pexels").to_string(), page_url: item.get("url").and_then(Value::as_str).unwrap_or("").to_string(), preview_url: item.get("image").and_then(Value::as_str).unwrap_or("").to_string(), download_url: download, license: "Licença Pexels".into(), license_url: "https://www.pexels.com/license/".into(), width: file.get("width").and_then(Value::as_u64), height: file.get("height").and_then(Value::as_u64), duration: item.get("duration").and_then(Value::as_f64) });
                }
            },
            ("pixabay", "image") => if let Some(items) = value.get("hits").and_then(Value::as_array) {
                for item in items {
                    let download = stock_item_string(item, &["/largeImageURL", "/webformatURL"]);
                    if download.is_empty() { continue; }
                    output.push(StockMediaItem { id: item.get("id").map(|v| v.to_string()).unwrap_or_default(), provider: provider.clone(), media_type: media_type.clone(), name: format!("Imagem Pixabay {}", item.get("id").map(|v| v.to_string()).unwrap_or_default()), author: item.get("user").and_then(Value::as_str).unwrap_or("Criador Pixabay").to_string(), page_url: item.get("pageURL").and_then(Value::as_str).unwrap_or("").to_string(), preview_url: stock_item_string(item, &["/previewURL", "/webformatURL"]), download_url: download, license: "Pixabay Content License".into(), license_url: "https://pixabay.com/service/license-summary/".into(), width: stock_item_number(item, "imageWidth"), height: stock_item_number(item, "imageHeight"), duration: None });
                }
            },
            ("pixabay", "video") => if let Some(items) = value.get("hits").and_then(Value::as_array) {
                for item in items {
                    let videos = item.get("videos").cloned().unwrap_or(Value::Null);
                    let download = stock_item_string(&videos, &["/large/url", "/medium/url", "/small/url"]);
                    if download.is_empty() { continue; }
                    output.push(StockMediaItem { id: item.get("id").map(|v| v.to_string()).unwrap_or_default(), provider: provider.clone(), media_type: media_type.clone(), name: format!("Vídeo Pixabay {}", item.get("id").map(|v| v.to_string()).unwrap_or_default()), author: item.get("user").and_then(Value::as_str).unwrap_or("Criador Pixabay").to_string(), page_url: item.get("pageURL").and_then(Value::as_str).unwrap_or("").to_string(), preview_url: stock_item_string(&videos, &["/tiny/url", "/small/url"]), download_url: download, license: "Pixabay Content License".into(), license_url: "https://pixabay.com/service/license-summary/".into(), width: stock_item_number(item, "imageWidth"), height: stock_item_number(item, "imageHeight"), duration: item.get("duration").and_then(Value::as_f64) });
                }
            },
            ("freesound", "audio") => if let Some(items) = value.get("results").and_then(Value::as_array) {
                for item in items {
                    let previews = item.get("previews").cloned().unwrap_or(Value::Null);
                    let download = stock_item_string(&previews, &["/preview-hq-mp3", "/preview-lq-mp3"]);
                    if download.is_empty() { continue; }
                    let id = item.get("id").map(|v| v.to_string()).unwrap_or_default();
                    output.push(StockMediaItem { id: id.clone(), provider: provider.clone(), media_type: media_type.clone(), name: item.get("name").and_then(Value::as_str).unwrap_or("Áudio Freesound").to_string(), author: item.get("username").and_then(Value::as_str).unwrap_or("Criador Freesound").to_string(), page_url: item.get("url").and_then(Value::as_str).unwrap_or("").to_string(), preview_url: download.clone(), download_url: download, license: item.get("license").and_then(Value::as_str).unwrap_or("Ver licença na página original").to_string(), license_url: item.get("license").and_then(Value::as_str).unwrap_or("").to_string(), width: None, height: None, duration: item.get("duration").and_then(Value::as_f64) });
                }
            },
            _ => {}
        }
        Ok(output)
    }
}

#[tauri::command]
async fn search_stock_media(provider: String, query: String, media_type: String) -> Result<Vec<StockMediaItem>, String> {
    tauri::async_runtime::spawn_blocking(move || search_stock_media_blocking(provider, query, media_type))
        .await.map_err(|error| format!("A busca de mídia foi interrompida: {error}"))?
}

fn stock_download_host_allowed(provider: &str, host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    match provider {
        "pexels" => host == "images.pexels.com" || host == "videos.pexels.com",
        "pixabay" => host == "cdn.pixabay.com" || host.ends_with(".pixabay.com") || host == "pixabay.com",
        "freesound" => host == "cdn.freesound.org" || host.ends_with(".freesound.org") || host == "freesound.org",
        _ => false,
    }
}

fn safe_stock_filename(name: &str, media_type: &str, download_url: &str) -> String {
    let last = Url::parse(download_url).ok().and_then(|url| url.path_segments().and_then(|mut parts| parts.next_back().map(|part| part.to_string())))
        .unwrap_or_default();
    let suggested = if name.trim().is_empty() { last } else { name.to_string() };
    let mut cleaned = suggested.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ' | '(' | ')') { c } else { '_' }).collect::<String>();
    cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() { cleaned = "stock-media".into(); }
    let has_ext = Path::new(&cleaned).extension().and_then(|e| e.to_str()).map(|e| !e.is_empty()).unwrap_or(false);
    if !has_ext {
        let ext = Url::parse(download_url).ok().and_then(|url| Path::new(url.path()).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()))
            .filter(|e| e.len() <= 6 && e.chars().all(|c| c.is_ascii_alphanumeric()))
            .unwrap_or_else(|| match media_type { "image" => "jpg".into(), "video" => "mp4".into(), _ => "mp3".into() });
        cleaned.push('.'); cleaned.push_str(&ext);
    }
    if cleaned.len() > 150 { cleaned.truncate(150); }
    cleaned
}

#[tauri::command]
async fn download_stock_media(
    provider: String, media_type: String, download_url: String, filename: String, target_folder: String,
    source_page_url: String, author: String, license: String, license_url: String,
) -> Result<DownloadedStockMedia, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_stock_provider(&provider)?;
        if !matches!((provider.as_str(), media_type.as_str()),
            ("pexels", "image" | "video") | ("pixabay", "image" | "video") | ("freesound", "audio")) {
            return Err("O tipo de mídia não corresponde ao provedor selecionado.".into());
        }
        let parsed = Url::parse(&download_url).map_err(|error| format!("URL de download inválida: {error}"))?;
        if parsed.scheme() != "https" || !stock_download_host_allowed(&provider, parsed.host_str().unwrap_or("")) {
            return Err("O endereço de download não pertence ao provedor selecionado.".into());
        }
        let folder = PathBuf::from(&target_folder);
        fs::create_dir_all(&folder).map_err(|error| format!("Não foi possível criar a pasta de mídia: {error}"))?;
        let folder = folder.canonicalize().map_err(|error| format!("Não foi possível acessar a pasta de mídia: {error}"))?;
        let redirect_provider = provider.clone();
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .redirect(Policy::custom(move |attempt| {
                if attempt.previous().len() >= 5 { return attempt.stop(); }
                if stock_download_host_allowed(&redirect_provider, attempt.url().host_str().unwrap_or("")) {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build().map_err(|error| error.to_string())?;
        let mut response = client.get(parsed).send().map_err(|error| format!("Falha ao baixar mídia stock: {error}"))?;
        if !response.status().is_success() { return Err(format!("O provedor retornou HTTP {} ao baixar a mídia.", response.status().as_u16())); }
        let final_host = response.url().host_str().unwrap_or("");
        if !stock_download_host_allowed(&provider, final_host) { return Err("O provedor redirecionou para um domínio não autorizado.".into()); }
        const MAX_STOCK_DOWNLOAD: u64 = 1024 * 1024 * 1024;
        if response.content_length().map(|length| length > MAX_STOCK_DOWNLOAD).unwrap_or(false) {
            return Err("O arquivo excede o limite de 1 GB desta versão.".into());
        }
        let safe_name = safe_stock_filename(&filename, &media_type, &download_url);
        let mut destination = folder.join(&safe_name);
        if destination.exists() {
            let stem = Path::new(&safe_name).file_stem().and_then(|v| v.to_str()).unwrap_or("stock-media");
            let ext = Path::new(&safe_name).extension().and_then(|v| v.to_str()).unwrap_or("bin");
            let mut index = 1_u32;
            loop { let candidate = folder.join(format!("{stem} ({index}).{ext}")); if !candidate.exists() { destination = candidate; break; } index += 1; if index > 9999 { return Err("Não foi possível escolher um nome de arquivo livre.".into()); } }
        }
        // Stream the download to disk instead of buffering a potentially large video in RAM.
        let temporary = folder.join(format!(".editmaster-download-{}.part", Uuid::new_v4()));
        let mut output_file = File::create(&temporary).map_err(|error| format!("Não foi possível criar arquivo temporário: {error}"))?;
        let mut buffer = [0_u8; 64 * 1024];
        let mut size = 0_u64;
        loop {
            let count = match response.read(&mut buffer) {
                Ok(count) => count,
                Err(error) => {
                    drop(output_file);
                    let _ = fs::remove_file(&temporary);
                    return Err(format!("Falha ao receber a mídia: {error}"));
                }
            };
            if count == 0 { break; }
            size = size.saturating_add(count as u64);
            if size > MAX_STOCK_DOWNLOAD {
                drop(output_file);
                let _ = fs::remove_file(&temporary);
                return Err("O arquivo excede o limite de 1 GB desta versão.".into());
            }
            if let Err(error) = output_file.write_all(&buffer[..count]) {
                drop(output_file);
                let _ = fs::remove_file(&temporary);
                return Err(format!("Falha ao gravar a mídia: {error}"));
            }
        }
        if size == 0 {
            drop(output_file);
            let _ = fs::remove_file(&temporary);
            return Err("O provedor retornou um arquivo vazio.".into());
        }
        if let Err(error) = output_file.sync_all() {
            drop(output_file);
            let _ = fs::remove_file(&temporary);
            return Err(format!("Não foi possível concluir a gravação: {error}"));
        }
        drop(output_file);
        fs::rename(&temporary, &destination).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("Não foi possível concluir o download: {error}")
        })?;
        let actual_name = destination.file_name().and_then(|v| v.to_str()).unwrap_or(&safe_name).to_string();
        let provenance = json!({"provider":provider,"sourcePageUrl":source_page_url,"author":author,"license":license,"licenseUrl":license_url,"downloadedAt":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()});
        let sidecar = destination.with_file_name(format!("{actual_name}.editmaster-source.json"));
        if let Err(error) = fs::write(&sidecar, serde_json::to_vec_pretty(&provenance).unwrap_or_default()) {
            let _ = fs::remove_file(&destination);
            return Err(format!("A mídia foi baixada, mas não foi possível salvar os dados de origem/licença: {error}"));
        }
        Ok(DownloadedStockMedia { path: destination.to_string_lossy().into_owned(), name: actual_name, media_type, size_bytes: size, provider, page_url: source_page_url, author, license, license_url })
    }).await.map_err(|error| format!("O download de mídia foi interrompido: {error}"))?
}

#[cfg(target_os = "windows")]
fn youtube_secret_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("EditMaster.YouTube", key).map_err(|error| format!("Não foi possível acessar o Cofre de Credenciais do Windows: {error}"))
}

#[cfg(target_os = "windows")]
fn save_youtube_secret(key: &str, value: &str) -> Result<(), String> {
    youtube_secret_entry(key)?.set_password(value).map_err(|error| format!("Não foi possível salvar a credencial do YouTube: {error}"))
}

#[cfg(target_os = "windows")]
fn read_youtube_secret(key: &str) -> Result<String, String> {
    youtube_secret_entry(key)?.get_password().map_err(|error| match error {
        keyring::Error::NoEntry => "Configure as credenciais do Google e conecte uma conta do YouTube.".into(),
        other => format!("Não foi possível ler a credencial do YouTube: {other}"),
    })
}

#[cfg(target_os = "windows")]
fn delete_youtube_secret(key: &str) -> Result<(), String> {
    match youtube_secret_entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Não foi possível remover a credencial: {error}")),
    }
}

#[tauri::command]
fn youtube_connection_status() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    { return Ok(read_youtube_secret("refresh_token").map(|v| !v.is_empty()).unwrap_or(false)); }
    #[cfg(not(target_os = "windows"))]
    { Err("A conexão com o YouTube está habilitada no Windows nesta versão.".into()) }
}

#[tauri::command]
fn youtube_disconnect() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { delete_youtube_secret("refresh_token")?; Ok(()) }
    #[cfg(not(target_os = "windows"))]
    { Err("A conexão com o YouTube está habilitada no Windows nesta versão.".into()) }
}

#[tauri::command]
async fn youtube_connect(client_id: String, client_secret: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || youtube_connect_blocking(client_id, client_secret))
        .await.map_err(|error| format!("A conexão do YouTube foi interrompida: {error}"))?
}

#[cfg(target_os = "windows")]
fn youtube_connect_blocking(client_id: String, client_secret: String) -> Result<String, String> {
    let client_id = client_id.trim().to_string();
    let client_secret = client_secret.trim().to_string();
    if client_id.is_empty() || client_secret.is_empty() { return Err("Informe o Client ID e o Client Secret do aplicativo OAuth do Google.".into()); }
    save_youtube_secret("client_id", &client_id)?;
    save_youtube_secret("client_secret", &client_secret)?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Não foi possível abrir o retorno OAuth local: {error}"))?;
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}/oauth2callback");
    let state = Uuid::new_v4().to_string();
    let verifier = format!("{}{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest);
    let mut auth_url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").map_err(|error| error.to_string())?;
    auth_url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "https://www.googleapis.com/auth/youtube.upload")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    // Avoid passing the OAuth URL through cmd.exe, where ampersands in query parameters
    // could be interpreted as shell operators.
    Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler", auth_url.as_str()]).spawn()
        .map_err(|error| format!("Não foi possível abrir o navegador para autorizar o YouTube: {error}"))?;

    let deadline = Instant::now() + std::time::Duration::from_secs(180);
    let mut authorization_code = None;
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0_u8; 8192];
                let count = stream.read(&mut buffer).map_err(|error| format!("Falha ao ler retorno OAuth: {error}"))?;
                let request = String::from_utf8_lossy(&buffer[..count]);
                let request_path = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("/");
                let callback = Url::parse(&format!("http://127.0.0.1:{port}{request_path}")).map_err(|error| error.to_string())?;
                let received_state = callback.query_pairs().find(|(key, _)| key == "state").map(|(_, value)| value.to_string()).unwrap_or_default();
                let error = callback.query_pairs().find(|(key, _)| key == "error").map(|(_, value)| value.to_string());
                let code = callback.query_pairs().find(|(key, _)| key == "code").map(|(_, value)| value.to_string());
                let (status, body) = if received_state != state { ("400 Bad Request", "Estado OAuth inválido. Você pode fechar esta janela.") }
                    else if let Some(reason) = error.as_deref() { ("400 Bad Request", if reason == "access_denied" { "Autorização cancelada. Você pode fechar esta janela." } else { "O Google não concluiu a autorização. Você pode fechar esta janela." }) }
                    else if code.is_some() { ("200 OK", "Conta conectada ao Edit Master. Você pode fechar esta janela e retornar ao aplicativo.") }
                    else { ("400 Bad Request", "Retorno OAuth inválido. Você pode fechar esta janela.") };
                let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                let _ = stream.write_all(response.as_bytes());
                if received_state != state { return Err("O estado recebido pelo OAuth não corresponde ao pedido iniciado pelo Edit Master.".into()); }
                if let Some(reason) = error.as_deref() { return Err(format!("O Google recusou ou cancelou a autorização: {reason}")); }
                authorization_code = code;
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(std::time::Duration::from_millis(200)),
            Err(error) => return Err(format!("Falha ao aguardar autorização do Google: {error}")),
        }
    }
    let code = authorization_code.ok_or("A autorização não foi concluída em 3 minutos. Tente novamente.")?;
    let client = Client::builder().timeout(std::time::Duration::from_secs(45)).build().map_err(|error| error.to_string())?;
    let response = client.post("https://oauth2.googleapis.com/token").form(&[
        ("code", code.as_str()), ("client_id", client_id.as_str()), ("client_secret", client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()), ("grant_type", "authorization_code"), ("code_verifier", verifier.as_str()),
    ]).send().map_err(|error| format!("Falha ao trocar o código OAuth por token: {error}"))?;
    let token = checked_response(response, "Google OAuth")?;
    let refresh = token.get("refresh_token").and_then(Value::as_str).filter(|v| !v.is_empty()).ok_or("O Google não retornou refresh_token. Revogue a autorização anterior na conta Google e tente novamente com consentimento.")?;
    save_youtube_secret("refresh_token", refresh)?;
    Ok("Conta Google conectada. O Edit Master poderá enviar vídeos após sua confirmação.".into())
}

#[cfg(not(target_os = "windows"))]
fn youtube_connect_blocking(_client_id: String, _client_secret: String) -> Result<String, String> {
    Err("A conexão com o YouTube está habilitada no Windows nesta versão.".into())
}

#[tauri::command]
async fn upload_video_to_youtube(file_path: String, title: String, description: String, tags: Vec<String>, privacy_status: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || upload_video_to_youtube_blocking(file_path, title, description, tags, privacy_status))
        .await.map_err(|error| format!("O envio para o YouTube foi interrompido: {error}"))?
}

#[cfg(target_os = "windows")]
fn upload_video_to_youtube_blocking(file_path: String, title: String, description: String, tags: Vec<String>, privacy_status: String) -> Result<Value, String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 100 { return Err("O título precisa ter entre 1 e 100 caracteres.".into()); }
    if description.chars().count() > 5000 { return Err("A descrição deve ter no máximo 5.000 caracteres.".into()); }
    if !matches!(privacy_status.as_str(), "private" | "unlisted" | "public") { return Err("Escolha uma privacidade válida para o vídeo.".into()); }
    let path = PathBuf::from(file_path).canonicalize().map_err(|error| format!("Vídeo não encontrado: {error}"))?;
    if !path.is_file() || path.extension().and_then(|v| v.to_str()).map(|v| !v.eq_ignore_ascii_case("mp4")).unwrap_or(true) { return Err("Selecione um arquivo MP4 exportado.".into()); }
    let total = fs::metadata(&path).map_err(|error| error.to_string())?.len();
    if total == 0 { return Err("O vídeo está vazio.".into()); }
    let client_id = read_youtube_secret("client_id")?;
    let client_secret = read_youtube_secret("client_secret")?;
    let refresh_token = read_youtube_secret("refresh_token")?;
    let client = Client::builder().timeout(std::time::Duration::from_secs(900)).redirect(Policy::none()).build()
        .map_err(|error| format!("Não foi possível criar o cliente de upload: {error}"))?;
    let token_response = client.post("https://oauth2.googleapis.com/token").form(&[
        ("client_id", client_id.as_str()), ("client_secret", client_secret.as_str()),
        ("refresh_token", refresh_token.as_str()), ("grant_type", "refresh_token"),
    ]).send().map_err(|error| format!("Falha ao renovar a autorização Google: {error}"))?;
    let token = checked_response(token_response, "Google OAuth")?;
    let access_token = token.get("access_token").and_then(Value::as_str).ok_or("O Google não retornou access_token.")?;
    let clean_tags = tags.into_iter().map(|tag| tag.trim().to_string()).filter(|tag| !tag.is_empty()).take(500).collect::<Vec<_>>();
    let metadata = json!({"snippet":{"title":title,"description":description,"tags":clean_tags,"categoryId":"22"},"status":{"privacyStatus":privacy_status,"selfDeclaredMadeForKids":false}});
    let init = client.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status")
        .bearer_auth(access_token)
        .header("X-Upload-Content-Type", "video/mp4")
        .header("X-Upload-Content-Length", total.to_string())
        .json(&metadata).send().map_err(|error| format!("Não foi possível iniciar a sessão de upload: {error}"))?;
    if !init.status().is_success() {
        let status = init.status(); let body = init.text().unwrap_or_default();
        return Err(format!("O YouTube recusou o início do envio (HTTP {}): {}", status.as_u16(), body.chars().take(600).collect::<String>()));
    }
    let upload_url = init.headers().get(reqwest::header::LOCATION).and_then(|value| value.to_str().ok()).ok_or("O YouTube não retornou o endereço da sessão de upload.")?.to_string();
    let mut file = File::open(&path).map_err(|error| format!("Não foi possível abrir o MP4: {error}"))?;
    let chunk_size = 8 * 1024 * 1024;
    let mut buffer = vec![0_u8; chunk_size];
    let mut offset = 0_u64;
    loop {
        let count = file.read(&mut buffer).map_err(|error| format!("Falha ao ler o MP4 durante o upload: {error}"))?;
        if count == 0 { break; }
        let start = offset;
        let end = offset + count as u64 - 1;
        let response = client.put(&upload_url)
            .header("Content-Type", "video/mp4")
            .header("Content-Length", count.to_string())
            .header("Content-Range", format!("bytes {start}-{end}/{total}"))
            .body(buffer[..count].to_vec()).send()
            .map_err(|error| format!("Falha durante o envio do bloco iniciado em {start}. A sessão pode ser reiniciada pelo YouTube: {error}"))?;
        let status = response.status();
        offset += count as u64;
        if status.as_u16() == 308 { continue; }
        if status.is_success() {
            let value: Value = response.json().map_err(|error| format!("O YouTube concluiu o envio, mas a resposta não pôde ser interpretada: {error}"))?;
            let id = value.get("id").and_then(Value::as_str).ok_or("O YouTube não retornou o ID do vídeo enviado.")?;
            return Ok(json!({"videoId":id,"videoUrl":format!("https://www.youtube.com/watch?v={id}"),"privacyStatus":privacy_status,"bytesSent":offset}));
        }
        let body = response.text().unwrap_or_default();
        return Err(format!("O YouTube interrompeu o envio (HTTP {}): {}", status.as_u16(), body.chars().take(700).collect::<String>()));
    }
    Err("O upload terminou sem uma confirmação de vídeo do YouTube.".into())
}

#[cfg(not(target_os = "windows"))]
fn upload_video_to_youtube_blocking(_file_path: String, _title: String, _description: String, _tags: Vec<String>, _privacy_status: String) -> Result<Value, String> {
    Err("O envio para o YouTube está habilitado no Windows nesta versão.".into())
}

fn ffprobe_has_audio(ffmpeg_path: &Path, media_path: &Path) -> bool {
    let probe_name = if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" };
    let probe_candidate = ffmpeg_path.parent().map(|parent| parent.join(probe_name)).filter(|candidate| candidate.is_file());
    let probe = probe_candidate.unwrap_or_else(|| PathBuf::from(if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" }));
    Command::new(probe).args(["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0"]).arg(media_path).output()
        .map(|output| output.status.success() && !String::from_utf8_lossy(&output.stdout).trim().is_empty())
        .unwrap_or(false)
}

fn ffprobe_media_duration(ffmpeg_path: &Path, media_path: &Path) -> Result<f64, String> {
    let probe_name = if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" };
    let probe = ffmpeg_path.parent()
        .map(|parent| parent.join(probe_name))
        .filter(|candidate| candidate.is_file())
        .unwrap_or_else(|| PathBuf::from(probe_name));
    let output = Command::new(&probe)
        .args(["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1"])
        .arg(media_path)
        .output()
        .map_err(|error| format!("Não foi possível verificar o MP4 gerado com FFprobe: {error}"))?;
    if !output.status.success() {
        return Err(format!("FFprobe não conseguiu validar o MP4 gerado: {}", String::from_utf8_lossy(&output.stderr).chars().take(500).collect::<String>()));
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    let duration = raw.trim().parse::<f64>()
        .map_err(|_| "O arquivo exportado não informou uma duração válida.".to_string())?;
    if !duration.is_finite() || duration <= 0.0 {
        return Err("O MP4 gerado está vazio ou possui duração inválida.".into());
    }
    Ok(duration)
}

fn atempo_chain(speed: f64) -> String {
    let mut remaining = speed.clamp(0.25, 2.0);
    let mut filters = Vec::new();
    while remaining < 0.5 - f64::EPSILON {
        filters.push("atempo=0.5".to_string());
        remaining /= 0.5;
    }
    while remaining > 2.0 + f64::EPSILON {
        filters.push("atempo=2.0".to_string());
        remaining /= 2.0;
    }
    filters.push(format!("atempo={remaining:.4}"));
    filters.join(",")
}

fn export_timeline_blocking(request: ExportTimelineRequest) -> Result<ExportResult, String> {
    let ffmpeg = PathBuf::from(&request.ffmpeg_path);
    if !ffmpeg.is_file() { return Err("Selecione um ffmpeg.exe válido nas configurações de exportação.".into()); }
    let width = request.width.clamp(640, 3840) / 2 * 2;
    let height = request.height.clamp(360, 2160) / 2 * 2;
    let fps = request.fps.clamp(24, 60);
    let crf = request.crf.clamp(16, 30);
    let output = PathBuf::from(&request.output_path);
    if output.extension().and_then(|v| v.to_str()).map(|v| !v.eq_ignore_ascii_case("mp4")).unwrap_or(true) { return Err("O arquivo de saída deve terminar em .mp4.".into()); }
    if let Some(parent) = output.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let media_map = request.media.iter().map(|media| (media.id.as_str(), PathBuf::from(&media.source_path))).collect::<HashMap<_, _>>();
    let main_clips = request.clips.iter().filter(|clip| clip.media_type == "video" || clip.media_type == "image").collect::<Vec<_>>();
    let audio_clips = request.clips.iter().filter(|clip| clip.media_type == "audio").collect::<Vec<_>>();
    if main_clips.is_empty() { return Err("Adicione pelo menos um vídeo ou imagem à timeline antes de exportar.".into()); }
    let mut source_durations = Vec::new();
    let mut render_durations = Vec::new();
    let mut main_paths = Vec::new();
    let mut source_audio = Vec::new();
    for clip in &main_clips {
        let path = media_map.get(clip.media_id.as_str()).ok_or_else(|| format!("A mídia '{}' não está no projeto.", clip.media_id))?.canonicalize().map_err(|error| format!("Mídia '{}' indisponível: {error}", clip.media_id))?;
        if !path.is_file() { return Err(format!("Mídia '{}' não é um arquivo válido.", path.display())); }
        let duration = (clip.end - clip.start).max(0.0).min(clip.duration.max(0.0));
        if !duration.is_finite() || duration <= 0.05 { return Err(format!("O segmento '{}' tem duração inválida.", path.display())); }
        let has_audio = clip.media_type == "video" && !clip.audio_muted.unwrap_or(false) && ffprobe_has_audio(&ffmpeg, &path);
        let speed = if clip.media_type == "image" { 1.0 } else { clip.playback_speed.unwrap_or(1.0).clamp(0.25, 2.0) };
        source_durations.push(duration);
        render_durations.push(duration / speed);
        main_paths.push(path);
        source_audio.push(has_audio);
    }
    let mut audio_paths = Vec::new();
    let mut audio_source_durations = Vec::new();
    let mut audio_durations = Vec::new();
    let mut rendered_audio_clips = Vec::new();
    for clip in &audio_clips {
        if clip.audio_muted.unwrap_or(false) { continue; }
        let path = media_map.get(clip.media_id.as_str()).ok_or_else(|| format!("A mídia de áudio '{}' não está no projeto.", clip.media_id))?.canonicalize().map_err(|error| format!("Áudio indisponível: {error}"))?;
        let source_duration = (clip.end - clip.start).max(0.0).min(clip.duration.max(0.0));
        if !path.is_file() || source_duration <= 0.05 { continue; }
        let speed = clip.playback_speed.unwrap_or(1.0).clamp(0.25, 2.0);
        audio_paths.push(path);
        audio_source_durations.push(source_duration);
        audio_durations.push(source_duration / speed);
        rendered_audio_clips.push(*clip);
    }

    let mut command = Command::new(&ffmpeg);
    command.args(["-y", "-hide_banner", "-loglevel", "error"]);
    for (index, clip) in main_clips.iter().enumerate() {
        if clip.media_type == "image" {
            command.args(["-loop", "1", "-framerate", &fps.to_string(), "-t", &format!("{:.4}", render_durations[index]), "-i"]);
            command.arg(&main_paths[index]);
        } else {
            command.args(["-ss", &format!("{:.4}", clip.start.max(0.0)), "-t", &format!("{:.4}", source_durations[index]), "-i"]);
            command.arg(&main_paths[index]);
        }
    }
    let mut audio_input_indices = Vec::new();
    let main_count = main_clips.len();
    let mut next_input = main_count;
    for (index, clip) in main_clips.iter().enumerate() {
        if source_audio[index] { audio_input_indices.push(index); }
        else {
            command.args(["-f", "lavfi", "-t", &format!("{:.4}", render_durations[index]), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]);
            audio_input_indices.push(next_input); next_input += 1;
        }
        let _ = clip;
    }
    let mut audio_track_indices = Vec::new();
    for (audio_index, path) in audio_paths.iter().enumerate() {
        let clip = rendered_audio_clips[audio_index];
        command.args(["-ss", &format!("{:.4}", clip.start.max(0.0)), "-t", &format!("{:.4}", audio_source_durations[audio_index]), "-i"]);
        command.arg(path);
        audio_track_indices.push(next_input);
        next_input += 1;
    }

    let mut filters = Vec::new();
    let mut video_labels = Vec::new();
    let mut base_audio_labels = Vec::new();
    for (index, clip) in main_clips.iter().enumerate() {
        let speed = if clip.media_type == "image" { 1.0 } else { clip.playback_speed.unwrap_or(1.0).clamp(0.25, 2.0) };
        let brightness = ((clip.color_brightness.unwrap_or(100.0).clamp(50.0, 150.0) - 100.0) / 100.0).clamp(-0.5, 0.5);
        let contrast = (clip.color_contrast.unwrap_or(100.0).clamp(50.0, 150.0) / 100.0).clamp(0.5, 1.5);
        let saturation = (clip.color_saturation.unwrap_or(100.0).clamp(0.0, 200.0) / 100.0).clamp(0.0, 2.0);
        filters.push(format!("[{index}:v:0]setpts=PTS/{speed:.4},fps={fps},scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,eq=brightness={brightness:.4}:contrast={contrast:.4}:saturation={saturation:.4},format=yuv420p[v{index}]"));
        video_labels.push(format!("[v{index}]"));
        let audio_index = audio_input_indices[index];
        let gain = if clip.audio_muted.unwrap_or(false) { 0.0 } else { clip.audio_gain.unwrap_or(1.0).clamp(0.0, 2.0) };
        let mut chain = format!("[{audio_index}:a:0]atrim=duration={:.4},asetpts=PTS-STARTPTS,{},aresample=48000,aformat=channel_layouts=stereo,volume={gain:.4}", source_durations[index], atempo_chain(speed));
        let fade_in = clip.audio_fade_in.unwrap_or(0.0).clamp(0.0, render_durations[index]);
        let fade_out = clip.audio_fade_out.unwrap_or(0.0).clamp(0.0, render_durations[index]);
        if fade_in > 0.0 { chain.push_str(&format!(",afade=t=in:st=0:d={fade_in:.4}")); }
        if fade_out > 0.0 { chain.push_str(&format!(",afade=t=out:st={:.4}:d={fade_out:.4}", (render_durations[index] - fade_out).max(0.0))); }
        chain.push_str(&format!("[a{index}]"));
        filters.push(chain);
        base_audio_labels.push(format!("[a{index}]"));
    }
    filters.push(format!("{}concat=n={}:v=1:a=1[vout][abase]", video_labels.iter().zip(base_audio_labels.iter()).map(|(v,a)| format!("{v}{a}")).collect::<String>(), main_clips.len()));
    let total_duration: f64 = render_durations.iter().sum();
    let mut extra_audio_labels = Vec::new();
    // Audio items are placed sequentially from the beginning of the soundtrack. This first
    // renderer intentionally does not claim arbitrary drag positioning or layered transitions.
    let mut audio_cursor: f64 = 0.0;
    for (index, clip) in rendered_audio_clips.iter().enumerate() {
        if index >= audio_track_indices.len() { break; }
        let audio_index = audio_track_indices[index];
        let duration = audio_durations[index];
        let speed = clip.playback_speed.unwrap_or(1.0).clamp(0.25, 2.0);
        let source_duration = (clip.end - clip.start).max(0.0).min(clip.duration.max(0.0));
        let gain = clip.audio_gain.unwrap_or(1.0).clamp(0.0, 2.0);
        let delay_ms = (audio_cursor * 1000.0).round() as u64;
        let mut chain = format!("[{audio_index}:a:0]atrim=duration={source_duration:.4},asetpts=PTS-STARTPTS,{},aresample=48000,aformat=channel_layouts=stereo,volume={gain:.4}", atempo_chain(speed));
        if clip.audio_fade_in.unwrap_or(0.0) > 0.0 { chain.push_str(&format!(",afade=t=in:st=0:d={:.4}", clip.audio_fade_in.unwrap().clamp(0.0, duration))); }
        if clip.audio_fade_out.unwrap_or(0.0) > 0.0 { let fade = clip.audio_fade_out.unwrap().clamp(0.0, duration); chain.push_str(&format!(",afade=t=out:st={:.4}:d={fade:.4}", (duration-fade).max(0.0))); }
        chain.push_str(&format!(",adelay={delay_ms}|{delay_ms}[extra{index}]"));
        filters.push(chain);
        extra_audio_labels.push(format!("[extra{index}]"));
        audio_cursor += duration;
    }
    if extra_audio_labels.is_empty() {
        filters.push("[abase]anull[aout]".into());
    } else {
        let labels = format!("[abase]{}", extra_audio_labels.join(""));
        filters.push(format!("{labels}amix=inputs={}:duration=first:dropout_transition=0[aout]", extra_audio_labels.len()+1));
    }
    let filter_graph = filters.join(";");
    command.args(["-filter_complex", &filter_graph, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "fast", "-crf", &crf.to_string(), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]);
    command.arg(&output);
    let result = command.output().map_err(|error| format!("Não foi possível iniciar FFmpeg: {error}"))?;
    if !result.status.success() {
        let details = String::from_utf8_lossy(&result.stderr);
        return Err(format!("A exportação MP4 falhou: {}", details.chars().take(1200).collect::<String>()));
    }
    let output_metadata = fs::metadata(&output)
        .map_err(|error| format!("O FFmpeg terminou, mas o arquivo MP4 não foi encontrado: {error}"))?;
    if output_metadata.len() < 1024 {
        return Err("O arquivo MP4 gerado está vazio ou incompleto.".into());
    }
    let verified_duration = ffprobe_media_duration(&ffmpeg, &output)?;
    let duration_tolerance = (total_duration * 0.02).max(0.5);
    if (verified_duration - total_duration).abs() > duration_tolerance {
        return Err(format!("O MP4 foi gerado, mas a duração ({verified_duration:.2}s) diverge da timeline ({total_duration:.2}s). Verifique os clipes antes de considerar a exportação concluída."));
    }
    Ok(ExportResult { output_path: output.to_string_lossy().into_owned(), duration_seconds: verified_duration, video_segments: main_clips.len(), audio_segments: audio_paths.len() })
}

#[tauri::command]
async fn export_timeline_mp4(request: ExportTimelineRequest) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || export_timeline_blocking(request))
        .await.map_err(|error| format!("A exportação foi interrompida: {error}"))?
}


#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String { app.package_info().version.to_string() }

#[tauri::command]
fn get_bundled_media_tools(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let resource_dir = app.path().resource_dir()
        .map_err(|error| format!("Não foi possível localizar os recursos instalados: {error}"))?;
    let ffmpeg = resource_dir.join("resources").join("ffmpeg").join("ffmpeg.exe");
    let ffprobe = resource_dir.join("resources").join("ffmpeg").join("ffprobe.exe");
    let whisper = resource_dir.join("resources").join("whisper").join("whisper-cli.exe");
    let whisper_model = resource_dir.join("resources").join("whisper").join("ggml-tiny.bin");
    Ok(json!({
        "ffmpegPath": if ffmpeg.is_file() { Some(ffmpeg.to_string_lossy().to_string()) } else { None },
        "ffprobePath": if ffprobe.is_file() { Some(ffprobe.to_string_lossy().to_string()) } else { None },
        "whisperExecutable": if whisper.is_file() { Some(whisper.to_string_lossy().to_string()) } else { None },
        "whisperModelPath": if whisper_model.is_file() { Some(whisper_model.to_string_lossy().to_string()) } else { None }
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let decoded_icon = image::load_from_memory(include_bytes!("../icons/icon-m-128.png"))
                    .map_err(|error| std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        format!("Falha ao carregar o ícone do Edit Master: {error}"),
                    ))?;
                let rgba = decoded_icon.to_rgba8();
                let (width, height) = rgba.dimensions();
                let icon = tauri::image::Image::new_owned(rgba.into_raw(), width, height);
                window.set_icon(icon)?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            launch_uninstaller,
            launch_local_update,
            check_local_update,
            scan_duplicate_videos,
            move_duplicate_to_recycle_bin,
            register_media_paths,
            copy_media_to_folder,
            move_media_to_recycle_bin,
            save_project_bundle,
            load_project_bundle,
            read_srt_file,
            save_ai_provider_key,
            ai_provider_key_status,
            remove_ai_provider_key,
            transcribe_media_with_ai,
            refine_subtitles_with_claude,
            transcribe_local_whisper,
            save_stock_provider_key,
            stock_provider_key_status,
            remove_stock_provider_key,
            search_stock_media,
            download_stock_media,
            youtube_connection_status,
            youtube_disconnect,
            youtube_connect,
            upload_video_to_youtube,
            extract_audio_file,
            export_timeline_mp4,
            get_app_version,
            get_bundled_media_tools
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Edit Master");
}


#[cfg(test)]
mod export_timing_tests {
    use super::atempo_chain;

    #[test]
    fn builds_supported_atempo_chains_for_slow_motion() {
        assert_eq!(atempo_chain(0.25), "atempo=0.5,atempo=0.5000");
        assert_eq!(atempo_chain(0.5), "atempo=0.5000");
        assert_eq!(atempo_chain(1.0), "atempo=1.0000");
        assert_eq!(atempo_chain(2.0), "atempo=2.0000");
    }

    #[test]
    fn clamps_speed_to_the_supported_editor_range() {
        assert_eq!(atempo_chain(0.1), atempo_chain(0.25));
        assert_eq!(atempo_chain(3.0), atempo_chain(2.0));
    }
}

#[cfg(test)]
mod audio_extraction_tests {
    use super::audio_codec_args;

    #[test]
    fn supports_all_advertised_audio_formats() {
        for format in ["mp3", "wav", "flac", "aac", "ogg"] {
            assert!(audio_codec_args(format).is_ok(), "format should be supported: {format}");
        }
    }

    #[test]
    fn rejects_unknown_audio_formats() {
        for format in ["", "mp4", "exe", "../mp3"] {
            assert!(audio_codec_args(format).is_err(), "format should be rejected: {format}");
        }
    }
}

#[cfg(test)]
mod media_storage_tests {
    use super::unique_media_destination;
    use std::fs;

    #[test]
    fn duplicate_names_get_a_suffix_instead_of_overwriting() {
        let folder = std::env::temp_dir().join(format!("edit-master-media-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&folder).expect("test folder should be created");
        fs::write(folder.join("clip.mp4"), b"original").expect("original file should be created");

        let destination = unique_media_destination(&folder, "clip.mp4");
        assert_eq!(
            destination.file_name().and_then(|name| name.to_str()),
            Some("clip (2).mp4")
        );

        fs::remove_dir_all(folder).expect("test folder should be removed");
    }

    #[test]
    fn unique_names_keep_the_original_extension() {
        let folder = std::env::temp_dir().join(format!("edit-master-media-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&folder).expect("test folder should be created");

        let destination = unique_media_destination(&folder, "footage.final.mov");
        assert_eq!(
            destination.file_name().and_then(|name| name.to_str()),
            Some("footage.final.mov")
        );

        fs::remove_dir_all(folder).expect("test folder should be removed");
    }
}
