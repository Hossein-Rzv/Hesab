; Inno Setup 6 Persian (Farsi) Language File
; UTF-8 with BOM — placeholders match Inno Setup 6 Default.isl:
;   [name], [name/ver], [mb] = bracket constants
;   %1, %2, %n = format parameters

[LangOptions]
LanguageName=Farsi
LanguageID=$0429
LanguageCodePage=0
DialogFontName=Tahoma
DialogFontSize=9

[Messages]

; *** Application titles
SetupAppTitle=برنامه نصب
SetupWindowTitle=برنامه نصب — %1
UninstallAppTitle=حذف برنامه
UninstallAppFullTitle=حذف %1

; *** Misc. common
InformationTitle=اطلاعات
ConfirmTitle=تأیید
ErrorTitle=خطا

; *** SetupLdr messages
SetupLdrStartupMessage=برنامه %1 نصب خواهد شد. آیا ادامه می دهید؟

; *** Startup error messages
SetupFileCorrupt=فایل نصب خراب است.
SetupAlreadyRunning=برنامه نصب در حال اجراست.
WindowsVersionNotSupported=این برنامه از نسخه ویندوز شما پشتیبانی نمی کند.
SetupAppRunningError=برنامه نصب متوجه شد %1 در حال اجراست. لطفاً ان را ببندید.
UninstallAppRunningError=برنامه حذف متوجه شد %1 در حال اجراست. لطفاً ان را ببندید.

; *** Misc. errors
ErrorCreatingDir=برنامه نصب نتوانست پوشه "%1" را ایجاد کند.
ErrorTooManyFilesInDir=ایجاد فایل در پوشه "%1" ممکن نیست.

; *** Setup common messages
ExitSetupTitle=خروج از نصب
ExitSetupMessage=نصب کامل نشده است. اگر خارج شوید، برنامه نصب نخواهد شد.%n%nمی توانید بعداً برنامه نصب را دوباره اجرا کنید تا نصب را کامل کنید.%n%nخروج از نصب؟

; *** Buttons
ButtonBack=< &قبلی
ButtonNext=&بعدی >
ButtonInstall=&نصب
ButtonOK=تأیید
ButtonCancel=لغو
ButtonYes=&بله
ButtonNo=&خیر
ButtonFinish=&پایان
ButtonBrowse=&مرور...
ButtonWizardBrowse=مرور...
ButtonNewFolder=ساخت پوشه &جدید

; *** Select Language
SelectLanguageTitle=انتخاب زبان نصب
SelectLanguageLabel=زبان مورد نظر برای نصب را انتخاب کنید:

; *** Common wizard text
ClickNext=برای ادامه روی بعدی کلیک کنید، یا برای خروج لغو را بزنید.
BrowseDialogTitle=مرور برای پوشه
BrowseDialogLabel=یک پوشه از لیست زیر انتخاب کنید، سپس روی تأیید کلیک کنید.
NewFolderName=پوشه جدید

; *** Welcome
WelcomeLabel1=به برنامه نصب [name] خوش آمدید
WelcomeLabel2=این برنامه [name/ver] را روی رایانه شما نصب خواهد کرد.%n%nتوصیه می شود قبل از ادامه همه برنامه های دیگر را ببندید.

; *** Password
WizardPassword=محافظت با رمز عبور
PasswordLabel1=این نصب با رمز عبور محافظت می شود.
PasswordLabel3=لطفاً رمز عبور را وارد کنید و روی بعدی کلیک کنید. رمز عبور به بزرگی و کوچکی حروف حساس است.
PasswordEditLabel=&رمز عبور:
IncorrectPassword=رمز عبور صحیح نیست. لطفاً دوباره تلاش کنید.

; *** License
WizardLicense=پیمانه پذیرش
LicenseLabel=لطفاً قبل از ادامه اطلاعات مهم زیر را بخوانید.
LicenseLabel3=لطفاً متن پیمانه پذیرش زیر را بخوانید. برای ادامه باید شرایط را بپذیرید.
LicenseAccepted=شرایط را &می پذیرم
LicenseNotAccepted=شرایط را &نمی پذیرم

