const sections = [
    [
        'architecture',
        'transactional-template-cache',
        [
            ['Свежесть шаблонов', 'Версия кэша читается из одной служебной строки PostgreSQL и меняется в той же транзакции, что и шаблон. Откат не публикует новую версию. Сбой очистки Redis не оставляет старый шаблон в других процессах API. Чтения не сканируют пользователей или таблицу шаблонов; персональные HWID, права и выдача остаются независимыми.'],
            ['Template freshness', 'The cache revision is read from one PostgreSQL metadata row and changes in the same transaction as the template. Rollback does not publish a new revision. Redis cleanup failures cannot leave other API processes serving the old template. Reads do not scan users or template rows; personal HWID, permissions and delivery remain independent.'],
            ['تازگی قالب‌ها', 'نسخه حافظه نهان از یک ردیف فراداده PostgreSQL خوانده می‌شود و در همان تراکنش قالب تغییر می‌کند. بازگردانی تراکنش نسخه جدیدی منتشر نمی‌کند. خطای پاک‌سازی Redis باعث ارائه قالب قدیمی در پردازش‌های دیگر API نمی‌شود. این خواندن کاربران یا جدول قالب‌ها را پیمایش نمی‌کند؛ HWID، مجوزها و خروجی هر کاربر مستقل می‌مانند.'],
            ['模板新鲜度', '缓存版本从 PostgreSQL 的一行元数据读取，并与模板在同一事务中更新。回滚不会发布新版本。Redis 清理失败不会导致其他 API 进程继续提供旧模板。读取不会扫描用户或模板表；个人 HWID、权限及订阅输出仍然独立。']
        ]
    ],
    [
        'architecture',
        'network-storage-and-cold-cache',
        [
            ['Сетевой диск и холодный кэш', 'Сетевой блочный диск сам по себе не делает сервер несовместимым. Важны задержка чтения и записи, доступные IOPS и сохранность подтверждённых записей. После запуска PostgreSQL и ОС часть данных ещё не находится в памяти; последующее ускорение может быть прогревом кэша, но это не доказывает отсутствие тяжёлых запросов. Сравнивайте задержки подписок при холодном и прогретом кэше, загрузку диска и ожидания БД. Не очищайте кэш рабочей БД ради проверки.\n\nОдинаковые одновременные чтения сырого шаблона в одном API-процессе используют один запрос при работающем общем кэше. Персональная выдача, HWID и права при этом не объединяются. Сборки одного набора геофайлов также разделяют работу и ограничены по ресурсам. Медленный диск всё равно ограничивает пропускную способность: увеличение числа подключений БД не устраняет нехватку IOPS.\n\nДля PostgreSQL нужен накопитель с корректной POSIX-семантикой и надёжным fsync. NFS требует hard-монтирования; серверный экспорт должен обеспечивать сохранность fsync. Не отключайте fsync ради скорости. Статистика blks_hit показывает кэш PostgreSQL, но не весь кэш ОС; для PostgreSQL 14/15 используйте pg_stat_database и pg_stat_activity, а pg_stat_io доступен начиная с 16. Официальные требования: https://www.postgresql.org/docs/current/creating-cluster.html'],
            ['Network storage and cold caches', 'Network-backed block storage does not by itself make a server incompatible. Read/write latency, available IOPS and durability of acknowledged writes matter. After PostgreSQL or the OS starts, some data is not yet in memory. Later improvement may be cache warming, but does not prove that queries are efficient. Compare cold and warm subscription latency, disk load and database waits. Do not clear a production database cache merely to test it.\n\nConcurrent reads of the same raw template share one query within an API process when the shared cache is available. Personal rendering, HWID and access checks are not shared. Identical geofile builds also share bounded work. Slow storage still limits throughput; adding database connections does not fix insufficient IOPS.\n\nPostgreSQL requires correct POSIX filesystem semantics and reliable fsync. NFS requires a hard mount and a server export that preserves fsync durability. Do not disable fsync for speed. blks_hit measures PostgreSQL cache hits, not the entire OS cache. Use pg_stat_database and pg_stat_activity on PostgreSQL 14/15; pg_stat_io is available from 16. Official requirements: https://www.postgresql.org/docs/current/creating-cluster.html'],
            ['ذخیره‌سازی شبکه‌ای و کش سرد', 'دیسک بلوکی شبکه‌ای به‌خودی‌خود ناسازگار نیست. تأخیر خواندن و نوشتن، IOPS و پایداری نوشتن تأییدشده مهم است. پس از شروع PostgreSQL یا سیستم‌عامل، بخشی از داده هنوز در حافظه نیست. بهبود بعدی ممکن است گرم‌شدن کش باشد، اما کارآمد بودن کوئری‌ها را ثابت نمی‌کند. تأخیر اشتراک سرد و گرم، بار دیسک و انتظار پایگاه داده را مقایسه کنید. برای آزمایش، کش پایگاه داده عملیاتی را پاک نکنید.\n\nخواندن هم‌زمان یک قالب خام در هر فرایند API با وجود کش مشترک یک کوئری را شریک می‌شود. خروجی شخصی، HWID و بررسی دسترسی مشترک نمی‌شوند. ساخت یکسان فایل جغرافیایی نیز کار محدود مشترک دارد. دیسک کند همچنان توان عملیاتی را محدود می‌کند؛ افزایش اتصال پایگاه داده کمبود IOPS را رفع نمی‌کند.\n\nPostgreSQL به رفتار درست POSIX و fsync مطمئن نیاز دارد. NFS به mount از نوع hard و export سرور با پایداری fsync نیاز دارد. fsync را برای سرعت خاموش نکنید. blks_hit کش PostgreSQL است، نه کل کش سیستم‌عامل. در PostgreSQL 14/15 از pg_stat_database و pg_stat_activity استفاده کنید؛ pg_stat_io از 16 موجود است. الزامات رسمی: https://www.postgresql.org/docs/current/creating-cluster.html'],
            ['网络存储与冷缓存', '网络块存储本身不意味着服务器不兼容。关键在于读写延迟、可用 IOPS 和已确认写入的持久性。PostgreSQL 或操作系统启动后，部分数据尚未进入内存；之后变快可能是缓存预热，但不能证明查询没有问题。应比较冷、热缓存下的订阅延迟、磁盘负载及数据库等待。不要仅为测试而清空生产数据库缓存。\n\n共享缓存可用时，同一 API 进程内并发读取同一个原始模板会共享一次数据库查询。个性化配置、HWID 和权限检查不会共享。相同地理文件构建也会复用有界任务。慢存储仍会限制吞吐量，增加数据库连接不能解决 IOPS 不足。\n\nPostgreSQL 需要正确的 POSIX 文件系统语义及可靠 fsync。NFS 需要 hard 挂载，服务器导出必须保证 fsync 的持久性。不要为速度关闭 fsync。blks_hit 表示 PostgreSQL 缓存命中，不包含全部操作系统缓存。PostgreSQL 14/15 使用 pg_stat_database 和 pg_stat_activity；pg_stat_io 从 16 起可用。官方要求：https://www.postgresql.org/docs/current/creating-cluster.html']
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
                'Кто проверяет окончание срока',
                'Внутренний планировщик панели каждые 30 секунд отправляет проверку срока в очередь USERS_WATCHDOG_QUEUE. Просроченные ACTIVE и LIMITED переводятся в EXPIRED, затем синхронизируется доступ на нодах. Дополнительный crontab не нужен. Планировщик, обработчик очереди, Valkey и база данных должны работать; при остановке обработчика выполнение задерживается. FROZEN исключён из автоматического истечения: остаток хранится как разница expireAt и frozenAt, при активации новый срок вычисляется от текущего времени. Постоянно переписывать дату в БД не требуется. Сбросы трафика выполняются своим расписанием и не размораживают пользователя.'
            ],
            [
                'How expiry is checked',
                'The panel scheduler enqueues an expiry check every 30 seconds in USERS_WATCHDOG_QUEUE. Overdue ACTIVE and LIMITED users become EXPIRED and node access is synchronized. No extra crontab is needed. The scheduler, queue worker, Valkey and database must be running; stopping a worker delays execution. FROZEN users are excluded from expiry: the saved remainder is expireAt minus frozenAt, and activation computes a new expiry from the current time. No continuous database date rewrite is required. Scheduled traffic resets follow their own schedule and never unfreeze users.'
            ],
            [
                'بررسی پایان اعتبار',
                'زمان‌بند داخلی پنل هر ۳۰ ثانیه بررسی اعتبار را در USERS_WATCHDOG_QUEUE قرار می‌دهد. کاربران ACTIVE و LIMITED منقضی به EXPIRED تغییر می‌کنند و دسترسی نود همگام می‌شود. crontab اضافی لازم نیست. زمان‌بند، پردازشگر صف، Valkey و پایگاه داده باید فعال باشند؛ توقف پردازشگر اجرا را عقب می‌اندازد. کاربران FROZEN از انقضای خودکار مستثنا هستند: باقی‌مانده اختلاف expireAt و frozenAt است و فعال‌سازی تاریخ جدید را از زمان جاری محاسبه می‌کند. بازنویسی پیوسته تاریخ لازم نیست. بازنشانی ترافیک زمان‌بندی مستقل دارد و کاربر را از توقف خارج نمی‌کند.'
            ],
            [
                '到期检查机制',
                '面板内部调度器每 30 秒向 USERS_WATCHDOG_QUEUE 提交到期检查。到期的 ACTIVE 和 LIMITED 用户转为 EXPIRED，并同步节点访问权限。无需额外 crontab。调度器、队列处理器、Valkey 和数据库必须运行；处理器停止会延迟执行。FROZEN 用户不参与自动到期：保存的剩余时长为 expireAt 与 frozenAt 之差，激活时从当前时间计算新到期日期，无需不断更新数据库日期。流量重置遵循独立计划，不会解除冻结。'
            ]
        ]
    ],
    [
        'api-tokens',
        'permanent-user-management-tokens',
        [
            [
                'Токен бота для пользователей и бессрочный доступ',
                'Набор «Пользователи» разрешает создание, изменение, заморозку и активацию, сброс трафика, чтение ключей и ссылок подписки, а также массовые операции над пользователями. Это фиксированный список из 30 прав ресурса users; управление HWID, каталогами сквадов и доменов требует отдельного выбора. Настройки панели, серверы, резервные копии и управление токенами в этот набор не входят. В API пользователей status FROZEN включает заморозку, ACTIVE — активацию. Нужен users:update или users:write, а также users:by-id или users:read; users:* покрывает оба разрешения. Истёкший аккаунт замораживается с нулевым остатком. При создании можно выбрать «Без срока действия»: API принимает expiresInDays: null, хранит expireAt: null и выпускает JWT без exp с явным признаком permanent. Это не фиктивная далёкая дата. Удаление и текущие права проверяются в БД при каждом запросе. Правка имени и прав не меняет срок или строку токена; для нового срока создайте замену и удалите старый токен. Минимальный набор страницы подписки содержит только system:metadata, subscriptions:subpage-config, subscription-page-configs:get и subscription-page-configs:list. Для включённой совместимости старых ссылок Marzban отдельно добавьте users:by-username.'
            ],
            [
                'User-management bots and permanent access',
                'The Users preset permits creating, editing, freezing/resuming users, resetting traffic, reading subscription keys and links, and bulk user operations. It is a fixed list of 30 users-resource scopes; HWID management and squad/domain catalogs require separate selection. It excludes panel settings, servers, backups and token administration. In the user API, set status FROZEN to freeze and ACTIVE to resume. Required scopes: users:update or users:write, plus users:by-id or users:read; users:* covers both. Expired accounts freeze with zero remaining time. When creating a token select No expiration: expiresInDays: null stores expireAt: null and signs a JWT without exp with an explicit permanent marker. No fabricated distant date is used. Every request checks deletion and current scopes in the database. Editing names/permissions preserves token value and expiry; create a replacement and delete the old token to change lifetime. The minimum subscription-page preset contains only system:metadata, subscriptions:subpage-config, subscription-page-configs:get and subscription-page-configs:list. Add users:by-username separately only for enabled Marzban legacy-link compatibility.'
            ],
            [
                'توکن مدیریت کاربران و دسترسی بدون انقضا',
                'گزینه کاربران ایجاد، ویرایش، تعلیق و فعال‌سازی، بازنشانی ترافیک، خواندن کلید و لینک اشتراک و عملیات گروهی کاربران را مجاز می‌کند. این فهرست ثابت 30 مجوز از منبع users دارد؛ مدیریت HWID و فهرست گروه‌ها و دامنه‌ها باید جداگانه انتخاب شوند. تنظیمات پنل، سرورها، پشتیبان‌ها و مدیریت توکن‌ها شامل نمی‌شود. برای تعلیق از API کاربران و {"id":123,"status":"FROZEN"} و برای فعال‌سازی از ACTIVE استفاده کنید. مجوز users:update یا users:write همراه با users:by-id یا users:read لازم است؛ users:* هر دو را پوشش می‌دهد. حساب منقضی با زمان باقی‌مانده صفر تعلیق می‌شود. گزینه بدون انقضا با expiresInDays: null، مقدار expireAt: null و JWT بدون exp با permanent صریح ایجاد می‌شود. حذف و مجوزهای جاری در هر درخواست از پایگاه داده بررسی می‌شوند. ویرایش نام و مجوز، مقدار و مدت توکن را تغییر نمی‌دهد؛ برای تغییر مدت، توکن جایگزین بسازید و قبلی را حذف کنید. صفحه اشتراک فقط system:metadata، subscriptions:subpage-config، subscription-page-configs:get و subscription-page-configs:list نیاز دارد؛ users:by-username فقط برای سازگاری فعال لینک قدیمی Marzban اضافه شود.'
            ],
            [
                '用户管理令牌与永久访问',
                '“用户”预设允许创建、修改、冻结/恢复用户、重置流量、读取订阅密钥及链接、批量管理用户。这是固定的 30 项 users 资源权限；HWID 管理以及分组和域名目录需另行选择。不包含面板设置、服务器、备份或令牌管理。冻结使用 用户 API 和 {"id":123,"status":"FROZEN"}，恢复使用 ACTIVE。需要 users:update 或 users:write，以及 users:by-id 或 users:read；users:* 同时包含两种权限。已过期账户冻结后剩余时间为零。创建时选择“永不过期”：expiresInDays: null 保存为 expireAt: null，并签发带显式 permanent 标记且没有 exp 的 JWT，不使用虚假的遥远日期。每次请求均检查数据库中的撤销状态和当前权限。编辑名称及权限不会改变令牌值和期限；更改期限请创建替代令牌后删除旧令牌。订阅页面最小权限仅为 system:metadata、subscriptions:subpage-config、subscription-page-configs:get、subscription-page-configs:list。仅在启用 Marzban 旧链接兼容时另加 users:by-username。'
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
                'В меню пользователя выберите «Заморозить»: обычный доступ отключается, а оставшийся срок сохраняется. Например, два оставшихся дня останутся двумя днями до активации. При возобновлении новый срок рассчитывается из остатка; повторная заморозка его не меняет. Если остаток равен нулю или квота исчерпана, доступ автоматически не включится. Продление увеличивает остаток. Истёкшую подписку можно заморозить с нулевым остатком; сохранённый остаток форматируется независимо от текущей даты. Вместо даты отображается синий сохранённый остаток; дата не редактируется. Для действующего срока предупреждение жёлтое за три дня, после окончания — красное. Существующий трафик не сбрасывается самой заморозкой; настроенные периодические сбросы продолжают работать. Состояние сохраняется при перезапуске и экспорте с импортом. При массовой заморозке доступ устройств обновляется для каждого пользователя; обработка выполняется в очереди.'
            ],
            [
                'Freeze a subscription',
                'Choose Freeze in the user menu: ordinary access is paused and the remaining lifetime is retained. Two days remaining stay two days until activation. Resuming sets the new expiry from that remainder; repeating Freeze does not change it. Zero remaining time or an exhausted quota does not grant access. Extending adds to the remainder. Expired subscriptions can be frozen with zero remaining time; the saved remainder is formatted independently of the current date. A blue saved remainder replaces the date editor. Active expiry warnings turn yellow at three days and red on expiry. Freezing itself does not reset usage; scheduled traffic resets continue. The state survives restarts and export/import. Bulk freezes synchronize each user’s device access through the queue.'
            ],
            [
                'توقف اشتراک',
                'در منوی کاربر، توقف اشتراک را انتخاب کنید. دسترسی معمول قطع و زمان باقی‌مانده حفظ می‌شود؛ مثلاً دو روز تا زمان فعال‌سازی دو روز می‌ماند. با فعال‌سازی، تاریخ انقضا از باقی‌مانده محاسبه می‌شود و تکرار توقف آن را تغییر نمی‌دهد. زمان صفر یا سهمیه تمام‌شده موجب فعال شدن دسترسی نمی‌شود. تمدید به زمان باقی‌مانده اضافه می‌شود و تاریخ در حالت توقف قابل ویرایش نیست. اشتراک منقضی‌شده با زمان صفر متوقف می‌شود؛ نمایش زمان ذخیره‌شده به تاریخ جاری وابسته نیست. باقی‌مانده آبی است؛ هشدار سه روز مانده زرد و پس از انقضا قرمز است. توقف، ترافیک را بازنشانی نمی‌کند؛ بازنشانی زمان‌بندی‌شده ادامه دارد. وضعیت پس از راه‌اندازی مجدد و انتقال فایل حفظ می‌شود. دسترسی دستگاه‌ها در عملیات گروهی از طریق صف همگام می‌شود.'
            ],
            [
                '冻结订阅',
                '在用户菜单选择冻结：普通访问暂停，剩余有效期被保存。例如剩余两天会一直保持两天，直到重新激活。恢复时根据剩余时长计算新到期时间；重复冻结不会改变时长。剩余时间为零或流量额度耗尽时不会自动开放访问。续期增加剩余时间；已过期的订阅可冻结，剩余时间为零；保存的剩余时间不依赖当前日期进行格式化。冻结时显示蓝色剩余时长，日期不可编辑。有效期剩余三天时显示黄色，过期后显示红色。冻结本身不会清空流量，计划流量重置仍会执行。重启及导出导入后状态仍会保留。批量冻结通过队列逐个同步设备访问。'
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
                'Диагностика и безопасные операции',
                "Проверка связи использует реальный запрос mTLS к зарегистрированной ноде, проверяет Xray, синхронизацию пользователей и статус применения портов. Она не проверяет весь путь от устройства клиента. Отключённые ноды не опрашиваются; частота ручных проверок ограничена. Изменения портов сначала проверяются, затем подтверждаются с хешем просмотра и текущей ревизией: устаревший просмотр не применяется. Успех подтверждает ACK ноды, а не постановка в очередь. При ошибке можно восстановить ранее применённую ревизию без перезаписи более новых изменений. Авария подтверждается тремя наблюдениями минимум за 20 секунд, восстановление — двумя за 10 секунд. Новые неподключённые ноды не вызывают аварий. Обслуживание и операции подавляют уведомления; ручная пауза на 30 минут не останавливает проверки. Мастер установки создаёт ноду, использует проверенный установщик через SSH и подтверждает связь отдельной диагностикой; существующий каталог не перезаписывается. NET_ADMIN выключен по умолчанию. Если задан IP главного сервера, все входящие порты и ping разрешены только от него, кроме SSH (22 и обнаруженные порты sshd). Правила учитывают Docker forwarding и IPv6, сохраняют исходящие ответы и не очищают чужой firewall. Для HTTP-01 это несовместимо с внешним продлением сертификата: используйте DNS-01 или внешнее управление сертификатом. Отмена: python3 /etc/remnacust-node-firewall/guard.py remove.\n\nПроверка выпуска (--check-release) не запускает APT. Фоновое обновление компонентов из панели откладывает обслуживание ОС, требующее SSH, и сообщает об этом в прогрессе и приватном журнале; это само по себе не блокирует обновление компонента. Пакеты ОС обслуживаются отдельно через интерактивный SSH-сеанс с ответами на вопросы dpkg/debconf. --yes не подменяет эти ответы; автоматической перезагрузки нет."
            ],
            [
                'Diagnostics and safe operations',
                "Diagnostics make a real mTLS request to the registered node and check Xray, user synchronization and port apply status. They do not verify the full client network path. Disabled nodes are not probed; manual probes are rate limited. Port edits are reviewed, then confirmed with a review hash and current revision: stale reviews are rejected. Success requires node ACK, not merely enqueueing. Errors allow restoring a previously applied revision without overwriting newer edits. Outages require three observations over at least 20 seconds; recovery requires two over 10 seconds. Never-connected installations do not generate outage alerts. Maintenance and operations suppress alerts; a manual 30-minute pause does not stop health checks. The install wizard uses the verified installer over SSH and confirms connectivity separately; existing directories are not overwritten. NET_ADMIN defaults off. When a main server IP is set, all incoming ports and ping accept only that source except SSH (22 and detected sshd ports). Rules cover Docker forwarding and IPv6, preserve outbound replies and never flush other firewall rules. This blocks external HTTP-01 renewals: use DNS-01 or externally managed certificates. Remove the guard with python3 /etc/remnacust-node-firewall/guard.py remove.\n\nRelease checking (--check-release) does not run APT. Background component updates from the panel defer OS maintenance that requires SSH and record it in progress and the private log; that deferral alone does not block the component update. Maintain OS packages separately through an interactive SSH session and answer dpkg/debconf questions. --yes does not supply those answers; there is no automatic reboot."
            ],
            [
                'عیب‌یابی و عملیات امن',
                "عیب‌یابی درخواست واقعی mTLS به نود ثبت‌شده می‌فرستد و Xray، همگام‌سازی کاربران و اعمال پورت را بررسی می‌کند؛ مسیر کامل کلاینت را نمی‌آزماید. نود غیرفعال بررسی نمی‌شود و بررسی دستی محدودیت نرخ دارد. تغییر پورت ابتدا بازبینی و سپس با هش بازبینی و نسخهٔ جاری تأیید می‌شود؛ بازبینی قدیمی رد می‌شود. موفقیت به ACK نود نیاز دارد، نه صرفاً صف. بازیابی نسخهٔ اعمال‌شده تغییر جدیدتر را بازنویسی نمی‌کند. خرابی با سه مشاهده در دست‌کم ۲۰ ثانیه و بازیابی با دو مشاهده در ۱۰ ثانیه تأیید می‌شود. نود هرگز متصل‌نشده هشدار خرابی نمی‌دهد. نگهداری و عملیات هشدار را ساکت می‌کنند؛ توقف دستی ۳۰ دقیقه‌ای بررسی سلامت را متوقف نمی‌کند. نصب از نصب‌کنندهٔ تأییدشده با SSH استفاده و ارتباط را جداگانه بررسی می‌کند؛ پوشهٔ موجود بازنویسی نمی‌شود. NET_ADMIN پیش‌فرض خاموش است. با IP سرور اصلی، تمام پورت‌های ورودی و ping جز SSH فقط از آن منبع مجازند؛ پورت ۲۲ و پورت‌های شناسایی‌شدهٔ sshd حفظ می‌شوند. قوانین Docker و IPv6 و پاسخ خروجی را پوشش می‌دهند و فایروال دیگر را پاک نمی‌کنند. تمدید خارجی HTTP-01 مسدود می‌شود؛ از DNS-01 یا مدیریت خارجی گواهی استفاده کنید. حذف محدودیت: python3 /etc/remnacust-node-firewall/guard.py remove.\n\nبررسی انتشار (--check-release) APT را اجرا نمی‌کند. به‌روزرسانی پس‌زمینهٔ مؤلفه‌ها از پنل، نگهداری سیستم‌عاملِ نیازمند SSH را به تعویق می‌اندازد و در پیشرفت و گزارش خصوصی ثبت می‌کند؛ این تعویق به‌تنهایی مانع به‌روزرسانی مؤلفه نیست. بسته‌های سیستم‌عامل را جداگانه در نشست تعاملی SSH نگهداری کنید و به پرسش‌های dpkg/debconf پاسخ دهید. --yes این پاسخ‌ها را ارائه نمی‌کند و راه‌اندازی مجدد خودکار وجود ندارد."
            ],
            [
                '诊断与安全操作',
                "诊断向已注册节点发送真实 mTLS 请求，检查 Xray、用户同步和端口应用状态，不验证完整客户端路径。禁用节点不会被探测，手动检查有速率限制。端口更改先预览，再用预览哈希和当前版本确认；过期预览被拒绝。成功需要节点 ACK，而非仅入队。错误时可恢复已应用版本，不覆盖更新的修改。故障需至少 20 秒内三次观测，恢复需 10 秒内两次观测。从未连接的节点不会触发故障告警。维护和操作抑制告警；手动暂停 30 分钟不会停止健康检查。安装向导通过 SSH 使用已验证安装器，并单独确认连接；不会覆盖现有目录。NET_ADMIN 默认关闭。设置主服务器 IP 后，除 SSH 外，所有入站端口和 ping 仅接受该来源；保留 22 和检测到的 sshd 端口。规则覆盖 Docker 转发及 IPv6，保留出站响应，不清空其他防火墙规则。这会阻止外部 HTTP-01 续期；请使用 DNS-01 或外部证书管理。移除限制：python3 /etc/remnacust-node-firewall/guard.py remove。\n\n版本检查（--check-release）不会运行 APT。面板后台组件更新会推迟需要 SSH 的操作系统维护，并在进度和私有日志中记录；仅此推迟不会阻止组件更新。请单独通过交互式 SSH 会话维护系统软件包并回答 dpkg/debconf 问题。--yes 不会代替这些回答，也不会自动重启。"
            ]
        ]
    ],
    [
        'users',
        'users-device-subscription-preview',
        [
            [
                'Предпросмотр подписки устройства',
                'В карточке устройств выберите уже зарегистрированное устройство, формат и User-Agent и выполните предпросмотр. Используется реальный генератор и правила ответа; устройство и история подключений не изменяются, новые ключи доступа в БД не создаются. Заблокированное устройство не получает рабочий доступ. Список хостов показывает кандидатов: окончательную фильтрацию протокола и пула выполняет генератор. Конфигурация с ключами скрыта по умолчанию и выдаётся только по явному запросу, до 2 MiB. Это приватные данные: не отправляйте их в публичный журнал.'
            ],
            [
                'Device subscription preview',
                'Select an already registered device, format and User-Agent in the device card and generate a preview. It uses the real generator and response rules without changing the device or connection history or creating access keys in the database. A blocked device receives no working access. The host list shows candidates; the generator performs final protocol and pool filtering. Configuration containing keys is hidden by default and returned only on explicit request, up to 2 MiB. Treat it as private and keep it out of public logs.'
            ],
            [
                'پیش‌نمایش اشتراک دستگاه',
                'در کارت دستگاه، دستگاه ثبت‌شده، قالب و User-Agent را انتخاب و پیش‌نمایش بسازید. از مولد واقعی و قوانین پاسخ استفاده می‌شود؛ دستگاه و تاریخچه تغییر نمی‌کنند و کلید دسترسی در پایگاه داده ساخته نمی‌شود. دستگاه مسدود دسترسی فعال نمی‌گیرد. فهرست میزبان نامزدهاست؛ مولد پالایش نهایی پروتکل و مجموعه را انجام می‌دهد. پیکربندی دارای کلید پیش‌فرض پنهان است و فقط با درخواست صریح تا ۲ MiB بازگردانده می‌شود. آن را خصوصی نگه دارید و در گزارش عمومی نفرستید.'
            ],
            [
                '设备订阅预览',
                '在设备卡片选择已注册设备、格式及 User-Agent 并生成预览。使用真实生成器和响应规则，不改变设备或连接历史，也不在数据库创建访问密钥。被封禁设备不会获得有效访问。主机列表为候选，生成器执行最终协议和池筛选。含密钥配置默认隐藏，仅明确请求时返回，最大 2 MiB。请作为私密数据处理，不要写入公共日志。'
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
