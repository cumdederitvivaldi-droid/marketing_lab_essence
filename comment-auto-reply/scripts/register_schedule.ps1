# 무인 초안 준비 스케줄 등록/해제 (Windows 작업 스케줄러)
# 매일 09:00 / 19:00 에 auto_draft.bat 실행 (수집+초안+검토엑셀, 게시는 안 함)
param([string]$Action = "register")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)  # comment-reply 루트
$bat  = Join-Path $root "assets\auto_draft.bat"
$name = "CoveringCommentDrafts"

if ($Action -eq "unregister") {
    try { Unregister-ScheduledTask -TaskName $name -Confirm:$false; "해제 완료: $name" }
    catch { "등록된 작업이 없습니다($name)." }
    return
}

if (-not (Test-Path $bat)) { throw "auto_draft.bat 을 찾을 수 없습니다: $bat" }

$act  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$bat`"" -WorkingDirectory $root
$t1   = New-ScheduledTaskTrigger -Daily -At 9:00am
$t2   = New-ScheduledTaskTrigger -Daily -At 7:00pm
# 절전 상태면 깨워서 실행 / 시간 놓치면 가능할 때 실행 / 배터리에서도 실행
$set  = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $name -Action $act -Trigger $t1, $t2 -Settings $set -Force | Out-Null
"등록 완료: 매일 09:00 / 19:00 → $bat"
"  (절전이면 깨워서 실행 / 완전히 꺼져 있으면 실행 안 됨 → 그때는 클라우드 필요)"
"  해제: assets\스케줄_해제.bat"