; *** Info
WizardInfoBefore=اطلاعات
InfoBeforeLabel=لطفاً قبل از ادامه اطلاعات مهم زیر را بخوانید.
InfoBeforeClickLabel=وقتی آماده ادامه نصب شدید، روی بعدی کلیک کنید.
WizardInfoAfter=اطلاعات
InfoAfterLabel=لطفاً اطلاعات مهم زیر را بخوانید.
InfoAfterClickLabel=وقتی آماده ادامه نصب شدید، روی بعدی کلیک کنید.

; *** User Info
WizardUserInfo=اطلاعات کاربر
UserInfoDesc=لطفاً اطلاعات خود را وارد کنید.
UserInfoName=&نام کاربر:
UserInfoOrg=&سازمان:
UserInfoSerial=&شماره سریال:

; *** Select Dir
WizardSelectDir=انتخاب محل نصب
SelectDirDesc=[name] کجا نصب شود؟
SelectDirLabel3=برنامه [name] در پوشه زیر نصب خواهد شد.
SelectDirBrowseLabel=برای ادامه روی بعدی کلیک کنید. اگر می خواهید پوشه دیگری انتخاب کنید، روی مرور کلیک کنید.
DiskSpaceMBLabel=حداقل [mb] مگابایت فضای دیسک آزاد لازم است.
CannotInstallToNetworkDrive=نصب روی درایو شبکه ممکن نیست.
CannotInstallToUNCPath=نصب روی مسیر UNC ممکن نیست.
InvalidPath=باید مسیر کامل با حرف درایو وارد کنید؛ برای مثال:%n%nC:\APP%n%nیا مسیر UNC به شکل:%n%n\\server\share
InvalidDirName=نام پوشه نامعتبر است.
DirExistsTitle=پوشه وجود دارد
DirExists=برنامه نصب متوجه شد پوشه:%n%n%1%n%nاز قبل وجود دارد. آیا در این پوشه نصب شود؟
DirDoesntExistTitle=پوشه وجود ندارد
DirDoesntExist=پوشه:%n%n%1%n%nوجود ندارد. آیا می خواهید برنامه نصب آن را ایجاد کند؟

; *** Select Components
WizardSelectComponents=انتخاب مولفه ها
SelectComponentsDesc=کدام مولفه ها نصب شوند؟
SelectComponentsLabel2=مولفه هایی را که می خواهید نصب شوند انتخاب کنید؛ مولفه هایی که نمی خواهید را پاک کنید. وقتی آماده شدید روی بعدی کلیک کنید.
FullInstallation=نصب کامل
CompactInstallation=نصب فشرده
CustomInstallation=نصب سفارشی

; *** Select Tasks
WizardSelectTasks=انتخاب وظایف اضافی
SelectTasksDesc=چه کارهای اضافی انجام شود؟
SelectTasksLabel2=وظایف اضافی را که می خواهید برنامه نصب هنگام نصب [name] انجام دهد انتخاب کنید، سپس روی بعدی کلیک کنید.

; *** Select Program Group
WizardSelectProgramGroup=انتخاب پوشه منوی استارت
SelectStartMenuFolderDesc=برنامه نصب میانبرهای برنامه را کجا قرار دهد؟
SelectStartMenuFolderLabel3=برنامه نصب میانبرهای برنامه را در پوشه منوی استارت زیر ایجاد خواهد کرد.
SelectStartMenuFolderBrowseLabel=برای ادامه روی بعدی کلیک کنید. اگر می خواهید پوشه دیگری انتخاب کنید، روی مرور کلیک کنید.
MustEnterGroupName=باید نام پوشه را وارد کنید.
GroupNameTooLong=نام یا مسیر پوشه بیش از حد طولانی است.
InvalidGroupName=نام پوشه نامعتبر است.
BadGroupName=نام پوشه نمی تواند کاراکترهای زیر را داشته باشد:%n%n%1
NoProgramGroupCheck2=پوشه منوی استارت &ایجاد نکن

