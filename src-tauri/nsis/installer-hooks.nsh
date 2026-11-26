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
