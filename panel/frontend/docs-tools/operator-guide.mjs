// Four translations share the same section IDs and describe the same workflow.
const languages = ['ru', 'en', 'fa', 'zh']
const help = {
    'templates-2': [
        'Создайте или выберите шаблон нужного формата. При переименовании укажите имя, которое ещё не занято другим шаблоном этого формата. Если имя уже существует, панель отметит поле и покажет причину; введённый текст сохранится. Перед удалением проверьте, используется ли шаблон в настройках подписки или внешнем скваде. После изменения получите подписку тестового пользователя и импортируйте её в клиент: проверка JSON или YAML не проверяет подключение.',
        'Create or select a template for the required format. When renaming it, choose a name not already used by another template of that format. If the name exists, the panel marks the field and explains the error while keeping your input. Before deleting a template, check subscription settings and external squads that use it. After editing, fetch a test user’s subscription and import it into the client: valid JSON or YAML does not verify a connection.',
        'قالبی با فرمت موردنظر بسازید یا انتخاب کنید. هنگام تغییر نام، نامی انتخاب کنید که قالب دیگری با همان فرمت نداشته باشد. اگر نام تکراری باشد، پنل فیلد را مشخص می‌کند و علت را نشان می‌دهد؛ متن واردشده حفظ می‌شود. پیش از حذف، تنظیمات اشتراک و گروه‌های خارجی استفاده‌کننده از قالب را بررسی کنید. پس از ویرایش، اشتراک کاربر آزمایشی را دریافت و در کلاینت وارد کنید؛ معتبر بودن JSON یا YAML، اتصال را آزمایش نمی‌کند.',
        '创建或选择所需格式的模板。重命名时，请选择该格式下尚未使用的名称。名称重复时，面板会标记名称字段并说明原因，保留已输入的内容。删除前，请检查订阅设置和外部群组是否使用该模板。修改后获取测试用户的订阅并导入客户端；JSON 或 YAML 格式正确并不代表连接可用。'
    ],
    'xray-editor-1': [
        'Откройте профиль и отредактируйте JSON. Подсказки вызываются сочетанием Ctrl+Space; выберите вариант стрелками вверх и вниз, нажмите Enter для вставки или Esc для закрытия списка. Текущий вариант выделен. В редакторе также доступны поиск, форматирование и полноэкранный режим. Перед сохранением исправьте отмеченные ошибки и запустите проверку конфигурации.',
        'Open a profile and edit its JSON. Press Ctrl+Space for suggestions, use the up and down arrows to select an option, Enter to insert it or Esc to close the list. The current option is highlighted. Search, formatting and full-screen mode are also available. Before saving, fix marked errors and run configuration validation.',
        'پروفایل را باز و JSON آن را ویرایش کنید. برای پیشنهادها Ctrl+Space را بزنید؛ با کلیدهای بالا و پایین گزینه را انتخاب کنید، با Enter آن را درج کنید یا با Esc فهرست را ببندید. گزینه فعلی برجسته است. جست‌وجو، قالب‌بندی و حالت تمام‌صفحه نیز در دسترس‌اند. پیش از ذخیره، خطاهای مشخص‌شده را اصلاح و بررسی تنظیمات را اجرا کنید.',
        '打开配置文件并编辑 JSON。按 Ctrl+Space 显示补全建议，用上下方向键选择，按 Enter 插入，或按 Esc 关闭列表。当前选项会高亮。编辑器还支持搜索、格式化和全屏。保存前修复标出的错误，并运行配置检查。'
    ],
    'auth-methods-3': [
        'Настройте Client ID, Client Secret и redirect URI у выбранного провайдера. Для Generic OAuth2 укажите адреса авторизации и выдачи токена, домен панели и точный issuer из OpenID Connect-конфигурации провайдера. Issuer может содержать путь; завершающий / тоже учитывается. Панель сравнивает его с iss полученного ID-токена и отклоняет ответ другого issuer. При обновлении старой настройки заполните это поле до следующего входа через Generic OAuth2. Оставьте работающий способ входа, пока не проверите новый в отдельном сеансе. OAuth2-вход администратора и API-токены настраиваются отдельно.',
        'Configure the Client ID, Client Secret and redirect URI with the selected provider. For Generic OAuth2, set the authorization and token endpoints, panel domain and exact issuer from the provider’s OpenID Connect configuration. The issuer can include a path; its trailing / matters too. The panel compares it with the ID token’s iss and rejects a response from another issuer. When upgrading an existing configuration, fill in this field before signing in through Generic OAuth2 again. Keep a working login method until you have tested the new one in a separate session. Administrator OAuth2 login and API tokens are configured separately.',
        'Client ID، Client Secret و redirect URI را در ارائه‌دهنده انتخاب‌شده تنظیم کنید. برای Generic OAuth2، نشانی‌های احراز هویت و دریافت توکن، دامنه پنل و مقدار دقیق issuer از تنظیمات OpenID Connect ارائه‌دهنده را وارد کنید. issuer می‌تواند مسیر داشته باشد و / پایانی نیز در مقایسه لحاظ می‌شود. پنل آن را با iss توکن ID مقایسه می‌کند و پاسخ صادرکننده دیگری را نمی‌پذیرد. پس از ارتقای تنظیمات قدیمی، پیش از ورود دوباره با Generic OAuth2 این فیلد را تکمیل کنید. تا آزمایش روش جدید در نشستی جداگانه، یک روش ورود فعال را نگه دارید. ورود مدیر با OAuth2 و توکن‌های API جداگانه تنظیم می‌شوند.',
        '在所选身份提供方配置 Client ID、Client Secret 和 redirect URI。Generic OAuth2 还需要授权接口、令牌接口、面板域名，以及提供方 OpenID Connect 配置中的精确 issuer。issuer 可以包含路径，末尾的 / 也参与比较。面板将其与 ID 令牌中的 iss 比较，拒绝其他 issuer 的响应。升级已有配置后，请先填写此字段，再通过 Generic OAuth2 登录。在另一会话中确认新登录方式可用前，保留已有的登录方式。管理员 OAuth2 登录与 API 令牌分别配置。'
    ],
    'user-bulk-1': [
        'Выделите пользователей, выберите действие и проверьте число получателей перед подтверждением. В массовом редактировании укажите только поля, которые нужно изменить. Остальные значения сохранятся у каждого пользователя. Например, изменение срока подписки само по себе не меняет сквады и квоту трафика.',
        'Select users, choose an action and check the recipient count before confirming. In bulk editing, set only the fields you want to change. Each user keeps their other values. For example, changing the expiration date does not also change squads or the traffic quota.',
        'کاربران را انتخاب کنید، عملی را برگزینید و پیش از تأیید تعداد دریافت‌کنندگان را بررسی کنید. در ویرایش گروهی فقط فیلدهایی را تعیین کنید که باید تغییر کنند؛ مقادیر دیگر هر کاربر حفظ می‌شوند. برای مثال، تغییر تاریخ پایان اشتراک، گروه‌ها یا سهمیه ترافیک را تغییر نمی‌دهد.',
        '选择用户和操作，确认前检查接收人数。批量编辑时只设置需要修改的字段，其他值保持各用户原来的设置。例如，修改到期时间不会同时修改群组或流量配额。'
    ],
    'user-import-1': [
        'Загрузите JSON-файл экспорта: он должен содержать список users, не больше 20 000 записей. Галочка «Восстановить сквады по именам» связывает пользователей с уже существующими внутренними сквадами того же имени; отсутствующие сквады не создаются. Если снять галочку, назначения из файла не переносятся. Выбранный в форме дополнительный сквад добавляется всем импортируемым пользователям независимо от этой галочки.',
        'Upload an exported JSON file containing a users list with at most 20,000 records. “Restore squads by name” assigns users to existing internal squads with matching names; missing squads are not created. Turn it off to discard squad assignments from the file. The additional squad selected in the form is assigned to every imported user independently of this checkbox.',
        'فایل JSON خروجی را بارگذاری کنید؛ باید فهرست users با حداکثر ۲۰٬۰۰۰ رکورد داشته باشد. گزینه «بازیابی گروه‌ها بر اساس نام» کاربران را به گروه‌های داخلی موجود با نام یکسان وصل می‌کند و گروه‌های ناموجود را نمی‌سازد. با خاموش کردن آن، عضویت‌های فایل منتقل نمی‌شوند. گروه اضافی انتخاب‌شده در فرم، مستقل از این گزینه به همه کاربران واردشده اختصاص می‌یابد.',
        '上传导出的 JSON 文件，其中必须有 users 列表，最多 20,000 条记录。“按名称恢复群组”会分配名称相同的现有内部群组，不会创建缺失的群组。取消勾选后不导入文件中的群组分配。表单中另选的群组仍会分配给所有导入的用户。'
    ],
    'user-import-2': [
        'После импорта проверьте числа созданных, пропущенных и ошибочных записей. Совпадение имени пользователя или короткого идентификатора с существующей записью приводит к пропуску; другие ошибки отражаются в результате импорта. Проверьте подписку одного из созданных пользователей. Экспорт содержит данные доступа: храните файл как секрет. Он не заменяет копию базы и не переносит профили, ноды, API-токены и все настройки панели.',
        'Check the created, skipped and failed counts after import. An existing username or short identifier causes a record to be skipped; other errors appear in the import result. Test a subscription belonging to a newly created user. The export contains access credentials: keep the file private. It is not a database backup and does not transfer profiles, nodes, API tokens or all panel settings.',
        'پس از ورود، تعداد رکوردهای ساخته‌شده، ردشده و ناموفق را بررسی کنید. تکراری بودن نام کاربری یا شناسه کوتاه باعث رد شدن رکورد می‌شود؛ خطاهای دیگر در نتیجه نمایش داده می‌شوند. اشتراک یک کاربر جدید را آزمایش کنید. فایل خروجی اطلاعات دسترسی دارد و باید محرمانه بماند. این فایل پشتیبان پایگاه داده نیست و پروفایل‌ها، نودها، توکن‌های API و همه تنظیمات پنل را منتقل نمی‌کند.',
        '导入后检查创建、跳过和失败的数量。用户名或短标识与现有记录重复时会跳过该记录，其他错误在导入结果中显示。测试一个新用户的订阅。导出文件包含访问凭据，请妥善保管。它不能替代数据库备份，也不包含配置、节点、API 令牌和全部面板设置。'
    ],
    'devices-1': [
        'При новой установке HWID включён по умолчанию; обновление не меняет уже сохранённый переключатель. Совместимое приложение передаёт идентификатор устройства при запросе подписки. Для пользователя пустое значение лимита использует общий резервный лимит, 0 разрешает любое число устройств, положительное число задаёт максимум. Например, при лимите 3 четвёртое новое устройство не зарегистрируется. «Запрет новых устройств» отдельно останавливает регистрацию, сохраняя доступ уже разрешённых устройств.',
        'HWID is enabled by default on a new installation; an upgrade preserves the saved switch. A compatible app sends its device identifier when requesting a subscription. An empty user limit uses the shared fallback limit, 0 allows any number of devices, and a positive number sets the maximum. With a limit of 3, a fourth new device cannot register. “Disallow new devices” separately stops registration while preserving access for existing allowed devices.',
        'در نصب جدید، HWID به‌طور پیش‌فرض فعال است؛ ارتقا وضعیت ذخیره‌شده را تغییر نمی‌دهد. برنامه سازگار هنگام درخواست اشتراک شناسه دستگاه را می‌فرستد. حد خالی کاربر از حد جایگزین عمومی استفاده می‌کند، ۰ تعداد دستگاه‌ها را نامحدود می‌کند و عدد مثبت سقف را تعیین می‌کند. با حد ۳، دستگاه چهارم ثبت نمی‌شود. «منع دستگاه‌های جدید» جداگانه ثبت را متوقف می‌کند و دسترسی دستگاه‌های مجاز موجود حفظ می‌شود.',
        '新安装默认启用 HWID，升级会保留已保存的开关。兼容应用请求订阅时发送设备标识。用户限制留空时使用全局备用限制，0 表示设备数量不限，正数表示上限。例如设为 3 时，第四台新设备无法注册。“禁止新设备”单独控制注册，已有的允许设备仍可访问。'
    ],
    'devices-2': [
        'Удаление освобождает регистрацию: если новые устройства разрешены, то же приложение сможет зарегистрироваться повторно. Для постоянного запрета выберите блокировку: запись сохраняется, а доступ этого устройства отзывается. Разблокировка снимает запрет. «Удалить все незаблокированные» очищает только разрешённые регистрации и сохраняет список заблокированных устройств.',
        'Deleting a device removes its registration: the same app can register again if new devices are allowed. To prevent access, block it instead: the record remains and that device’s access is revoked. Unblocking removes the ban. “Delete all unblocked” clears allowed registrations while keeping blocked device records.',
        'حذف دستگاه ثبت آن را پاک می‌کند؛ اگر ثبت دستگاه جدید مجاز باشد، همان برنامه می‌تواند دوباره ثبت شود. برای منع دسترسی، دستگاه را مسدود کنید: رکورد می‌ماند و دسترسی همان دستگاه لغو می‌شود. رفع مسدودی منع را برمی‌دارد. «حذف همه دستگاه‌های غیرمسدود» فقط ثبت‌های مجاز را پاک می‌کند و دستگاه‌های مسدود را نگه می‌دارد.',
        '删除设备会清除注册；若允许新设备，同一应用可以再次注册。要禁止访问，请使用封锁：保留记录并撤销该设备的访问权限。解除封锁会移除禁令。“删除所有未封锁设备”只清除允许的注册，保留封锁记录。'
    ],
    'node-health-1': [
        'Откройте карточку ноды, чтобы проверить связь, онлайн, загрузку CPU, память, сеть и сведения Xray. Набор показателей зависит от данных агента. Отсутствующее значение не означает нулевую нагрузку: проверьте связь с нодой и повторите запрос. Версии панели, агента ноды и Xray проверяются отдельно в разделе «Документация → Версии».',
        'Open a node card to inspect connectivity, online users, CPU load, memory, networking and Xray information. Available metrics depend on the agent. A missing value does not mean zero load: check connectivity and refresh. Panel, node agent and Xray versions are listed separately under Documentation → Versions.',
        'کارت نود را باز کنید تا اتصال، کاربران آنلاین، بار CPU، حافظه، شبکه و اطلاعات Xray را بررسی کنید. شاخص‌های موجود به داده‌های عامل بستگی دارند. مقدار ناموجود به معنی بار صفر نیست؛ اتصال نود را بررسی و درخواست را تکرار کنید. نسخه پنل، عامل نود و Xray جداگانه در «مستندات ← نسخه‌ها» آمده‌اند.',
        '打开节点卡片查看连接、在线用户、CPU、内存、网络和 Xray 信息，可用指标取决于代理返回的数据。缺失值不代表负载为零，请检查节点连接并刷新。在“文档 → 版本”中分别查看面板、节点代理和 Xray 的版本。'
    ],
    'hosts-2': [
        "Скрытый хост не выдаётся в новых ответах подписки, но скрытие само по себе не отзывает уже выданные данные подключения. Отключение хоста управляет доступом через политику ноды. Внутренние сквады ограничивают, кому выдаётся хост. Клонирование создаёт ещё одну запись хоста с исходными параметрами; новый сервер при этом не создаётся. После сохранения дождитесь применения политики и проверьте подписку тестового пользователя.\n\nЕсли панель потеряла связь с нодой, доступный пользователю хост остаётся в подписке с теми же данными подключения. Состояние ноды само по себе не скрывает хост. До восстановления сервера подключение может не работать; после восстановления обновлять подписку только ради возвращения хоста не нужно. Скрытие, отключение, ограничения сквада, квоты и блокировки устройств проверяются отдельно.",
        "A hidden host is omitted from new subscription responses, but hiding alone does not revoke credentials already issued. Disabling a host controls access through node policy. Internal squads restrict who receives the host. Cloning creates another host record with the original settings; it does not create a server. After saving, wait for policy application and test a user’s subscription.\n\nIf the panel loses contact with a node, an authorized host remains in the subscription with the same connection details. Node health alone does not hide it. The connection may fail until the server recovers; once it recovers, a subscription refresh is not needed just to restore the host entry. Visibility, disabled status, squad restrictions, quotas and device blocks are checked separately.",
        "هاست مخفی در پاسخ‌های جدید اشتراک نمایش داده نمی‌شود، اما مخفی کردن به‌تنهایی اطلاعات اتصال قبلی را لغو نمی‌کند. غیرفعال کردن هاست از طریق سیاست نود دسترسی را کنترل می‌کند. گروه‌های داخلی تعیین می‌کنند چه کسی هاست را دریافت کند. کپی کردن، رکورد هاست جدید با تنظیمات قبلی می‌سازد و سرور جدید نمی‌سازد. پس از ذخیره، منتظر اعمال سیاست بمانید و اشتراک کاربر آزمایشی را بررسی کنید.\n\nاگر ارتباط پنل با نود قطع شود، هاست مجاز با همان اطلاعات اتصال در اشتراک باقی می‌ماند. وضعیت نود به‌تنهایی هاست را پنهان نمی‌کند. تا بازیابی سرور ممکن است اتصال برقرار نشود؛ پس از بازیابی، برای بازگشت هاست به فهرست نیازی به تازه‌سازی اشتراک نیست. پنهان‌بودن، غیرفعال‌بودن، محدودیت اسکواد، سهمیه و مسدودبودن دستگاه جداگانه بررسی می‌شوند.",
        "隐藏的主机不会出现在新的订阅响应中，但仅隐藏不会撤销已发放的连接凭据。禁用主机通过节点策略控制访问。内部群组决定哪些用户收到主机。克隆只创建具有原设置的新主机记录，不会创建服务器。保存后等待策略应用，再测试用户订阅。\n\n面板与节点失去联系时，用户有权访问的主机会保留在订阅中，连接参数不变。节点状态本身不会隐藏主机。服务器恢复前可能无法连接；恢复后，无需仅为恢复主机条目而刷新订阅。隐藏、停用、小组限制、配额和设备封锁仍单独检查。"
    ],
    'hosts-3': [
        'Выделите хосты, укажите изменяемые поля и проверьте получателей. Если поле тегов выбрано для изменения и оставлено пустым, теги будут очищены; если поле не выбрано, существующие теги сохранятся. Порядок записей задаёт порядок выдачи, кроме включённого перемешивания. После изменения inbound, видимости или сквада обновите подписку в клиенте и проверьте наличие нужного подключения.',
        'Select hosts, choose the fields to update and check the recipients. Selecting the tags field and leaving it empty clears tags; leaving the field unselected preserves existing tags. Record order determines subscription order except where shuffling is enabled. After changing an inbound, visibility or squad, refresh the subscription in a client and check that the intended connection is present.',
        'هاست‌ها و فیلدهای مورد تغییر را انتخاب و دریافت‌کنندگان را بررسی کنید. اگر فیلد تگ‌ها برای تغییر انتخاب و خالی گذاشته شود، تگ‌ها پاک می‌شوند؛ اگر انتخاب نشود، تگ‌های قبلی حفظ می‌شوند. ترتیب رکوردها ترتیب خروجی اشتراک را تعیین می‌کند، مگر وقتی جابه‌جایی تصادفی فعال باشد. پس از تغییر inbound، نمایش یا گروه، اشتراک را در برنامه تازه‌سازی و اتصال موردنظر را بررسی کنید.',
        '选择主机和要更新的字段，检查接收对象。选择修改标签并留空会清除标签；不选择该字段则保留原标签。记录顺序决定订阅顺序，启用随机排序时除外。修改入站、可见性或群组后，在客户端更新订阅，检查目标连接是否存在。'
    ],
    'limits-2': [
        'В таблице сравнивайте расход, действующую квоту, остаток, разовую добавку и статус доступа. Например, при базовой квоте 100 ГиБ и добавке 20 ГиБ пользователь получает 120 ГиБ; после учтённого расхода 80 ГиБ остаётся 40 ГиБ. Безлимит снимает персональную квоту в выбранной области, но расход продолжает учитываться. Он не отменяет остановку трафика, срок подписки и другие ограничения пользователя.',
        'Compare usage, effective quota, remaining traffic, one-time bonus and access status in the table. A 100 GiB base quota plus a 20 GiB bonus provides 120 GiB; after 80 GiB of accounted usage, 40 GiB remains. Unlimited removes the personal quota in the selected scope, but usage is still counted. It does not override a traffic pause, subscription expiration or other user restrictions.',
        'در جدول مصرف، سهمیه مؤثر، ترافیک باقی‌مانده، افزایش یک‌باره و وضعیت دسترسی را مقایسه کنید. سهمیه پایه ۱۰۰ گیبی‌بایت با افزایش ۲۰ گیبی‌بایت، ۱۲۰ گیبی‌بایت می‌دهد؛ پس از مصرف محاسبه‌شده ۸۰، مقدار ۴۰ باقی می‌ماند. حالت نامحدود سهمیه شخصی محدوده انتخابی را برمی‌دارد ولی مصرف همچنان ثبت می‌شود. توقف ترافیک، پایان اشتراک و محدودیت‌های دیگر را لغو نمی‌کند.',
        '在表格中比较已用流量、实际配额、剩余流量、一次性追加量和访问状态。例如基础配额 100 GiB 加上 20 GiB 追加量，共计 120 GiB；计费使用 80 GiB 后剩余 40 GiB。无限流量仅移除所选范围的个人配额，仍记录用量，不会解除流量暂停、订阅到期或其他用户限制。'
    ],
    'backups-1': [
        'При новой установке панели установщик спрашивает пароль резервных копий; Enter создаёт его автоматически. Пароль показан после установки и сохранён в `backup-password.txt` в каталоге панели с доступом только root. Сохраните его отдельно от сервера. Раздел доступен администратору после ввода этого пароля. Нажмите «Создать ZIP-копию» и дождитесь файла в списке. Архив зашифрован и содержит дамп базы данных: для открытия понадобится пароль. Скачайте копию на отдельное хранилище. Отправка передаёт выбранный файл в Telegram, удаление стирает его с сервера, «Закрыть доступ» снова блокирует раздел. Копия базы не включает серверный .env, сертификаты и файлы нод. Кнопки восстановления в панели нет: восстановление выполняет администратор сервера.',
        'A fresh panel installation asks for a backup password; Enter generates one automatically. The installer shows it when installation finishes and saves it in `backup-password.txt` in the panel directory, accessible only to root. Keep a copy away from the server. Administrators unlock this section with that password. Click “Create ZIP backup” and wait for the file to appear. The encrypted archive contains a database dump and requires its password to open. Download it to separate storage. Sending transfers the selected file to Telegram, deleting removes it from the server, and “Lock access” locks the section again. The database backup excludes the server’s .env, certificates and node files. There is no restore button in the panel; restoration is performed by the server administrator.',
        'در نصب جدید پنل، نصب‌کننده رمز پشتیبان را می‌پرسد؛ Enter آن را خودکار می‌سازد. رمز در پایان نصب نمایش داده می‌شود و در `backup-password.txt` در پوشه پنل ذخیره می‌شود؛ فقط root به آن دسترسی دارد. رمز را جدا از سرور نگه دارید. مدیر با این رمز بخش پشتیبان را باز می‌کند. «ساخت پشتیبان ZIP» را بزنید و منتظر ظاهر شدن فایل بمانید. آرشیو رمزگذاری‌شده شامل خروجی پایگاه داده است و برای باز کردن به رمز نیاز دارد. آن را در محل جداگانه دانلود کنید. ارسال، فایل را به تلگرام می‌فرستد؛ حذف، آن را از سرور پاک می‌کند و «بستن دسترسی» بخش را دوباره قفل می‌کند. فایل .env سرور، گواهی‌ها و فایل‌های نود در این پشتیبان نیستند. دکمه بازیابی در پنل وجود ندارد؛ مدیر سرور بازیابی را انجام می‌دهد.',
        '首次安装面板时，安装程序会询问备份密码；按 Enter 可自动生成。安装完成后会显示该密码，并将其保存到面板目录中的 `backup-password.txt`，仅 root 可读取。请在服务器之外保存一份密码。管理员输入该密码后进入此页面。点击“创建 ZIP 备份”并等待文件出现。加密压缩包包含数据库转储，打开时需要密码。请下载到独立存储。发送会将所选文件发到 Telegram，删除会从服务器移除文件，“关闭访问”会重新锁定页面。数据库备份不包含服务器 .env、证书或节点文件。面板没有恢复按钮，恢复由服务器管理员执行。'
    ],
    'notifications-1': [
        'Общие уведомления о пользователях, нодах и служебных событиях настраивает администратор сервера в параметрах установки: он включает отправку, задаёт токен бота и чаты для нужных типов событий. В панели нет отдельной формы для всех этих параметров. Автоматическая отправка резервных копий настраивается отдельно на странице «Резервные копии» и может использовать другого бота.',
        'The server administrator configures general user, node and service notifications in the installation settings: enable delivery, set the bot token and choose chats for each event type. The panel has no separate form covering all these parameters. Automatic backup delivery is configured separately on the Backups page and can use a different bot.',
        'مدیر سرور اعلان‌های عمومی کاربران، نودها و رویدادهای سرویس را در تنظیمات نصب تعیین می‌کند: ارسال را فعال، توکن ربات و چت هر نوع رویداد را مشخص می‌کند. پنل فرم جداگانه‌ای برای همه این پارامترها ندارد. ارسال خودکار پشتیبان در صفحه «پشتیبان‌ها» جداگانه تنظیم می‌شود و می‌تواند ربات دیگری داشته باشد.',
        '服务器管理员在安装配置中设置用户、节点和服务通知：启用发送，填写机器人令牌，并为事件类型指定聊天。面板没有涵盖这些参数的独立表单。自动发送备份在“备份”页面单独设置，可以使用不同的机器人。'
    ],
    'response-rules-1': [
        'Правила выбирают ответ подписки по условиям запроса: например, по имени приложения в заголовке User-Agent. Добавьте правило, задайте условия и формат или шаблон, затем включите его. Порядок правил влияет на выбор ответа. Список приложений на странице собирается из положительных условий включённых правил; отсутствие приложения в этом списке само по себе не доказывает, что его запрос будет запрещён.',
        'Rules choose a subscription response from request conditions, such as the app name in the User-Agent header. Add a rule, set its conditions and response format or template, then enable it. Rule order affects response selection. The app list is built from positive conditions in enabled rules; an app missing from that list is not necessarily blocked.',
        'قواعد بر اساس شرایط درخواست، مانند نام برنامه در سربرگ User-Agent، پاسخ اشتراک را انتخاب می‌کنند. قانون بسازید، شرایط و قالب پاسخ را تعیین و آن را فعال کنید. ترتیب قواعد در انتخاب پاسخ اثر دارد. فهرست برنامه‌ها از شرایط مثبت قواعد فعال ساخته می‌شود؛ نبودن برنامه در این فهرست به‌تنهایی به معنی مسدود بودن درخواست آن نیست.',
        '规则根据请求条件选择订阅响应，例如 User-Agent 标头中的应用名称。新增规则、设置条件及响应格式或模板，然后启用。规则顺序影响响应选择。页面应用列表来自已启用规则的正向条件；应用未列出不代表其请求一定被禁止。'
    ],
    'response-rules-2': [
        'Откройте проверку совпадения и передайте те же заголовки, которые отправляет клиент. Проверьте выбранное правило и результат: конфигурацию, запрет, HTTP 404/451 или закрытие соединения. При неверном результате уточните порядок правил и операторы условий, затем повторите проверку. После сохранения обновите подписку в самом приложении: обычный браузер может получить другой ответ.',
        'Open the matching test and supply the same headers as the client. Check the selected rule and result: a configuration, rejection, HTTP 404/451 or closed connection. If the result is wrong, review rule order and condition operators, then test again. After saving, refresh the subscription in the app itself; a browser may receive a different response.',
        'آزمون تطبیق را باز کنید و همان سربرگ‌های برنامه را بدهید. قانون انتخابی و نتیجه را بررسی کنید: پیکربندی، منع، HTTP 404/451 یا بستن اتصال. اگر نتیجه درست نیست، ترتیب قواعد و عملگرهای شرایط را اصلاح و دوباره آزمایش کنید. پس از ذخیره، اشتراک را در خود برنامه تازه‌سازی کنید؛ مرورگر ممکن است پاسخ دیگری دریافت کند.',
        '打开匹配测试，输入与客户端相同的标头。检查选中的规则及结果：配置、拒绝、HTTP 404/451 或关闭连接。结果不符时检查规则顺序和条件运算符，再次测试。保存后在应用中更新订阅，普通浏览器可能得到不同响应。'
    ],
    'subscription-request-path-1': [
        'Пользователь открывает ссылку подписки в браузере или добавляет её в приложение. Браузер может получить страницу с инструкциями, а приложение — конфигурацию выбранного формата. Панель учитывает заголовки запроса и правила ответа. Если приложение не получает подключения, откройте историю запросов, найдите его запрос и проверьте выбранный формат, статус пользователя и HWID.',
        'A user opens the subscription link in a browser or adds it to an app. A browser may receive an instruction page while an app receives a configuration in the selected format. The panel considers request headers and response rules. If the app receives no connections, find its request in request history and check the response format, user status and HWID.',
        'کاربر لینک اشتراک را در مرورگر باز یا به برنامه اضافه می‌کند. مرورگر ممکن است صفحه راهنما بگیرد و برنامه پیکربندی با قالب انتخاب‌شده. پنل سربرگ‌ها و قواعد پاسخ را بررسی می‌کند. اگر برنامه اتصالی دریافت نمی‌کند، درخواست آن را در تاریخچه پیدا و قالب پاسخ، وضعیت کاربر و HWID را بررسی کنید.',
        '用户在浏览器打开订阅链接，或将其加入应用。浏览器可能收到说明页面，应用则收到所选格式的配置。面板会考虑请求标头和响应规则。若应用未收到连接，请在请求历史中找到该请求，检查响应格式、用户状态和 HWID。'
    ]
}

