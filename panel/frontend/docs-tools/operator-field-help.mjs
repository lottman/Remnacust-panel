// Each tuple is RU, EN, FA, ZH. Keep field names aligned with the actual forms.
export const operatorFieldHelp = {
    defaultSquadUuid: [
        'Дополнительный внутренний сквад для всех создаваемых пользователей. Добавляется даже при восстановлении сквадов из файла; пустое значение не добавляет дополнительный сквад.',
        'Additional internal squad for all users created by the import. It is added even when restoring squads from the file; leave empty to add no extra squad.',
        'گروه داخلی اضافی برای همه کاربران ساخته‌شده؛ حتی با بازیابی گروه‌های فایل اضافه می‌شود. مقدار خالی یعنی گروه اضافی تعیین نمی‌شود.',
        '为所有导入创建的用户分配额外内部群组，即使恢复文件中的群组也会添加。留空则不分配额外群组。'
    ],
    username: [
        'Имя учётной записи для поиска и управления пользователем. При создании оно должно быть свободно.',
        'Account name used to find and manage the user. It must be available when creating an account.',
        'نام حساب برای جستجو و مدیریت کاربر؛ هنگام ساخت باید آزاد باشد.',
        '用于搜索和管理用户的账户名，创建时不能与已有账户重复。'
    ],
    description: [
        'Описание записи для администратора. Здесь можно оставить условия обслуживания или пояснение к настройкам.',
        'An administrator description of the record, such as service terms or a note about its settings.',
        'توضیح رکورد برای مدیر، مانند شرایط سرویس یا یادداشت تنظیمات.',
        '供管理员查看的记录说明，可填写服务条件或配置备注。'
    ],
    status: [
        'ACTIVE — активен, DISABLED — отключён, EXPIRED — срок истёк, LIMITED — общая квота исчерпана. Для рабочего подключения также нужны действующий срок и доступ к хосту.',
        'ACTIVE means active, DISABLED disabled, EXPIRED expired and LIMITED overall quota exhausted. A working connection also requires a valid expiry date and host access.',
        'ACTIVE فعال، DISABLED غیرفعال، EXPIRED منقضی و LIMITED پایان سهمیه کلی است. اتصال به تاریخ معتبر و دسترسی هاست هم نیاز دارد.',
        'ACTIVE 为启用，DISABLED 为停用，EXPIRED 为过期，LIMITED 为总配额耗尽。连接还需要有效期限和主机访问权限。'
    ],
    expireAt: [
        'Дата и время окончания подписки. Укажите будущую дату для действующей подписки и учитывайте часовой пояс, показанный в форме.',
        'Subscription expiry date and time. Choose a future date for a valid subscription and use the time zone shown in the form.',
        'تاریخ و ساعت پایان اشتراک؛ برای اشتراک فعال تاریخ آینده و منطقه زمانی فرم را در نظر بگیرید.',
        '订阅到期日期和时间。有效订阅应选择未来日期，并注意表单显示的时区。'
    ],
    trafficLimitStrategy: [
        'Период сброса общей квоты пользователя: без сброса, день, неделя, календарный месяц или скользящий месяц. Периоды хостов и тегов задаются в их настройках.',
        'Overall user quota reset strategy: no reset, day, week, calendar month or rolling month. Host and tag periods are configured in their own settings.',
        'دوره بازنشانی سهمیه کلی: بدون بازنشانی، روز، هفته، ماه تقویمی یا ماه شناور. دوره هاست و تگ جدا تنظیم می‌شود.',
        '用户总配额重置方式：不重置、每日、每周、自然月或滚动月。主机和标签的周期单独设置。'
    ],
    activeInternalSquads: [
        'Внутренние сквады, предоставляющие пользователю доступ к выбранным inbound. Можно назначить несколько сквадов.',
        'Internal squads granting the user access to selected inbounds. Multiple squads can be assigned.',
        'اسکوادهای داخلی که دسترسی به ورودی‌ها می‌دهند؛ چند اسکواد قابل انتخاب است.',
        '授予用户访问所选入站的小组，可分配多个内部小组。'
    ],
    externalSquadUuid: [
        'Внешний сквад с отдельными настройками выдачи подписки. Выберите группу, если пользователю нужны её шаблон или страница подписки.',
        'External squad with its own subscription delivery settings. Select it when the user needs that group’s template or subscription page.',
        'اسکواد خارجی با تنظیمات ارائه اشتراک؛ برای قالب یا صفحه ویژه آن گروه انتخاب کنید.',
        '具有独立订阅输出设置的外部小组，需要该小组的模板或订阅页面时选择。'
    ],
    activePluginUuid: [
        'Конфигурация плагина, назначаемая пользователю. Проверьте, что её исполнитель настроен на нужных нодах.',
        'Plugin configuration assigned to the user. Check that its executor is configured on the required nodes.',
        'پیکربندی پلاگین کاربر؛ اجرای آن باید روی نودهای مورد نظر تنظیم شده باشد.',
        '分配给用户的插件配置，需确认相应执行组件已在目标节点配置。'
    ],
    'hwidSettings.fallbackDeviceLimit': [
        'Лимит устройств для пользователей без собственного лимита. Например, 3 разрешает зарегистрировать до трёх устройств; 0 снимает ограничение количества.',
        'Device limit for users without an individual limit. For example, 3 allows up to three registered devices; 0 removes the count limit.',
        'سقف دستگاه کاربران بدون محدودیت فردی؛ 3 تا سه دستگاه و 0 بدون سقف تعداد است.',
        '未设置个人设备限制时使用的数量上限；3 表示最多三个设备，0 表示不限制数量。'
    ],
    'hwidSettings.maxDevicesAnnounce': [
        'Сообщение о количестве устройств, передаваемое совместимому приложению вместе с подпиской. Пустое значение оставляет объявление не заданным.',
        'Device-count announcement sent to a compatible app with the subscription. An empty value leaves the announcement unset.',
        'پیام تعداد دستگاه همراه اشتراک برای برنامه سازگار؛ مقدار خالی پیام را تعیین نمی‌کند.',
        '随订阅发送给兼容应用的设备数量提示，留空表示不设置此提示。'
    ],
    isHidden: [
        'Скрывает хост из выдаваемой подписки. Для прекращения доступа по уже выданным ключам используйте отключение хоста или блокировку трафика.',
        'Hides the host from subscription output. Use host disabling or a traffic block to stop access using previously issued credentials.',
        'هاست را از خروجی اشتراک پنهان می‌کند؛ برای قطع دسترسی کلیدهای قبلی از غیرفعال‌سازی یا مسدودسازی ترافیک استفاده کنید.',
        '从订阅输出中隐藏主机；若要停止已发放凭据的访问，请停用主机或阻止流量。'
    ],
    alwaysAvailable: [
        'Разрешает выдавать этот хост при завершённой или отключённой подписке. Подходит для резервного подключения; ограничения самого хоста проверяются отдельно.',
        'Allows this host to be delivered for an expired or disabled subscription. Useful for a fallback connection; the host’s own restrictions are checked separately.',
        'ارائه این هاست برای اشتراک منقضی یا غیرفعال را مجاز می‌کند؛ محدودیت خود هاست جدا بررسی می‌شود.',
        '允许向已过期或停用的订阅输出该主机，可用于备用连接；主机自身限制仍单独检查。'
    ],
    onlyWhenInactive: [
        'Выдаёт хост только при неактивной подписке. Сначала включите «Всегда доступен»; при активной подписке этот хост будет скрыт.',
        'Delivers the host only for inactive subscriptions. Enable “Always available” first; active subscriptions will not show this host.',
        'هاست فقط برای اشتراک غیرفعال ارائه می‌شود؛ ابتدا «همیشه در دسترس» را فعال کنید.',
        '仅为非活跃订阅输出主机，需先启用“始终可用”；活跃订阅不显示此主机。'
    ],
    keepSniBlank: [
        'Оставляет SNI пустым при формировании клиентской конфигурации вместо автоматической подстановки. Используйте, когда это требуется настройкой транспорта.',
        'Keeps SNI empty in the generated client configuration instead of filling it automatically. Use when required by the transport configuration.',
        'SNI خروجی کلاینت را به‌جای پرکردن خودکار خالی نگه می‌دارد؛ مطابق نیاز انتقال انتخاب کنید.',
        '生成客户端配置时保持 SNI 为空，不自动填充；按传输配置需要启用。'
    ],
    overrideSniFromAddress: [
        'Использует адрес хоста как SNI в клиентской конфигурации. Адрес должен подходить для TLS/REALITY этого подключения.',
        'Uses the host address as SNI in client configuration. The address must suit the connection’s TLS/REALITY settings.',
        'نشانی هاست را به‌عنوان SNI کلاینت استفاده می‌کند؛ باید با TLS/REALITY سازگار باشد.',
        '将主机地址用作客户端 SNI，地址必须符合连接的 TLS/REALITY 设置。'
    ],
    userTrafficLimitBytes: [
        'Квота одного пользователя на этом хосте или теге. В форме хоста вводится в GiB, хранится в байтах. Значение 0 снимает эту квоту.',
        'Quota per user for this host or tag. The host form accepts GiB and stores bytes. Zero removes this quota.',
        'سهمیه هر کاربر روی هاست یا تگ؛ فرم هاست GiB می‌گیرد و بایت ذخیره می‌کند. 0 این سهمیه را حذف می‌کند.',
        '此主机或标签的个人流量配额；主机表单按 GiB 输入、按字节存储，0 表示不限制此配额。'
    ],
    serverSpeedLimitMbps: [
        'Скорость одного пользователя на хосте, общая для его устройств и соединений. Единица — Мбит/с; 0 означает отсутствие этого ограничения.',
        'Per-user host bandwidth shared by that user’s devices and connections. Measured in Mbps; zero removes this restriction.',
        'سرعت هر کاربر هاست، مشترک بین دستگاه‌ها و اتصال‌های او، بر حسب Mbps؛ 0 بدون این محدودیت است.',
        '主机上的单用户带宽，由该用户所有设备和连接共享；单位 Mbps，0 表示不设置此限制。'
    ],
    totalSpeedLimitMbps: [
        'Общий предел скорости хоста или тега для всех пользователей. Если указано 100 Мбит/с, этот объём делят одновременно работающие подключения.',
        'Total host or tag bandwidth shared by all users. A 100 Mbps limit is shared between concurrent connections.',
        'سقف سرعت کلی هاست یا تگ برای همه کاربران؛ 100 Mbps بین اتصال‌های هم‌زمان تقسیم می‌شود.',
        '所有用户共享的主机或标签总带宽；100 Mbps 上限由同时运行的连接共同使用。'
    ],
    trafficMultiplier: [
        'Множитель расхода: при коэффициенте 2 передача 1 GiB учитывается как 2 GiB. Пустое значение хоста использует наследование от тегов.',
        'Usage multiplier: with a value of 2, transferring 1 GiB counts as 2 GiB. An empty host value inherits from tags.',
        'ضریب مصرف؛ با 2، انتقال 1 GiB برابر 2 GiB حساب می‌شود. مقدار خالی هاست از تگ ارث می‌گیرد.',
        '流量统计倍率：设为 2 时，传输 1 GiB 按 2 GiB 计入；主机留空时从标签继承。'
    ],
    trafficLimitResetValue: [
        'Количество дней или месяцев между сбросами расхода этой квоты. Единицу выберите рядом с числом. Значение 0 отключает автоматический сброс.',
        'Number of days or months between usage resets for this quota. Select the unit beside the value. Zero disables automatic resets.',
        'تعداد روز یا ماه بین بازنشانی مصرف این سهمیه؛ واحد را کنار عدد انتخاب کنید. 0 بازنشانی خودکار را خاموش می‌کند.',
        '此配额用量重置之间的天数或月数，需同时选择单位；0 表示不自动重置。'
    ],
    trafficResetDay: [
        'День месяца для сброса месячного счётчика трафика ноды. Этот параметр относится к учёту сервера.',
        'Day of the month for resetting the node’s monthly traffic counter. This setting applies to server accounting.',
        'روز ماه برای بازنشانی شمارنده ماهانه ترافیک نود؛ مربوط به حساب مصرف سرور است.',
        '重置节点月度流量计数器的日期，用于服务器用量统计。'
    ],
    useTagTrafficLimit: [
        'Включает расход этого хоста в общую квоту пользователя по тегу. При выключении собственная квота хоста продолжает действовать.',
        'Includes this host’s usage in the user’s shared tag quota. The host’s own quota still applies when disabled.',
        'مصرف این هاست را در سهمیه مشترک تگ کاربر وارد می‌کند؛ با خاموشی سهمیه خود هاست باقی می‌ماند.',
        '将主机用量计入用户的共享标签配额；关闭时主机自身配额仍有效。'
    ],
    useTagSpeedLimit: [
        'Применяет скорость пользователя из настроек тега к этому хосту. На каждом участвующем хосте предел действует отдельно.',
        'Applies the tag’s per-user bandwidth limit to this host. Each participating host applies the limit separately.',
        'سقف سرعت فردی تگ را روی این هاست اعمال می‌کند؛ سقف هر هاست جداست.',
        '将标签的个人速度上限应用到该主机，每个参与主机分别执行此限制。'
    ],
    useTagTotalSpeedLimit: [
        'Включает хост в общий предел скорости тега, разделяемый участвующими подключениями.',
        'Includes the host in the tag’s total bandwidth limit, shared by participating connections.',
        'هاست را در سقف سرعت کلی تگ، مشترک بین اتصال‌های شرکت‌کننده، وارد می‌کند.',
        '让主机参与标签的总带宽上限，由参与的连接共同使用。'
    ],
    shuffleHost: [
        'Перемешивает этот хост вместе с другими хостами с такой же опцией при выдаче подписки.',
        'Shuffles this host with other hosts that have the same option when generating a subscription.',
        'هنگام ارائه اشتراک این هاست با هاست‌های دارای همین گزینه جابه‌جا می‌شود.',
        '生成订阅时将该主机与其他启用此选项的主机一起随机排序。'
    ],
    randomizeHosts: [
        'Включает случайный порядок хостов в выдаваемой подписке. При следующем обновлении порядок может измениться.',
        'Enables random host ordering in subscription output. The order can change on the next refresh.',
        'ترتیب تصادفی هاست‌ها در خروجی اشتراک؛ در به‌روزرسانی بعدی ممکن است تغییر کند.',
        '在订阅输出中随机排列主机，下次更新时顺序可能改变。'
    ],
    serveJsonAtBaseSubscription: [
        'Выбирает JSON для базового адреса подписки. Проверьте результат в приложении, которое будет импортировать этот адрес.',
        'Selects JSON output for the base subscription URL. Check it in the application that will import that URL.',
        'خروجی JSON را برای آدرس پایه اشتراک انتخاب می‌کند؛ در برنامه واردکننده آزمایش کنید.',
        '为基础订阅地址选择 JSON 输出，请在实际导入该地址的应用中验证。'
    ],
    isShowCustomRemarks: [
        'Показывает настроенные сообщения о состоянии подписки, например об истёкшем сроке или исчерпанной квоте.',
        'Shows configured subscription status messages, such as expiry or exhausted quota notices.',
        'پیام‌های تنظیم‌شده وضعیت اشتراک، مانند انقضا یا پایان سهمیه، را نمایش می‌دهد.',
        '显示已配置的订阅状态提示，例如到期或配额耗尽。'
    ],
    keepSquads: [
        'Восстанавливает принадлежность к внутренним сквадам по именам из файла. На новой панели должны существовать сквады с такими именами; отсутствующие пропускаются.',
        'Restores internal squad membership by names from the file. Squads with those names must exist in the destination panel; missing squads are skipped.',
        'عضویت اسکواد داخلی را با نام‌های فایل بازمی‌گرداند؛ اسکواد باید در پنل مقصد موجود باشد و نام‌های مفقود رد می‌شوند.',
        '按文件中的名称恢复内部小组成员关系；目标面板需存在同名小组，缺失的小组会跳过。'
    ],
    proxyUrl: [
        'SOCKS-прокси для управляющих запросов панели к этой ноде, например socks5://user:pass@proxy.example.com:1080. Пустое поле означает прямое соединение. Это не прокси для трафика пользователей; реквизиты внутри URL храните как секрет.',
        'SOCKS proxy for panel control requests to this node, for example socks5://user:pass@proxy.example.com:1080. Leave empty for a direct connection. This does not proxy user traffic; keep embedded credentials private.',
        'پروکسی SOCKS برای درخواست‌های مدیریتی پنل به این نود، مانند socks5://user:pass@proxy.example.com:1080. فیلد خالی یعنی اتصال مستقیم. این تنظیم ترافیک کاربران را پروکسی نمی‌کند؛ اطلاعات ورود داخل URL محرمانه است.',
        '用于面板向此节点发送管理请求的 SOCKS 代理，例如 socks5://user:pass@proxy.example.com:1080。留空表示直接连接，不代理用户流量；请妥善保管 URL 中的凭据。'
    ],
    'passkeySettings.origin': [
        'Полный HTTPS-адрес панели для проверки WebAuthn, например https://panel.example.com. Он должен совпадать с адресом, открытым в браузере.',
        'Full HTTPS panel origin for WebAuthn, for example https://panel.example.com. It must match the origin opened in the browser.',
        'آدرس کامل HTTPS پنل برای WebAuthn، مانند https://panel.example.com؛ باید با مبدأ مرورگر یکسان باشد.',
        'WebAuthn 使用的面板完整 HTTPS 源，例如 https://panel.example.com，须与浏览器打开的源一致。'
    ],
    'passkeySettings.rpId': [
        'Домен панели для passkey без https:// и пути, например panel.example.com. Настраивайте вместе с origin.',
        'Passkey relying-party domain without https:// or a path, for example panel.example.com. Configure it together with origin.',
        'دامنه passkey بدون https:// و مسیر، مانند panel.example.com؛ همراه origin تنظیم کنید.',
        'Passkey 的依赖方域名，不含 https:// 或路径，例如 panel.example.com，与 origin 配套设置。'
    ],
    'brandingSettings.title': [
        'Название на странице подписки. Проверьте его в выбранной конфигурации страницы.',
        'Name displayed on the subscription page. Check it in the chosen page configuration.',
        'نام نمایش‌داده‌شده در صفحه اشتراک؛ در پیکربندی صفحه بررسی کنید.',
        '订阅页面显示的名称，请在所选页面配置中检查。'
    ],
    'brandingSettings.logoUrl': [
        'Адрес изображения логотипа страницы подписки. Изображение должно открываться у пользователя без входа в административную панель.',
        'Subscription page logo image URL. The user must be able to load the image without signing into the administration panel.',
        'آدرس تصویر لوگوی صفحه اشتراک؛ کاربر باید بدون ورود به پنل مدیریت آن را باز کند.',
        '订阅页面徽标图片地址，用户应能在未登录管理面板时加载。'
    ],
    'brandingSettings.supportUrl': [
        'Ссылка поддержки на странице подписки. Укажите действующий адрес службы, к которой должны обращаться ваши пользователи.',
        'Support link on the subscription page. Enter the working address of the support service for your users.',
        'پیوند پشتیبانی صفحه اشتراک؛ آدرس فعال پشتیبانی کاربران را وارد کنید.',
        '订阅页面的支持链接，请填写用户可联系的有效支持地址。'
    ],
    'baseSettings.metaTitle': [
        'Название страницы подписки во вкладке браузера и при отправке ссылки.',
        'Subscription page title used in browser tabs and shared link previews.',
        'عنوان صفحه اشتراک در زبانه مرورگر و پیش‌نمایش پیوند.',
        '订阅页面在浏览器标签和分享链接预览中的标题。'
    ],
    'baseSettings.metaDescription': [
        'Краткое описание страницы подписки для предпросмотра ссылки.',
        'Short description of the subscription page used in link previews.',
        'توضیح کوتاه صفحه اشتراک برای پیش‌نمایش پیوند.',
        '分享链接预览中使用的订阅页面简短说明。'
    ],
    'baseSettings.hideGetLinkButton': [
        'Скрывает кнопку получения ссылки на странице подписки. Сама ссылка и настройки доступа пользователя сохраняются.',
        'Hides the get-link button on the subscription page. The subscription URL and user access settings remain.',
        'دکمه دریافت پیوند صفحه اشتراک را پنهان می‌کند؛ آدرس و تنظیمات دسترسی باقی می‌مانند.',
        '隐藏订阅页面的获取链接按钮，订阅地址和用户访问设置仍保留。'
    ],
    'baseSettings.showConnectionKeys': [
        'Показывает отдельные ключи подключения на странице подписки. Пользователь сможет копировать их для ручного импорта.',
        'Shows individual connection keys on the subscription page so the user can copy them for manual import.',
        'کلیدهای اتصال را در صفحه اشتراک برای کپی و واردکردن دستی نشان می‌دهد.',
        '在订阅页面显示单独的连接凭据，便于用户复制并手动导入。'
    ],
    'uiConfig.installationGuidesBlockType': [
        'Вариант отображения инструкций установки приложений на странице подписки.',
        'Display style for application installation instructions on the subscription page.',
        'سبک نمایش راهنمای نصب برنامه‌ها در صفحه اشتراک.',
        '订阅页面上应用安装说明的展示方式。'
    ],
    'uiConfig.subscriptionInfoBlockType': [
        'Вариант отображения сведений о подписке: срока, состояния и расхода.',
        'Display style for subscription details such as expiry, status and usage.',
        'سبک نمایش جزئیات اشتراک مانند انقضا، وضعیت و مصرف.',
        '订阅期限、状态和用量等信息的展示方式。'
    ]
}
