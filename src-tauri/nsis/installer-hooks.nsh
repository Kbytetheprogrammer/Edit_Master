; Edit Master optional component selection for the NSIS setup.
; Tauri includes installerHooks before the built-in page declarations.
; Use PREINSTALL prompts instead of declaring a custom page here:
; a top-level Page declaration would appear before Tauri's welcome page.

!include "LogicLib.nsh"

Var EM_WhisperSelected
Var EM_FfmpegSelected

!macro NSIS_HOOK_PREINSTALL
  ; Ask separately so users can install either component independently.
  ; The first button (Yes) is the default.
  StrCpy $EM_FfmpegSelected "1"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "Install FFmpeg + FFprobe?\nRecommended for MP4 export, audio extraction, and video processing." IDYES em_ffmpeg_done
  StrCpy $EM_FfmpegSelected "0"
  em_ffmpeg_done:

  StrCpy $EM_WhisperSelected "1"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "Install local Whisper (whisper.cpp + Tiny model)?\nEnables offline audio transcription. FFmpeg is required to extract audio from videos." IDYES em_whisper_done
  StrCpy $EM_WhisperSelected "0"
  em_whisper_done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Remove payload folders when the user declined an optional component.
  ${If} $EM_FfmpegSelected != "1"
    RMDir /r "$INSTDIR\resources\ffmpeg"
  ${EndIf}
  ${If} $EM_WhisperSelected != "1"
    RMDir /r "$INSTDIR\resources\whisper"
  ${EndIf}
!macroend