export function explainOperatorWorkflows(articles) {
    for (const article of articles) {
        for (const section of article.sections) {
            const translation = help[section.id]
            if (!translation) continue
            languages.forEach((language, index) => {
                section[language] = { ...section[language], body: translation[index] }
            })
        }
    }
    for (const [articleId, section] of extraSections) {
        const article = articles.find((entry) => entry.id === articleId)
        if (!article) throw new Error(`Missing guide article: ${articleId}`)
        article.sections.push(section)
    }
}

const extraSections = [
    ['appearance', {
        id: 'appearance-panel-update',
        ru: {
            title: 'Обновление из панели',
            body: 'Если доступна новая версия, её номер в верхней панели подсвечивается цветом темы. Нажмите на номер: под кнопками поддержки и GitHub появится «Обновить». Для прежней установки один раз выполните upgrade-panel через новый установщик — он настроит сервис обновления.\n\nПосле нажатия панель блокируется для всех открытых сеансов. Установщик проверяет выпуск, создаёт копию базы и обновляет приложения, сохраняя ключи, тома и параметры Compose. Ноды и существующий Nginx/Caddy не обновляются. Вкладку можно закрыть: работа продолжится. После запуска приложений страница перезагрузится. При ошибке прочитайте сообщение и проверьте журнал panel-update-<идентификатор>.log в каталоге logs установщика перед повтором.'
        },
        en: {
            title: 'Updating from the panel',
            body: 'When a new version is available, the header version number uses the theme accent color. Click it to find Update below the support and GitHub buttons. For an older installation, run upgrade-panel with the new installer once to configure the update service.\n\nStarting an update blocks all open panel sessions. The installer checks the release, backs up the database and updates the applications while preserving keys, volumes and Compose settings. Nodes and existing Nginx/Caddy are not updated. Closing the browser does not stop the operation. After the applications restart, the page reloads. If the update fails, read the message and check panel-update-<identifier>.log in the installer logs directory before retrying.'
        },
        fa: {
            title: 'به‌روزرسانی از پنل',
            body: 'اگر نسخه جدیدی موجود باشد، شماره نسخه در سربرگ با رنگ اصلی پوسته نمایش داده می‌شود. روی آن کلیک کنید؛ دکمه به‌روزرسانی زیر دکمه‌های پشتیبانی و GitHub ظاهر می‌شود. برای نصب قدیمی یک‌بار upgrade-panel را با نصب‌کننده جدید اجرا کنید تا سرویس به‌روزرسانی تنظیم شود.\n\nشروع به‌روزرسانی همه نشست‌های باز پنل را مسدود می‌کند. نصب‌کننده نسخه را بررسی می‌کند، از پایگاه داده پشتیبان می‌گیرد و برنامه‌ها را با حفظ کلیدها، حجم‌ها و تنظیمات Compose به‌روزرسانی می‌کند. نودها و Nginx/Caddy موجود به‌روزرسانی نمی‌شوند. بستن مرورگر عملیات را متوقف نمی‌کند. پس از راه‌اندازی مجدد برنامه‌ها، صفحه دوباره بارگذاری می‌شود. در صورت خطا، پیام و فایل panel-update-<identifier>.log در پوشه logs نصب‌کننده را پیش از تلاش دوباره بررسی کنید.'
        },
        zh: {
            title: '从面板更新',
            body: '有新版本时，顶部版本号会使用主题强调色。点击版本号，即可在支持和 GitHub 按钮下方看到更新按钮。旧安装请先用新版安装程序执行一次 upgrade-panel，以配置更新服务。\n\n开始更新后，所有已打开的面板会话都会被锁定。安装程序检查版本、备份数据库并更新应用，保留密钥、数据卷和 Compose 设置。节点及现有 Nginx/Caddy 不会更新。关闭浏览器不会停止操作。应用重新启动后页面会自动重新加载。如果更新失败，请阅读提示，并在重试前检查安装程序 logs 目录中的 panel-update-<identifier>.log。'
        }
    }],
    ['subscription-settings', {
        id: 'subscription-settings-3',
        ru: {
            title: 'Порядок примечаний',
            body: 'Откройте «Настройки подписки» → карточку примечаний. Стрелками вверх и вниз перемещайте причины уведомлений, затем сохраните настройки и обновите подписку в клиенте. По умолчанию порядок такой: «Подписка истекла», «Подписка отключена», «Запрет новых устройств», «Устройство заблокировано (HWID)». Показываются сообщения только для действующих причин. Текст каждой причины задаётся отдельно в этой карточке.\n\nПри включённом объединении статуса подписки и HWID истёкшая или отключённая подписка вместе с заблокированным устройством дают обе группы сообщений в выбранном порядке. Например, при истёкшей подписке и заблокированном устройстве сначала появится текст об истечении, затем — о блокировке. Если поднять HWID выше, порядок станет обратным. При выключенном объединении показывается сообщение о состоянии подписки; если подписка активна, остаётся сообщение о блокировке устройства.\n\n«Запрет новых устройств» обрабатывается отдельно. Когда новому устройству отказано в регистрации и подписка одновременно истекла или отключена, показывается причина, расположенная выше в списке. Например, подняв запрет выше истечения, вы получите текст о запрете регистрации. Эти две причины не объединяются. Уже зарегистрированное разрешённое устройство продолжает работать при соблюдении остальных условий доступа.\n\nЛимит трафика, превышение числа устройств и отсутствие поддержки HWID имеют отдельные сообщения и в этот список не входят. Перестановка примечаний меняет сообщения в подписке; блокировки и условия доступа продолжают действовать. Вид отображения зависит от клиента.'
        },
        en: {
            title: 'Remark order',
            body: 'Open Subscription settings → the remarks card. Use the up and down arrows to move notification reasons, save the settings, then refresh the subscription in the client. The default order is Subscription expired, Subscription disabled, New devices denied, and Device blocked (HWID). Only messages for applicable reasons are shown. Each reason’s text is edited separately in this card.\n\nWhen combining subscription status and HWID is enabled, an expired or disabled subscription together with a blocked device produces both message groups in the chosen order. For example, expiry appears before the device block by default; moving HWID above expiry reverses them. With combining disabled, the subscription status message takes priority; an active subscription shows the device block message.\n\nNew devices denied is handled separately. If registration is denied for a new device and its subscription is also expired or disabled, the reason placed higher in the list is shown. Moving registration denial above expiry therefore shows the registration message. These two reasons are not combined. An already registered, allowed device keeps access when the other access conditions are met.\n\nTraffic quota exhaustion, the maximum device count and missing HWID support have separate messages outside this list. Reordering changes subscription messages; restrictions and access checks still apply. Presentation depends on the client.'
        },
        fa: {
            title: 'ترتیب پیام‌ها',
            body: 'در «تنظیمات اشتراک»، کارت پیام‌ها را باز کنید. با فلش‌های بالا و پایین ترتیب علت‌ها را تغییر دهید، تنظیمات را ذخیره کنید و اشتراک را در برنامه تازه‌سازی کنید. ترتیب پیش‌فرض: اشتراک منقضی، اشتراک غیرفعال، منع دستگاه جدید و دستگاه مسدود (HWID). فقط پیام علت‌های جاری نمایش داده می‌شود. متن هر علت در همین کارت جداگانه ویرایش می‌شود.\n\nاگر ترکیب وضعیت اشتراک و HWID روشن باشد، اشتراک منقضی یا غیرفعال همراه با دستگاه مسدود، هر دو گروه پیام را با ترتیب انتخابی نمایش می‌دهد. برای مثال، در حالت پیش‌فرض پیام انقضا پیش از مسدود بودن دستگاه است؛ بردن HWID بالاتر ترتیب را برعکس می‌کند. با خاموش کردن ترکیب، پیام وضعیت اشتراک اولویت دارد؛ برای اشتراک فعال پیام مسدود بودن دستگاه نمایش داده می‌شود.\n\nمنع دستگاه جدید جداگانه بررسی می‌شود. اگر ثبت دستگاه جدید ممنوع و اشتراک هم منقضی یا غیرفعال باشد، علت بالاتر در فهرست نمایش داده می‌شود. بنابراین بردن منع ثبت بالاتر از انقضا، پیام منع ثبت را نشان می‌دهد. این دو علت ترکیب نمی‌شوند. دستگاه مجاز از پیش ثبت‌شده، با رعایت سایر شرایط دسترسی، همچنان کار می‌کند.\n\nپایان سهمیه ترافیک، سقف تعداد دستگاه‌ها و پشتیبانی نشدن HWID پیام‌های جداگانه خارج از این فهرست دارند. تغییر ترتیب، پیام‌های اشتراک را عوض می‌کند؛ محدودیت‌ها و بررسی دسترسی همچنان اعمال می‌شوند. شیوه نمایش به برنامه بستگی دارد.'
        },
        zh: {
            title: '备注顺序',
            body: '打开“订阅设置”中的备注卡片。使用上下箭头移动通知原因，保存设置，然后在客户端更新订阅。默认顺序为：订阅已过期、订阅已禁用、禁止新设备、设备已封禁（HWID）。只显示当前适用原因的消息。每种原因的文本在此卡片中单独编辑。\n\n启用合并订阅状态与 HWID 时，如果订阅已过期或被禁用，同时设备已封禁，会按所选顺序显示两组消息。例如默认先显示过期，再显示设备封禁；将 HWID 移到过期上方即可反转顺序。关闭合并时优先显示订阅状态消息；订阅有效时显示设备封禁消息。\n\n禁止新设备单独处理。如果新设备注册被拒绝，同时订阅已过期或被禁用，则显示列表中位置更高的原因。因此将禁止注册移到过期上方，会显示注册被拒绝的消息。这两种原因不会合并。已经注册且获准的设备，在满足其他访问条件时仍可使用。\n\n流量额度耗尽、设备数量上限和不支持 HWID 各有独立消息，不属于此列表。调整顺序会改变订阅中的消息，封禁与访问检查仍然生效。显示方式取决于客户端。'
        }
    }],
    ['appearance', {
        id: 'appearance-3',
        ru: {
            title: 'Лаунчер и сброс оформления',
            body: 'В настройках темы переключатель «Лаунчер» находится рядом с компактным интерфейсом и уменьшением анимации. Он показывает или скрывает плавающее окно быстрых переходов. Включите его, откройте настройку быстрых ссылок и выберите нужные разделы. Выбор и положение окна сохраняются в этом браузере.\n\nКнопка «Сбросить» внизу возвращает стандартные тему, цвет, шрифт, плотность и настройку анимации. Переключатель лаунчера сохраняет своё значение; отключить окно можно отдельно.'
        },
        en: {
            title: 'Launcher and appearance reset',
            body: 'In theme settings, Launcher is grouped with the compact interface and reduced motion switches. It shows or hides the floating quick navigation window. Enable it, open quick link settings and choose the sections you need. Your selection and window position are saved in this browser.\n\nReset at the bottom restores the default theme, accent, font, density and motion setting. The launcher switch keeps its value; turn the window off separately when needed.'
        },
        fa: {
            title: 'راه‌انداز و بازنشانی ظاهر',
            body: 'در تنظیمات پوسته، گزینه راه‌انداز کنار رابط فشرده و کاهش حرکت قرار دارد. این گزینه پنجره شناور دسترسی سریع را نشان می‌دهد یا پنهان می‌کند. آن را روشن کنید، تنظیمات لینک‌های سریع را باز کنید و بخش‌های موردنیاز را انتخاب کنید. انتخاب و جای پنجره در همین مرورگر ذخیره می‌شوند.\n\nبازنشانی در پایین، پوسته، رنگ، قلم، تراکم و تنظیم حرکت را به پیش‌فرض برمی‌گرداند. مقدار کلید راه‌انداز حفظ می‌شود؛ در صورت نیاز پنجره را جداگانه خاموش کنید.'
        },
        zh: {
            title: '启动器与外观重置',
            body: '主题设置中的启动器开关与紧凑界面、减少动画放在一起。它控制浮动快捷导航窗口的显示。启用后打开快捷链接设置，选择需要的页面。选择和窗口位置保存在当前浏览器中。\n\n底部的重置按钮恢复默认主题、强调色、字体、密度和动画设置。启动器开关保留当前值，需要隐藏窗口时可单独关闭。'
        }
    }]
]

