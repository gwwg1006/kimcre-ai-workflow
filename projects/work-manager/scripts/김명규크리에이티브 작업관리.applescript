on run
	try
		do shell script quoted form of ((POSIX path of (path to home folder)) & "사업/작업관리웹/scripts/launch_macos_app.sh")
	on error errorMessage number errorNumber
		display dialog "작업관리 웹앱을 시작하지 못했습니다." & return & return & errorMessage & return & return & "서버 로그: ~/Library/Logs/김명규크리에이티브 작업관리/server.log" buttons {"확인"} default button "확인" with icon stop
	end try
end run
