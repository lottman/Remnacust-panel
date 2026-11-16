const sections = [
    [
        'architecture',
        'transactional-template-cache',
        [
            [
                'Свежесть шаблонов',
                'После сохранения шаблона получите новую подписку тестового пользователя и проверьте её в приложении. Уже импортированный профиль в приложении обновляется отдельно. Если осталась старая конфигурация, проверьте, что изменения применены, выбран нужный шаблон и клиент обновил подписку. При ошибке сохранения последняя рабочая версия остаётся активной. Не очищайте базу или общий кэш ради обновления одной подписки.'
            ],
            [
                'Template freshness',
                'After saving a template, fetch a test user’s subscription and check it in the app. A profile already imported into an app needs its own subscription refresh. If an old configuration remains, check that the changes were applied, the intended template is selected and the client refreshed the subscription. A failed save keeps the last working version active. Do not clear the database or shared cache merely to refresh one subscription.'
            ],
            [
                'تازگی قالب‌ها',
                'پس از ذخیره قالب، اشتراک کاربر آزمایشی را دریافت و در برنامه بررسی کنید. پروفایل واردشده به برنامه باید جداگانه به‌روز شود. اگر پیکربندی قدیمی باقی ماند، اعمال تغییرات، انتخاب قالب درست و به‌روزرسانی اشتراک در برنامه را بررسی کنید. ذخیره ناموفق آخرین نسخه سالم را فعال نگه می‌دارد. برای تازه‌سازی یک اشتراک، پایگاه داده یا کش عمومی را پاک نکنید.'
            ],
            [
                '模板新鲜度',
                '保存模板后，获取测试用户的订阅并在应用中检查。已导入应用的配置需要单独更新订阅。如果仍是旧配置，请确认更改已应用、选择了正确模板且客户端已刷新订阅。保存失败时继续使用上一个可用版本。不要仅为刷新一个订阅而清空数据库或公共缓存。'
            ]
        ]
    ],
    [
        'architecture',

        'network-storage-and-cold-cache',
        [
            [
                'Хранилище и скорость подписок',
                'Для панели нужен надёжный диск с запасом свободного места и производительности. Сетевой блочный диск допустим, если обеспечивает устойчивое чтение и запись. Медленный накопитель особенно заметен после запуска и при одновременном обновлении большого числа подписок. Сравните время получения подписки, загрузку диска, CPU и память. Если замедление сохраняется, изучите журнал панели. Не очищайте рабочую базу и не отключайте надёжное сохранение данных ради ускорения.'
            ],
            [
                'Storage and subscription speed',
                'The panel needs reliable storage with enough free space and read/write capacity. Network-backed block storage can be used when it provides durable reads and writes. Slow storage is especially noticeable after startup and when many subscriptions refresh together. Compare subscription response time, disk load, CPU and memory. If the slowdown persists, inspect the panel log. Do not clear the live database or disable durable writes to improve speed.'
            ],
            [
                'ذخیره‌سازی و سرعت اشتراک',
                'پنل به دیسک قابل‌اعتماد با فضای آزاد و توان خواندن و نوشتن کافی نیاز دارد. دیسک بلوکی شبکه‌ای با ذخیره پایدار قابل استفاده است. کندی دیسک پس از راه‌اندازی و هنگام به‌روزرسانی هم‌زمان اشتراک‌های زیاد بیشتر دیده می‌شود. زمان دریافت اشتراک، بار دیسک، CPU و حافظه را مقایسه کنید. اگر کندی ادامه داشت گزارش پنل را بررسی کنید. برای افزایش سرعت پایگاه داده فعال را پاک نکنید و ذخیره پایدار را خاموش نکنید.'
            ],
            [
                '存储与订阅速度',
                '面板需要可靠的存储，并保留足够空间和读写能力。能保证数据持久性的网络块存储可以使用。慢磁盘在启动后以及大量订阅同时刷新时尤为明显。请比较订阅响应时间、磁盘负载、CPU 和内存；持续变慢时检查面板日志。不要为了提速清空运行中的数据库或关闭持久化写入。'
            ]
        ]
    ],
    [
        'templates',
        'subscription-delivery-diagnostics',
        [
            [
                'Обновление подписки и персональные ссылки',
                'Если приложение показывает прежнюю ошибку после выпуска панели, проверьте, что обновилась именно подписка: при недоступном HTTPS старого домена клиент продолжает использовать сохранённую конфигурацию. Сохраните старый домен и его сертификат на время переноса ссылок; изменение адреса в панели само по себе не переносит установленную подписку. Отдельно установленную страницу подписки обновляйте вместе с панелью. Персональные ссылки /device/ привязаны к подписке и HWID; их подпись, блокировка устройства и доступ пользователя проверяются панелью при каждом запросе. Не публикуйте эти ссылки. В INCY длинные встроенные списки выдаются без потери правил в строковой форме Xray; размер проверяется после форматирования JSON. Способ доставки выбирается автоматически по размеру каждого профиля.'
            ],
            [
                'Subscription refresh and personal links',
                'If a client still shows an old error after a panel release, verify that the subscription itself refreshed: when HTTPS on its old domain fails, the app keeps its saved configuration. Retain the old domain and certificate while migrating links; changing the panel address does not migrate installed subscriptions. Update a separately installed subscription page together with the panel. Personal /device/ links are bound to the subscription and HWID; the panel checks their signature, device block and user access on every request. Keep these links private. INCY receives long inline lists in lossless Xray string form; the size budget includes JSON formatting. Delivery is chosen automatically using each profile’s size.'
            ],
            [
                'به‌روزرسانی اشتراک و پیوند شخصی',
                'اگر پس از انتشار پنل خطای قدیمی باقی است، به‌روزرسانی خود اشتراک را بررسی کنید: خرابی HTTPS دامنه قدیمی باعث استفاده از پیکربندی ذخیره‌شده می‌شود. هنگام انتقال پیوندها دامنه و گواهی قبلی را نگه دارید؛ تغییر آدرس پنل اشتراک نصب‌شده را منتقل نمی‌کند. صفحه اشتراک مستقل را همراه پنل به‌روز کنید. پیوند /device/ به اشتراک و HWID وابسته است و پنل در هر درخواست امضا، مسدود بودن دستگاه و دسترسی کاربر را بررسی می‌کند؛ پیوند را محرمانه نگه دارید. فهرست‌های بلند INCY بدون حذف قوانین به قالب رشته‌ای Xray تبدیل می‌شوند و اندازه پس از قالب‌بندی JSON سنجیده می‌شود. روش تحویل با توجه به اندازه هر پروفایل خودکار انتخاب می‌شود.'
            ],
            [
                '订阅刷新与设备链接',
                '面板更新后仍显示旧错误时，请确认订阅本身已刷新：旧域名 HTTPS 不可用时，应用会继续使用已保存配置。迁移链接期间保留旧域名及证书；更改面板地址不会迁移已安装订阅。独立订阅页面应与面板一起更新。/device/ 个人链接绑定订阅和 HWID；每次请求由面板检查签名、设备封禁及用户权限。请勿公开链接。INCY 的大型内嵌列表使用无损 Xray 字符串格式，大小限制包含 JSON 格式化开销。交付方式按每个配置的大小自动选择。'
            ]
        ]
    ],
    [
        'users',
        'expiry-scheduler',
        [
            [
                'Как проверяется срок подписки',
                'Панель автоматически проверяет срок подписки каждые 30 секунд. Просроченные ACTIVE и LIMITED переходят в EXPIRED, после чего изменение доступа отправляется нодам. Дополнительное расписание на сервере не требуется. При остановке служб панели или потере связи с нодой обновление состояния может задержаться. FROZEN сохраняет остаток срока; активация возобновляет отсчёт с этого остатка. Сброс трафика не снимает заморозку.'
            ],
            [
                'How expiry is checked',
                'The panel checks subscription expiry automatically every 30 seconds. Overdue ACTIVE and LIMITED accounts become EXPIRED, then the access change is sent to nodes. No additional server schedule is required. Stopped panel services or a disconnected node can delay the state update. FROZEN preserves remaining lifetime; activation resumes the countdown from that remainder. Resetting traffic does not unfreeze the account.'
            ],
            [
                'بررسی پایان اعتبار',
                'پنل هر ۳۰ ثانیه پایان اعتبار اشتراک را خودکار بررسی می‌کند. حساب‌های ACTIVE و LIMITED منقضی به EXPIRED تغییر می‌کنند و تغییر دسترسی به نودها ارسال می‌شود. زمان‌بندی دیگری در سرور لازم نیست. توقف سرویس‌های پنل یا قطع اتصال نود می‌تواند به‌روزرسانی وضعیت را عقب بیندازد. FROZEN زمان باقی‌مانده را نگه می‌دارد و فعال‌سازی شمارش را از همان مقدار ادامه می‌دهد. بازنشانی ترافیک حساب را از انجماد خارج نمی‌کند.'
            ],
            [
                '到期检查',
                '面板每 30 秒自动检查订阅期限。到期的 ACTIVE 和 LIMITED 账号变为 EXPIRED，随后向节点发送访问变更。无需另设服务器计划任务。面板服务停止或节点断开可能延迟状态更新。FROZEN 保留剩余时长，激活后从该时长继续计时。重置流量不会解除冻结。'
            ]
        ]
    ],
    [
        'api-tokens',
        'permanent-user-management-tokens',
        [
            [
                'Токен бота для пользователей и бессрочный доступ',
                'Набор прав «Пользователи» позволяет создавать и редактировать пользователей, замораживать и активировать подписки, сбрасывать трафик, получать ключи и ссылки, выполнять массовые действия. Управление HWID и доступ к каталогам сквадов и доменов выбираются отдельно. Набор не даёт прав на настройки панели, серверы, копии и управление токенами.\n\nПри создании токена выберите «Без срока действия», если он должен работать до отзыва. Удаление токена отзывает доступ; изменения прав действуют для следующих запросов. Редактирование имени и прав сохраняет значение токена и его срок. Для другого срока создайте замену и удалите прежний токен после проверки.\n\nДля страницы подписки используйте минимальный отдельный набор прав страницы. Чтение пользователя по имени добавляйте только для включённой совместимости старых ссылок Marzban. Храните токен на сервере страницы, а не в публичной ссылке или браузерном коде.'
            ],
            [
                'User-management bots and permanent access',
                'The Users preset permits creating and editing users, freezing and resuming subscriptions, resetting traffic, obtaining keys and links, and bulk operations. HWID management and access to squad and domain catalogs are selected separately. It does not grant panel settings, servers, backups or token administration.\n\nWhen creating a token, select No expiration if it should remain valid until revoked. Deleting the token revokes access; permission changes affect subsequent requests. Editing the name and permissions preserves the token value and expiry. To change its lifetime, create a replacement and delete the old token after checking it.\n\nUse the separate minimal subscription-page preset for a subscription website. Add username lookup only for enabled Marzban legacy-link compatibility. Store the token on the website server, not in public links or browser code.'
            ],
            [
                'توکن مدیریت کاربران و دسترسی بدون انقضا',
                'پیش‌تنظیم کاربران اجازه ساخت و ویرایش کاربر، انجماد و فعال‌سازی اشتراک، بازنشانی ترافیک، دریافت کلید و پیوند و اقدام گروهی می‌دهد. مدیریت HWID و دسترسی به فهرست گروه‌ها و دامنه‌ها جداگانه انتخاب می‌شوند. این پیش‌تنظیم تنظیمات پنل، سرورها، پشتیبان یا مدیریت توکن را مجاز نمی‌کند.\n\nهنگام ساخت توکن، برای اعتبار تا زمان لغو گزینه بدون انقضا را انتخاب کنید. حذف توکن دسترسی را لغو می‌کند و تغییر مجوز بر درخواست بعدی اثر دارد. ویرایش نام و مجوز مقدار و انقضای توکن را حفظ می‌کند. برای مدت دیگر توکن جایگزین بسازید و پس از بررسی قبلی را حذف کنید.\n\nبرای وب‌سایت اشتراک از پیش‌تنظیم حداقلی و جداگانه صفحه استفاده کنید. جست‌وجوی نام کاربر فقط برای سازگاری فعال پیوندهای قدیمی Marzban اضافه شود. توکن را روی سرور صفحه نگه دارید، نه در پیوند عمومی یا کد مرورگر.'
            ],
            [
                '用户管理令牌与永久访问',
                '“用户”权限预设允许创建和编辑用户、冻结及恢复订阅、重置流量、获取密钥和链接以及批量操作。HWID 管理和群组、域名目录权限需单独选择。该预设不授予面板设置、服务器、备份或令牌管理权限。\n\n创建时若需一直有效直至撤销，可选择无到期时间。删除令牌撤销访问；权限变更作用于后续请求。编辑名称和权限会保留令牌值及期限。要更改期限，请创建替代令牌，验证后删除旧令牌。\n\n订阅网站应使用单独的最小页面权限预设。仅在启用 Marzban 旧链接兼容时增加按用户名读取权限。令牌保存在页面服务器上，不应放入公开链接或浏览器代码。'
            ]
        ]
    ],
    [
        'templates',
        'selection-and-geofile-workflow',
        [
            [
                'Автовыбор и геофайлы в редакторе',
                'У каждого автовыбора одна раскрывающаяся карточка: серверы для выбора, стратегия и хосты подписки, на которых он используется. Назначение относится к имени конкретного балансера; переименование сохраняет связь. Если у старого назначения единственный возможный автовыбор, оно показано внутри него; при нескольких вариантах выберите связь явно. Простое открытие страницы не переписывает код. Вкладки прокручиваются со страницей, сохранение остаётся внизу. В геофайлах выберите библиотеку, компьютер или ссылку. Загрузка сразу сохраняет файл в общей библиотеке; совместимый файл подключается к текущему черновику одним действием. Настройте категории, действие и интервал клиента в карточке файла и сохраните шаблон; способ доставки выбирается автоматически. Удаление из шаблона не удаляет файл из библиотеки. Общие параметры файла и обновления на сервере находятся в раскрывающемся разделе библиотеки.'
            ],
            [
                'Selection and geofile editor workflow',
                'Each selection has one expandable card containing its servers, strategy and subscription host assignments. Assignments belong to a specific balancer name; renaming preserves the link. A legacy assignment with one possible selection appears inside it; ambiguous assignments require an explicit target. Opening the page does not rewrite code. Tabs scroll with the page; saving stays at the bottom. For geofiles, choose the library, computer or URL. Uploads immediately store the file in the shared library; a compatible file attaches to the current draft in one action. Set categories, action and the client interval in its card, then save the template; delivery is selected automatically. Detaching a file does not delete it from the library. Shared file settings and server refresh are in the expandable library section.'
            ],
            [
                'روند ویرایش انتخاب خودکار و فایل جغرافیایی',
                'هر انتخاب خودکار یک کارت بازشدنی شامل سرورها، روش انتخاب و میزبان‌های اشتراک دارد. تخصیص به نام یک بالانسر مشخص متصل است و تغییر نام این ارتباط را حفظ می‌کند. تخصیص قدیمی با یک انتخاب ممکن در همان کارت نشان داده می‌شود؛ برای تخصیص مبهم مقصد را صریح انتخاب کنید. باز کردن صفحه کد را تغییر نمی‌دهد. زبانه‌ها با صفحه حرکت می‌کنند و ذخیره در پایین می‌ماند. برای فایل جغرافیایی کتابخانه، رایانه یا نشانی را انتخاب کنید. بارگذاری فایل را بلافاصله در کتابخانه مشترک ذخیره می‌کند و فایل سازگار با یک عمل به پیش‌نویس فعلی متصل می‌شود. دسته‌ها، عمل و فاصله زمانی کلاینت را تنظیم و الگو را ذخیره کنید؛ روش تحویل خودکار انتخاب می‌شود. جدا کردن فایل از الگو آن را از کتابخانه حذف نمی‌کند. تنظیمات مشترک فایل و به‌روزرسانی سرور در بخش بازشدنی کتابخانه است.'
            ],
            [
                '自动选择和地理文件编辑流程',
                '每个自动选择使用一张可展开卡片，集中配置服务器、策略和订阅主机分配。分配关联到具体的负载均衡器名称，重命名时保留关联。旧分配若只有一个可用目标，会显示在该卡片中；目标不明确时需显式选择。打开页面不会重写代码。选项卡随页面滚动，保存操作保留在底部。地理文件可从文件库、电脑或链接添加。上传会立即将文件存入共享文件库，兼容文件可一步关联至当前草稿。设置分类、动作和客户端更新间隔后保存模板；交付方式由系统自动选择。从模板移除文件不会从文件库删除文件。共享文件设置和服务器刷新位于文件库的可展开区域。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'local-subscription-page-management',
        [
            [
                'Страницы на сервере',
                'Вкладка «Страницы подписки» управляет только зарегистрированными экземплярами на сервере панели. Доступны запуск, остановка, перезапуск и отдельное обновление. Нужен установщик 1.2.100 с локальной службой управления. CLI: install-subscription-page, upgrade-subscription-page --page-id ID и manage-subscription-page. Список показывает ID. Локальная панель использует отдельный ограниченный токен и сеть Docker; удалённая требует HTTPS и API-токен с правами страницы. Порты страницы доступны на loopback; HTTPS настраивается через свободный отдельный Caddy или существующий proxy. Обновление сохраняет настройки и остановленное состояние, при сбое готовности откатывает Compose. Приватные журналы находятся в /opt/remnacust/logs/page-<id>.log. Произвольные Docker-команды, пути и образы через браузер не принимаются.'
            ],
            [
                'Pages on this server',
                'The Subscription pages tab manages registered instances on the panel server: start, stop, restart and independent update. Installer 1.2.100 and its local control service are required. CLI commands: install-subscription-page, upgrade-subscription-page --page-id ID, and manage-subscription-page; the list shows IDs. A local panel uses a separate restricted token and Docker network. A remote panel requires HTTPS and a subscription-page API token. Page ports bind to loopback; use a separate Caddy on free HTTPS ports or your existing proxy. Updates preserve settings and stopped state; failed readiness rolls Compose back. Private operation logs: /opt/remnacust/logs/page-<id>.log. Browser requests cannot supply arbitrary commands, paths or images.'
            ],
            [
                'صفحه‌های همین سرور',
                'زبانه صفحه‌های اشتراک فقط نمونه‌های ثبت‌شده در سرور پنل را اجرا، متوقف، بازراه‌اندازی و جداگانه به‌روزرسانی می‌کند. نصب‌کننده 1.2.100 و سرویس محلی لازم است. فرمان‌ها: install-subscription-page، upgrade-subscription-page --page-id ID و manage-subscription-page. اتصال محلی از توکن محدود و شبکه Docker استفاده می‌کند؛ اتصال راه دور به HTTPS و توکن صفحه نیاز دارد. پورت فقط روی loopback است؛ HTTPS با Caddy جداگانه روی پورت آزاد یا proxy موجود تنظیم می‌شود. تنظیمات و وضعیت توقف حفظ می‌شوند و خطای آمادگی Compose را برمی‌گرداند. گزارش خصوصی در /opt/remnacust/logs/page-<id>.log است. فرمان، مسیر و تصویر دلخواه از مرورگر پذیرفته نمی‌شود.'
            ],
            [
                '此服务器上的页面',
                '“订阅页面”标签只管理面板服务器上已注册的实例，可启动、停止、重启或单独更新。需要安装程序 1.2.100 及本地控制服务。CLI：install-subscription-page、upgrade-subscription-page --page-id ID、manage-subscription-page；列表显示 ID。本地面板使用独立受限令牌和 Docker 网络，远程面板需要 HTTPS 及订阅页面 API 令牌。页面端口仅绑定 loopback；HTTPS 可使用空闲端口上的独立 Caddy 或现有代理。更新保留设置和停止状态，未通过就绪检查时回滚 Compose。私有日志位于 /opt/remnacust/logs/page-<id>.log。浏览器不能提交任意命令、路径或镜像。'
            ]
        ]
    ],
    [
        'templates',
        'incy-checksum-delivery',
        [
            [
                'Проверка геофайлов INCY',
                'INCY получает стабильные URL DAT без параметров запроса. Подписанный выбор файлов находится в пути: добавление .sha256 к полному URL возвращает контрольную сумму того же набора. Неизменённый файл можно проверить без повторной загрузки; LastUpdated профиля Happ/INCY не меняется при каждом запросе подписки. Он увеличивается при изменении профиля, файла или режима доставки; состояние изолировано по устройству и сохраняется при перезапуске панели. интервал задаётся routing-geo-update-interval в часах. Если отдельно установлена страница подписки, обновите её вместе с панелью. Если выбран встроенный режим, профиль получает пустые URL и интервал 0; правила остаются в JSON. Ранее выданные ссылки поддерживаются. Поведение расписания и повторов после сетевой ошибки зависит от версии клиента; сервер не включает туннель. Официальный протокол: https://docs.incy.cc/routing/'
            ],
            [
                'INCY geofile checks',
                'INCY receives stable DAT URLs without query parameters. The signed file selection is in the path, so appending .sha256 to the complete URL returns the checksum for the same bundle. Unchanged files can be checked without downloading them again. Happ/INCY profile LastUpdated stays stable across unchanged subscription requests; a profile, file or delivery-mode change advances it. State is device-scoped and survives panel restarts. routing-geo-update-interval uses hours. Update a separately deployed subscription page together with the panel. Automatic inline delivery sends empty geofile URLs and disables periodic checks; the JSON keeps the rules. Previously issued URLs remain supported. Scheduling and network-error retries depend on the client version; the server does not start the tunnel. Official protocol: https://docs.incy.cc/routing/'
            ],
            [
                'بررسی فایل جغرافیایی INCY',
                'نشانی DAT برای INCY ثابت و بدون query است. انتخاب امضاشده در مسیر قرار دارد؛ افزودن .sha256 به نشانی کامل، هش همان مجموعه را می‌دهد. فایل بدون تغییر به دانلود مجدد نیاز ندارد. LastUpdated برای درخواست‌های بدون تغییر Happ/INCY ثابت می‌ماند و فقط با تغییر پروفایل، فایل یا روش تحویل افزایش می‌یابد. وضعیت برای هر دستگاه جداست و با راه‌اندازی مجدد پنل حفظ می‌شود. routing-geo-update-interval بر حسب ساعت است. صفحه اشتراک جداگانه را همراه پنل به‌روزرسانی کنید. در روش داخلی خودکار، نشانی فایل‌ها خالی و بررسی دوره‌ای غیرفعال می‌شود؛ قوانین در JSON می‌مانند. نشانی‌های قبلی همچنان کار می‌کنند. زمان‌بندی و تکرار پس از خطای شبکه به نسخه برنامه بستگی دارد؛ تونل اجرا نمی‌شود. پروتکل رسمی: https://docs.incy.cc/routing/'
            ],
            [
                'INCY 地理文件校验',
                'INCY 获得不含查询参数的稳定 DAT URL。经过签名的文件选择位于路径中，在完整 URL 后添加 .sha256 即返回同一文件包的校验和。未更改的文件无需重新下载。Happ/INCY 的 LastUpdated 在订阅内容不变时保持稳定，仅在配置、文件或交付方式更改时增加。状态按设备隔离，并在面板重启后保留。routing-geo-update-interval 的单位为小时。独立部署的订阅页面应与面板一同更新。自动选择内嵌方式时，地理文件 URL 为空且定期检查停用，规则仍保留在 JSON 中。旧 URL 仍受支持。调度和网络错误重试取决于客户端版本；服务器不会开启隧道。官方协议：https://docs.incy.cc/routing/'
            ]
        ]
    ],
    [
        'nodes',
        'nodes-ssh-install-http01',
        [
            [
                'Установка и сертификат',
                'Для установки по SSH нужен root или sudo без пароля; существующий пустой каталог допустим. Ошибка показывает этап, а подробный журнал сохраняется на сервере. При ограничении по IP панели и HTTP-01 TCP 80 временно открывается для проверки сертификата и автоматически закрывается после неё; при сбое окно истекает не позднее чем через 15 минут. Так же работает продление. Внешний firewall и ограничения провайдера нужно настроить отдельно. Для постоянно закрытого порта 80 используйте DNS-01 или готовый сертификат.'
            ],
            [
                'Installation and certificates',
                'SSH installation requires root or passwordless sudo; an existing empty directory is allowed. Failures show the stage and detailed logs remain on the server. With a panel-IP restriction and HTTP-01, TCP 80 opens temporarily for certificate validation and closes afterwards; a failed process cannot keep it open longer than 15 minutes. Renewal uses the same rule. External and provider firewalls need their own configuration. Use DNS-01 or an existing certificate to keep port 80 closed.'
            ],
            [
                'نصب و گواهی',
                'نصب از طریق SSH به root یا sudo بدون گذرواژه نیاز دارد؛ پوشه خالی موجود پذیرفته می‌شود. مرحله خطا نمایش داده می‌شود و گزارش کامل روی سرور می‌ماند. با محدودیت IP پنل و HTTP-01، پورت 80 فقط برای تأیید گواهی موقتاً باز و سپس بسته می‌شود؛ در صورت خطا حداکثر پس از ۱۵ دقیقه بسته می‌شود. تمدید نیز همین روش را دارد. دیوار آتش خارجی و ارائه‌دهنده باید جداگانه تنظیم شوند. برای بسته ماندن دائمی پورت 80 از DNS-01 یا گواهی موجود استفاده کنید.'
            ],
            [
                '安装和证书',
                'SSH 安装需要 root 或免密码 sudo；允许使用已有空目录。错误会显示失败阶段，详细日志保存在服务器上。启用面板 IP 限制并使用 HTTP-01 时，TCP 80 仅在证书验证期间临时开放，随后关闭；进程异常时最多 15 分钟后自动关闭。续期采用相同方式。外部及服务商防火墙需单独配置。若要始终关闭 80 端口，请使用 DNS-01 或现有证书。'
            ]
        ]
    ],
    [
        'users',
        'users-frozen-lifetime',
        [
            [
                'Заморозка подписки',
                'В меню пользователя выберите «Заморозить», затем укажите дату и время в новом поле «Автоматическая разморозка» и нажмите «Сохранить». До сохранения статус не меняется. После сохранения поле становится доступным только для чтения; изменить срок этой заморозки нельзя. Индикатор пользователя и замороженные даты синие.\n\nЗаморозка сохраняет оставшееся время подписки. Например, при остатке два дня и разморозке завтра подписка после разморозки действует ещё два дня. Проверка запланированных разморозок выполняется каждые пять секунд при работающей панели. После перезапуска пропущенные сроки обрабатываются; окончание подписки считается от запланированного момента, поэтому простой панели не добавляет время. Нода применяет доступ после получения изменения. Если срок уже исчерпан или квота закончилась, сохраняются соответствующие ограничения. Продление во время заморозки увеличивает остаток, не меняя дату разморозки.\n\nПри массовой заморозке задайте общий срок; уже сохранённые сроки замороженных пользователей останутся прежними. Старые заморозки без даты не включаются самовольно: откройте пользователя и назначьте будущую дату один раз. Для API и импорта новых заморозок также нужен будущий frozenUntil с часовым поясом. Само сохранение не подтверждает немедленное прекращение соединений на недоступной ноде.'
            ],
            [
                'Freeze a subscription',
                'Choose Freeze in the user menu, enter the new Automatic resume date and time, then Save. The status does not change before saving. The saved deadline becomes read-only and cannot be changed for that freeze. Frozen user indicators and dates are blue.\n\nFreezing preserves the remaining subscription lifetime. With two days remaining and a resume date tomorrow, two days remain after resuming. A running panel checks scheduled resumes every five seconds. After a restart, overdue work catches up; expiry is based on the scheduled resume time, so panel downtime does not add time. Nodes apply access after receiving the update. Exhausted lifetime and quota continue to restrict access. Extending a frozen subscription adds lifetime without changing its resume deadline.\n\nBulk freezing uses the selected deadline while retaining saved deadlines of already frozen users. Legacy freezes without a deadline are not silently activated: open the user and assign a future date once. New frozen users created through the API or import also need a future frozenUntil with a UTC offset. Saving does not confirm immediate termination of connections on an unreachable node.'
            ],
            [
                'توقف اشتراک',
                'در منوی کاربر «توقف اشتراک» را انتخاب کنید، تاریخ و ساعت «فعال‌سازی خودکار» را وارد و ذخیره کنید. پیش از ذخیره وضعیت تغییر نمی‌کند. مهلت ذخیره‌شده فقط خواندنی است و برای همان تعلیق تغییر نمی‌کند. نشانگر کاربر و تاریخ تعلیق آبی هستند.\n\nتعلیق زمان باقی‌مانده اشتراک را حفظ می‌کند. اگر دو روز باقی مانده و فعال‌سازی برای فردا باشد، پس از فعال‌سازی دو روز قابل استفاده است. پنل در حال اجرا هر پنج ثانیه موعدها را بررسی می‌کند. پس از راه‌اندازی دوباره موعدهای گذشته پردازش می‌شوند؛ انقضا از موعد تعیین‌شده محاسبه می‌شود و خاموشی پنل زمان اضافه نمی‌کند. نود پس از دریافت تغییر، دسترسی را اعمال می‌کند. پایان اعتبار یا سهمیه همچنان دسترسی را محدود می‌کند. تمدید در حالت تعلیق زمان باقی‌مانده را زیاد می‌کند و موعد فعال‌سازی را تغییر نمی‌دهد.\n\nدر تعلیق گروهی مهلت تعیین‌شده برای کاربران جدید اعمال و مهلت کاربران از قبل معلق حفظ می‌شود. تعلیق‌های قدیمی بدون موعد خودکار فعال نمی‌شوند؛ در کارت کاربر یک‌بار موعد آینده را مشخص کنید. ایجاد کاربر معلق از API یا فایل وارداتی نیز به frozenUntil آینده با منطقه زمانی نیاز دارد. ذخیره موفق، قطع فوری اتصال نود دور از دسترس را تأیید نمی‌کند.'
            ],
            [
                '冻结订阅',
                '在用户菜单选择冻结，在新增的“自动解冻时间”字段中设置日期和时间，然后保存。保存前状态不会改变。保存后截止时间只读，同一次冻结不能修改。冻结用户的指示点和日期显示为蓝色。\n\n冻结会保留订阅剩余时长。例如剩余两天并设置明天解冻，解冻后仍有两天。面板运行时每五秒检查到期的冻结。重启后会补处理逾期任务；到期时间按计划解冻时刻计算，面板停机不会额外增加有效期。节点收到更新后才应用访问变更。剩余时长为零或额度耗尽时仍限制访问。冻结期间续期会增加剩余时长，不改变解冻时间。\n\n批量冻结使用所选时间，已有冻结用户保留其原定时间。没有截止时间的旧冻结不会被擅自激活；请打开用户卡片，一次性指定未来日期。通过 API 或导入新建冻结用户也需要带时区偏移的未来 frozenUntil。保存成功不代表不可达节点上的连接已立即终止。'
            ]
        ]
    ],
    [
        'templates',
        'templates-pool-boundaries',
        [
            [
                'Состав пула после переключения',
                'При переключении группового отбора на выбор при подключении UUID и теги объединяются в values. Для regex и тегов получателя groups сохраняет список UUID: исходный фильтр и доступ пользователя действуют одновременно. Списки редактируются в GUI или коде; посторонние хосты не добавляются. Переход из ручной клиентской группы в автоматическую задаёт URL и интервал проверок.'
            ],
            [
                'Pool membership after switching',
                'Switching grouped selection to connection-time selection merges UUID and tag groups into values. Regex and recipient-tag selectors retain their UUID boundary in groups: the original filter and user access both apply. Edit these lists in the GUI or code; unrelated hosts are excluded. Switching a manual client group to automatic selection sets its probe URL and interval.'
            ],
            [
                'اعضای مجموعه پس از تغییر حالت',
                'با تغییر انتخاب گروهی به انتخاب هنگام اتصال، گروه‌های UUID و برچسب در values ادغام می‌شوند. برای عبارت منظم و برچسب گیرنده، groups مرز UUID را حفظ می‌کند؛ فیلتر اصلی و دسترسی کاربر هم‌زمان اعمال می‌شوند. فهرست‌ها در رابط و کد قابل ویرایش‌اند. تغییر گروه دستی به خودکار، نشانی و فاصله پایش را نیز تنظیم می‌کند.'
            ],
            [
                '切换后的池成员范围',
                '从分组抽样切换到连接时选择后，UUID 和标签分组合并到 values。正则表达式和接收主机标签选择器在 groups 中保留 UUID 范围，原始筛选条件和用户权限同时生效。列表可通过界面或代码编辑；不会增加无关主机。手动组切换为自动组时会设置探测 URL 和间隔。'
            ]
        ]
    ],
    [
        'templates',
        'templates-connection-selection',
        [
            [
                'Выбор при подключении',
                'Пулы источников и получатели — разные настройки. Для каждого назначения выберите конкретный balancerTag и хосты или теги получателей в remnawave.assignments. Назначение хосту приоритетнее назначения по тегу. Явный шаблон в карточке хоста сохраняет приоритет; внутри него выбирается назначенный этому хосту автовыбор. Правила DIRECT, REJECT и доменные ограничения сохраняются. all передаёт клиенту все разрешённые источники, а стратегия выбирает сервер при новом соединении. random/group сокращают состав при обновлении подписки. Изменение состава источников приходит при обновлении подписки. Отдельный TCP-вход для смены серверов больше не создаётся.'
            ],
            [
                'Selection at connection time',
                'Source pools and recipients are separate settings. Each remnawave.assignments entry binds a specific balancerTag to recipient hosts or tags. A direct host assignment takes precedence over a tag assignment. An explicit template in the host card remains highest priority; that template uses the balancer assigned to this recipient. DIRECT, REJECT and domain restrictions are preserved. all delivers every authorized source; the client strategy chooses a server for each new connection. random/group reduce membership when subscriptions refresh. Membership changes arrive on subscription refresh. A separate TCP entry for server changes is no longer created.'
            ],
            [
                'انتخاب هنگام اتصال',
                'مجموعه‌های منبع و گیرندگان تنظیمات جداگانه دارند. هر ورودی remnawave.assignments یک balancerTag مشخص را به میزبان‌ها یا برچسب‌های گیرنده پیوند می‌دهد. انتساب مستقیم میزبان بر برچسب اولویت دارد. الگوی صریح کارت میزبان همچنان اولویت اول است و درون آن انتخاب خودکار تعیین‌شده برای همان گیرنده استفاده می‌شود. قوانین DIRECT و REJECT و محدودیت دامنه حفظ می‌شوند. all تمام منابع مجاز را به کلاینت می‌فرستد و راهبرد برای اتصال جدید انتخاب می‌کند. random/group هنگام به‌روزرسانی اشتراک اعضا را کاهش می‌دهند. تغییر اعضا با به‌روزرسانی اشتراک دریافت می‌شود. ورودی TCP جداگانه دیگر ایجاد نمی‌شود.'
            ],
            [
                '连接时选择',
                '源池与接收主机是两种设置。remnawave.assignments 的每条记录将指定 balancerTag 绑定到接收主机或标签。主机直接分配优先于标签分配。主机卡片中的显式模板保持最高优先级，并在模板内使用分配给此接收主机的均衡器。DIRECT、REJECT 和域名限制保持有效。all 下发全部已授权源，由客户端策略为新连接选择服务器。random/group 在订阅更新时缩小成员范围。源成员变更通过更新订阅获取。不再创建用于切换服务器的独立 TCP 入口。'
            ]
        ]
    ],
    [
        'nodes',
        'nodes-reviewed-operations',
        [
            [
                "Состояние ноды и безопасные операции",
                "Связь с нодой, готовность Core и история проверок отображаются во вкладке «Здоровье и журнал». Автоматические проверки и уведомления продолжают работать. Доступность VPN с устройства проверяется отдельно. Отключённые ноды не опрашиваются.\n\nSSH-установка требует root или sudo без пароля. Существующие каталоги не перезаписываются; после установки связь проверяется отдельно. NET_ADMIN по умолчанию выключен. Ограничение по IP главного сервера закрывает остальные входящие порты и ping, кроме SSH; оно действует и на Docker, но не отменяет правила провайдера. Такая настройка несовместима с публичным HTTP-01: используйте подходящий способ выдачи сертификата. Для удаления только этого ограничения предусмотрено python3 /etc/remnacust-node-firewall/guard.py remove.\n\nОбновление компонента из панели может отложить обслуживание пакетов, требующее интерактивного SSH, и показать уведомление в журнале. Завершите его отдельно; параметр --yes не отвечает на вопросы настройки пакетов. Автоматической перезагрузки нет."
            ],
            [
                "Node health and safe operations",
                "The Health and logs tab shows node connectivity, Core readiness and check history. Automatic health checks and notifications remain active. Test VPN connectivity from the device separately. Disabled nodes are not contacted.\n\nSSH installation requires root or passwordless sudo. Existing directories are not overwritten; connectivity is checked separately after installation. NET_ADMIN defaults off. A main-server IP restriction closes other incoming ports and ping except SSH. It also covers Docker but does not override provider rules. This is incompatible with public HTTP-01; use an appropriate certificate method. Remove only this restriction with python3 /etc/remnacust-node-firewall/guard.py remove.\n\nA component update from the panel can defer package maintenance requiring interactive SSH and record a notice in the log. Complete it separately; --yes does not answer package-configuration prompts. There is no automatic reboot."
            ],
            [
                "سلامت نود و عملیات امن",
                "زبانهٔ سلامت و گزارش‌ها، اتصال نود، آمادگی Core و سابقهٔ بررسی‌ها را نشان می‌دهد. بررسی خودکار سلامت و اعلان‌ها فعال می‌مانند. اتصال VPN دستگاه را جداگانه آزمایش کنید. نود غیرفعال بررسی نمی‌شود.\n\nنصب SSH به root یا sudo بدون گذرواژه نیاز دارد. پوشه موجود بازنویسی نمی‌شود و ارتباط پس از نصب جداگانه بررسی می‌شود. NET_ADMIN پیش‌فرض خاموش است. محدودیت IP سرور اصلی سایر پورت‌های ورودی و ping به‌جز SSH را می‌بندد. Docker را نیز پوشش می‌دهد ولی قانون ارائه‌دهنده را لغو نمی‌کند. این تنظیم با HTTP-01 عمومی سازگار نیست؛ روش گواهی مناسب را انتخاب کنید. حذف فقط این محدودیت: python3 /etc/remnacust-node-firewall/guard.py remove.\n\nارتقای مؤلفه از پنل می‌تواند نگهداری بسته نیازمند SSH تعاملی را عقب بیندازد و در گزارش اطلاع دهد. آن را جداگانه تکمیل کنید؛ --yes پاسخ پرسش تنظیم بسته نیست. راه‌اندازی مجدد خودکار وجود ندارد."
            ],
            [
                "节点健康与安全操作",
                "“健康与日志”显示节点连接、Core 就绪状态及检查历史。自动健康检查和通知继续工作。设备的 VPN 连接需要单独测试。已禁用节点不会被检查。\n\nSSH 安装需要 root 或免密 sudo。不会覆盖已有目录，安装后另行检查连接。NET_ADMIN 默认关闭。主服务器 IP 限制会关闭 SSH 以外的其他入站端口和 ping，也覆盖 Docker，但不会覆盖提供方规则。此设置不兼容公共 HTTP-01，请使用适当的证书方式。仅移除此限制的命令为 python3 /etc/remnacust-node-firewall/guard.py remove。\n\n从面板更新组件可能推迟需要交互式 SSH 的软件包维护，并在日志中提示。请单独完成，--yes 不会回答软件包配置问题。不会自动重启服务器。"
            ]
        ]
    ],
    [
        'users',
        'users-device-subscription-preview',
        [
            [
                'Предпросмотр подписки устройства',
                'В карточке уже зарегистрированного устройства выберите формат и User-Agent, затем сформируйте предпросмотр. Он учитывает правила выдачи, не меняя устройство и историю подключений. Заблокированное устройство не получает работающий доступ. Список показывает возможные хосты; итоговый состав зависит от формата и пула. Конфигурация с ключами скрыта по умолчанию и выдаётся по отдельному запросу, до 2 MiB. Храните её в закрытом месте.'
            ],
            [
                'Device subscription preview',
                'Choose the format and User-Agent in an already registered device card, then generate a preview. It follows delivery rules without changing the device or connection history. A blocked device receives no working access. The host list shows candidates; the final selection depends on the format and pool. Configuration containing keys is hidden by default and available on explicit request, up to 2 MiB. Keep it private.'
            ],
            [
                'پیش‌نمایش اشتراک دستگاه',
                'فرمت و User-Agent را در کارت دستگاه ثبت‌شده انتخاب و پیش‌نمایش را ایجاد کنید. قواعد تحویل رعایت می‌شوند و دستگاه یا تاریخچه اتصال تغییر نمی‌کند. دستگاه مسدود دسترسی فعال نمی‌گیرد. فهرست میزبان‌ها نامزدها را نشان می‌دهد؛ انتخاب نهایی به فرمت و مجموعه بستگی دارد. تنظیمات دارای کلید پیش‌فرض پنهان است و فقط با درخواست صریح تا 2 MiB نمایش داده می‌شود. آن را محرمانه نگه دارید.'
            ],
            [
                '设备订阅预览',
                '在已注册设备卡片中选择格式和 User-Agent，再生成预览。预览遵循订阅规则，不修改设备或连接历史。被封禁设备不会获得可用访问。主机列表展示候选项，最终内容取决于格式和池。含密钥的配置默认隐藏，需明确请求才能获取，最多 2 MiB。请私密保存。'
            ]
        ]
    ]
]

sections.push([
    'subscription-settings',
    'existing-remnawave-pages',
    [
        [
            'Существующие страницы Remnawave',
            'На локальном сервере обнаруживаются также старые Compose-страницы Remnawave, связанные именно с этой панелью: проверяются официальный образ, привязка к панели и её сети, идентичность Compose и доступность безопасных файлов. Просмотр не регистрирует и не изменяет установку. Старой странице доступны запуск, остановка и перезапуск; её образ, токен и настройки не заменяются. Для обновления сначала выполните явный перенос через установщик. Страницы на другом сервере, без Compose, с адресом другой панели или небезопасными путями не принимаются в управление. Зарегистрированные страницы сохраняют прежнее управление.'
        ],
        [
            'Existing Remnawave pages',
            'Local discovery also includes legacy Remnawave Compose pages connected to this exact panel. It checks the official image, connection to the panel and its network, Compose identity and safe files. Listing does not register or change the deployment. Legacy pages support start, stop and restart; their image, token and settings are preserved. Migrate explicitly with the installer before upgrading. Remote pages, non-Compose deployments, connections to another panel and unsafe paths are not accepted for management. Registered pages retain their existing controls.'
        ],
        [
            'صفحه‌های موجود Remnawave',
            'صفحه‌های قدیمی Compose در همین سرور که به این پنل متصل‌اند نیز کشف می‌شوند. تصویر رسمی، اتصال به پنل و شبکه آن، هویت Compose و امن بودن فایل‌ها بررسی می‌شود. مشاهده فهرست نصب را ثبت یا تغییر نمی‌دهد. شروع، توقف و راه‌اندازی مجدد مجاز است؛ تصویر، توکن و تنظیمات حفظ می‌شوند. پیش از ارتقا انتقال را صریح با نصب‌کننده انجام دهید. سرور دیگر، نصب بدون Compose، پنل نامرتبط و مسیر ناامن پذیرفته نمی‌شود. کنترل صفحه‌های ثبت‌شده بدون تغییر است.'
        ],
        [
            '现有 Remnawave 页面',
            '本地发现也包含关联当前面板的旧版 Remnawave Compose 页面。系统检查官方镜像、与面板及其网络的关联、Compose 身份及文件安全性。查看列表不会注册或修改部署。旧页面支持启动、停止和重启，保留镜像、令牌和设置；升级前须明确使用安装程序迁移。其他服务器、非 Compose 部署、其他面板或不安全路径不会纳入管理。已注册页面保留原有控制。'
        ]
    ]
])

sections.push([
    'subscription-settings',
    'page-panel-connection',
    [
        [
            'Подключение страницы к панели',
            'При установке и переносе страницы можно выбрать локальную панель или HTTPS-адрес другой панели и её API-токен с правами страницы подписки. В меню управления страницей установщика пункт 9 меняет панель и токен. Токен вводится скрыто либо читается из приватного файла с правами 0600. Сначала проверяются подключение и права; при ошибке применения прежние настройки восстанавливаются. Меняется только выбранная страница, остановленная страница не запускается. Уже установленный образ Remnacust повторно не предлагается переносить.'
        ],
        [
            'Page connection to the panel',
            'During page installation or migration, choose the local panel or another panel’s HTTPS address and an API token with subscription-page permissions. Option 9 in the installer’s page management changes the panel and token. Enter the token privately or use a private file with mode 0600. Connectivity and permissions are checked first; failed application restores the previous settings. Only the selected page changes, and stopped pages remain stopped. An existing Remnacust image is not offered for migration again.'
        ],
        [
            'اتصال صفحه به پنل',
            'هنگام نصب یا انتقال صفحه، پنل محلی یا نشانی HTTPS پنل دیگر و توکن API با مجوزهای صفحه اشتراک را انتخاب کنید. گزینه ۹ مدیریت صفحه در نصب‌کننده پنل و توکن را تغییر می‌دهد. توکن مخفی وارد می‌شود یا از فایل خصوصی با مجوز 0600 خوانده می‌شود. ابتدا اتصال و مجوزها بررسی می‌شوند؛ خطای اعمال تنظیمات قبلی را بازمی‌گرداند. فقط صفحه انتخاب‌شده تغییر می‌کند و صفحه متوقف‌شده روشن نمی‌شود. تصویر نصب‌شده Remnacust دوباره برای انتقال پیشنهاد نمی‌شود.'
        ],
        [
            '页面与面板的连接',
            '安装或迁移页面时，可选择本地面板，或填写其他面板的 HTTPS 地址及具有订阅页面权限的 API 令牌。安装程序的页面管理菜单第 9 项可更改面板和令牌。令牌通过隐藏输入或权限为 0600 的私密文件提供。程序先检查连接和权限；应用失败时恢复原设置。仅更改所选页面，已停止的页面保持停止。已安装的 Remnacust 镜像不会重复提示迁移。'
        ]
    ]
])

sections.push([
    'appearance',
    'appearance-controls',
    [
        [
            'Настройки темы',
            'Откройте палитру в верхней панели. Выбранные тема и акцент отмечены галочкой, название текущего акцента показано над палитрой. Шрифт выбирается из списка; плотность интерфейса и анимация переключаются ниже. Изменения применяются сразу и сохраняются в этом браузере, отдельная кнопка сохранения не нужна. «Сбросить» возвращает тему, акцент, шрифт, плотность и анимацию по умолчанию.'
        ],
        [
            'Theme settings',
            'Open the palette in the header. Checkmarks identify the selected theme and accent, and the current accent name appears above the palette. Choose a font from the list; interface density and motion have switches below. Changes apply immediately and are saved in this browser; no separate Save button is needed. Reset restores the default theme, accent, font, density and motion.'
        ],
        [
            'تنظیمات پوسته',
            'پالت را از نوار بالا باز کنید. پوسته و رنگ انتخاب‌شده با علامت مشخص می‌شوند و نام رنگ بالای پالت است. قلم را از فهرست و تراکم و حرکت را با کلیدهای پایین انتخاب کنید. تغییرات فوری اعمال و در همین مرورگر ذخیره می‌شوند و دکمه ذخیره جدا لازم نیست. بازنشانی پوسته، رنگ، قلم، تراکم و حرکت پیش‌فرض را برمی‌گرداند.'
        ],
        [
            '主题设置',
            '从顶部栏打开调色板。勾选标记表示当前主题和强调色，颜色名称显示在调色板上方。字体通过下拉列表选择，界面密度和动画由下方开关控制。更改立即生效并保存在当前浏览器，无需另行保存。重置恢复默认主题、强调色、字体、密度和动画。'
        ]
    ]
])

sections.push(
    [
        'templates',
        'geofile-profile-budget',
        [
            [
                'Пороги и категории геофайлов',
                'Настраиваемый порог встроенных правил — 1–250 000 условий, по умолчанию 20 000, отдельно для каждого итогового профиля хоста. Независимый предел 900 000 байт учитывает форматирование и раскрытие StringList. При превышении порога или предела только этот профиль переходит на DAT с выбранными категориями; небольшие профили остаются встроенными. GeoSite и GeoIP выдаются отдельно, правила и их порядок сохраняются. Профили разных хостов не суммируются. Обычные DIRECT/REJECT не дублируются именами direct/block; существующие простые выходы используются повторно, пользовательские настройки выходов не заменяются. Ссылки подписаны, прежние ссылки поддерживаются. При переносе сохраняйте весь backups/geofiles вместе с файлами выбора категорий. Подписка и DAT доступны без запущенного VPN через публичный домен или настроенный CDN; HTTP 502, DNS и ошибки сертификата требуют проверки внешнего прокси и работающей страницы подписки. Ошибка загрузки не превращается в пустой успешный набор.'
            ],
            [
                'Geofile thresholds and categories',
                'The configurable inline threshold is 1–250,000 conditions, default 20,000, independently for each final host profile. An independent 900,000-byte budget includes formatting and StringList expansion. Exceeding either limit switches only that profile to DAT containing selected categories; smaller profiles stay inline. GeoSite and GeoIP are separate downloads; rule actions and order remain intact. Host profiles are never summed. Plain DIRECT/REJECT actions are not duplicated as direct/block; existing plain outbounds are reused without replacing custom outbound settings. Links are signed and earlier links remain supported. Preserve the entire backups/geofiles directory, including category selections, when migrating. Subscription and DAT URLs do not require a running VPN and use the public domain or configured CDN; HTTP 502, DNS and certificate failures require checking the external proxy and running subscription page. Download failure never becomes an empty successful dataset.'
            ],
            [
                'سقف‌ها و دسته‌های فایل جغرافیایی',
                'آستانه قابل تنظیم قوانین داخلی ۱–۲۵۰٬۰۰۰ شرط، پیش‌فرض ۲۰٬۰۰۰، جداگانه برای هر پروفایل نهایی میزبان است. سقف مستقل ۹۰۰٬۰۰۰ بایت شامل قالب‌بندی و بازشدن StringList است. عبور از هر سقف فقط همان پروفایل را به DAT دسته‌های انتخابی تبدیل می‌کند؛ پروفایل کوچک داخلی می‌ماند. GeoSite و GeoIP جدا هستند و عمل و ترتیب قوانین حفظ می‌شود. اندازه پروفایل میزبان‌ها جمع نمی‌شود. DIRECT/REJECT با direct/block تکرار نمی‌شوند؛ خروجی ساده موجود دوباره استفاده می‌شود و تنظیمات سفارشی جایگزین نمی‌شود. پیوندها امضا دارند و پیوندهای قدیمی معتبر می‌مانند. هنگام انتقال، کل backups/geofiles و انتخاب دسته‌ها را حفظ کنید. دریافت اشتراک و DAT به VPN فعال نیاز ندارد و از دامنه عمومی یا CDN تنظیم‌شده انجام می‌شود؛ خطای HTTP 502، DNS و گواهی به بررسی پراکسی بیرونی و اجرای صفحه اشتراک نیاز دارد. شکست دانلود هرگز مجموعه خالی موفق محسوب نمی‌شود.'
            ],
            [
                '地理文件阈值与分类',
                '内嵌规则阈值可设置为 1–250,000 个条件，默认 20,000，独立应用于每个最终主机配置。独立的 900,000 字节预算包含格式化及 StringList 展开。超过任一限制时，仅该配置切换为所选分类的 DAT，小型配置保留内嵌规则。GeoSite 和 GeoIP 分别下载，规则动作及顺序保持不变。不会累加各主机配置大小。普通 DIRECT/REJECT 不会重复显示为 direct/block；复用已有的普通出站，不覆盖自定义出站设置。链接经过签名，旧链接继续受支持。迁移时保留整个 backups/geofiles 目录及分类选择文件。订阅和 DAT 可通过公共域名或已配置的 CDN 下载，无需先开启 VPN；HTTP 502、DNS 或证书错误需要检查外部代理及订阅页面运行状态。下载失败不会被当作成功的空数据集。'
            ]
        ]
    ],
    [
        'nodes',
        'mptcp-kernel-security',
        [
            [
                'MPTCP и безопасность ядра Linux',
                'Xray v26.10.31 выключает MPTCP по умолчанию; явное streamSettings.sockopt.tcpMptcp сохраняется. Включать MPTCP для прежнего поведения следует только после установки исправленного ядра Linux и загрузки именно этого ядра. Docker-образ не обновляет ядро хоста. CVE-2026-98432 затрагивает TCP IPv4: выключение MPTCP снижает поверхность атаки, но не закрывает саму ошибку. Статус исправления проверяется по бюллетеню дистрибутива для конкретного пакета, а не только по номеру uname -r. Для проверки слушателей используйте sudo ss -Mlnp. Не включайте MPTCP на непроверенном ядре. Источники: https://github.com/XTLS/Xray-core/releases/tag/v26.10.31 и https://groups.google.com/g/golang-announce/c/PCoQcdxoScw/m/aD-MgXEvAAAJ.'
            ],
            [
                'MPTCP and Linux kernel security',
                'Xray v26.10.31 disables MPTCP by default; explicit streamSettings.sockopt.tcpMptcp remains available. Restore earlier MPTCP behavior only after installing a patched Linux kernel and booting that kernel. A Docker image does not update the host kernel. CVE-2026-98432 affects IPv4 TCP: disabling MPTCP reduces attack surface but does not fix the kernel bug itself. Verify the exact distribution package against its security bulletin rather than relying only on uname -r. Inspect listeners with sudo ss -Mlnp. Do not enable MPTCP on an unverified kernel. Sources: https://github.com/XTLS/Xray-core/releases/tag/v26.10.31 and https://groups.google.com/g/golang-announce/c/PCoQcdxoScw/m/aD-MgXEvAAAJ.'
            ],
            [
                'MPTCP و امنیت هسته لینوکس',
                'Xray v26.10.31 به‌طور پیش‌فرض MPTCP را خاموش می‌کند؛ تنظیم صریح streamSettings.sockopt.tcpMptcp باقی است. رفتار قبلی MPTCP را فقط پس از نصب هسته اصلاح‌شده لینوکس و راه‌اندازی با همان هسته برگردانید. تصویر Docker هسته میزبان را به‌روز نمی‌کند. CVE-2026-98432 مربوط به TCP IPv4 است؛ خاموش کردن MPTCP سطح حمله را کم می‌کند ولی خود خطای هسته را رفع نمی‌کند. وضعیت بسته دقیق توزیع را در بولتن امنیتی بررسی کنید، نه فقط شماره uname -r. شنونده‌ها با sudo ss -Mlnp بررسی می‌شوند. روی هسته تاییدنشده MPTCP را فعال نکنید. منابع: https://github.com/XTLS/Xray-core/releases/tag/v26.10.31 و https://groups.google.com/g/golang-announce/c/PCoQcdxoScw/m/aD-MgXEvAAAJ.'
            ],
            [
                'MPTCP 与 Linux 内核安全',
                'Xray v26.10.31 默认关闭 MPTCP，仍支持显式设置 streamSettings.sockopt.tcpMptcp。只有在安装修补后的 Linux 内核并启动该内核后，才应恢复原有 MPTCP 行为。Docker 镜像不会更新主机内核。CVE-2026-98432 影响 IPv4 TCP；关闭 MPTCP 可缩小攻击面，但无法修复内核漏洞本身。应根据发行版安全公告核验具体软件包，不能只依赖 uname -r。可使用 sudo ss -Mlnp 查看监听程序。不要在未经核验的内核上启用 MPTCP。来源：https://github.com/XTLS/Xray-core/releases/tag/v26.10.31 和 https://groups.google.com/g/golang-announce/c/PCoQcdxoScw/m/aD-MgXEvAAAJ。'
            ]
        ]
    ]
)

sections.push([
    'templates',
    'template-opening',
    [
        [
            'Открытие редактора шаблона',
            'Текст выбранного шаблона открывается независимо от загрузки списка хостов. Пока хосты загружаются, можно продолжать редактирование текста; выбор хостов и подсказки по ним станут доступны после загрузки. Ошибка списка хостов не заменяет шаблон пустым документом. Повторите загрузку списка перед изменением пула. Если не загрузился сам шаблон, повторите запрос со страницы ошибки и не создавайте пустую замену ради открытия редактора.'
        ],
        [
            'Opening a template',
            'The selected template text opens independently of the host list. While hosts are loading, you can continue editing text; host selection and host hints become available after loading. A failed host-list request does not replace the template with an empty document. Retry loading the list before changing a pool. If the template itself fails to load, retry from the error page instead of creating an empty replacement just to open the editor.'
        ],
        [
            'باز کردن قالب',
            'متن قالب انتخاب‌شده مستقل از فهرست میزبان‌ها باز می‌شود. هنگام بارگذاری میزبان‌ها می‌توانید متن را ویرایش کنید؛ انتخاب و راهنمای میزبان پس از بارگذاری در دسترس است. خطای فهرست میزبان، قالب را با سند خالی جایگزین نمی‌کند. پیش از تغییر مجموعه بارگذاری فهرست را تکرار کنید. اگر خود قالب بارگذاری نشد از صفحه خطا درخواست را تکرار کنید و برای باز شدن ویرایشگر جایگزین خالی نسازید.'
        ],
        [
            '打开模板',
            '所选模板文本独立于主机列表打开。主机加载期间可以继续编辑文本，加载完成后才可选择主机及查看提示。主机列表请求失败不会把模板替换为空文档。更改池之前请重试加载列表。如果模板本身加载失败，请从错误页重试，不要仅为打开编辑器而新建空白替代内容。'
        ]
    ]
])

export function explainOperations(articles) {
    for (const [articleId, id, translations] of sections) {
        const article = articles.find((item) => item.id === articleId)
        if (!article) throw new Error(`Missing article: ${articleId}`)
        article.sections.push({
            id,
            ...Object.fromEntries(
                ['ru', 'en', 'fa', 'zh'].map((lang, index) => [
                    lang,
                    { title: translations[index][0], body: translations[index][1] }
                ])
            )
        })
    }
}