export const supportGuide = {
    id: 'support',
    category: 'settings',
    ru: 'Поддержать проект',
    en: 'Support the project',
    fa: 'حمایت از پروژه',
    zh: '支持项目',
    sources: ['src/pages/dashboard/support/support.page.tsx'],
    route: '/dashboard/support',
    resources: [],
    sections: [
        {
            id: 'support-1',
            ru: {
                title: 'Адреса и сети',
                body: 'Откройте «Поддержать проект» в меню дополнительных возможностей. На странице находятся адреса Gram в сети TON, Solana, TRC20 в сети TRON, Litecoin, Ethereum и Bitcoin. Найдите нужную сеть в списке и нажмите «Копировать». Проверьте полный адрес в своём кошельке перед переводом; имя валюты и сеть должны соответствовать выбранной сети.'
            },
            en: {
                title: 'Addresses and networks',
                body: 'Open “Support the project” in the additional options menu. The page lists Gram on TON, Solana, TRC20 on TRON, Litecoin, Ethereum and Bitcoin addresses. Find the required network in the list and click Copy. Check the full address in your wallet before sending; the currency and network must match the selected network.'
            },
            fa: {
                title: 'آدرس‌ها و شبکه‌ها',
                body: '«حمایت از پروژه» را در منوی امکانات بیشتر باز کنید. صفحه آدرس‌های Gram در TON، Solana، TRC20 در TRON، Litecoin، Ethereum و Bitcoin را نشان می‌دهد. شبکه موردنظر را در فهرست پیدا کنید و «کپی» را بزنید. پیش از ارسال، آدرس کامل را در کیف پول بررسی کنید؛ ارز و شبکه باید با شبکه انتخاب‌شده یکسان باشند.'
            },
            zh: {
                title: '地址与网络',
                body: '在更多选项菜单中打开“支持项目”。页面列出 TON 网络的 Gram、Solana、TRON 网络的 TRC20、Litecoin、Ethereum 和 Bitcoin 地址。在列表中找到对应网络并点击复制。转账前在钱包中核对完整地址，币种和网络必须与所选网络一致。'
            }
        },
        {
            id: 'support-2',
            ru: {
                title: 'Что делает страница',
                body: 'Кнопка копирования помещает адрес в буфер обмена. Панель не подключает кошелёк, не подписывает и не отправляет перевод, не списывает средства и не оформляет подписку. Ссылка Telegram открывает связь с автором проекта для вопросов и предложений.'
            },
            en: {
                title: 'How the page works',
                body: 'Copy places the address on the clipboard. The panel does not connect a wallet, sign or send a transfer, charge funds or create a subscription. The Telegram link opens contact with the project author for questions and suggestions.'
            },
            fa: {
                title: 'عملکرد صفحه',
                body: 'کپی، آدرس را در کلیپ‌بورد قرار می‌دهد. پنل کیف پول را وصل نمی‌کند، انتقال را امضا یا ارسال نمی‌کند، پول برداشت نمی‌کند و اشتراک نمی‌سازد. لینک تلگرام برای پرسش و پیشنهاد، ارتباط با نویسنده پروژه را باز می‌کند.'
            },
            zh: {
                title: '页面的功能',
                body: '复制按钮将地址放入剪贴板。面板不会连接钱包、签名或发送交易、扣款或创建订阅。Telegram 链接用于向项目作者提出问题和建议。'
            }
        }
    ]
}

