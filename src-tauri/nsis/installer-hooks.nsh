; Edit Master custom installer component handling.
!include "LogicLib.nsh"
Var EM_WhisperSelected
Var EM_FfmpegSelected

!macro NSIS_HOOK_PREINSTALL
  ; Selection is made in the branded custom components page.
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $EM_FfmpegSelected != "1"
    RMDir /r "$INSTDIR\resources\ffmpeg"
  ${EndIf}
  ${If} $EM_WhisperSelected != "1"
    RMDir /r "$INSTDIR\resources\whisper"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Keep the separately stored media tools during an in-place app update.
  ${If} $UpdateMode != 1
    ReadINIStr $R9 "$COMMONAPPDATA\Edit Master\MediaTools.ini" "MediaTools" "Path"
    ${If} $R9 != ""
      RMDir /r "$R9"
    ${EndIf}
    Delete "$COMMONAPPDATA\Edit Master\MediaTools.ini"
    RMDir "$COMMONAPPDATA\Edit Master"
  ${EndIf}
!macroend
