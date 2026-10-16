; Tauri already removes the Run value on uninstall. Remove Explorer's paired state too.
; Updates must retain the user's enabled/disabled choice.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Ember Peek"
  ${EndIf}
!macroend
