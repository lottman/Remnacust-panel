const sections = [
    ['templates', 'selection-and-geofile-workflow', [
        ['Автовыбор и геофайлы в редакторе', 'У каждого автовыбора одна раскрывающаяся карточка: серверы для выбора, стратегия и хосты подписки, на которых он используется. Назначение относится к имени конкретного балансера; переименование сохраняет связь. Если у старого назначения единственный возможный автовыбор, оно показано внутри него; при нескольких вариантах выберите связь явно. Простое открытие страницы не переписывает код. Вкладки прокручиваются со страницей, сохранение остаётся внизу. В геофайлах выберите библиотеку, компьютер или ссылку. Загрузка сразу сохраняет файл в общей библиотеке; совместимый файл подключается к текущему черновику одним действием. Настройте категории, действие и доставку в карточке файла и сохраните шаблон. Удаление из шаблона не удаляет файл из библиотеки. Общие параметры файла и обновления на сервере находятся в раскрывающемся разделе библиотеки.'],
        ['Selection and geofile editor workflow', 'Each selection has one expandable card containing its servers, strategy and subscription host assignments. Assignments belong to a specific balancer name; renaming preserves the link. A legacy assignment with one possible selection appears inside it; ambiguous assignments require an explicit target. Opening the page does not rewrite code. Tabs scroll with the page; saving stays at the bottom. For geofiles, choose the library, computer or URL. Uploads immediately store the file in the shared library; a compatible file attaches to the current draft in one action. Set categories, action and delivery in its card, then save the template. Detaching a file does not delete it from the library. Shared file settings and server refresh are in the expandable library section.'],
        ['روند ویرایش انتخاب خودکار و فایل جغرافیایی', 'هر انتخاب خودکار یک کارت بازشدنی شامل سرورها، روش انتخاب و میزبان‌های اشتراک دارد. تخصیص به نام یک بالانسر مشخص متصل است و تغییر نام این ارتباط را حفظ می‌کند. تخصیص قدیمی با یک انتخاب ممکن در همان کارت نشان داده می‌شود؛ برای تخصیص مبهم مقصد را صریح انتخاب کنید. باز کردن صفحه کد را تغییر نمی‌دهد. زبانه‌ها با صفحه حرکت می‌کنند و ذخیره در پایین می‌ماند. برای فایل جغرافیایی کتابخانه، رایانه یا نشانی را انتخاب کنید. بارگذاری فایل را بلافاصله در کتابخانه مشترک ذخیره می‌کند و فایل سازگار با یک عمل به پیش‌نویس فعلی متصل می‌شود. دسته‌ها، عمل و تحویل را تنظیم و الگو را ذخیره کنید. جدا کردن فایل از الگو آن را از کتابخانه حذف نمی‌کند. تنظیمات مشترک فایل و به‌روزرسانی سرور در بخش بازشدنی کتابخانه است.'],
        ['自动选择和地理文件编辑流程', '每个自动选择使用一张可展开卡片，集中配置服务器、策略和订阅主机分配。分配关联到具体的负载均衡器名称，重命名时保留关联。旧分配若只有一个可用目标，会显示在该卡片中；目标不明确时需显式选择。打开页面不会重写代码。选项卡随页面滚动，保存操作保留在底部。地理文件可从文件库、电脑或链接添加。上传会立即将文件存入共享文件库，兼容文件可一步关联至当前草稿。设置分类、动作和交付方式后保存模板。从模板移除文件不会从文件库删除文件。共享文件设置和服务器刷新位于文件库的可展开区域。']
    ]],
    ['subscription-settings', 'local-subscription-page-management', [
        ['Страницы на сервере', 'Вкладка «Страницы подписки» управляет только зарегистрированными экземплярами на сервере панели. Доступны запуск, остановка, перезапуск и отдельное обновление. Нужен установщик 1.2.96 с локальной службой управления. CLI: install-subscription-page, upgrade-subscription-page --page-id ID и manage-subscription-page. Список показывает ID. Локальная панель использует отдельный ограниченный токен и сеть Docker; удалённая требует HTTPS и API-токен с правами страницы. Порты страницы доступны на loopback; HTTPS настраивается через свободный отдельный Caddy или существующий proxy. Обновление сохраняет настройки и остановленное состояние, при сбое готовности откатывает Compose. Приватные журналы находятся в /opt/remnacust/logs/page-<id>.log. Произвольные Docker-команды, пути и образы через браузер не принимаются.'],
        ['Pages on this server', 'The Subscription pages tab manages registered instances on the panel server: start, stop, restart and independent update. Installer 1.2.96 and its local control service are required. CLI commands: install-subscription-page, upgrade-subscription-page --page-id ID, and manage-subscription-page; the list shows IDs. A local panel uses a separate restricted token and Docker network. A remote panel requires HTTPS and a subscription-page API token. Page ports bind to loopback; use a separate Caddy on free HTTPS ports or your existing proxy. Updates preserve settings and stopped state; failed readiness rolls Compose back. Private operation logs: /opt/remnacust/logs/page-<id>.log. Browser requests cannot supply arbitrary commands, paths or images.'],
        ['صفحه‌های همین سرور', 'زبانه صفحه‌های اشتراک فقط نمونه‌های ثبت‌شده در سرور پنل را اجرا، متوقف، بازراه‌اندازی و جداگانه به‌روزرسانی می‌کند. نصب‌کننده 1.2.96 و سرویس محلی لازم است. فرمان‌ها: install-subscription-page، upgrade-subscription-page --page-id ID و manage-subscription-page. اتصال محلی از توکن محدود و شبکه Docker استفاده می‌کند؛ اتصال راه دور به HTTPS و توکن صفحه نیاز دارد. پورت فقط روی loopback است؛ HTTPS با Caddy جداگانه روی پورت آزاد یا proxy موجود تنظیم می‌شود. تنظیمات و وضعیت توقف حفظ می‌شوند و خطای آمادگی Compose را برمی‌گرداند. گزارش خصوصی در /opt/remnacust/logs/page-<id>.log است. فرمان، مسیر و تصویر دلخواه از مرورگر پذیرفته نمی‌شود.'],
        ['此服务器上的页面', '“订阅页面”标签只管理面板服务器上已注册的实例，可启动、停止、重启或单独更新。需要安装程序 1.2.96 及本地控制服务。CLI：install-subscription-page、upgrade-subscription-page --page-id ID、manage-subscription-page；列表显示 ID。本地面板使用独立受限令牌和 Docker 网络，远程面板需要 HTTPS 及订阅页面 API 令牌。页面端口仅绑定 loopback；HTTPS 可使用空闲端口上的独立 Caddy 或现有代理。更新保留设置和停止状态，未通过就绪检查时回滚 Compose。私有日志位于 /opt/remnacust/logs/page-<id>.log。浏览器不能提交任意命令、路径或镜像。']
    ]],
    ['templates', 'incy-checksum-delivery', [
        ['Проверка геофайлов INCY', 'INCY получает стабильные URL DAT без параметров запроса. Подписанный выбор файлов находится в пути: добавление .sha256 к полному URL возвращает контрольную сумму того же набора. Неизменённый файл можно проверить без повторной загрузки; интервал задаётся routing-geo-update-interval в часах. Если отдельно установлена страница подписки, обновите её вместе с панелью. При отключении загрузки прежний профиль получает пустые URL и интервал 0; встроенные правила остаются в JSON. Ранее выданные ссылки поддерживаются. Поведение расписания и повторов после сетевой ошибки зависит от версии клиента; сервер не включает туннель. Официальный протокол: https://docs.incy.cc/routing/'],
        ['INCY geofile checks', 'INCY receives stable DAT URLs without query parameters. The signed file selection is in the path, so appending .sha256 to the complete URL returns the checksum for the same bundle. Unchanged files can be checked without downloading them again. routing-geo-update-interval uses hours. Update a separately deployed subscription page together with the panel. Turning downloads off replaces the old provider profile with empty geofile URLs and disables periodic checks; the JSON keeps the embedded rules. Previously issued URLs remain supported. Scheduling and network-error retries depend on the client version; the server does not start the tunnel. Official protocol: https://docs.incy.cc/routing/'],
        ['بررسی فایل جغرافیایی INCY', 'نشانی DAT برای INCY ثابت و بدون query است. انتخاب امضاشده در مسیر قرار دارد؛ افزودن .sha256 به نشانی کامل، هش همان مجموعه را می‌دهد. فایل بدون تغییر به دانلود مجدد نیاز ندارد. routing-geo-update-interval بر حسب ساعت است. صفحه اشتراک جداگانه را همراه پنل به‌روزرسانی کنید. با خاموش کردن دانلود، نشانی‌های فایل در پروفایل قبلی خالی و بررسی دوره‌ای غیرفعال می‌شود؛ قوانین تعبیه‌شده در JSON باقی می‌مانند. نشانی‌های قبلی همچنان کار می‌کنند. زمان‌بندی و تکرار پس از خطای شبکه به نسخه برنامه بستگی دارد؛ تونل اجرا نمی‌شود. پروتکل رسمی: https://docs.incy.cc/routing/'],
        ['INCY 地理文件校验', 'INCY 获得不含查询参数的稳定 DAT URL。经过签名的文件选择位于路径中，在完整 URL 后添加 .sha256 即返回同一文件包的校验和。未更改的文件无需重新下载。routing-geo-update-interval 的单位为小时。独立部署的订阅页面应与面板一同更新。关闭下载后，原有配置的地理文件 URL 将被清空，定期检查也会停用；内嵌规则仍保留在 JSON 中。旧 URL 仍受支持。调度和网络错误重试取决于客户端版本；服务器不会开启隧道。官方协议：https://docs.incy.cc/routing/']
    ]],
    [
        'nodes', 'nodes-ssh-install-http01',
        [
            ['Установка и сертификат', 'Для установки по SSH нужен root или sudo без пароля; существующий пустой каталог допустим. Ошибка показывает этап, а подробный журнал сохраняется на сервере. При ограничении по IP панели и HTTP-01 TCP 80 временно открывается для проверки сертификата и автоматически закрывается после неё; при сбое окно истекает не позднее чем через 15 минут. Так же работает продление. Внешний firewall и ограничения провайдера нужно настроить отдельно. Для постоянно закрытого порта 80 используйте DNS-01 или готовый сертификат.'],
            ['Installation and certificates', 'SSH installation requires root or passwordless sudo; an existing empty directory is allowed. Failures show the stage and detailed logs remain on the server. With a panel-IP restriction and HTTP-01, TCP 80 opens temporarily for certificate validation and closes afterwards; a failed process cannot keep it open longer than 15 minutes. Renewal uses the same rule. External and provider firewalls need their own configuration. Use DNS-01 or an existing certificate to keep port 80 closed.'],
            ['نصب و گواهی', 'نصب از طریق SSH به root یا sudo بدون گذرواژه نیاز دارد؛ پوشه خالی موجود پذیرفته می‌شود. مرحله خطا نمایش داده می‌شود و گزارش کامل روی سرور می‌ماند. با محدودیت IP پنل و HTTP-01، پورت 80 فقط برای تأیید گواهی موقتاً باز و سپس بسته می‌شود؛ در صورت خطا حداکثر پس از ۱۵ دقیقه بسته می‌شود. تمدید نیز همین روش را دارد. دیوار آتش خارجی و ارائه‌دهنده باید جداگانه تنظیم شوند. برای بسته ماندن دائمی پورت 80 از DNS-01 یا گواهی موجود استفاده کنید.'],
            ['安装和证书', 'SSH 安装需要 root 或免密码 sudo；允许使用已有空目录。错误会显示失败阶段，详细日志保存在服务器上。启用面板 IP 限制并使用 HTTP-01 时，TCP 80 仅在证书验证期间临时开放，随后关闭；进程异常时最多 15 分钟后自动关闭。续期采用相同方式。外部及服务商防火墙需单独配置。若要始终关闭 80 端口，请使用 DNS-01 或现有证书。']
        ]
    ],
    [
        'users',
        'users-frozen-lifetime',
        [
            ['Заморозка подписки', 'В меню пользователя выберите «Заморозить»: обычный доступ отключается, а оставшийся срок сохраняется. Например, два оставшихся дня останутся двумя днями до активации. При возобновлении новый срок рассчитывается из остатка; повторная заморозка его не меняет. Если остаток равен нулю или квота исчерпана, доступ автоматически не включится. Продление увеличивает остаток. Истёкшую подписку нельзя заморозить. При наступлении срока открытое меню отключает заморозку автоматически; сохранённый остаток форматируется независимо от текущей даты. Вместо даты отображается синий сохранённый остаток; дата не редактируется. Для действующего срока предупреждение жёлтое за три дня, после окончания — красное. Существующий трафик не сбрасывается самой заморозкой; настроенные периодические сбросы продолжают работать. Состояние сохраняется при перезапуске и экспорте с импортом. При массовой заморозке доступ устройств обновляется для каждого пользователя; обработка выполняется в очереди.'],
            ['Freeze a subscription', 'Choose Freeze in the user menu: ordinary access is paused and the remaining lifetime is retained. Two days remaining stay two days until activation. Resuming sets the new expiry from that remainder; repeating Freeze does not change it. Zero remaining time or an exhausted quota does not grant access. Extending adds to the remainder. Expired subscriptions cannot be frozen. The open menu disables Freeze automatically at expiry; the saved remainder is formatted independently of the current date. A blue saved remainder replaces the date editor. Active expiry warnings turn yellow at three days and red on expiry. Freezing itself does not reset usage; scheduled traffic resets continue. The state survives restarts and export/import. Bulk freezes synchronize each user’s device access through the queue.'],
            ['توقف اشتراک', 'در منوی کاربر، توقف اشتراک را انتخاب کنید. دسترسی معمول قطع و زمان باقی‌مانده حفظ می‌شود؛ مثلاً دو روز تا زمان فعال‌سازی دو روز می‌ماند. با فعال‌سازی، تاریخ انقضا از باقی‌مانده محاسبه می‌شود و تکرار توقف آن را تغییر نمی‌دهد. زمان صفر یا سهمیه تمام‌شده موجب فعال شدن دسترسی نمی‌شود. تمدید به زمان باقی‌مانده اضافه می‌شود و تاریخ در حالت توقف قابل ویرایش نیست. اشتراک منقضی‌شده متوقف نمی‌شود. هنگام انقضا، گزینه توقف در منوی باز خودکار غیرفعال می‌شود؛ نمایش زمان ذخیره‌شده به تاریخ جاری وابسته نیست. باقی‌مانده آبی است؛ هشدار سه روز مانده زرد و پس از انقضا قرمز است. توقف، ترافیک را بازنشانی نمی‌کند؛ بازنشانی زمان‌بندی‌شده ادامه دارد. وضعیت پس از راه‌اندازی مجدد و انتقال فایل حفظ می‌شود. دسترسی دستگاه‌ها در عملیات گروهی از طریق صف همگام می‌شود.'],
            ['冻结订阅', '在用户菜单选择冻结：普通访问暂停，剩余有效期被保存。例如剩余两天会一直保持两天，直到重新激活。恢复时根据剩余时长计算新到期时间；重复冻结不会改变时长。剩余时间为零或流量额度耗尽时不会自动开放访问。续期增加剩余时间；已过期的订阅无法冻结。到期时，打开的菜单会自动禁用冻结；保存的剩余时间不依赖当前日期进行格式化。冻结时显示蓝色剩余时长，日期不可编辑。有效期剩余三天时显示黄色，过期后显示红色。冻结本身不会清空流量，计划流量重置仍会执行。重启及导出导入后状态仍会保留。批量冻结通过队列逐个同步设备访问。']
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
                'Проверка связи использует реальный запрос mTLS к зарегистрированной ноде, проверяет Xray, синхронизацию пользователей и статус применения портов. Она не проверяет весь путь от устройства клиента. Отключённые ноды не опрашиваются; частота ручных проверок ограничена. Изменения портов сначала проверяются, затем подтверждаются с хешем просмотра и текущей ревизией: устаревший просмотр не применяется. Успех подтверждает ACK ноды, а не постановка в очередь. При ошибке можно восстановить ранее применённую ревизию без перезаписи более новых изменений. Авария подтверждается тремя наблюдениями минимум за 20 секунд, восстановление — двумя за 10 секунд. Новые неподключённые ноды не вызывают аварий. Обслуживание и операции подавляют уведомления; ручная пауза на 30 минут не останавливает проверки. Мастер установки создаёт ноду, использует проверенный установщик через SSH и подтверждает связь отдельной диагностикой; существующий каталог не перезаписывается. NET_ADMIN выключен по умолчанию. Если задан IP главного сервера, все входящие порты и ping разрешены только от него, кроме SSH (22 и обнаруженные порты sshd). Правила учитывают Docker forwarding и IPv6, сохраняют исходящие ответы и не очищают чужой firewall. Для HTTP-01 это несовместимо с внешним продлением сертификата: используйте DNS-01 или внешнее управление сертификатом. Отмена: python3 /etc/remnacust-node-firewall/guard.py remove.'
            ],
            [
                'Diagnostics and safe operations',
                'Diagnostics make a real mTLS request to the registered node and check Xray, user synchronization and port apply status. They do not verify the full client network path. Disabled nodes are not probed; manual probes are rate limited. Port edits are reviewed, then confirmed with a review hash and current revision: stale reviews are rejected. Success requires node ACK, not merely enqueueing. Errors allow restoring a previously applied revision without overwriting newer edits. Outages require three observations over at least 20 seconds; recovery requires two over 10 seconds. Never-connected installations do not generate outage alerts. Maintenance and operations suppress alerts; a manual 30-minute pause does not stop health checks. The install wizard uses the verified installer over SSH and confirms connectivity separately; existing directories are not overwritten. NET_ADMIN defaults off. When a main server IP is set, all incoming ports and ping accept only that source except SSH (22 and detected sshd ports). Rules cover Docker forwarding and IPv6, preserve outbound replies and never flush other firewall rules. This blocks external HTTP-01 renewals: use DNS-01 or externally managed certificates. Remove the guard with python3 /etc/remnacust-node-firewall/guard.py remove.'
            ],
            [
                'عیب‌یابی و عملیات امن',
                'عیب‌یابی درخواست واقعی mTLS به نود ثبت‌شده می‌فرستد و Xray، همگام‌سازی کاربران و اعمال پورت را بررسی می‌کند؛ مسیر کامل کلاینت را نمی‌آزماید. نود غیرفعال بررسی نمی‌شود و بررسی دستی محدودیت نرخ دارد. تغییر پورت ابتدا بازبینی و سپس با هش بازبینی و نسخهٔ جاری تأیید می‌شود؛ بازبینی قدیمی رد می‌شود. موفقیت به ACK نود نیاز دارد، نه صرفاً صف. بازیابی نسخهٔ اعمال‌شده تغییر جدیدتر را بازنویسی نمی‌کند. خرابی با سه مشاهده در دست‌کم ۲۰ ثانیه و بازیابی با دو مشاهده در ۱۰ ثانیه تأیید می‌شود. نود هرگز متصل‌نشده هشدار خرابی نمی‌دهد. نگهداری و عملیات هشدار را ساکت می‌کنند؛ توقف دستی ۳۰ دقیقه‌ای بررسی سلامت را متوقف نمی‌کند. نصب از نصب‌کنندهٔ تأییدشده با SSH استفاده و ارتباط را جداگانه بررسی می‌کند؛ پوشهٔ موجود بازنویسی نمی‌شود. NET_ADMIN پیش‌فرض خاموش است. با IP سرور اصلی، تمام پورت‌های ورودی و ping جز SSH فقط از آن منبع مجازند؛ پورت ۲۲ و پورت‌های شناسایی‌شدهٔ sshd حفظ می‌شوند. قوانین Docker و IPv6 و پاسخ خروجی را پوشش می‌دهند و فایروال دیگر را پاک نمی‌کنند. تمدید خارجی HTTP-01 مسدود می‌شود؛ از DNS-01 یا مدیریت خارجی گواهی استفاده کنید. حذف محدودیت: python3 /etc/remnacust-node-firewall/guard.py remove.'
            ],
            [
                '诊断与安全操作',
                '诊断向已注册节点发送真实 mTLS 请求，检查 Xray、用户同步和端口应用状态，不验证完整客户端路径。禁用节点不会被探测，手动检查有速率限制。端口更改先预览，再用预览哈希和当前版本确认；过期预览被拒绝。成功需要节点 ACK，而非仅入队。错误时可恢复已应用版本，不覆盖更新的修改。故障需至少 20 秒内三次观测，恢复需 10 秒内两次观测。从未连接的节点不会触发故障告警。维护和操作抑制告警；手动暂停 30 分钟不会停止健康检查。安装向导通过 SSH 使用已验证安装器，并单独确认连接；不会覆盖现有目录。NET_ADMIN 默认关闭。设置主服务器 IP 后，除 SSH 外，所有入站端口和 ping 仅接受该来源；保留 22 和检测到的 sshd 端口。规则覆盖 Docker 转发及 IPv6，保留出站响应，不清空其他防火墙规则。这会阻止外部 HTTP-01 续期；请使用 DNS-01 或外部证书管理。移除限制：python3 /etc/remnacust-node-firewall/guard.py remove。'
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