// Pending node configuration after a policy synchronization failure.
for (const [lang, text] of Object.entries({"ru": "Не удалось применить правила хостов. Новая конфигурация не отправлена на ноду; работающий Xray сохраняет прежнюю конфигурацию. Проверьте поддержку изоляции хостов v2 в ноде и ядре. Панель повторит попытку после восстановления поддержки. Установленные в панели ограничения не отключаются.", "en": "Host policies could not be applied. The new configuration was not sent to the node; a running Xray keeps its previous configuration. Check host isolation v2 support in the node and core. The panel will retry once support is restored. The configured limits remain enabled.", "fa": "اعمال سیاست‌های میزبان ممکن نشد. پیکربندی جدید به نود ارسال نشده است؛ Xray در حال اجرا پیکربندی قبلی را نگه می‌دارد. پشتیبانی از جداسازی میزبان نسخه ۲ را در نود و هسته بررسی کنید. پنل پس از بازیابی پشتیبانی دوباره تلاش می‌کند. محدودیت‌های تنظیم‌شده فعال می‌مانند.", "zh": "主机策略未能应用。新配置未发送到节点；正在运行的 Xray 保留原配置。请检查节点和内核是否支持主机隔离 v2。恢复支持后，面板会重试。已配置的限制仍保持启用。"})) {
    help['node-health-1'][languages.indexOf(lang)] += '\n\n' + text
}

