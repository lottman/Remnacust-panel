const sections = [
    [
        'templates',
        'templates-pool-boundaries',
        [
            [
                'Состав пула после переключения',
                'При переключении группового отбора на выбор при подключении UUID и теги объединяются в values. Для regex и тегов получателя groups сохраняет объединённый список UUID: исходный фильтр и доступ пользователя действуют одновременно. Эти списки можно изменить в GUI или коде. Посторонние хосты не добавляются. Переход из ручной клиентской группы в автоматическую также задаёт URL и интервал проверок доступности. Постоянный вход проверяет DNS и нормализованные IP обоих концов, чтобы не направить соединение обратно на себя; одинаковые записи IPv4 и IPv6 не обходят эту проверку.'
            ],
            [
                'Pool membership after switching',
                'Switching grouped selection to connection-time selection merges UUID and tag groups into values. For regex and recipient-tag selectors, groups retains the combined UUID boundary: the original filter and user access both apply. Edit these lists in the GUI or code; unrelated hosts are excluded. Switching a manual client group to automatic selection also sets its probe URL and interval. A stable entry resolves DNS and compares normalized IPs at both ends to reject loops; alternative IPv4 and IPv6 notation cannot bypass the comparison.'
            ],
            [
                'اعضای مجموعه پس از تغییر حالت',
                'با تغییر انتخاب گروهی به انتخاب هنگام اتصال، گروه‌های UUID و برچسب در values ادغام می‌شوند. برای عبارت منظم و برچسب گیرنده، groups مرز مشترک UUID را نگه می‌دارد؛ فیلتر اصلی و دسترسی کاربر هم‌زمان اعمال می‌شوند. فهرست‌ها در رابط یا کد قابل ویرایش‌اند و میزبان نامرتبط اضافه نمی‌شود. تغییر گروه دستی به خودکار، نشانی و فاصلهٔ پایش را نیز تنظیم می‌کند. ورودی ثابت DNS و IP نرمال‌شدهٔ هر دو طرف را بررسی می‌کند تا حلقه ایجاد نشود؛ نگارش متفاوت IPv4 و IPv6 این بررسی را دور نمی‌زند.'
            ],
            [
                '切换后的池成员范围',
                '从分组抽样切换到连接时选择后，UUID 和标签分组会合并到 values。对于正则表达式和接收主机标签选择器，groups 保留合并后的 UUID 范围，并同时应用原有过滤条件和用户权限。这些列表可在界面或代码中编辑，不会加入无关主机。从手动客户端组切换到自动选择时，还会设置探测 URL 和间隔。固定入口会解析两端 DNS 并比较规范化 IP，以防止连接回环；不同的 IPv4 和 IPv6 写法无法绕过检查。'
            ]
        ]
    ],
    [
        'templates',
        'templates-connection-selection',
        [
            [
                'Выбор при подключении и постоянный вход',
                'Вкладка Автовыбор разделяет получателей шаблона и состав пула. Получатели не получают дополнительных прав на источники. В режиме all клиент получает весь доступный пул; работающий балансировщик Xray выбирает направление для каждого нового соединения по стратегии и последним проверкам. random/group заранее выбирают часть источников при формировании подписки; кнопка «Выбирать при подключении» переводит пул в all и сохраняет стратегию. В других форматах действуют родные стратегии приложения: ручной selector не выбирает сервер автоматически. Новые адреса и ключи требуют обновления подписки. Исключение — постоянный TCP-вход: заранее направьте стабильный домен и порт одного хоста на отдельный входной сервер, назначьте этому хосту конечные ноды с одинаковым inbound и ключами. В Автовыборе выберите вход, этот хост, порядок нод и стратегию, проверьте настройки и примените через SSH. Панель повторно проверяет принадлежность нод хосту и применённые TCP-порты. HAProxy проверяет TCP каждые 2 секунды (2 неудачи/успеха), в приоритетном режиме использует первый доступный сервер. Повторное применение меняет серверы без обновления клиентской подписки и без рестарта Xray. Открытые соединения не мигрируют; при корректной перезагрузке входа сохраняются до завершения или предельного часа. UDP-транспорты не поддерживаются. TCP-проверка не подтверждает VPN-авторизацию. TLS завершается на конечной ноде; входу не нужен сертификат. Конечная нода видит IP входа, что влияет на правила по исходному IP.'
            ],
            [
                'Selection on connection and a stable entry',
                'Autoselect separates template recipients from pool members. Assignment does not grant access to sources. In all mode the client receives the complete eligible pool; the running Xray balancer chooses a destination for every new connection using its strategy and recent probes. random/group sample during subscription generation; Choose on connection switches to all while preserving the strategy. Other formats use native application strategies: a manual selector does not select automatically. New addresses or keys normally require a subscription refresh. A stable TCP entry is an exception: point one host’s stable domain and port at a dedicated entry server and assign backend nodes sharing its inbound and keys. In Autoselect choose the entry, host, ordered nodes and strategy, review and apply over SSH. The panel rechecks membership and applied TCP ports. HAProxy checks TCP every 2 seconds (2 failures/successes); priority uses the first healthy server. Applying again changes backends without refreshing subscriptions or restarting Xray. Open connections are not migrated; graceful reload preserves them until they finish or the one-hour hard limit. UDP transports are unsupported. TCP checks do not verify VPN authorization. TLS terminates on the backend, so the entry needs no certificate. Backends see the entry IP, which affects source-IP policies.'
            ],
            [
                'انتخاب هنگام اتصال و ورودی ثابت',
                'در انتخاب خودکار، دریافت‌کنندگان قالب از اعضای مجموعه جدا هستند و تخصیص قالب دسترسی جدید نمی‌دهد. حالت all همهٔ اعضای مجاز را به کلاینت می‌دهد؛ متعادل‌کنندهٔ فعال Xray برای هر اتصال جدید طبق راهبرد و آخرین پایش انتخاب می‌کند. random/group هنگام ساخت اشتراک نمونه‌برداری می‌کنند؛ دکمهٔ انتخاب هنگام اتصال حالت را به all تغییر می‌دهد و راهبرد را حفظ می‌کند. قالب‌های دیگر از راهبرد بومی برنامه استفاده می‌کنند؛ selector دستی خودکار نیست. نشانی یا کلید جدید معمولاً به تازه‌سازی اشتراک نیاز دارد. برای ورودی TCP ثابت، دامنه و پورت ثابت یک میزبان را به سرور ورودی جداگانه هدایت و سرورهای دارای ورودی و کلید مشترک را به میزبان اختصاص دهید. در رابط، ورودی، میزبان، ترتیب سرورها و راهبرد را انتخاب و با SSH اعمال کنید. پنل عضویت و پورت TCP اعمال‌شده را دوباره بررسی می‌کند. HAProxy هر ۲ ثانیه TCP را با آستانهٔ ۲ شکست یا موفقیت بررسی می‌کند؛ اولویت نخستین سرور سالم را به کار می‌برد. اعمال مجدد بدون تازه‌سازی اشتراک یا راه‌اندازی مجدد Xray سرورها را تغییر می‌دهد. اتصال باز منتقل نمی‌شود؛ بارگذاری مجدد آرام آن را تا پایان یا سقف یک ساعت نگه می‌دارد. انتقال UDP پشتیبانی نمی‌شود. بررسی TCP مجوز VPN را تأیید نمی‌کند. TLS در سرور مقصد خاتمه می‌یابد و ورودی گواهی نمی‌خواهد. سرور مقصد IP ورودی را می‌بیند که روی سیاست IP مبدأ اثر دارد.'
            ],
            [
                '连接时选择与固定入口',
                '自动选择将模板接收者与池成员分开；分配模板不会授予源服务器访问权限。all 模式向客户端发送全部有权访问的成员；运行中的 Xray 均衡器根据策略和最新探测为每个新连接选择出口。random/group 在生成订阅时抽样；“连接时选择”切换到 all 并保留策略。其他格式使用应用原生策略；手动 selector 不会自动选择。新增地址或密钥通常需要刷新订阅。固定 TCP 入口是例外：将同一主机的固定域名和端口指向独立入口服务器，并将使用相同入站和密钥的后端节点分配给该主机。在界面中选择入口、主机、节点顺序及策略，通过 SSH 应用。面板重新检查成员资格和已应用的 TCP 端口。HAProxy 每 2 秒检查 TCP，以连续 2 次失败或成功确认状态；优先模式使用首个健康服务器。再次应用可更改后端，无需刷新订阅或重启 Xray。现有连接不会迁移；平滑重载保留连接直到结束或达到一小时上限。不支持 UDP 传输。TCP 检查不验证 VPN 授权。TLS 在后端终止，入口无需证书。后端看到入口 IP，因此会影响源 IP 策略。'
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
