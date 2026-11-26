; Edit Master branded component-selection page for the NSIS setup.
; Payloads are bundled in the setup, but are only retained when selected.
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Var EM_WhisperCheck
Var EM_FfmpegCheck
Var EM_WhisperSelected
Var EM_FfmpegSelected
Var EM_ComponentsDialog

Page custom EM_ComponentsPage EM_ComponentsLeave

Function EM_ComponentsPage
  !insertmacro MUI_HEADER_TEXT "Componentes opcionais" "Escolha quais ferramentas deseja instalar junto com o Edit Master."
  nsDialogs::Create 1018
  Pop $EM_ComponentsDialog
  ${If} $EM_ComponentsDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 30u "O editor funciona sem estes componentes. Você poderá selecionar suas próprias instalações depois."
  Pop $0

  ${NSD_CreateCheckBox} 0 42u 100% 14u "Instalar FFmpeg + FFprobe"
  Pop $EM_FfmpegCheck
  ; Both optional tools are selected by default on a first installation.
  ; A saved "0" is respected when the user returns to this page.
  ${If} $EM_FfmpegSelected == "0"
    ${NSD_Uncheck} $EM_FfmpegCheck
  ${Else}
    ${NSD_Check} $EM_FfmpegCheck
  ${EndIf}
  ${NSD_CreateLabel} 18u 59u 92% 30u "Recomendado para exportar MP4, extrair áudio e processar vídeos no AI Hub."
  Pop $0

  ${NSD_CreateCheckBox} 0 105u 100% 14u "Instalar Whisper local (whisper.cpp + modelo Tiny)"
  Pop $EM_WhisperCheck
  ${If} $EM_WhisperSelected == "0"
    ${NSD_Uncheck} $EM_WhisperCheck
  ${Else}
    ${NSD_Check} $EM_WhisperCheck
  ${EndIf}
  ${NSD_CreateLabel} 18u 122u 92% 34u "Permite transcrever áudio offline. Requer FFmpeg para extrair áudio de vídeos."
  Pop $0

  ${NSD_CreateLabel} 0 175u 100% 30u "Os componentes desmarcados não serão mantidos na pasta de instalação."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function EM_ComponentsLeave
  ${NSD_GetState} $EM_FfmpegCheck $EM_FfmpegSelected
  ${If} $EM_FfmpegSelected == ${BST_CHECKED}
    StrCpy $EM_FfmpegSelected "1"
  ${Else}
    StrCpy $EM_FfmpegSelected "0"
  ${EndIf}
  ${NSD_GetState} $EM_WhisperCheck $EM_WhisperSelected
  ${If} $EM_WhisperSelected == ${BST_CHECKED}
    StrCpy $EM_WhisperSelected "1"
  ${Else}
    StrCpy $EM_WhisperSelected "0"
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent/passive installations default to including both tools.
  ${If} $EM_FfmpegSelected == ""
    StrCpy $EM_FfmpegSelected "1"
  ${EndIf}
  ${If} $EM_WhisperSelected == ""
    StrCpy $EM_WhisperSelected "1"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; With bundle.resources = ["resources/**/*"], Tauri preserves the
  ; relative "resources/" prefix exactly once in the NSIS target paths.
  ${If} $EM_FfmpegSelected != "1"
    RMDir /r "$INSTDIR\resources\ffmpeg"
  ${EndIf}
  ${If} $EM_WhisperSelected != "1"
    RMDir /r "$INSTDIR\resources\whisper"
  ${EndIf}
!macroend
