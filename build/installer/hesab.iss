; Hesab Desktop Installer
; فایل نصب برنامه حساب — تشخیص خودکار معماری سیستم
; حالت نصب مجدد: پس از انتخاب زبان، صفحه انتخاب بروزرسانی / حذف / انصراف نمایش داده می‌شود

#define MyAppName "حساب"
#define MyAppNameEn "Hesab"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Hesab"
#define MyAppExeName "hesab.exe"
#define MyAppId "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={commonpf}\{#MyAppNameEn}
DefaultGroupName={#MyAppName}
OutputDir=..\..\dist
OutputBaseFilename=HesabSetup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=classic
DisableProgramGroupPage=yes
DisableDirPage=no
UninstallDisplayName={#MyAppName} - {#MyAppVersion}
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=..\icon.ico
VersionInfoVersion=1.0.0.0
VersionInfoProductName={#MyAppName}
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "farsi"; MessagesFile: "E:\Temp\FactorDb\build\installer\Farsi.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\dist\hesab-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion createallsubdirs recursesubdirs
Source: "..\..\dist\hesab-win32-ia32\*"; DestDir: "{app}_ia32"; Flags: ignoreversion createallsubdirs recursesubdirs

[CustomMessages]
farsi.NameAndVersion=%1 نسخه %2
farsi.AdditionalIcons=میانبرهای اضافی:
farsi.CreateDesktopIcon=ایجاد میانبر روی &دسکتاپ
farsi.CreateQuickLaunchIcon=ایجاد میانبر &سریع
farsi.ProgramOnTheWeb=%1 در وب
farsi.UninstallProgram=حذف %1
farsi.LaunchProgram=اجرای %1
farsi.AssocFileExtension=&پیوند فایل های %1 با پسوند %2
farsi.AssocingFileExtension=در حال پیوند فایل های %1 با پسوند %2...
farsi.AutoStartProgramGroupDescription=خودکار:
farsi.AutoStartProgram=شروع خودکار %1 با ویندوز
farsi.AddonHostProgramNotFound=%1 یافت نشد.
farsi.LaunchProgram2=اجرای %1 پس از نصب

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "ایجاد میانبر روی دسکتاپ"; GroupDescription: "گزینه های اضافی:"; Flags: checkedonce

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "اجرای {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
var
  UpdateMode: Boolean;
  UninstallChosen: Boolean;
  ChoicePage: TWizardPage;
  rbUpdate: TNewRadioButton;
  rbUninstall: TNewRadioButton;
  rbCancel: TNewRadioButton;

// تشخیص نصب قبلی از رجیستری (Inno پسوند _is1 می‌سازد)
function GetOldInstallDir(): String;
var
  oldDir: String;
  base: String;
begin
  Result := '';
  base := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppId}';
  if RegQueryStringValue(HKLM, base + '_is1', 'InstallLocation', oldDir) then
  begin
    if oldDir <> '' then Result := oldDir;
  end;
  if (Result = '') and RegQueryStringValue(HKCU, base + '_is1', 'InstallLocation', oldDir) then
  begin
    if oldDir <> '' then Result := oldDir;
  end;
  // پشتیبانی از پسوندهای قدیمی‌تر (_is2 و ...)
  if (Result = '') and RegQueryStringValue(HKLM, base + '_is2', 'InstallLocation', oldDir) then
  begin
    if oldDir <> '' then Result := oldDir;
  end;
  if (Result = '') and RegQueryStringValue(HKCU, base + '_is2', 'InstallLocation', oldDir) then
  begin
    if oldDir <> '' then Result := oldDir;
  end;
end;

// اجرای حذف‌کننده موجود (بعد از بسته شدن نصاب)
procedure RunExistingUninstaller();
var
  oldDir: String;
  unCmd: String;
  ResultCode: Integer;
begin
  oldDir := GetOldInstallDir();
  if oldDir = '' then Exit;
  unCmd := oldDir + '\unins000.exe';
  if not FileExists(unCmd) then unCmd := oldDir + '\unins001.exe';
  if FileExists(unCmd) then
    Exec(unCmd, '', oldDir, SW_SHOW, ewNoWait, ResultCode);
end;

procedure InitializeWizard();
var
  oldDir: String;
  lblInfo: TNewStaticText;
begin
  UninstallChosen := False;
  oldDir := GetOldInstallDir();
  UpdateMode := (oldDir <> '') and DirExists(oldDir);

  // صفحه انتخاب عملیات (فقط در حالت نصب قبلی استفاده می‌شود)
  ChoicePage := CreateCustomPage(wpWelcome,
    'برنامه از قبل نصب شده است',
    'برنامه «حساب» روی سیستم شما نصب است. چه کاری می‌خواهید انجام دهید؟');

  lblInfo := TNewStaticText.Create(WizardForm);
  lblInfo.Parent := ChoicePage.Surface;
  lblInfo.Top := ScaleY(8);
  lblInfo.Caption := 'محل نصب فعلی:' #13#10 + oldDir;

  rbUpdate := TNewRadioButton.Create(WizardForm);
  rbUpdate.Parent := ChoicePage.Surface;
  rbUpdate.Top := ScaleY(72);
  rbUpdate.Width := ScaleX(400);
  rbUpdate.Caption := 'بروزرسانی — نصب نسخه جدید در همان محل قبلی';
  rbUpdate.Checked := True;

  rbUninstall := TNewRadioButton.Create(WizardForm);
  rbUninstall.Parent := ChoicePage.Surface;
  rbUninstall.Top := ScaleY(104);
  rbUninstall.Width := ScaleX(400);
  rbUninstall.Caption := 'حذف برنامه از سیستم';

  rbCancel := TNewRadioButton.Create(WizardForm);
  rbCancel.Parent := ChoicePage.Surface;
  rbCancel.Top := ScaleY(136);
  rbCancel.Width := ScaleX(400);
  rbCancel.Caption := 'انصراف — خروج از برنامه نصب';

  if UpdateMode then
    WizardForm.DirEdit.Text := oldDir;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  // صفحه انتخاب عملیات فقط در حالت نصب قبلی نمایش داده شود
  if (ChoicePage <> nil) and (PageID = ChoicePage.ID) then
  begin
    Result := not UpdateMode;
    Exit;
  end;
  if UpdateMode then
  begin
    // در حالت بروزرسانی سایر صفحات رد شود — فقط صفحه انتخاب عملیات + پیشرفت
    if (PageID = wpWelcome) or (PageID = wpLicense) or (PageID = wpPassword) or
       (PageID = wpInfoBefore) or (PageID = wpUserInfo) or (PageID = wpSelectDir) or
       (PageID = wpSelectComponents) or (PageID = wpSelectProgramGroup) or
       (PageID = wpSelectTasks) or (PageID = wpReady) or (PageID = wpInfoAfter) then
      Result := True;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if UpdateMode and (ChoicePage <> nil) and (CurPageID = ChoicePage.ID) then
  begin
    if rbUninstall.Checked then
    begin
      UninstallChosen := True;
      WizardForm.Close;
      Result := False;
    end
    else if rbCancel.Checked then
    begin
      WizardForm.Close;
      Result := False;
    end;
    // بروزرسانی: ادامه مراحل — صفحات باقی رد شده و نصب شروع می‌شود
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if IsWin64 and not UpdateMode then
    begin
      DelTree(ExpandConstant('{app}_ia32'), True, True, True);
    end
    else if (not IsWin64) and (not UpdateMode) then
    begin
      DelTree(ExpandConstant('{app}'), True, True, True);
      RenameFile(ExpandConstant('{app}_ia32'), ExpandConstant('{app}'));
    end;
    // در حالت بروزرسانی هیچ درختی حذف نمی‌شود تا دیتا و مسیر فعلی حفظ شود
  end;
end;

procedure DeinitializeSetup();
begin
  if UninstallChosen then
    RunExistingUninstaller();
end;