// Purple status identifies a missing host isolation API, not a transport outage.
for (const [lang, text] of Object.entries({"ru": "Обновите ноду до Remnacust Node 1.1.1 с нашим Xray. Для этого профиля требуется изоляция хостов v2. Без обновления его ограничения и новые подключения не заработают. Работающая конфигурация пока сохранена; после обновления панель применит новую автоматически.", "en": "Update the node to Remnacust Node 1.1.1 with our Xray. This profile requires host isolation v2. Its limits and new connections will not work until the update. The running configuration is kept; after updating, the panel will apply the new one automatically.", "fa": "نود را به Remnacust Node 1.1.1 همراه با Xray ما به‌روزرسانی کنید. این پروفایل به جداسازی میزبان نسخه ۲ نیاز دارد. تا زمان به‌روزرسانی، محدودیت‌های آن و اتصال‌های جدید کار نخواهند کرد. پیکربندی در حال اجرا حفظ می‌شود؛ پس از به‌روزرسانی، پنل پیکربندی جدید را خودکار اعمال می‌کند.", "zh": "请将节点更新至包含我们 Xray 的 Remnacust Node 1.1.1。此配置需要主机隔离 v2。更新前，其限制和新连接无法生效。当前运行配置会保留；更新后，面板将自动应用新配置。"})) {
    help['node-health-1'][languages.indexOf(lang)] += '\n\n' + text
}