; *** Preparing
WizardPreparing=آماده سازی برای نصب
PreparingDesc=برنامه نصب در حال آماده سازی برای نصب [name] روی رایانه شما است.
CannotContinue=برنامه نصب نمی تواند ادامه دهد. لطفاً لغو را بزنید.

; *** Ready
WizardReady=آماده نصب
ReadyLabel1=برنامه نصب آماده است [name] را روی رایانه شما نصب کند.
ReadyLabel2a=برای ادامه نصب روی نصب کلیک کنید، یا اگر می خواهید تنظیمات را تغییر دهید روی قبلی کلیک کنید.
ReadyLabel2b=برای ادامه نصب روی نصب کلیک کنید، یا اگر می خواهید تنظیمات را تغییر دهید روی قبلی کلیک کنید.
ReadyMemoDir=محل نصب:
ReadyMemoType=نوع نصب:
ReadyMemoComponents=مولفه های انتخاب شده:
ReadyMemoGroup=پوشه منوی استارت:
ReadyMemoTasks=وظایف اضافی:

; *** Installing
WizardInstalling=در حال نصب
InstallingLabel=لطفاً صبر کنید در حال نصب [name] روی رایانه شما...
StatusCreateDirs=ایجاد پوشه ها...
StatusExtractFiles=استخراج فایل ها...
StatusCreateIcons=ایجاد میانبرها...
StatusSavingUninstall=ذخیره اطلاعات حذف...
StatusRunProgram=اجرای مراحل پایانی...
StatusClosingApplications=بستن برنامه ها...

; *** Finished
FinishedHeadingLabel=پایان برنامه نصب [name]
FinishedLabelNoIcons=برنامه نصب نصب [name] را روی رایانه شما تمام کرد.
FinishedLabel=برنامه نصب نصب [name] را روی رایانه شما تمام کرد. برنامه را می توان با انتخاب میانبرهای نصب شده اجرا کرد.
ClickFinish=برای خروج از برنامه نصب روی پایان کلیک کنید.

; *** Uninstall
WizardUninstalling=در حال حذف
UninstallStatusLabel=لطفاً صبر کنید در حال حذف %1 از رایانه شما...
ConfirmUninstall=آیا مطمئن هستید که می خواهید %1 و همه مولفه هایش را به طور کامل حذف کنید؟
UninstalledAll=%1 با موفقیت از رایانه شما حذف شد.
UninstallOpenError=خطا در باز کردن پوشه.

; *** Run entries
RunEntryExec=اجرای %1
RunEntryShellExec=مشاهده %1

; *** Custom Messages
NameAndVersion=%1 نسخه %2
AdditionalIcons=میانبرهای اضافی:
CreateDesktopIcon=ایجاد میانبر روی &دسکتاپ
CreateQuickLaunchIcon=ایجاد میانبر &سریع
ProgramOnTheWeb=%1 در وب
UninstallProgram=حذف %1
LaunchProgram=اجرای %1
AssocFileExtension=&پیوند فایل های %1 با پسوند %2
AssocingFileExtension=در حال پیوند فایل های %1 با پسوند %2...
AutoStartProgramGroupDescription=شروع خودکار:
AutoStartProgram=شروع خودکار %1 با ویندوز
AddonHostProgramNotFound=%1 در پوشه انتخاب شده یافت نشد.%n%nآیا می خواهید ادامه دهید؟
ApplicationsFound=برنامه های زیر در حال استفاده از فایل هایی هستند که باید به روز شوند. توصیه می شود اجازه دهید برنامه نصب این برنامه ها را ببندد.
CloseApplications=&بستن برنامه ها
DontCloseApplications=برنامه ها را &نبند
ErrorCloseApplications=برنامه نصب نتوانست همه برنامه ها را ببندد. لطفاً قبل از ادامه خودتان انها را ببندید.
SetupFileMissing=فایل %1 در پوشه نصب یافت نشد.
UninstallNotFound=فایل "%1" وجود ندارد. امکان حذف نیست.
ErrorTitle=خطا
SetupAborted=نصب تمام نشد.%n%nلطفاً مشکل را برطرف کنید و برنامه نصب را دوباره اجرا کنید.