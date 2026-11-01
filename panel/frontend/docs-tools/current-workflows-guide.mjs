const languages = ['ru', 'en', 'fa', 'zh']

// Keep scope and units identical in all four operator guides.
const sections = [
    ["subscription-settings","subscriptions-cdn-gateway",[["CDN без подмены ссылок","Панель и страница 1.1.7.79 автоматически добавляют /cdn/<ID> в CDN-ссылку пользователя и ссылки геофайлов, контрольных сумм и устройств. Это работает при Host основного сайта на источнике. В «Настроить CDN» можно преобразовать старую HTTPS-ссылку или ключ локально в браузере и скопировать результат; там же указаны источник HTTPS, Host и SNI для VK. Не добавляйте отдельный путь в адрес источника и не включайте принудительное кэширование персональных ответов. В карточке пользователя выберите CDN, сохраните и скопируйте новую ссылку. Старые ссылки работают, но для распознавания CDN с подменой Host URL нужно заменить один раз. ID выбирает только зарегистрированный публичный CDN, не отменяет статус, заморозку, срок, ключ и HWID и не раскрывает адрес панели. .env продолжает хранить основной адрес без CDN-префикса."],["CDN links through an origin Host rewrite","Panel and page 1.1.7.79 automatically add /cdn/<ID> to CDN user URLs, geofiles, checksums and device URLs. This works when the CDN sends the main site’s Host to the origin. Use Set up CDN to convert an old HTTPS URL or key locally in the browser and copy the result; it also shows the HTTPS origin, Host and SNI for VK. Do not add an extra origin path or force caching of personalized responses. Select the CDN in a user card, save and copy the new URL. Old links still work, but replace the URL once for CDN identification through a Host rewrite. The ID selects only a registered public CDN and does not bypass status, freeze, expiry, keys or HWID or expose the panel address. .env keeps the main address without the CDN prefix."],["نشانی CDN هنگام تغییر Host","پنل و صفحه 1.1.7.79 مسیر /cdn/<ID> را خودکار به نشانی CDN کاربر، فایل‌های جغرافیایی، checksum و دستگاه‌ها اضافه می‌کنند. تغییر Host به دامنه اصلی مانع تشخیص نمی‌شود. در تنظیم CDN، نشانی HTTPS قدیمی یا کلید را فقط در مرورگر تبدیل و نتیجه را کپی کنید؛ مبدأ HTTPS و Host و SNI برای VK نیز نمایش داده می‌شود. مسیر اضافی به مبدأ اضافه نکنید و کش اجباری پاسخ شخصی را روشن نکنید. دامنه CDN را در کارت کاربر انتخاب و ذخیره کنید و نشانی جدید را کپی کنید. نشانی قدیمی کار می‌کند، اما برای تشخیص CDN با تغییر Host باید یک بار جایگزین شود. شناسه فقط CDN عمومی ثبت‌شده را انتخاب می‌کند و وضعیت، انجماد، انقضا، کلید و HWID را دور نمی‌زند و نشانی پنل را آشکار نمی‌کند. فایل .env همچنان نشانی اصلی بدون پیشوند CDN را نگه می‌دارد."],["CDN 改写 Host 时的链接","面板和订阅页 1.1.7.79 会自动向 CDN 用户链接、地理文件、校验和及设备链接添加 /cdn/<ID>，因此 CDN 使用主站 Host 回源时也能识别。打开“配置 CDN”，在浏览器本地转换旧 HTTPS 链接或密钥并复制结果；窗口也显示 VK 所需的 HTTPS 源站、Host 和 SNI。无需额外添加源站路径，请勿强制缓存个性化响应。在用户卡片选择 CDN、保存并复制新链接。旧链接仍有效，但要在 Host 改写时识别 CDN，需更换一次链接。ID 仅选择已注册的公开 CDN，不绕过状态、冻结、有效期、密钥或 HWID 检查，也不泄露面板地址。.env 保留不带 CDN 前缀的主地址。"]]],
    ["subscription-settings","subscriptions-domain-environment",[["Домен подписки и .env","Основной домен и SUB_PUBLIC_DOMAIN синхронизируются в обе стороны через локальную службу установщика. Изменение .env проверяется при запуске API, открытии списка и каждые 30 секунд; изменение основного адреса в панели сохраняется в .env и зарегистрированном Compose без перезапуска. Поддерживаются имя домена, HTTPS URL и безопасный путь. CDN-домены хранятся в реестре. Для исправленного API списка доменов нужна панель 1.1.7.78 или новее. Нужен установщик 1.2.113 или новее; без службы выводится статус недоступности, а не ложное подтверждение. Параллельная правка файла отклоняет запись. DNS и сертификат настраиваются отдельно."],["Subscription domain and .env","The primary domain and SUB_PUBLIC_DOMAIN are synchronized both ways through the local installer service. The API checks .env at startup, when opening the list and every 30 seconds. Changing the primary address in the panel updates .env and the registered Compose without a restart. A hostname, HTTPS URL and safe path are supported. CDN domains remain in the registry. The domain list API requires panel 1.1.7.78 or later to avoid the authentication dependency error. Installer 1.2.113 or later is required; a missing service shows an unavailable status rather than a false confirmation. Concurrent file changes prevent overwrites. Configure DNS and certificates separately."],["دامنه اشتراک و .env","دامنه اصلی و SUB_PUBLIC_DOMAIN از طریق سرویس محلی نصاب دوطرفه همگام می‌شوند. API هنگام شروع، بازکردن فهرست و هر 30 ثانیه .env را بررسی می‌کند. تغییر دامنه اصلی در پنل، .env و Compose ثبت‌شده را بدون راه‌اندازی مجدد به‌روز می‌کند. نام دامنه، نشانی HTTPS و مسیر امن پشتیبانی می‌شوند. دامنه‌های CDN در رجیستری می‌مانند. برای رفع خطای وابستگی احراز هویت فهرست دامنه‌ها، پنل 1.1.7.78 یا جدیدتر لازم است. نصاب 1.2.113 یا جدیدتر لازم است؛ نبود سرویس با وضعیت عدم دسترسی نشان داده می‌شود. تغییر هم‌زمان فایل از بازنویسی جلوگیری می‌کند. DNS و گواهی جداگانه تنظیم می‌شوند."],["订阅域名与 .env","主域名与 SUB_PUBLIC_DOMAIN 通过本地安装服务双向同步。API 在启动、打开列表时及每 30 秒检查 .env。在面板更改主地址会更新 .env 和已注册的 Compose，无需重启。支持域名、HTTPS URL 和安全路径。CDN 域名仍保存在注册表中。域名列表 API 的身份验证依赖错误已在面板 1.1.7.78 修复，请使用该版本或更新版本。需要安装程序 1.2.113 或更新版本；服务缺失时显示不可用状态，不会虚假确认。文件被并发修改时拒绝覆盖。DNS 和证书需单独配置。"]]],
    [
        'architecture', 'architecture-node-continuity', [
            ['Ноды при отключении панели', 'Нода с подтверждённой автономной политикой продолжает обслуживать сохранённые ключи без панели, включая XHTTP через CDN напрямую на ноду. Локально сохраняются срок доступа, квоты, скорость и правила. Исчерпание резерва или срока по-прежнему закрывает доступ. Новые пользователи, продления и блокировки доходят после восстановления связи. Перед остановкой приложений установщик проверяет автономность нод. При неподтверждённой готовности он предупреждает и продолжает обновление; дополнительный флаг не нужен. Зависимые от панели ноды могут временно потерять связь. Старая политика без локальных резервов истекает через 90 секунд: её срок нельзя просто отключить. Вручную выполненный docker compose down обходит проверку; он также остановит ноду или прокси, если они входят в тот же проект.'],
            ['Nodes while the panel is offline', 'A node with a confirmed autonomous policy continues serving saved keys without the panel, including XHTTP through a CDN pointing directly at the node. Access expiry, quotas, speeds and rules remain enforced locally. Exhausted credit or expiry still denies access. New users, renewals and blocks arrive after reconnection. Before stopping applications, the installer checks node autonomy. Unconfirmed readiness produces a warning and the update continues without an extra flag. Panel-dependent nodes may temporarily lose connectivity. Legacy policy without local reserves expires after 90 seconds; simply disabling that deadline is unsafe. Manual docker compose down bypasses the check and also stops a node or proxy in the same project.'],
            ['نودها هنگام قطع پنل', 'نود با سیاست مستقل تأییدشده، کلیدهای ذخیره‌شده را بدون پنل سرویس می‌دهد؛ از جمله XHTTP با CDN مستقیم به نود. انقضا، سهمیه، سرعت و قواعد محلی حفظ می‌شوند. پایان اعتبار یا سهمیه همچنان دسترسی را می‌بندد. کاربران جدید، تمدیدها و مسدودسازی‌ها پس از اتصال مجدد می‌رسند. نصاب پیش از توقف برنامه‌ها استقلال نودها را بررسی می‌کند. در نبود تأیید، هشدار می‌دهد و به‌روزرسانی بدون گزینه اضافی ادامه می‌یابد. نودهای وابسته به پنل ممکن است موقتاً قطع شوند. سیاست قدیمی بدون ذخیره محلی پس از 90 ثانیه منقضی می‌شود و حذف این مهلت امن نیست. اجرای دستی docker compose down بررسی را دور می‌زند و نود یا پروکسی همان پروژه را نیز متوقف می‌کند.'],
            ['面板离线时的节点', '已确认自主策略的节点可在面板离线时继续使用已保存的密钥，包括 CDN 直连节点的 XHTTP。访问期限、配额、限速和规则仍在本地执行；额度耗尽或到期仍会拒绝访问。新用户、续期和封禁在恢复连接后同步。安装程序在停止应用前检查节点自主性。未确认就绪时会警告并继续更新，无需额外参数。依赖面板的节点可能暂时断连。没有本地配额的旧策略会在 90 秒后到期，不能简单取消此期限。手动执行 docker compose down 会绕过检查，也会停止同一项目中的节点或代理。']
        ]
    ],
    [
        'hosts',
        'hosts-device-speed',
        [
            [
                'Динамическая скорость устройств',
                'Лимит скорости пользователя в Mbps — общий потолок всех его соединений на этом хосте. Активные ключи устройств делят его по объёму переданных данных: одно устройство использует свободную скорость, при появлении другого канал перераспределяется; неактивным устройствам доля не резервируется. Отдельный лимит устройства ограничивает все соединения его приватного ключа, включая загрузку и отдачу. При 20 Mbps на пользователя и 15 Mbps на устройство одно активное устройство получит до 15 Mbps; два загружающих устройства смогут делить 20 Mbps, примерно по 10 Mbps при постоянном спросе. Это верхние пределы, а не гарантия скорости сети. Общий лимит хоста или тега делится сначала между пользователями, затем между их устройствами; число потоков не увеличивает долю. Без заданного общего предела физическая ёмкость канала неизвестна ядру.'
            ],
            [
                'Dynamic device bandwidth',
                'The user speed in Mbps is a shared ceiling for all their connections on this host. Active device keys share it by bytes served: one device uses available capacity; when another sends traffic, capacity is redistributed. Idle devices reserve nothing. The device speed limit caps all connections of its private key, combining upload and download. With a 20 Mbps user ceiling and a 15 Mbps device ceiling, one active device gets up to 15 Mbps; two continuously demanding devices can share 20 Mbps, roughly 10 Mbps each. These are ceilings, not guaranteed network rates. A configured host or tag shared ceiling is divided first among users, then their devices; opening more flows does not increase the share. Without a configured shared ceiling the core does not know the physical channel capacity.'
            ],
            [
                'تقسیم پویای سرعت دستگاه‌ها',
                'سرعت کاربر با Mbps سقف مشترک همه اتصال‌های او در این میزبان است. کلیدهای فعال بر پایه بایت‌های انتقال‌یافته سهم می‌گیرند؛ یک دستگاه از ظرفیت آزاد استفاده می‌کند و با شروع ترافیک دستگاه دیگر، سهم‌ها تغییر می‌کنند. دستگاه بیکار ظرفیتی رزرو نمی‌کند. سقف دستگاه همه اتصال‌های کلید خصوصی آن را برای ارسال و دریافت محدود می‌کند. با سقف کاربر 20 Mbps و دستگاه 15 Mbps، یک دستگاه تا 15 Mbps می‌گیرد؛ دو دستگاه پرمصرف می‌توانند 20 Mbps را تقریباً نصف کنند. این سقف است، نه تضمین سرعت شبکه. سقف مشترک میزبان یا برچسب ابتدا بین کاربران و سپس دستگاه‌هایشان تقسیم می‌شود؛ افزایش تعداد اتصال سهم را زیاد نمی‌کند. بدون سقف مشترک، ظرفیت فیزیکی کانال برای هسته معلوم نیست.'
            ],
            [
                '设备动态带宽',
                '以 Mbps 设置的用户速度是此主机上该用户所有连接的共享上限。活跃设备密钥按已服务字节数共享带宽：单个设备使用空闲容量，其他设备产生流量时会重新分配；空闲设备不预留份额。设备上限合计限制其私钥的全部上传和下载连接。若用户上限为 20 Mbps、设备上限为 15 Mbps，一个设备最多使用 15 Mbps；两个持续传输的设备可共享 20 Mbps，约各 10 Mbps。这些是上限，而非网络速率保证。主机或标签的共享上限先在用户间分配，再在用户设备间分配；增加连接数不会增加份额。未配置共享上限时，核心无法知道物理信道容量。'
            ]
        ]
    ],
    [
        'host-tags',
        'host-tags-device-speed',
        [
            [
                'Лимит устройства из тега',
                'Лимит устройства из тега применяется отдельно на каждом хосте с включённым переключателем «Учитывать скорость на устройство из тегов». Он независим от квоты тега, скорости пользователя и общей скорости. Самый строгий из действующих пределов ограничивает передачу; 0 отключает только соответствующий предел. Нужны обновлённые нода и ядро с поддержкой remnacust-device-speed-v1. Несовместимая нода не может подтвердить новый лимит. При нескольких нодах предел консервативно делится между привязками, чтобы сумма не превысила настройку; это не перенос свободной скорости между нодами. HWID используется для выдачи отдельного приватного ключа. Копии одного ключа считаются одним устройством; приложение без отдельного ключа не позволяет различать физические устройства. Правила остаются на ноде при недоступной панели.'
            ],
            [
                'Device speed from tags',
                'A tag device ceiling applies independently on each host with “Apply device speed limit from tags” enabled. It is independent of tag quota, user speed and shared speed. The strictest applicable ceiling wins; 0 disables only the corresponding ceiling. Update node and core to support remnacust-device-speed-v1. An incompatible node cannot confirm the new limit. Across multiple bound nodes, the configured ceiling is conservatively divided so their sum cannot exceed it; spare capacity is not transferred between nodes. HWID enrolls a distinct private key. Copies of one key count as one device; applications without distinct keys cannot identify physical devices separately. Local rules remain active while the panel is unavailable.'
            ],
            [
                'سرعت دستگاه از برچسب',
                'سقف دستگاه برچسب جداگانه روی هر میزبان با کلید مربوط فعال اعمال می‌شود؛ از سهمیه، سرعت کاربر و سرعت مشترک مستقل است. سخت‌گیرانه‌ترین سقف اعمال می‌شود؛ 0 فقط همان سقف را حذف می‌کند. نود و هسته باید از remnacust-device-speed-v1 پشتیبانی کنند؛ نود ناسازگار محدودیت جدید را تأیید نمی‌کند. در چند نود متصل، سقف محافظه‌کارانه تقسیم می‌شود تا مجموع از تنظیم بیشتر نشود؛ ظرفیت آزاد بین نودها جابه‌جا نمی‌شود. HWID کلید خصوصی جدا ثبت می‌کند. نسخه‌های یک کلید یک دستگاه‌اند؛ برنامه بدون کلید جدا امکان تشخیص دستگاه فیزیکی را نمی‌دهد. قوانین محلی هنگام قطعی پنل باقی می‌مانند.'
            ],
            [
                '标签设备限速',
                '启用对应开关后，标签的设备上限在各主机独立生效，与标签配额、用户速度和共享总速度相互独立。采用最严格的有效上限；0 仅关闭对应上限。节点和核心必须支持 remnacust-device-speed-v1；不兼容节点不能确认新限制。多个绑定节点间保守地分配上限，确保总和不超过设置值；空闲带宽不会跨节点转移。HWID 用于签发独立私钥。同一密钥的副本视为一个设备；没有独立密钥的应用无法区分物理设备。面板不可用时本地规则继续生效。'
            ]
        ]
    ],
    [
        'hosts',
        'hosts-user-speed',
        [
            [
                'Скорость одного пользователя',
                'В разделе «На каждого пользователя этого хоста» задайте квоту в GiB и скорость в Mbps. Это разные ограничения: квота задаёт объём, скорость — темп передачи. Все устройства и соединения одного пользователя на этом хосте делят скорость, включая загрузку и отдачу. При 2 Mbps два устройства получают суммарно до 2 Mbps, а другой пользователь имеет свой предел. На другом хосте действует его собственная настройка. 0 отключает только собственный предел; включённые ограничения тегов остаются. Ниже расположены общая скорость всех пользователей хоста и коэффициент учёта.'
            ],
            [
                'One user’s speed',
                'Under “For each user on this host”, set the quota in GiB and speed in Mbps. These are different limits: quota is a data allowance, speed is the transfer rate. All devices and connections of one user on this host share the speed, including upload and download. With 2 Mbps, two devices together get up to 2 Mbps; another user has a separate allowance. Another host uses its own setting. 0 disables only the host’s own cap; enabled tag restrictions remain. Shared speed for all host users and the accounting multiplier appear below.'
            ],
            [
                'سرعت یک کاربر',
                'در بخش «برای هر کاربر این میزبان»، سهمیه را با GiB و سرعت را با Mbps تنظیم کنید. سهمیه حجم داده است؛ سرعت نرخ انتقال است. همه دستگاه‌ها و اتصال‌های یک کاربر در این میزبان، ارسال و دریافت را در سقف مشترک دارند. با ۲ Mbps، دو دستگاه روی‌هم تا ۲ Mbps دارند؛ کاربر دیگر سقف جدا دارد. میزبان دیگر تنظیم خودش را دارد. صفر فقط سقف خود میزبان را غیرفعال می‌کند؛ محدودیت‌های فعال برچسب باقی می‌مانند. سرعت مشترک همه کاربران میزبان و ضریب محاسبه در بخش بعدی هستند.'
            ],
            [
                '单个用户的速度',
                '在“此主机的每位用户”中，以 GiB 设置流量配额，以 Mbps 设置速度。配额限制数据总量，速度限制传输速率。同一用户在此主机上的全部设备与连接共享速度，上传和下载合计。设置 2 Mbps 时，两台设备合计最多 2 Mbps；其他用户拥有独立上限。另一主机使用自身设置。0 只关闭主机自己的限制，已启用的标签限制仍然生效。下方分别设置所有用户共享的主机总速度和计费倍率。'
            ]
        ]
    ],
    [
        'host-tags',
        'host-tags-speed-units',
        [
            [
                'Скорость по тегу',
                'Скорость пользователя от тега задаёт одинаковый предел отдельно на каждом участвующем хосте. Общая скорость группы — отдельный пул для всего участвующего трафика. В хосте независимо включаются квота тега, скорость пользователя и общая скорость. При нескольких действующих ограничениях применяется более строгий предел. 0 означает отсутствие соответствующего ограничения, а не запрет передачи. Mbps уже означает мегабиты в секунду; 8 Mbps — приблизительно 1 MB/s до накладных расходов.'
            ],
            [
                'Speed by tag',
                'A tag’s user speed sets the same cap separately on each participating host. Shared group speed is a separate pool for all participating traffic. Each host independently enables the tag quota, user speed and shared speed. When several restrictions apply, the stricter cap wins. 0 means no corresponding cap, not blocked traffic. Mbps already means megabits per second; 8 Mbps is approximately 1 MB/s before overhead.'
            ],
            [
                'سرعت بر اساس برچسب',
                'سرعت کاربر از برچسب، سقف یکسانی را جداگانه روی هر میزبان مشارکت‌کننده اعمال می‌کند. سرعت مشترک گروه، بودجه جداگانه همه ترافیک مشارکت‌کننده است. سهمیه، سرعت کاربر و سرعت مشترک برچسب در هر میزبان مستقل فعال می‌شوند. محدودیت سخت‌گیرانه‌تر اعمال می‌شود. صفر یعنی نبود محدودیت مربوط، نه مسدود بودن ترافیک. Mbps خود به معنی مگابیت بر ثانیه است؛ ۸ Mbps پیش از سربار تقریباً ۱ مگابایت بر ثانیه است.'
            ],
            [
                '按标签限速',
                '标签的用户速度在每个参与主机上分别施加相同上限。分组共享总速度是所有参与流量共用的另一个速度池。每个主机独立启用标签配额、用户速度和共享总速度。多个限制同时生效时采用更严格的上限。0 表示没有对应限制，而非阻止流量。Mbps 已表示每秒兆比特；不计开销，8 Mbps 约为 1 MB/s。'
            ]
        ]
    ],
    [
        'limits',
        'limits-offline-reserves',
        [
            [
                'При недоступной панели',
                'На совместимых нодах используются заранее выданные локальные резервы квоты. При недоступной панели подключение работает в пределах уже выданного остатка; новый резерв требует связи. После исчерпания резерв не становится безлимитным. Сброс применяется сразу к доступным нодам, остальные получают его при подключении. Пока недоступная нода расходует старый резерв, общий расход может временно превышать новую квоту. Скорость и остальные локальные правила продолжают действовать.'
            ],
            [
                'When the panel is unavailable',
                'Compatible nodes use quota reserves allocated in advance. While the panel is unavailable, connections can use the remaining local reserve; a new reserve requires connectivity. Exhausting it does not grant unlimited access. A reset applies immediately to reachable nodes; others receive it when reconnecting. While an unreachable node spends its old reserve, total usage can temporarily exceed the new quota. Speed caps and other local rules remain active.'
            ],
            [
                'وقتی پنل در دسترس نیست',
                'نودهای سازگار از ذخیره سهمیه از پیش تخصیص‌یافته استفاده می‌کنند. هنگام قطعی پنل، اتصال تا باقی‌مانده ذخیره محلی کار می‌کند؛ ذخیره جدید به ارتباط نیاز دارد. پایان ذخیره دسترسی نامحدود نمی‌دهد. بازنشانی فوراً به نودهای در دسترس می‌رسد و بقیه پس از اتصال آن را می‌گیرند. مصرف ذخیره قدیمی نود قطع‌شده ممکن است موقتاً از سهمیه جدید بیشتر شود. سقف سرعت و قوانین محلی همچنان فعال هستند.'
            ],
            [
                '面板不可用时',
                '兼容节点使用预先分配的本地配额储备。面板不可用时，连接可继续使用剩余本地储备；申请新储备需要恢复连接。耗尽储备不会变为无限流量。重置立即应用到可访问节点，其他节点重新连接后接收重置。失联节点仍使用旧储备期间，总用量可能暂时超过新配额。限速和其他本地规则继续生效。'
            ]
        ]
    ],
    [
        'node-actions',
        'node-actions-live-ports',
        [
            [
                'Изменение работающего порта',
                'В плане портов каждой привязке назначаются порт, профиль и inbound. Совместимые изменения применяются через ядро с сохранением существующих соединений. Реальная смена порта, транспорта или несовместимых настроек занятого listener требует отдельного порта и тега либо явного перезапуска с возможным обрывом соединений. Сообщение об отказе не запускает скрытый перезапуск. Последняя техническая ошибка показывается в исходном виде. Обновление контейнера или бинарника ядра может прервать подключения.'
            ],
            [
                'Changing an active port',
                'Each port-plan binding selects a port, profile and inbound. Compatible changes are applied through the core while preserving existing connections. A real port, transport or incompatible active-listener change requires a separate port and tag, or an explicit restart that may interrupt connections. A rejection does not trigger a hidden restart. The original technical error is shown verbatim. Updating the container or core binary may interrupt connections.'
            ],
            [
                'تغییر پورت فعال',
                'هر اتصال در طرح پورت، یک پورت، پروفایل و inbound دارد. تغییرات سازگار از طریق هسته با حفظ اتصال‌های موجود اعمال می‌شوند. تغییر واقعی پورت، ترنسپورت یا تنظیم ناسازگار شنونده فعال، به پورت و تگ جدا یا راه‌اندازی دوباره صریح با احتمال قطع اتصال نیاز دارد. خطای رد شدن، راه‌اندازی پنهان انجام نمی‌دهد. آخرین خطای فنی عیناً نمایش داده می‌شود. به‌روزرسانی کانتینر یا باینری هسته ممکن است اتصال‌ها را قطع کند.'
            ],
            [
                '修改正在使用的端口',
                '端口计划的每个绑定选择端口、配置和 inbound。兼容修改通过内核应用，并保留现有连接。真正修改端口、传输方式或活动监听器的不兼容设置时，需要独立端口和标签，或明确执行可能中断连接的重启。拒绝应用不会暗中重启。最后一条技术错误按原文显示。更新容器或内核二进制文件可能中断连接。'
            ]
        ]
    ],
    [
        'architecture',
        'architecture-updates',
        [
            [
                'Обновление и его журнал',
                'Обновление панели показывает восемь этапов, прошедшее время и последние 24 события. Оценка оставшегося времени появляется только при наличии данных предыдущей операции; без них показаны оставшиеся этапы. Закрытие вкладки не отменяет обновление. Служба закрепляет свежий выпуск установщика до проверки и установки; более новая проверенная панель может заменить устаревшую версию из уведомления. После успешного обновления сохраняются текущий и предыдущий образы и образы контейнеров, а лишние образы компонентов очищаются. Docker socket панели не передаётся.'
            ],
            [
                'Update progress and logs',
                'Panel updates show eight stages, elapsed time and the last 24 events. Remaining time is estimated only when a previous operation supplies timing data; otherwise remaining stages are shown. Closing the tab does not cancel the update. The service pins a fresh installer release before checking and installing it; a newer verified panel may supersede an outdated notification target. Successful updates keep current, previous and container-used images while removing redundant component images. The panel does not receive the Docker socket.'
            ],
            [
                'پیشرفت و گزارش به‌روزرسانی',
                'به‌روزرسانی پنل هشت مرحله، زمان سپری‌شده و ۲۴ رویداد آخر را نشان می‌دهد. زمان باقی‌مانده فقط با داده زمانی عملیات قبلی تخمین زده می‌شود؛ وگرنه تعداد مراحل باقی‌مانده نمایش داده می‌شود. بستن زبانه عملیات را لغو نمی‌کند. سرویس پیش از بررسی و نصب، نسخه تازه نصب‌کننده را ثابت می‌کند؛ پنل تأییدشده جدیدتر می‌تواند جای هدف قدیمی اعلان را بگیرد. پس از موفقیت، تصویر جاری، قبلی و تصاویر مورد استفاده کانتینرها حفظ و تصاویر اضافی مؤلفه پاک می‌شوند. سوکت Docker در اختیار پنل قرار نمی‌گیرد.'
            ],
            [
                '更新进度与日志',
                '面板更新显示八个阶段、已用时间和最近 24 条事件。只有存在上次操作的计时数据时才估算剩余时间，否则显示剩余阶段数。关闭页面不会取消更新。服务在校验和安装前固定最新安装程序的版本；经过验证的新面板可取代过期通知中的目标版本。成功更新后保留当前、上一版本及容器正在使用的镜像，清理多余的组件镜像。面板不会获得 Docker 套接字。'
            ]
        ]
    ],
    [
        'sessions',
        'sessions-net-admin',
        [
            [
                'Права ноды',
                'Для получения IP активных соединений через Xray право NET_ADMIN не требуется. Оно используется дополнительными функциями Linux на ноде. Установщик отдельно спрашивает о нём при установке и обновлении ноды, если право не подтверждено в работающем контейнере. При уже действующем праве повторного вопроса нет. Для автоматизации добавьте --net-admin или --no-net-admin; одно наличие строки cap_add в старом Compose не подтверждает действующее право.'
            ],
            [
                'Node permissions',
                'Reading active-connection IPs through Xray does not require NET_ADMIN. Additional Linux features on the node use it. Node installation and updates ask about it separately when it cannot be confirmed in the running container. An already effective capability is kept without another prompt. For automation, use --net-admin or --no-net-admin; a cap_add entry in an old Compose file alone does not prove the capability is effective.'
            ],
            [
                'مجوزهای نود',
                'گرفتن IP اتصال‌های فعال از Xray به NET_ADMIN نیاز ندارد. قابلیت‌های اضافی لینوکس در نود از آن استفاده می‌کنند. هنگام نصب و به‌روزرسانی نود، اگر مجوز در کانتینر فعال تأیید نشود، نصب‌کننده جداگانه سؤال می‌کند. مجوز مؤثر بدون سؤال دوباره حفظ می‌شود. برای خودکارسازی --net-admin یا --no-net-admin را بدهید؛ وجود cap_add در Compose قدیمی به‌تنهایی مؤثر بودن مجوز را ثابت نمی‌کند.'
            ],
            [
                '节点权限',
                '通过 Xray 读取活动连接 IP 不需要 NET_ADMIN。节点上的附加 Linux 功能才使用此权限。安装和更新节点时，如果无法确认运行中容器拥有该权限，安装程序会单独询问。已生效的权限会保留且不重复询问。自动化时使用 --net-admin 或 --no-net-admin；旧 Compose 中仅存在 cap_add 并不能证明权限已生效。'
            ]
        ]
    ]
]

export function explainCurrentWorkflows(articles) {
    const tagSettings = [
        'Настройки тега действуют на связанные хосты, у которых включён соответствующий переключатель: квота, скорость пользователя или общая скорость. Переключатель скорости устройства из тегов также независим. Перед сохранением проверьте участвующие хосты и ограничения. Получатели и персональные исключения доступны в разделе «Лимиты».',
        'Tag settings affect associated hosts with the corresponding quota, user-speed or shared-speed switch enabled. The device-speed inheritance switch is also independent. Check participating hosts and restrictions before saving. Open “Limits” for recipients and personal exceptions.',
        'تنظیمات برچسب روی میزبان‌هایی اعمال می‌شوند که کلید مربوط به سهمیه، سرعت کاربر یا سرعت مشترک را فعال کرده‌اند. کلید سرعت دستگاه نیز مستقل است. پیش از ذخیره، میزبان‌های مشارکت‌کننده و محدودیت‌ها را بررسی کنید. گیرندگان و استثناهای شخصی در «محدودیت‌ها» هستند.',
        '标签设置作用于已启用对应配额、用户速度或共享速度开关的关联主机。设备速度继承开关也相互独立。保存前检查参与主机和限制。接收对象与个人例外位于“限制”页面。'
    ]
    const tagArticle = articles.find((entry) => entry.id === 'host-tags')
    for (const [index, language] of languages.entries()) {
        tagArticle.sections.find((section) => section.id === 'host-tags-3')[language].body =
            tagSettings[index]
    }
    for (const [articleId, id, translations] of sections) {
        const article = articles.find((entry) => entry.id === articleId)
        if (!article) throw new Error(`Missing workflow article: ${articleId}`)
        article.sections.push({
            id,
            ...Object.fromEntries(
                languages.map((language, index) => [
                    language,
                    {
                        title: translations[index][0],
                        body: translations[index][1]
                    }
                ])
            )
        })
    }
}
