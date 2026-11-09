const languages = ['ru', 'en', 'fa', 'zh']

// Keep scope and units identical in all four operator guides.
const sections = [
    ['nodes', 'nodes-start-queue-pause', [
        ['Пауза очереди запуска', 'Пакетное применение профиля не приостанавливает общую очередь запуска: операции согласуются отдельно для каждой ноды. Существующая ручная или оставшаяся от старого обновления пауза автоматически не снимается. Если задания остаются приостановлены, проверьте завершение обслуживания и снимите паузу в Bull Board. Перезапуск панели не должен отменять намеренную паузу администратора.'],
        ['Paused start queue', 'Applying a profile in bulk does not pause the global start queue; operations are coordinated per node. An existing manual pause or one left by an older update is not automatically resumed. If jobs remain paused, confirm that maintenance is complete and resume the queue in Bull Board. Restarting the panel must not override an intentional administrative pause.'],
        ['توقف صف راه‌اندازی', 'اعمال گروهی پروفایل، صف عمومی راه‌اندازی را متوقف نمی‌کند؛ عملیات برای هر نود جداگانه هماهنگ می‌شوند. توقف دستی موجود یا توقف باقی‌مانده از به‌روزرسانی قدیمی خودکار رفع نمی‌شود. اگر کارها متوقف مانده‌اند، پایان نگهداری را تأیید و صف را در Bull Board از سر بگیرید. بازراه‌اندازی پنل نباید توقف عمدی مدیر را لغو کند.'],
        ['启动队列暂停', '批量应用配置不会暂停全局启动队列；操作按节点分别协调。已有的手动暂停或旧版更新遗留的暂停不会自动解除。如果任务仍处于暂停状态，请确认维护已结束，再在 Bull Board 中恢复队列。重启面板不应取消管理员有意设置的暂停。']
    ]],
    ['nodes', 'nodes-local-core-recovery', [
        ['Восстановление после падения ядра', 'При подтверждённом падении совместимого ядра агент восстанавливает последнюю приватную конфигурацию без панели. Рабочий процесс не перезапускается; неизвестное состояние и занятое управление откладывают проверку. Пауза администратора и проверки квот сохраняются. Автоматические попытки ограничены: не более трёх восстановлений за час процесса агента. Новое падение после лимита или ошибка восстановления прекращают попытки; проверьте журнал и выполните явный запуск после устранения причины. Обычное применение настроек без перезапуска бюджет попыток не сбрасывает. Повреждённый журнал не обнуляется. Нужны сборки Node и Core с этим исправлением; обновление только панели их не заменяет.'],
        ['Recovery after a core crash', 'After a confirmed crash of a compatible core, the agent restores the last private configuration without the panel. A working process is left running; unknown status or busy management defers the check. Administrative pause and quota checks remain enforced. Automatic attempts are limited to three recoveries per hour of the agent process. A further crash after that limit or a recovery error stops retries; check the log, correct the cause and explicitly start a new process. Hot application of settings does not reset the attempt budget. A corrupt journal is never cleared. Both Node and Core builds must include this fix; updating only the panel does not replace them.'],
        ['بازیابی پس از خرابی هسته', 'پس از خرابی تأییدشده هسته سازگار، عامل آخرین پیکربندی خصوصی را بدون پنل بازیابی می‌کند. فرایند سالم بازراه‌اندازی نمی‌شود و وضعیت نامشخص یا مدیریت مشغول، بررسی را عقب می‌اندازد. توقف مدیر و کنترل سهمیه حفظ می‌شوند. حداکثر سه بازیابی خودکار در هر ساعت فرایند عامل مجاز است. خرابی بعدی پس از حد یا خطای بازیابی، تلاش را متوقف می‌کند؛ گزارش را بررسی و علت را رفع کنید، سپس فرایند جدید را صریح راه‌اندازی کنید. اعمال تنظیمات بدون راه‌اندازی مجدد بودجه تلاش را بازنشانی نمی‌کند. ژورنال خراب هرگز پاک نمی‌شود. ساخت Node و Core هر دو باید این اصلاح را داشته باشند؛ به‌روزرسانی پنل به‌تنهایی آن‌ها را جایگزین نمی‌کند.'],
        ['内核崩溃后的恢复', '确认兼容内核崩溃后，代理可在没有面板时恢复最后的私有配置。正常进程不会重启；状态未知或管理忙碌时会推迟检查。管理员暂停和配额检查仍有效。每个代理进程每小时最多自动恢复三次。达到上限后再次崩溃，或恢复出错，都会停止重试；请检查日志、排除原因并显式启动新进程。热应用设置不会重置尝试次数。损坏的日志不会被清空。Node 和 Core 都需要包含此修复的新构建；只更新面板不会替换它们。']
    ]],
    ['architecture', 'architecture-offline-day', [
        ['Сутки без панели', 'Автономная политика не отключается просто из-за отсутствия панели. Для планируемых суток нужны применённая политика, постоянные тома, действующие ключи и достаточный локальный резерв каждого лимита пользователя, хоста и тега. Общий остаток пользователя распределён между нодами и не равен запасу каждой ноды. Срок подписки, исчерпание резерва или конец периода квоты продолжают закрывать доступ. После календарного сброса новый резерв выдаёт панель; текущая реализация не финансирует следующий период без связи. CDN, DNS, прокси и сертификаты ноды должны работать независимо. Пересоздание контейнера требует постоянных каталогов состояния. При загрузке ядра через CUSTOM_CORE_URL его источник также должен быть доступен. Изменения блокировки или заморозки во время разрыва доходят после восстановления связи. Проверка готовности перед обслуживанием подтверждает текущее состояние, но не обещает сутки трафика.'],
        ['A day without the panel', 'Autonomous policy does not stop merely because the panel is unreachable. A planned day requires an applied policy, persistent volumes, valid credentials and enough local credit for every user, host and tag limit. A user’s total remaining quota is distributed across nodes and is not the credit of each node. Subscription expiry, exhausted credit and quota-period boundaries still deny access. The panel must fund the next period after a reset; the current implementation does not fund it offline. CDN, DNS, proxy and node certificates must remain independent. Recreating a container requires persistent state directories. A core loaded through CUSTOM_CORE_URL also needs its source to be reachable. Blocks or freezes changed during the outage arrive after reconnection. A maintenance readiness check proves current state, not a guaranteed day of traffic.'],
        ['یک روز بدون پنل', 'سیاست مستقل صرفاً به دلیل قطع پنل متوقف نمی‌شود. برای یک روز برنامه‌ریزی‌شده، سیاست اعمال‌شده، حجم‌های پایدار، کلیدهای معتبر و اعتبار محلی کافی برای هر محدودیت کاربر، میزبان و برچسب لازم است. مانده کل کاربر میان نودها تقسیم می‌شود و اعتبار هر نود نیست. پایان اشتراک، اتمام اعتبار یا مرز دوره سهمیه همچنان دسترسی را می‌بندد. اعتبار دوره بعد پس از بازنشانی باید توسط پنل تأمین شود؛ نسخه فعلی آن را آفلاین تأمین نمی‌کند. CDN، DNS، پروکسی و گواهی نود باید مستقل باشند. ایجاد دوباره کانتینر به مسیرهای پایدار وضعیت نیاز دارد. هسته دانلودشده با CUSTOM_CORE_URL نیز به دسترسی منبع نیاز دارد. مسدودسازی یا تعلیق جدید پس از اتصال مجدد می‌رسد. بررسی آمادگی نگهداری فقط وضعیت فعلی را تأیید می‌کند، نه یک روز ترافیک تضمینی.'],
        ['面板离线一天', '自主策略不会仅因面板不可达而停止。计划离线一天需要已应用的策略、持久卷、有效密钥，以及用户、主机和标签每项限制的足够本地额度。用户总剩余额度分配在各节点之间，不等于每个节点的额度。订阅到期、额度耗尽及配额周期结束仍会拒绝访问。重置后的下一周期需要面板重新分配额度；当前实现不会在离线时为下一周期授信。CDN、DNS、代理及节点证书必须独立工作。重建容器需要持久状态目录。通过 CUSTOM_CORE_URL 下载的内核还需要源站可达。断连期间新增的封禁或冻结在恢复连接后同步。维护就绪检查只确认当前状态，并不保证一天的流量。']
    ]],
    ['templates', 'subscription-transient-query-errors', [
        ['Временная ошибка выдачи', 'Ошибка чтения пользователя, устройства или хостов не означает, что подписка удалена. Конфигурационная выдача возвращает временную ошибку с предложением повторить запрос через 30 секунд; настоящий отсутствующий пользователь по-прежнему даёт 404. Ошибочная выборка хостов не считается успешной пустой подпиской. Если доступных хостов действительно нет, дополнительные запросы шаблонов и квот пропускаются. При повторяющемся сбое проверьте журнал и связь с базой данных; не создавайте пользователю новые ключи для устранения сетевой ошибки.'],
        ['Temporary delivery errors', 'A failed user, device or host query does not mean the subscription was deleted. Configuration delivery returns a temporary error asking the client to retry after 30 seconds; a genuinely missing user still returns 404. A failed host query is not reported as a successful empty subscription. If there truly are no available hosts, extra template and quota queries are skipped. For repeated failures, check the log and database connectivity; do not replace a user’s keys to solve a network error.'],
        ['خطای موقت دریافت', 'خطای خواندن کاربر، دستگاه یا میزبان به معنی حذف اشتراک نیست. دریافت پیکربندی خطای موقت با درخواست تلاش دوباره پس از 30 ثانیه می‌دهد؛ کاربر واقعاً ناموجود همچنان 404 می‌گیرد. خطای جست‌وجوی میزبان، اشتراک خالی موفق محسوب نمی‌شود. اگر واقعاً میزبانی موجود نباشد، درخواست‌های اضافی قالب و سهمیه انجام نمی‌شود. برای خطای تکراری، گزارش و اتصال پایگاه داده را بررسی کنید؛ برای رفع خطای شبکه کلید کاربر را عوض نکنید.'],
        ['临时分发错误', '读取用户、设备或主机失败不代表订阅已被删除。配置分发返回临时错误并建议 30 秒后重试；用户确实不存在时仍返回 404。主机查询失败不会被当作成功的空订阅。确实没有可用主机时，会跳过额外的模板和配额查询。重复失败时检查日志及数据库连接，不要为修复网络问题而替换用户密钥。']
    ]],
    [
        'profiles',
        'editor-unsaved-recovery',
        [
            [
                'Восстановление несохранённых правок',
                'В редакторах профилей и шаблонов подписки откройте «История» → «Несохранённый черновик». Здесь хранится последняя локальная копия текста, включая незавершённый JSON или YAML. Сравните её с сохранённой версией и нажмите «Загрузить в редактор», затем сохраните обычной кнопкой. Автоматического применения нет.\n\nПосле успешного сохранения соответствующая временная копия удаляется. Если во время запроса вы продолжили редактирование, более новые правки остаются восстанавливаемыми. Ошибка сохранения не удаляет копию. Удаление в этой вкладке убирает только локальный черновик.\n\nКопии разделены по администратору, профилю и шаблону; они доступны только в этом браузере и на этом адресе панели, до семи дней и до 8 MiB на документ. Очистка данных сайта удаляет их. Текст хранится зашифрованным в IndexedDB; это не защита от доступа к открытой сессии администратора. Если браузер запрещает хранилище или лимит превышен, интерфейс покажет ошибку. Перед принудительным обновлением интерфейс ожидает запись черновика. При аварийном закрытии последние ещё не записанные нажатия могут потеряться.'
            ],
            [
                'Recovering unsaved edits',
                'In profile and subscription-template editors, open History → Unsaved draft. This contains the most recent local text, including incomplete JSON or YAML. Compare it with the saved version, choose Load into editor, then save normally. Nothing is applied automatically.\n\nA successful save removes its temporary copy. Edits typed while that request is pending remain recoverable. A failed save does not delete the copy. Delete in this tab removes only the local draft.\n\nCopies are separated by administrator and document. They are available only in this browser on this panel origin, for up to seven days and 8 MiB per document. Clearing site data removes them. Text is encrypted in IndexedDB; this does not protect an open administrator session. Storage restrictions or exceeded limits are shown as errors. Before a forced interface refresh, the interface waits for draft persistence. A browser crash can lose recent keystrokes that have not yet been written.'
            ],
            [
                'بازیابی تغییرات ذخیره‌نشده',
                'در ویرایشگر پروفایل و قالب اشتراک، «تاریخچه» ← «پیش‌نویس ذخیره‌نشده» را باز کنید. آخرین متن محلی، حتی JSON یا YAML ناقص، اینجا نگه داشته می‌شود. آن را با نسخه ذخیره‌شده مقایسه کنید، «بارگذاری در ویرایشگر» را بزنید و سپس ذخیره کنید. اعمال خودکار انجام نمی‌شود.\n\nذخیره موفق نسخه موقت مربوط را حذف می‌کند؛ تغییرات جدید هنگام انتظار پاسخ باقی می‌مانند. خطای ذخیره نسخه را حذف نمی‌کند. حذف از این زبانه فقط پیش‌نویس محلی را پاک می‌کند.\n\nنسخه‌ها برای هر مدیر و سند جدا و فقط در همین مرورگر و مبدأ پنل، تا هفت روز و 8 MiB برای هر سند، در دسترس‌اند. پاک‌کردن داده سایت آن‌ها را حذف می‌کند. متن در IndexedDB رمزگذاری می‌شود، اما نشست باز مدیر همچنان باید محافظت شود. محدودیت ذخیره‌سازی با خطا نشان داده می‌شود. پیش از نوسازی اجباری رابط، ثبت پیش‌نویس تکمیل می‌شود؛ خرابی مرورگر ممکن است آخرین کلیدهای ثبت‌نشده را از بین ببرد.'
            ],
            [
                '恢复未保存的编辑',
                '在配置档案或订阅模板编辑器中打开“历史记录”→“未保存草稿”。这里保留最近的本地文本，包括未完成的 JSON 或 YAML。与已保存版本比较后，选择“载入编辑器”，再正常保存；不会自动应用。\n\n保存成功后会删除对应的临时副本。等待保存响应期间输入的新内容仍可恢复；保存失败不会删除副本。本页的删除操作只清除本地草稿。\n\n副本按管理员和文档隔离，仅在当前浏览器及面板来源下可用，最长保留七天，每份上限 8 MiB。清除站点数据会删除副本。文本在 IndexedDB 中加密保存，但这不能保护已打开的管理员会话。存储被禁用或超过上限时会显示错误。强制刷新界面前会等待草稿写入；浏览器崩溃时尚未写入的最后输入仍可能丢失。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-cold-node-discovery',
        [
            [
                'Первый запуск смешанного парка',
                'Перед подготовкой политики и ключей панель проверяет возможности ноды и других нод с теми же входящими подключениями. Проверки выполняются вне SQL-транзакций, с ограничением параллельности и времени. Политика и конфигурация используют один снимок совместимости. Недоступная нода задерживает только затронутые входящие подключения; независимые исправные ноды продолжают запуск. При неизвестной совместимости сохраняется прежняя конфигурация и назначается повторная проверка. Сетевой сбой не превращает ноду в обычную Remnawave-ноду и не снимает ограничения.'
            ],
            [
                'First start of a mixed node fleet',
                'Before preparing policy and credentials, the panel discovers capabilities of the node and peers sharing its inbounds. Discovery runs outside SQL transactions with bounded concurrency and time. Policy and configuration use the same compatibility snapshot. An unavailable node delays only affected inbounds; independent healthy nodes continue starting. Unknown compatibility keeps the previous configuration and schedules a retry. A network failure never classifies a node as native Remnawave or removes restrictions.'
            ],
            [
                'شروع نخست مجموعه نودهای متفاوت',
                'پنل پیش از آماده‌سازی سیاست و کلیدها، قابلیت‌های نود و همتایان دارای ورودی مشترک را بررسی می‌کند. بررسی خارج از تراکنش SQL و با زمان و هم‌زمانی محدود انجام می‌شود. سیاست و پیکربندی از یک تصویر سازگاری استفاده می‌کنند. نود در دسترس نبودنی فقط ورودی‌های مرتبط را عقب می‌اندازد و نودهای سالم مستقل راه‌اندازی می‌شوند. سازگاری نامشخص پیکربندی قبلی را نگه می‌دارد و بررسی دوباره زمان‌بندی می‌شود. خطای شبکه نود را Remnawave عادی تلقی نمی‌کند و محدودیت را برنمی‌دارد.'
            ],
            [
                '混合节点的首次启动',
                '准备策略和凭据前，面板先检测当前节点及共享入站的其他节点的能力。检测在 SQL 事务外进行，并限制并发与时间。策略和配置使用同一份兼容性快照。节点不可用时仅延迟受影响的入站，独立的健康节点继续启动。兼容性未知时保留原配置并安排重试；网络故障不会将节点识别为原生 Remnawave，也不会解除限制。'
            ]
        ]
    ],
    [
        'host-tags',
        'host-tags-bounded-accounting',
        [
            [
                'Учёт трафика и пакеты квот',
                'Накопленный трафик фиксируется пакетами до восьми квитанций в транзакции. Квитанция может содержать несколько пользователей; удаление подтверждения в Redis происходит после фиксации PostgreSQL, а повтор не списывает расход дважды. Результат свежего снятия счётчиков остаётся под блокировкой до сохранения. Эпохи квот записываются пакетами до 500 строк в общей транзакции ревизии. Координатор фиксирует финансирование и курсор по владельцу, проверяет поколение и продлевает аренду между областями. Бюджет проверяется между владельцами; один владелец с множеством областей может обрабатываться дольше 20 секунд.'
            ],
            [
                'Traffic accounting and quota batches',
                'Pending traffic commits at most eight receipts per transaction. A receipt may contain several users. Redis acknowledgements are removed after PostgreSQL commits, and retries do not charge usage twice. Fresh counter collection remains locked until its result is saved. Quota epochs are written in batches of up to 500 rows within the revision transaction. The coordinator commits funding and its cursor per owner, checks the generation and renews its lease between scopes. The budget is checked between owners; one owner with many scopes may take longer than 20 seconds.'
            ],
            [
                'حسابداری ترافیک و دسته‌های سهمیه',
                'ترافیک معوق در هر تراکنش با حداکثر هشت رسید ثبت می‌شود. هر رسید می‌تواند چند کاربر داشته باشد. تأیید Redis پس از ثبت PostgreSQL حذف می‌شود و تلاش دوباره مصرف را دوبار حساب نمی‌کند. خواندن شمارنده تازه تا ذخیره نتیجه قفل می‌ماند. دوره‌های سهمیه در دسته‌های حداکثر 500 ردیفی در تراکنش همان بازبینی ثبت می‌شوند. هماهنگ‌کننده اعتبار و نشانگر را برای هر مالک ثبت، نسل را بررسی و اجاره را بین محدوده‌ها تمدید می‌کند. بودجه بین مالکان بررسی می‌شود؛ پردازش یک مالک با محدوده‌های فراوان ممکن است بیش از 20 ثانیه طول بکشد.'
            ],
            [
                '流量记账与配额批处理',
                '积压流量每个事务最多提交八张收据，每张收据可包含多个用户。PostgreSQL 提交后才删除 Redis 确认记录，重试不会重复扣除流量。读取新计数器时，锁保留到结果保存。配额 epoch 在同一修订事务内每批最多写入 500 行。协调器按所有者提交额度和游标，检查代次并在各作用域之间续租。处理预算在所有者之间检查；单个所有者拥有很多作用域时可能超过 20 秒。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-access-utc',
        [
            [
                'Срок доступа и устройства: UTC',
                'Проверка срока доступа и дат выбранных устройств использует UTC независимо от часового пояса PostgreSQL. Обновление применяет миграцию функций доступа, не меняя сохранённые даты, остаток заморозки и квоты. Если устройство заблокировали или зарегистрировали заново после открытия списка, старое массовое удаление его не затронет.'
            ],
            [
                'Access lifetime and devices: UTC',
                'Access expiry and selected device timestamps use UTC independently of the PostgreSQL timezone. The update migrates access functions without changing stored dates, frozen lifetime or quotas. If a device is blocked or registered again after the list is opened, a stale bulk deletion preserves it.'
            ],
            [
                'مدت دسترسی و دستگاه‌ها: UTC',
                'انقضای دسترسی و زمان دستگاه‌های انتخاب‌شده مستقل از منطقه زمانی PostgreSQL با UTC بررسی می‌شوند. به‌روزرسانی توابع دسترسی را بدون تغییر تاریخ‌های ذخیره‌شده، زمان منجمد یا سهمیه مهاجرت می‌دهد. اگر دستگاه پس از باز شدن فهرست مسدود یا دوباره ثبت شود، حذف گروهی قدیمی آن را حفظ می‌کند.'
            ],
            [
                '访问期限与设备：UTC',
                '访问到期时间和选中设备的时间戳统一按 UTC 检查，不受 PostgreSQL 时区影响。更新会迁移访问函数，不更改已保存日期、冻结剩余时长或配额。设备若在打开列表后被封禁或重新注册，旧的批量删除请求会保留该设备。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-database-load',
        [
            [
                'Производительность и совместимость подписок',
                'Панель 1.1.7.95 проверяет выданные ключи и пользователей массовой конфигурации наборами SQL. Срок, статус, сквады, блокировка HWID и смена ключей продолжают учитываться. Проверка поддержки ноды выполняется перед тяжёлой сборкой; паузы лимитов читаются одним запросом на ноду. Синхронизации объединяются, одновременно обрабатываются не более трёх нод на процесс, занятая advisory-блокировка повторяется вне транзакции. Подтверждённая штатная Remnawave-нода получает обычную конфигурацию: новые ограничения хоста, правила сайтов и неактивные хосты-исключения на её inbound отключены. Если этот inbound используется и нашей нодой, обе используют совместимые обычные ключи. На отдельных совместимых inbound новые функции сохраняются. Старое наше ядро без учёта получателя автовыбора использует ключи и лимиты серверов пула; обновление Node/Core и подписки включает отдельный учёт. Панель показывает режим совместимости. Неизвестная нода и сетевой сбой сами по себе не отключают ограничения. Существующие резервы квот и финансовые блокировки не стираются при понижении версии. API старых страниц подписки сохранён; страницы со скрытыми ключами не строят ненужные ссылки. Новых переменных .env для этого режима нет; миграция проверки срока UTC описана отдельно.'
            ],
            [
                'Subscription performance and compatibility',
                'Panel 1.1.7.95 checks issued identities and bulk configuration users using SQL sets while preserving expiry, status, squads, HWID blocks and key rotation. Node preflight precedes expensive configuration compilation; limit pauses are read in one query per node. Updates coalesce, at most three nodes synchronize per process, and a busy advisory lock is retried outside the transaction. A confirmed native Remnawave node receives a baseline configuration: new host restrictions, destination rules and inactive-user exceptions are disabled on its inbounds. A custom node sharing such an inbound uses the same compatible baseline credentials; isolated compatible inbounds retain extensions. Older custom cores without autoselect recipient accounting use ordinary pool-server credentials and limits. Upgrade Node/Core and refresh the client subscription for separate recipient accounting. The panel displays compatibility mode. An unknown node or network failure alone never disables restrictions. Existing quota reserves and financial fences are not erased by a downgrade. Older subscription-page APIs remain compatible, and pages hiding connection keys skip unused link generation. This mode needs no new .env variables; the UTC access-expiry migration is described separately.'
            ],
            [
                'کارایی و سازگاری اشتراک',
                'پنل 1.1.7.95 کلیدهای صادرشده و کاربران پیکربندی گروهی را با مجموعه‌های SQL بررسی می‌کند و انقضا، وضعیت، اسکوا‌د، مسدودسازی HWID و تعویض کلید حفظ می‌شوند. بررسی پشتیبانی نود پیش از ساخت سنگین انجام می‌شود و توقف سهمیه‌ها با یک پرس‌وجو برای هر نود خوانده می‌شود. همگام‌سازی‌ها ادغام می‌شوند، هر پردازش حداکثر سه نود را هم‌زمان بررسی می‌کند و قفل اشغال‌شده بیرون تراکنش دوباره امتحان می‌شود. نود اصلی تأییدشده Remnawave پیکربندی عادی می‌گیرد؛ محدودیت میزبان، قواعد مقصد و استثنای کاربران غیرفعال روی ورودی‌های آن غیرفعال است. نود سفارشی با ورودی مشترک نیز کلید عادی یکسان دارد، اما ورودی سازگار مستقل قابلیت‌ها را حفظ می‌کند. هسته قدیمی بدون حسابداری گیرنده انتخاب خودکار از کلید و محدودیت سرور استخر استفاده می‌کند. برای حسابداری مستقل، Node/Core و اشتراک کلاینت را به‌روز کنید. حالت سازگاری در پنل نمایش داده می‌شود. خطای شبکه یا نود ناشناخته محدودیت‌ها را غیرفعال نمی‌کند. ذخایر سهمیه و حصارهای مالی با کاهش نسخه حذف نمی‌شوند. API صفحات قدیمی حفظ شده و صفحات با کلید مخفی، لینک غیرضروری نمی‌سازند. این حالت متغیر جدید .env نمی‌خواهد؛ مهاجرت بررسی انقضای UTC جداگانه توضیح داده شده است.'
            ],
            [
                '订阅性能与兼容性',
                '面板 1.1.7.95 使用 SQL 集合检查已签发凭据及批量配置用户，保留期限、状态、分组、HWID 封禁与密钥轮换检查。节点预检先于昂贵的配置构建，暂停限额按节点一次读取。同步请求合并，每个进程最多同时处理三个节点；占用中的 advisory 锁在事务外重试。已确认的原生 Remnawave 节点获得基础配置，其入站不启用新增的主机限额、目标规则和非活跃用户例外。同一入站上的自定义节点使用相同的兼容凭据；独立兼容入站仍保留扩展。缺少自动选择接收主机配额功能的旧版自定义核心使用池内服务器的普通凭据和限额。升级 Node/Core 并刷新客户端订阅可启用独立归属。面板显示兼容模式。未知节点或网络错误本身不会关闭限制。降级不会清除现有配额储备及财务围栏。旧版订阅页面 API 保持兼容，隐藏密钥的页面不生成无用链接。此模式无需新增 .env 变量；UTC 到期检查迁移另有说明。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'maintenance-log-download',
        [
            [
                'Технический журнал обновления',
                'В окне обновления панели и у операции страницы подписки «Скачать журнал» загружает настоящий технический вывод, а не JSON со статусом. Скачивание доступно только администратору панели по ID текущей задачи; API-токены доступа не получают. Пароли и токены удаляются из скачиваемой копии. Для больших файлов доступны последние 1 MiB с отметкой об ограничении; полный файл остаётся приватным на сервере до следующей операции того же компонента. При временной недоступности панели повторите скачивание после восстановления связи либо откройте указанный серверный путь. Нужны панель 1.1.7.91 и служба установщика 1.2.129. remnacust-panel-update.service запускает локальный API при загрузке сервера, но начинает обновление только по запросу администратора.'
            ],
            [
                'Technical update log',
                'Download journal in the panel update dialog and subscription page operations downloads real technical output rather than a status JSON. Only a panel administrator can download it for the current job ID; API tokens cannot. Passwords and tokens are removed from the downloaded copy. Large files return the last 1 MiB with a truncation notice; the complete private file remains on the server until the next operation for that component. If the panel is temporarily unreachable, retry after reconnection or open the displayed server path. Requires panel 1.1.7.91 and installer service 1.2.129. remnacust-panel-update.service starts the local API at boot and only starts updates on an administrator request.'
            ],
            [
                'گزارش فنی به‌روزرسانی',
                '«دریافت گزارش» در پنجره به‌روزرسانی پنل و عملیات صفحه اشتراک، خروجی فنی واقعی را دریافت می‌کند، نه JSON وضعیت. فقط مدیر پنل با شناسه کار جاری دسترسی دارد؛ توکن API مجاز نیست. گذرواژه‌ها و توکن‌ها از نسخه دریافتی حذف می‌شوند. برای فایل بزرگ، آخرین 1 MiB با پیام محدودیت دریافت می‌شود؛ فایل کامل تا عملیات بعدی همان مؤلفه در سرور خصوصی می‌ماند. هنگام قطع موقت پنل پس از اتصال دوباره تلاش کنید یا مسیر نمایش‌داده‌شده را در سرور باز کنید. پنل 1.1.7.91 و سرویس نصاب 1.2.129 لازم است. remnacust-panel-update.service هنگام راه‌اندازی سرور فقط API محلی را اجرا می‌کند و به‌روزرسانی را تنها با درخواست مدیر شروع می‌کند.'
            ],
            [
                '更新技术日志',
                '面板更新窗口和订阅页面操作中的“下载日志”会下载真实技术输出，而不是状态 JSON。只有面板管理员可以按当前任务 ID 下载，API 令牌无权访问。下载副本会移除密码和令牌。大文件返回最后 1 MiB 并注明截断；完整私有文件保留在服务器上，直到该组件的下一次操作。面板暂时无法连接时，请在恢复后重试，或打开显示的服务器路径。需要面板 1.1.7.91 和安装服务 1.2.129。remnacust-panel-update.service 开机时启动本地 API，只有收到管理员请求才开始更新。'
            ]
        ]
    ],
    [
        'hosts',
        'hosts-allowed-probe',
        [
            [
                'Пинг ограниченного хоста',
                'HTTP-проверка должна обращаться к разрешённому сайту через сам хост. В режиме «Разрешить только» форма показывает копируемый URL первого разрешённого домена. Для Happ с настоящим Provider ID панель выбирает общий разрешённый URL для всех выданных видимых хостов, сохраняет подходящий настроенный URL и HTTP-метод. Явно выбранные TCP и ICMP не меняются. Если общего домена нет или есть только IP/CIDR, используется TCP-проверка; она подтверждает доступность сервера, а не авторизацию VPN. В INCY выберите HTTP/INCY-пинг и этот URL в настройках подписки: обычные HTTP-заголовки не управляют адресом его проверки, автоматическая настройка доступна только через Premium API самого INCY. Политика сайтов не расширяется, проверка не отправляется через DIRECT. Сайт должен отвечать на выбранный HTTP-метод; перенаправление на запрещённый домен по-прежнему блокируется.'
            ],
            [
                'Restricted host latency',
                'An HTTP check must reach an allowed website through the host itself. In Allow only mode, the form shows a copyable URL for the first allowed domain. For Happ with a real Provider ID, the panel selects a common allowed URL for all delivered visible hosts, preserving a suitable configured URL and HTTP method. Explicit TCP and ICMP choices are unchanged. When no shared domain exists or only IP/CIDR destinations are allowed, it falls back to TCP; TCP confirms server reachability, not VPN authorization. In INCY, choose HTTP/INCY ping and this URL in subscription settings: ordinary HTTP headers cannot set its probe URL; automatic configuration requires INCY’s own Premium API. Website permissions are not widened and the check never goes through DIRECT. The website must respond to the selected HTTP method; redirects to a denied domain remain blocked.'
            ],
            [
                'پینگ میزبان محدود',
                'بررسی HTTP باید از طریق خود میزبان به یک وب‌سایت مجاز برسد. در حالت «فقط مجاز»، فرم نشانی قابل کپی اولین دامنه مجاز را نشان می‌دهد. برای Happ با Provider ID واقعی، پنل نشانی مشترک مجاز همه میزبان‌های قابل‌مشاهده اشتراک را انتخاب و نشانی مناسب و روش HTTP تنظیم‌شده را حفظ می‌کند. انتخاب صریح TCP یا ICMP تغییر نمی‌کند. بدون دامنه مشترک یا با مقصدهای صرفاً IP/CIDR، بررسی TCP به‌کار می‌رود؛ این بررسی فقط دسترسی به سرور را می‌سنجد، نه مجوز VPN. در تنظیمات اشتراک INCY، پینگ HTTP/INCY و این نشانی را انتخاب کنید؛ هدرهای معمولی نشانی بررسی را تنظیم نمی‌کنند و تنظیم خودکار به Premium API خود INCY نیاز دارد. مجوز سایت‌ها گسترش نمی‌یابد و بررسی از DIRECT عبور نمی‌کند. سایت باید به روش HTTP انتخاب‌شده پاسخ دهد؛ تغییر مسیر به دامنه ممنوع همچنان مسدود است.'
            ],
            [
                '受限主机延迟',
                'HTTP 检测必须通过主机本身访问允许的网站。在“仅允许”模式下，表单显示首个允许域名的可复制 URL。Happ 配有真实 Provider ID 时，面板为订阅中所有可见主机选择共同允许的 URL，并保留合适的自定义 URL 与 HTTP 方法。明确选择的 TCP 或 ICMP 不变。没有共同域名或仅允许 IP/CIDR 时，改用 TCP；TCP 只确认服务器可达，不验证 VPN 授权。在 INCY 的订阅设置中选择 HTTP/INCY 检测并填写此 URL；普通 HTTP 标头不能设置其检测地址，自动配置需要 INCY 自身的 Premium API。不会扩大网站权限，也不会通过 DIRECT 检测。网站必须响应所选 HTTP 方法；跳转到禁止域名仍会被阻止。'
            ]
        ]
    ],
    [
        'architecture',
        'architecture-maintenance-logs',
        [
            [
                'Журналы обслуживания и длительная работа',
                'Подробный журнал CLI хранится в /opt/remnacust/logs/installer-panel.log, installer-node.log или installer-subscription-page.log. Проверка состояния использует отдельный журнал и не удаляет журнал последнего обновления. Следующее действие с тем же компонентом заменяет предыдущий журнал; параллельный запуск не может затереть работающий журнал. Обновление панели через браузер сохраняет panel-update-<ID>.log, страницы — page-<ID страницы>-<ID задачи>.log, SSH-обновление ноды — node-maintenance.log на самой ноде. Ошибка показывает путь; журналы доступны только root и не входят в публичную подписку. Ввод и трассировка секретов не записываются. Подтверждение APT автоматическое, вопросы настройки остаются интерактивными в SSH. Кеш конфигураций ограничен количеством и размером; крупная запись пропускает локальный кеш, но выдаётся из основного источника. Завершение, ошибка и разрыв запроса освобождают ёмкость после завершения работы. Проверено совпадение исходной истории SQL Remnawave 3.0.0, 3.4.3 и 3.4.8; неизвестная или изменённая история останавливает перенос до изменения приложений.'
            ],
            [
                'Maintenance logs and long-running service',
                'Detailed CLI logs are /opt/remnacust/logs/installer-panel.log, installer-node.log and installer-subscription-page.log. Status checks use a separate log and retain the last update log. The next action for the same component replaces its previous log; a parallel invocation cannot erase an active log. Browser panel updates retain panel-update-<ID>.log, page operations retain page-<page ID>-<job ID>.log, and SSH node maintenance retains node-maintenance.log on that node. Failures show the path. Logs are root-only and never part of public subscriptions. Input and secret tracing are not recorded. APT confirmation is automatic; configuration questions remain interactive over SSH. Configuration caches are bounded by count and size; oversized entries bypass the local cache but remain available from the source. Completion, errors and disconnects release capacity when work settles. Original SQL histories match published Remnawave 3.0.0, 3.4.3 and 3.4.8; unknown or modified history stops migration before application changes.'
            ],
            [
                'گزارش نگهداری و اجرای طولانی',
                'گزارش CLI در /opt/remnacust/logs/installer-panel.log، installer-node.log یا installer-subscription-page.log است. بررسی وضعیت گزارش جداگانه دارد. عملیات بعدی همان مؤلفه گزارش قبلی را جایگزین می‌کند و اجرای هم‌زمان آن را پاک نمی‌کند. به‌روزرسانی پنل panel-update-<ID>.log، عملیات صفحه page-<page ID>-<job ID>.log و نگهداری نود node-maintenance.log را روی نود نگه می‌دارند. هنگام خطا مسیر نمایش داده می‌شود. فقط root دسترسی دارد و گزارش وارد اشتراک عمومی نمی‌شود. ورودی و ردیابی اسرار ثبت نمی‌شود. تأیید APT خودکار است؛ پرسش‌های تنظیمات از SSH پاسخ داده می‌شوند. کش تنظیمات از نظر تعداد و اندازه محدود است؛ داده بزرگ بدون کش محلی از منبع دریافت می‌شود. پس از پایان کار، خطا یا قطع اتصال ظرفیت آزاد می‌شود. تاریخچه SQL نسخه‌های رسمی Remnawave 3.0.0، 3.4.3 و 3.4.8 تطبیق داده شده است؛ تاریخچه ناشناخته یا تغییرکرده انتقال را قبل از تغییر برنامه متوقف می‌کند.'
            ],
            [
                '维护日志与长期运行',
                'CLI 详细日志位于 /opt/remnacust/logs/installer-panel.log、installer-node.log 或 installer-subscription-page.log。状态检查使用独立日志，不覆盖上次更新日志。同一组件下次操作才替换旧日志，并行执行无法覆盖正在使用的日志。面板更新保留 panel-update-<ID>.log，页面操作保留 page-<页面 ID>-<任务 ID>.log，SSH 节点维护在节点上保留 node-maintenance.log。失败时显示路径。日志仅 root 可读，不包含在公开订阅中，不记录输入或密钥跟踪。APT 自动确认；配置问题仍需通过 SSH 交互回答。配置缓存限制条数和大小，过大的条目绕过本地缓存，仍从原始来源返回。工作结束后，成功、错误或连接断开均释放容量。已比对官方 Remnawave 3.0.0、3.4.3 和 3.4.8 的 SQL 历史；未知或修改过的历史会在更改应用前停止迁移。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-inactive-access',
        [
            [
                'Неактивный доступ и заморозка',
                'Хосты с включённым доступом при неактивной подписке доступны при EXPIRED, DISABLED, FROZEN и LIMITED, а также при истёкшем сроке ACTIVE. Дополнительная настройка скрывает их во время активной подписки. Права сквадов, блокировки устройств и собственные ограничения хоста сохраняются. В своих примечаниях настройте отдельный блок FROZEN и его место в порядке примечаний. Маркер {{FREE_HOST}} вставляет разрешённые хосты в выбранную строку; он не снимает блокировку HWID и не выдаёт права. Добавьте inbound этого хоста во внутренний сквад пользователя. Если inbound общий, ограничьте остальные хосты через их доступ для сквадов, чтобы не открыть лишние подключения. Предпросмотр устройства предупреждает, если после разрешения ключей остались только уведомления. Внешний сквад может переопределять текст и порядок. Старые настройки получают стандартный текст заморозки без замены ваших сохранённых сообщений. При неактивном доступе JSON содержит самостоятельные подключения без общих или назначенных шаблонов, балансеров и геофайлов; ограничения самого хоста сохраняются. Домены, IP и подсети формируются отдельными правилами. Отказ HWID показывает сохранённое предупреждение о лимите или неподдерживаемом устройстве, а не только статус подписки. Happ и INCY на одном ПК используют разные HWID и занимают разные места в лимите устройств.'
            ],
            [
                'Inactive access and freezing',
                'Hosts enabled for inactive subscription access are available for EXPIRED, DISABLED, FROZEN and LIMITED, and for an ACTIVE account whose time has expired. The additional option hides them while the subscription is active. Squad permissions, device blocks and host-specific limits still apply. Configure the FROZEN block and its position in remark order under custom remarks. {{FREE_HOST}} inserts permitted hosts at that line; it cannot bypass an HWID block or grant access. Add that host’s inbound to the user’s internal squad. For a shared inbound, restrict other hosts through their squad access settings to avoid granting extra connections. Device preview warns when only notifications remain after resolving credentials. External squads may override wording and order. Older settings gain default frozen wording without replacing saved messages. Inactive JSON uses standalone connections without shared or assigned templates, balancers or geofiles; host restrictions still apply. Domains, IPs and networks become separate rules. HWID denial shows the saved device-limit or unsupported-device warning instead of only subscription status. Happ and INCY on the same PC use different HWIDs and occupy separate device slots.'
            ],
            [
                'دسترسی غیرفعال و انجماد',
                'میزبان‌های مجاز برای اشتراک غیرفعال در وضعیت‌های EXPIRED، DISABLED، FROZEN و LIMITED و حساب ACTIVE با زمان منقضی در دسترس‌اند. گزینه اضافی آن‌ها را هنگام فعال بودن اشتراک پنهان می‌کند. مجوز گروه، مسدودی دستگاه و محدودیت خود میزبان پابرجاست. در یادداشت‌های سفارشی، بخش FROZEN و جای آن در ترتیب یادداشت‌ها را تنظیم کنید. {{FREE_HOST}} میزبان‌های مجاز را در همان خط قرار می‌دهد و مسدودی HWID را دور نمی‌زند و مجوز نمی‌دهد. ورودی میزبان را به گروه داخلی کاربر اضافه کنید. برای ورودی مشترک، دسترسی گروه به سایر میزبان‌ها را محدود کنید تا اتصال اضافی مجاز نشود. پیش‌نمایش دستگاه در صورت باقی ماندن فقط اعلان هشدار می‌دهد. گروه خارجی می‌تواند متن و ترتیب را بازنویسی کند. تنظیمات قدیمی متن پیش‌فرض انجماد را بدون جایگزینی پیام‌های ذخیره‌شده دریافت می‌کنند. JSON اشتراک غیرفعال اتصال مستقل و بدون قالب مشترک یا اختصاص‌یافته، بالانسر و فایل جغرافیایی می‌دهد؛ محدودیت میزبان پابرجاست. دامنه، IP و زیرشبکه قوانین جدا دارند. رد HWID هشدار ذخیره‌شده سقف دستگاه یا دستگاه پشتیبانی‌نشده را نیز نشان می‌دهد. Happ و INCY روی یک رایانه HWID متفاوت و جایگاه جدا در سقف دستگاه دارند.'
            ],
            [
                '未启用访问与冻结',
                '允许未激活订阅访问的主机适用于 EXPIRED、DISABLED、FROZEN、LIMITED，以及时长已到期的 ACTIVE 账户。附加选项可在订阅激活时隐藏这些主机。组权限、设备封禁和主机自身限制仍然有效。在自定义备注中配置 FROZEN 内容及其顺序。{{FREE_HOST}} 在该行插入获准的主机，不能绕过 HWID 封禁或授予权限。请将该主机的入站添加到用户的内部组。共享入站时，应通过组访问设置限制其他主机，避免额外授权。解析凭据后若仅剩通知，设备预览会显示警告。外部组可以覆盖文字和顺序。旧设置自动获得冻结默认文字，不会替换已保存的消息。未激活订阅的 JSON 使用独立连接，不加载共享或已分配模板、负载均衡或地理文件；主机限制仍然生效。域名、IP 和网段生成独立规则。HWID 拒绝时会显示已保存的设备上限或不支持设备警告，而不只是订阅状态。同一台电脑上的 Happ 和 INCY 使用不同 HWID，各占一个设备名额。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-user-domain-links',
        [
            [
                'Несколько ссылок пользователя',
                'Карточка пользователя показывает обычный адрес и до трёх CDN выбранного основного домена. Каждую ссылку можно скопировать или открыть как QR-код; выбранный домен отмечен отдельно. Все адреса сохраняют общий срок, заморозку, устройства и квоты. В токене отдельно разрешаются обычные ссылки, только CDN или все ссылки; маршруты и фильтры приведены в справочнике API. Чтение каталога доменов не открывает ключи подписок. Четвёртый CDN нельзя создать или перенести в заполненную группу. Лишние старые записи удаляются вручную.'
            ],
            [
                'Multiple subscription links',
                'The user card shows the regular URL and up to three CDNs of the selected primary domain. Each link has copy and QR actions; the preferred domain is marked. Expiration, freezing, devices and quotas remain shared. API tokens may grant regular links only, CDN links only or all links; routes and filters are described in the API reference. Catalog access alone never grants access to subscription keys. A fourth CDN cannot be created or moved into a full family. Remove existing excess records manually.'
            ],
            [
                'چند پیوند اشتراک',
                'کارت کاربر نشانی عادی و حداکثر سه CDN دامنه اصلی انتخاب‌شده را نشان می‌دهد. هر پیوند امکان کپی و QR دارد و دامنه منتخب مشخص است. انقضا، انجماد، دستگاه‌ها و سهمیه مشترک‌اند. توکن API می‌تواند فقط پیوند عادی، فقط CDN یا همه پیوندها را مجاز کند؛ مسیرها و فیلترها در مرجع API هستند. مجوز فهرست به‌تنهایی دسترسی به کلید اشتراک نمی‌دهد. ایجاد یا انتقال CDN چهارم به گروه پر رد می‌شود. رکوردهای اضافی قبلی را دستی حذف کنید.'
            ],
            [
                '多个订阅链接',
                '用户卡片显示所选主域名的普通地址及最多三个 CDN。每个链接均支持复制和二维码，并标记首选域名。到期时间、冻结、设备及配额保持共用。API 令牌可分别授予仅普通链接、仅 CDN 或全部链接的权限；接口路径和筛选条件见 API 参考。仅有目录权限不能读取订阅密钥。禁止创建第四个 CDN 或将其移入已满的域名组。已有超额记录需要手动删除。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-cdn-gateway',
        [
            [
                'CDN: настройка один раз',
                'В «Настроить CDN» скопируйте индивидуальное случайное имя заголовка и значение UUID. Имя стабильно при обновлениях; при переходе со старого общего имени замените только имя в CDN. В VK добавьте заголовок запросов, в Яндексе — заголовок запроса к источнику. Источник HTTPS, Host и SNI берутся из основного сайта подписки. Отключите принудительное кэширование персональных ответов. Обычные ссылки клиентов сохраняются без замены; файлы, контрольные суммы и ссылки устройств идут через CDN. ID не заменяет ключ, статус, заморозку, срок и HWID. Путь /cdn/<ID> остаётся запасным вариантом для CDN без заголовков. Новых переменных .env нет. Имя формируется с закрытым ключом установки; по одному публичному ID его не вычислить. При отдельной смене APP_SECRET имя нужно заново скопировать в CDN.'
            ],
            [
                'CDN: configure once',
                'Copy the individual neutral request header name and UUID value from Set up CDN. Add an origin request header in VK or Yandex. The name stays stable across upgrades; replace only the old common header name when migrating. Use the main subscription site for the HTTPS origin, Host and SNI. Disable forced caching of personalized responses. Existing client URLs need no replacement; files, checksums and device URLs retain the CDN. The ID does not bypass keys, status, freezing, expiry or HWID. The /cdn/<ID> path remains a fallback for CDNs without request headers. No new .env variables are needed. The name is generated with the private installation key and cannot be computed from the public ID alone. If APP_SECRET is separately rotated, copy the new header name to the CDN.'
            ],
            [
                'CDN: تنظیم یک‌باره',
                'در تنظیم CDN نام اختصاصی و خنثای هدر و مقدار UUID را کپی و در VK یا Yandex به درخواست‌های مبدأ اضافه کنید. نام در به‌روزرسانی ثابت می‌ماند؛ هنگام مهاجرت فقط نام مشترک قدیمی را عوض کنید. مبدأ HTTPS و Host و SNI از سایت اصلی اشتراک گرفته می‌شوند. کش اجباری پاسخ شخصی را خاموش کنید. نشانی فعلی کاربران نیاز به تعویض ندارد و فایل‌ها و checksum و نشانی دستگاه‌ها روی CDN می‌مانند. شناسه، کلید و وضعیت و انجماد و انقضا و HWID را دور نمی‌زند. مسیر /cdn/<ID> روش جایگزین CDN بدون هدر است. متغیر جدید .env لازم نیست. نام با کلید خصوصی نصب ساخته می‌شود و فقط از شناسه عمومی قابل محاسبه نیست. اگر APP_SECRET را جداگانه عوض کردید، نام جدید را در CDN وارد کنید.'
            ],
            [
                'CDN：一次配置',
                '从配置 CDN 窗口复制专属中性请求头名称和 UUID 值，在 VK 或 Yandex 中添加到源站请求。名称在更新后保持不变；迁移时只需替换旧通用名称。HTTPS 源站、Host 和 SNI 使用主订阅网站，关闭个性化响应的强制缓存。客户端现有链接无需替换，文件、校验和及设备链接仍使用 CDN。ID 不绕过密钥、状态、冻结、期限或 HWID 检查。/cdn/<ID> 路径保留为不支持请求头的备用方式，无需新增 .env 变量。 名称使用安装私钥生成，无法仅凭公开 ID 计算。若单独更换 APP_SECRET，请将新的请求头名称复制到 CDN。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-domain-environment',
        [
            [
                'Домен подписки и .env',
                'Основной домен и SUB_PUBLIC_DOMAIN синхронизируются в обе стороны через локальную службу установщика. Изменение .env проверяется при запуске API, открытии списка и каждые 30 секунд; изменение основного адреса в панели сохраняется в .env и зарегистрированном Compose без перезапуска. Поддерживаются имя домена, HTTPS URL и безопасный путь. CDN-домены хранятся в реестре. Для исправленного API списка доменов нужна панель 1.1.7.78 или новее. Нужен установщик 1.2.113 или новее; без службы выводится статус недоступности, а не ложное подтверждение. Параллельная правка файла отклоняет запись. DNS и сертификат настраиваются отдельно.\n\nВ карточке основного домена выберите «Открытый доступ», «Только через CDN» или «Перенаправлять на CDN». Последний режим переводит прямые GET/HEAD-запросы на выбранный CDN этого же домена, сохраняя ключ подписки, /json, путь устройства, геофайла и параметры запроса. Проверка охватывает страницу, профили и DAT с контрольными суммами. Адрес источника и SUB_PUBLIC_DOMAIN остаются основными: не заменяйте их CDN-доменом. У одного основного домена не более трёх CDN.\n\nСначала обновите панель и нашу страницу подписки. В «Настроить CDN» скопируйте индивидуальные имя и значение заголовка в заголовки ЗАПРОСОВ VK/Яндекса. CDN должен перезаписывать этот заголовок, а не добавлять второе значение. Ключ нельзя помещать в ответы, публичные ссылки или настройки приложения. Получение ключа требует прав изменения доменов либо отдельного права credentials; чтение списка ключ не раскрывает. Публичный UUID и старый /cdn/ID выбирают адрес, но не открывают закрытый источник. Каждый CDN имеет отдельные имя и ключ, привязанные к этой установке.\n\nПроверьте через CDN HTML, обычную ссылку, /json и скачивание геофайлов до включения ограничения. Для CDN без правильного ключа возвращается 403, а не повторное перенаправление. Прямой запрос к закрытому источнику получает 403; режим перенаправления отвечает 307 без кэширования. Если приложение не следует перенаправлениям, выдайте ему CDN-ссылку сразу. Изменения могут распространяться между процессами до пяти секунд. При обновлении существующие домены остаются открытыми. Старые страницы работают в открытом режиме; для закрытого режима нужна обновлённая наша страница либо прямой CDN-доступ к API панели с тем же заголовком. Это защита выдачи, а не сетевое скрытие IP или изменение VPN-транспорта.'
            ],
            [
                'Subscription domain and .env',
                'The primary domain and SUB_PUBLIC_DOMAIN are synchronized both ways through the local installer service. The API checks .env at startup, when opening the list and every 30 seconds. Changing the primary address in the panel updates .env and the registered Compose without a restart. A hostname, HTTPS URL and safe path are supported. CDN domains remain in the registry. The domain list API requires panel 1.1.7.78 or later to avoid the authentication dependency error. Installer 1.2.113 or later is required; a missing service shows an unavailable status rather than a false confirmation. Concurrent file changes prevent overwrites. Configure DNS and certificates separately.\n\nEdit the primary domain and choose Open access, CDN only, or Redirect to CDN. Redirect sends direct GET/HEAD requests to a selected CDN belonging to the same primary, preserving the subscription key, /json, device paths, geofile paths and query parameters. The policy covers HTML, profiles, DAT and checksums. Keep the origin address and SUB_PUBLIC_DOMAIN on the primary domain; never replace them with the CDN hostname. Each primary supports at most three CDNs.\n\nUpdate both the panel and our subscription page first. In Configure CDN, copy its individual header name and value into REQUEST headers in VK/Yandex. The CDN must overwrite that header, not append another value. Never put the key in response headers, public links or client settings. Retrieving a key requires domain write access or the specific credentials permission; list/read access does not disclose the key. A public UUID or legacy /cdn/ID selects a domain but cannot unlock a restricted origin. Every CDN has a separate name and key tied to this installation.\n\nTest CDN HTML, the base link, /json and geofile downloads before restricting access. A CDN request without the correct key returns 403 instead of looping. Direct access returns 403 in CDN-only mode or an uncacheable 307 in redirect mode. Give clients the CDN link directly if they do not follow redirects. Changes may take up to five seconds across processes. Existing domains remain open after upgrade. Old pages work in open mode; restricted mode needs our updated page or direct CDN access to the panel subscription API with the same request header. This protects delivery; it does not hide network IPs or change VPN transports.'
            ],
            [
                'دامنه اشتراک و .env',
                'دامنه اصلی و SUB_PUBLIC_DOMAIN از طریق سرویس محلی نصاب دوطرفه همگام می‌شوند. API هنگام شروع، بازکردن فهرست و هر 30 ثانیه .env را بررسی می‌کند. تغییر دامنه اصلی در پنل، .env و Compose ثبت‌شده را بدون راه‌اندازی مجدد به‌روز می‌کند. نام دامنه، نشانی HTTPS و مسیر امن پشتیبانی می‌شوند. دامنه‌های CDN در رجیستری می‌مانند. برای رفع خطای وابستگی احراز هویت فهرست دامنه‌ها، پنل 1.1.7.78 یا جدیدتر لازم است. نصاب 1.2.113 یا جدیدتر لازم است؛ نبود سرویس با وضعیت عدم دسترسی نشان داده می‌شود. تغییر هم‌زمان فایل از بازنویسی جلوگیری می‌کند. DNS و گواهی جداگانه تنظیم می‌شوند.\n\nدر ویرایش دامنه اصلی، دسترسی آزاد، فقط CDN یا هدایت به CDN را انتخاب کنید. هدایت فقط به CDN همان دامنه انجام می‌شود و کلید اشتراک، /json، مسیر دستگاه، فایل و پارامترها حفظ می‌شوند. سیاست شامل صفحه، پروفایل، DAT و checksum است. مبدأ و SUB_PUBLIC_DOMAIN را روی دامنه اصلی نگه دارید. هر دامنه اصلی حداکثر سه CDN دارد.\n\nابتدا پنل و صفحه اشتراک ما را به‌روز کنید. نام و مقدار اختصاصی را از تنظیم CDN در سرآیندهای درخواست VK/Yandex کپی کنید. CDN باید مقدار را جایگزین کند، نه اینکه مقدار دوم اضافه کند. کلید را در پاسخ، لینک عمومی یا تنظیم برنامه قرار ندهید. دریافت کلید نیازمند مجوز نوشتن دامنه یا مجوز اختصاصی credentials است؛ خواندن فهرست کلید را آشکار نمی‌کند. UUID عمومی و مسیر قدیمی /cdn/ID فقط دامنه را انتخاب می‌کنند و مبدأ بسته را باز نمی‌کنند. هر CDN نام و کلید مستقل وابسته به این نصب دارد.\n\nپیش از محدودکردن، HTML، لینک پایه، /json و دانلود فایل از CDN را آزمایش کنید. CDN بدون کلید صحیح پاسخ 403 می‌گیرد، نه حلقه هدایت. دسترسی مستقیم در حالت فقط CDN برابر 403 و در حالت هدایت برابر 307 بدون کش است. برای برنامه‌ای که هدایت را دنبال نمی‌کند، لینک CDN بدهید. انتشار تغییر بین فرایندها تا پنج ثانیه زمان می‌برد. دامنه‌های موجود پس از ارتقا باز می‌مانند. صفحات قدیمی در حالت باز کار می‌کنند؛ حالت محدود به صفحه جدید ما یا CDN مستقیم به API اشتراک با همان سرآیند نیاز دارد. این حفاظت دریافت اشتراک است و IP شبکه یا ترابری VPN را پنهان یا تغییر نمی‌دهد.'
            ],
            [
                '订阅域名与 .env',
                '主域名与 SUB_PUBLIC_DOMAIN 通过本地安装服务双向同步。API 在启动、打开列表时及每 30 秒检查 .env。在面板更改主地址会更新 .env 和已注册的 Compose，无需重启。支持域名、HTTPS URL 和安全路径。CDN 域名仍保存在注册表中。域名列表 API 的身份验证依赖错误已在面板 1.1.7.78 修复，请使用该版本或更新版本。需要安装程序 1.2.113 或更新版本；服务缺失时显示不可用状态，不会虚假确认。文件被并发修改时拒绝覆盖。DNS 和证书需单独配置。\n\n编辑主域名时可选择开放访问、仅限 CDN 或重定向到 CDN。重定向只指向属于同一主域名的已注册 CDN，并保留订阅密钥、/json、设备路径、地理文件路径及查询参数。策略适用于 HTML、配置、DAT 和校验文件。源站地址及 SUB_PUBLIC_DOMAIN 应保留主域名，不要改为 CDN。每个主域名最多关联三个 CDN。\n\n请先更新面板和我们的订阅页面。在配置 CDN 中复制独立标头名称和值，填入 VK/Yandex 的请求标头。CDN 必须覆盖该标头，而非追加第二个值。不要将密钥写入响应标头、公开链接或客户端设置。获取密钥需要域名写入权限或单独的 credentials 权限；列表读取不会泄露密钥。公开 UUID 和旧 /cdn/ID 路径仅用于选择域名，不能绕过源站限制。每个 CDN 的名称和密钥均独立且与当前安装绑定。\n\n启用限制前请测试 CDN 的 HTML、基础链接、/json 和地理文件下载。缺少正确密钥的 CDN 请求返回 403，避免重定向循环。直接访问在仅限 CDN 模式返回 403，重定向模式返回不缓存的 307。不跟随重定向的客户端应直接使用 CDN 链接。进程间更新最多需五秒。现有域名升级后保持开放。旧页面可在开放模式工作；限制模式需要更新的订阅页面，或由 CDN 携带同一标头直接访问面板订阅 API。本功能保护订阅交付，不会隐藏网络 IP 或改变 VPN 传输。'
            ]
        ]
    ],
    [
        'architecture',
        'architecture-node-continuity',
        [
            [
                'Ноды при отключении панели',
                'Нода с подтверждённой автономной политикой продолжает обслуживать сохранённые ключи без панели, включая XHTTP через CDN напрямую на ноду. Локально сохраняются срок доступа, квоты, скорость и правила. Исчерпание резерва или срока по-прежнему закрывает доступ. Новые пользователи, продления и блокировки доходят после восстановления связи. Перед остановкой приложений установщик проверяет автономность нод. При неподтверждённой готовности он предупреждает и продолжает обновление; дополнительный флаг не нужен. Зависимые от панели ноды могут временно потерять связь. Старая политика без локальных резервов истекает через 90 секунд: её срок нельзя просто отключить. Вручную выполненный docker compose down обходит проверку; он также остановит ноду или прокси, если они входят в тот же проект.'
            ],
            [
                'Nodes while the panel is offline',
                'A node with a confirmed autonomous policy continues serving saved keys without the panel, including XHTTP through a CDN pointing directly at the node. Access expiry, quotas, speeds and rules remain enforced locally. Exhausted credit or expiry still denies access. New users, renewals and blocks arrive after reconnection. Before stopping applications, the installer checks node autonomy. Unconfirmed readiness produces a warning and the update continues without an extra flag. Panel-dependent nodes may temporarily lose connectivity. Legacy policy without local reserves expires after 90 seconds; simply disabling that deadline is unsafe. Manual docker compose down bypasses the check and also stops a node or proxy in the same project.'
            ],
            [
                'نودها هنگام قطع پنل',
                'نود با سیاست مستقل تأییدشده، کلیدهای ذخیره‌شده را بدون پنل سرویس می‌دهد؛ از جمله XHTTP با CDN مستقیم به نود. انقضا، سهمیه، سرعت و قواعد محلی حفظ می‌شوند. پایان اعتبار یا سهمیه همچنان دسترسی را می‌بندد. کاربران جدید، تمدیدها و مسدودسازی‌ها پس از اتصال مجدد می‌رسند. نصاب پیش از توقف برنامه‌ها استقلال نودها را بررسی می‌کند. در نبود تأیید، هشدار می‌دهد و به‌روزرسانی بدون گزینه اضافی ادامه می‌یابد. نودهای وابسته به پنل ممکن است موقتاً قطع شوند. سیاست قدیمی بدون ذخیره محلی پس از 90 ثانیه منقضی می‌شود و حذف این مهلت امن نیست. اجرای دستی docker compose down بررسی را دور می‌زند و نود یا پروکسی همان پروژه را نیز متوقف می‌کند.'
            ],
            [
                '面板离线时的节点',
                '已确认自主策略的节点可在面板离线时继续使用已保存的密钥，包括 CDN 直连节点的 XHTTP。访问期限、配额、限速和规则仍在本地执行；额度耗尽或到期仍会拒绝访问。新用户、续期和封禁在恢复连接后同步。安装程序在停止应用前检查节点自主性。未确认就绪时会警告并继续更新，无需额外参数。依赖面板的节点可能暂时断连。没有本地配额的旧策略会在 90 秒后到期，不能简单取消此期限。手动执行 docker compose down 会绕过检查，也会停止同一项目中的节点或代理。'
            ]
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
                'Совместимые изменения применяются через ядро без перезапуска процесса. Начиная с Node 1.1.21, обычное обновление профиля при точном отказе ядра из-за смены порта или транспорта автоматически проверяет конфигурацию и перезапускает только Xray. При неудаче восстанавливаются прежний приватный checkpoint и рабочая конфигурация. Возможен краткий обрыв соединений. Таймаут, неизвестный ответ или повреждённый checkpoint не разрешают автоматический restart. Строгий requireLiveApply и управляемые планы портов сохраняют свой контракт: такой отказ не превращается в скрытый полный перезапуск. Обновление контейнера или бинарника ядра также может прервать подключения.'
            ],
            [
                'Changing an active port',
                'Compatible changes apply through the core without restarting its process. From Node 1.1.21, an ordinary profile update with the exact native port-or-transport rejection validates the configuration and automatically restarts Xray only. Failed startup restores the previous private checkpoint and working configuration. Connections may briefly drop. Timeouts, unknown replies and damaged checkpoints do not authorize automatic restart. Strict requireLiveApply and managed port plans retain their contract: such a rejection never becomes a hidden full restart. Updating the container or core binary can also interrupt connections.'
            ],
            [
                'تغییر پورت فعال',
                'تغییرات سازگار بدون راه‌اندازی دوباره فرایند هسته اعمال می‌شوند. از Node 1.1.21، به‌روزرسانی عادی پروفایل پس از خطای دقیق تغییر پورت یا ترنسپورت، پیکربندی را اعتبارسنجی و فقط Xray را خودکار راه‌اندازی دوباره می‌کند. در شکست اجرا، checkpoint خصوصی و پیکربندی سالم قبلی بازگردانده می‌شوند. ممکن است اتصال کوتاه‌مدت قطع شود. مهلت تمام‌شده، پاسخ ناشناخته و checkpoint خراب مجوز restart خودکار نیستند. requireLiveApply سخت‌گیرانه و طرح‌های مدیریت‌شده قرارداد خود را حفظ می‌کنند و این رد شدن به راه‌اندازی کامل پنهان تبدیل نمی‌شود. به‌روزرسانی کانتینر یا باینری نیز ممکن است اتصال‌ها را قطع کند.'
            ],
            [
                '修改正在使用的端口',
                '兼容修改通过内核应用，无需重启进程。从 Node 1.1.21 起，普通配置更新遇到确切的端口或传输变更拒绝时，会先验证配置，再自动仅重启 Xray。启动失败会恢复先前的私有 checkpoint 和工作配置，连接可能短暂中断。超时、未知回复和损坏的 checkpoint 不会授权自动重启。严格 requireLiveApply 和托管端口计划保持原有约定，此类拒绝不会转为隐藏的完整重启。更新容器或内核二进制也可能中断连接。'
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

sections.push([
    'architecture',
    'architecture-browser-refresh',
    [
        [
            'Обновление браузера после выпуска',
            'После смены сборки открытые вкладки администраторов проверяют версию панели и автоматически перезагружаются. Сбрасываются кэш данных, настройки отображения и состояния таблиц. Аккаунт остаётся авторизованным; сохранённые шаблоны, история, SSH-хранилище и незавершённые служебные операции сохраняются. Выполняющийся запрос изменения не прерывается. Проверка происходит в активной вкладке каждые 45 секунд и при возвращении в неё; при недоступной панели повторяется после восстановления связи. Серверные настройки и данные пользователей не очищаются. Вкладкам старых выпусков без этой проверки нужно один раз обновить страницу. В подготавливаемом обновлении перед перезагрузкой сохраняется локальный черновик профиля или шаблона. Если запись не удалась, автоматическая перезагрузка отменяется. Восстановление доступно в «История → Несохранённый черновик» и не применяется без вашего выбора. В прежних открытых вкладках без восстановления текст может потеряться: сначала скопируйте его.'
        ],
        [
            'Browser refresh after an update',
            'After the build changes, open administrator tabs check the panel version and reload automatically. Data caches, view preferences and table state reset. Authentication, saved templates, history, the SSH vault and pending maintenance intents are preserved. An in-flight mutation is not interrupted. Visible tabs check every 45 seconds and when revisited; an unavailable panel is checked again after recovery. Server settings and user data are not cleared. Tabs from releases without this check need one initial page refresh. The upcoming update persists a local profile/template draft before reloading. If persistence fails, automatic reload is cancelled. Recovery is available in “History → Unsaved draft” and is never applied without your choice. Older open tabs without recovery can still lose text; copy it first.'
        ],
        [
            'تازه‌سازی مرورگر پس از به‌روزرسانی',
            'پس از تغییر بیلد، برگه‌های باز مدیر نسخه پنل را بررسی و خودکار بارگیری مجدد می‌کنند. حافظه موقت داده، تنظیمات نمایش و وضعیت جدول‌ها بازنشانی می‌شوند. ورود، قالب‌های ذخیره‌شده، تاریخچه، مخزن SSH و عملیات خدماتی ناتمام حفظ می‌شوند. درخواست تغییر در حال اجرا قطع نمی‌شود. برگه فعال هر 45 ثانیه و هنگام بازگشت بررسی می‌کند و پس از بازگشت ارتباط دوباره تلاش می‌شود. تنظیمات سرور و داده کاربران پاک نمی‌شوند. نسخه‌های قدیمی فاقد این بررسی یک بار تازه‌سازی دستی نیاز دارند. در به‌روزرسانی آینده، پیش‌نویس محلی پروفایل یا قالب پیش از بارگیری مجدد ذخیره می‌شود. اگر ثبت شکست بخورد، بارگیری مجدد خودکار لغو می‌شود. بازیابی در «تاریخچه ← پیش‌نویس ذخیره‌نشده» در دسترس است و بدون انتخاب شما اعمال نمی‌شود. برگه‌های قدیمی بدون بازیابی ممکن است متن را از دست بدهند؛ ابتدا آن را کپی کنید.'
        ],
        [
            '更新后的浏览器刷新',
            '构建变化后，管理员已打开的标签页会检查面板版本并自动重新加载。数据缓存、显示偏好和表格状态会重置。登录、已保存模板、历史记录、SSH 密钥库和待处理维护操作会保留，正在执行的修改请求不会被中断。活动标签页每 45 秒及重新切回时检查，面板不可用时会在恢复后重试。服务器设置和用户数据不会被清除。没有此检查的旧版本标签页需要先手动刷新一次。即将发布的更新会在重载前保存配置或模板的本地草稿。保存失败时取消自动重载。可在“历史记录→未保存草稿”中恢复，且不会未经选择自动应用。不支持恢复的旧标签页仍可能丢失文本，请先复制。'
        ]
    ]
])

sections.push([
    'api-tokens',
    'api-token-private-configuration',
    [
        [
            'Чтение приватных настроек через API',
            'Ответы API нод не содержат сырые настройки инбаундов и приватные ключи. Для чтения конфигурации используйте API профилей с соответствующим разрешением. Изменение профиля требует права обновления и config-profiles:get; изменение шаблона — права обновления и subscription-template:get, поскольку ответ содержит сохранённый текст. Подходящие права :read, :* или * также разрешают чтение. Без права чтения запрос отклоняется до изменения данных. Изменение пользователя, активация, отключение, продление, сброс трафика и отзыв подписки дополнительно требуют users:by-id. Изменение внешнего сквада требует external-squads:get, изменение порядка — external-squads:list. Соответствующие :read и :* также подходят. Создание пользователя не требует чтения существующих ключей. Сеанс администратора работает как прежде.'
        ],
        [
            'Reading private settings through the API',
            'Node API responses exclude raw inbound settings and private keys. Use the profile API with the appropriate permission to read configuration. Updating a profile requires update permission and config-profiles:get; updating a template requires update permission and subscription-template:get because the response contains stored content. Matching :read, :* or * scopes also permit reading. Without read access, the request is rejected before changing data. Updating, enabling, disabling or extending users, resetting their traffic and revoking subscriptions also require users:by-id. Updating an external squad requires external-squads:get; reordering requires external-squads:list. Matching :read and :* grants also apply. Creating a user does not require reading existing keys. Administrator sessions keep their existing behavior.'
        ],
        [
            'خواندن تنظیمات خصوصی از API',
            'پاسخ API نود تنظیمات خام ورودی و کلید خصوصی را نمایش نمی‌دهد. برای خواندن پیکربندی، از API پروفایل با مجوز مناسب استفاده کنید. ویرایش پروفایل به مجوز تغییر و config-profiles:get و ویرایش قالب به مجوز تغییر و subscription-template:get نیاز دارد، زیرا پاسخ شامل متن ذخیره‌شده است. مجوز متناظر :read یا :* یا * نیز خواندن را مجاز می‌کند. بدون مجوز خواندن، درخواست پیش از تغییر داده رد می‌شود. ویرایش، فعال‌سازی، غیرفعال‌سازی، تمدید، بازنشانی ترافیک کاربر و لغو اشتراک به users:by-id نیز نیاز دارند. ویرایش گروه خارجی به external-squads:get و تغییر ترتیب آن به external-squads:list نیاز دارد. مجوز متناظر :read و :* نیز معتبر است. ایجاد کاربر به خواندن کلیدهای موجود نیاز ندارد. رفتار نشست مدیر تغییر نمی‌کند.'
        ],
        [
            '通过 API 读取私密设置',
            '节点 API 响应不包含原始入站设置及私钥。读取配置请使用具有相应权限的配置档案 API。更新配置档案需要更新权限和 config-profiles:get；更新模板需要更新权限和 subscription-template:get，因为响应包含已保存内容。匹配的 :read、:* 或 * 权限同样允许读取。缺少读取权限时，请求会在修改数据前被拒绝。修改、启用、停用、延长用户期限、重置流量及撤销订阅还需要 users:by-id。修改外部分组需要 external-squads:get，调整顺序需要 external-squads:list；匹配的 :read 和 :* 权限同样适用。创建用户无需读取现有密钥。管理员会话的行为保持不变。'
        ]
    ]
])

sections.push([
    'templates',
    'template-generation-budget',
    [
        [
            'Размер выдачи и ошибки генерации',
            'Готовая подписка ограничена 16 MiB. Разворачивание групп Sing-box, Mihomo, Stash и Clash дополнительно ограничивается во время сборки с запасом на экранирование и форматирование; слишком большой состав может быть отклонён до достижения точного лимита. Уменьшите число групп или серверов в них. При ошибке генерации клиент получает HTTP 503, а не пустую успешную подписку. При недоступном кеше шаблон читается из базы данных.'
        ],
        [
            'Output size and generation errors',
            'A generated subscription is limited to 16 MiB. Sing-box, Mihomo, Stash and Clash group expansion is also bounded during generation with room for escaping and formatting; excessive fanout may be rejected before reaching the exact limit. Reduce the number of groups or their servers. Generation failures return HTTP 503 rather than an empty successful subscription. When the cache is unavailable, templates are read from the database.'
        ],
        [
            'اندازه خروجی و خطای تولید',
            'اندازه اشتراک تولیدشده حداکثر 16 MiB است. گسترش گروه‌های Sing-box، Mihomo، Stash و Clash هنگام تولید نیز با احتساب حاشیه برای قالب‌بندی و نویسه‌های گریز محدود می‌شود؛ ترکیب بیش‌ازحد بزرگ ممکن است پیش از سقف دقیق رد شود. تعداد گروه‌ها یا سرورهای آن‌ها را کاهش دهید. خطای تولید HTTP 503 برمی‌گرداند، نه اشتراک خالی با پاسخ موفق. در دسترس نبودن کش، قالب از پایگاه داده خوانده می‌شود.'
        ],
        [
            '输出大小与生成错误',
            '生成的订阅最大为 16 MiB。Sing-box、Mihomo、Stash 和 Clash 的分组展开在生成期间也有限制，并为转义与格式化预留空间；过多的分组成员可能在达到精确上限前被拒绝。请减少分组数量或组内服务器数量。生成失败返回 HTTP 503，而不是成功的空订阅。缓存不可用时从数据库读取模板。'
        ]
    ]
])

sections.push([
    'nodes',
    'nodes-delivery-confirmation',
    [
        [
            'Подтверждение команд ноды',
            'Запуск и остановка одной ноды выполняются последовательно. Устаревшая команда не должна менять новое состояние или адрес подключения. Если остановка не подтверждена, панель сохраняет причину ошибки и повторяет попытку: максимум пять попыток с интервалом 30 секунд. Отключённая администратором нода не включается автоматически после ошибки. Проверьте связь и журнал, затем повторите действие. Удаление недоступной ноды из панели остаётся доступным. Массовые изменения профилей обрабатываются по одному заданию, сохраняя общую подготовку конфигурации. Обновление образа Node сохраняет ранее выбранное управляемое Core. Проверьте запущенную версию в «Задачах нод» и при необходимости обновите Core отдельно, затем подписку клиента. Устаревшее предупреждение о лимитах автовыбора снимается после подтверждения поддержки и успешного применения политики; ошибка проверки не снимает ограничения.'
        ],
        [
            'Confirming node commands',
            'Start and stop operations for one node run sequentially. An outdated command must not overwrite a newer state or connection address. An unconfirmed stop retains its error and is retried up to five times, 30 seconds apart. A node disabled by an administrator is never automatically enabled after failure. Check connectivity and the log, then retry the action. An unavailable node can still be deleted from the panel. Bulk profile jobs run one at a time while retaining shared configuration preparation. Updating the Node image preserves the previously selected managed Core. Check the running version in Node tasks and update Core separately if needed, then refresh the client subscription. An outdated autoselect-limit warning clears after support and successful policy application are confirmed; a failed check never removes restrictions.'
        ],
        [
            'تأیید فرمان نود',
            'فرمان‌های شروع و توقف یک نود به‌ترتیب اجرا می‌شوند. فرمان قدیمی نباید وضعیت یا آدرس اتصال جدید را بازنویسی کند. توقف تأییدنشده با حفظ علت خطا حداکثر پنج بار و با فاصله ۳۰ ثانیه تکرار می‌شود. نود غیرفعال‌شده توسط مدیر پس از خطا خودکار فعال نمی‌شود. اتصال و گزارش را بررسی و سپس دوباره اقدام کنید. حذف نود در دسترس نبودنی از پنل همچنان ممکن است. کارهای گروهی پروفایل یکی‌یکی اجرا می‌شوند و آماده‌سازی مشترک پیکربندی حفظ می‌شود. به‌روزرسانی تصویر Node هسته مدیریت‌شده انتخابی قبلی را نگه می‌دارد. نسخه در حال اجرا را در کارهای نود بررسی کنید و در صورت نیاز Core را جداگانه به‌روز و اشتراک را تازه‌سازی کنید. هشدار قدیمی محدودیت انتخاب خودکار پس از تأیید پشتیبانی و اعمال موفق سیاست حذف می‌شود؛ شکست بررسی محدودیت را برنمی‌دارد.'
        ],
        [
            '确认节点命令',
            '同一节点的启动和停止操作按顺序执行。过期命令不应覆盖新的状态或连接地址。停止未获确认时保留错误原因，最多尝试五次，间隔 30 秒。管理员停用的节点不会在失败后自动启用。请检查连接和日志后重试操作。仍可从面板删除不可用节点。配置档案的批量任务逐个执行，同时保留共享配置准备过程。更新 Node 镜像会保留之前选择的托管 Core。请在节点任务中检查运行版本，必要时单独更新 Core，再刷新客户端订阅。确认支持并成功应用策略后，过期的自动选择限额警告会清除；检查失败不会解除限制。'
        ]
    ]
])

sections.push(
    ['profiles', 'profile-certificate-file-safety', [
        ['Файлы сертификатов', 'Если панель должна прочитать PEM-файл для подготовки конфигурации, подключите его только для чтения внутри /var/lib/remnawave и укажите этот путь. Чтение вне каталога, включая выход через символическую ссылку, запрещено. Обычные текстовые файлы, FIFO и PEM больше 128 KiB не принимаются. Это правило относится к файлам, которые читает панель; оно не переносит сертификаты ноды и не настраивает её HTTPS автоматически.'],
        ['Certificate files', 'If the panel needs to read a PEM file while preparing configuration, mount it read-only under /var/lib/remnawave and use that path. Reads outside this directory, including symlink escapes, are denied. Ordinary text files, FIFOs and PEM files over 128 KiB are rejected. This applies to files read by the panel; it does not relocate node certificates or configure node HTTPS automatically.'],
        ['فایل‌های گواهی', 'اگر پنل برای آماده‌سازی پیکربندی باید فایل PEM بخواند، آن را فقط‌خواندنی داخل /var/lib/remnawave متصل و همان مسیر را وارد کنید. خواندن بیرون این پوشه، از جمله خروج از طریق پیوند نمادین، ممنوع است. فایل متن عادی، FIFO و PEM بزرگ‌تر از 128 KiB پذیرفته نمی‌شود. این قاعده مربوط به فایل‌هایی است که پنل می‌خواند؛ گواهی نود را جابه‌جا یا HTTPS آن را خودکار تنظیم نمی‌کند.'],
        ['证书文件', '如果面板在准备配置时需要读取 PEM 文件，请将其以只读方式挂载到 /var/lib/remnawave 下并使用该路径。禁止读取此目录以外的文件，包括通过符号链接逃逸。普通文本、FIFO 以及超过 128 KiB 的 PEM 文件会被拒绝。此规则只适用于面板读取的文件，不会移动节点证书或自动配置节点 HTTPS。']
    ]],
    ['overview', 'overview-database-diagnostics', [
        ['Диагностика базы данных', 'На главной показаны подключения приложения, активные запросы, ожидания блокировок и простаивающие транзакции. Снимок относится только к текущей роли и базе панели; собственный диагностический запрос исключён. Тексты SQL, адреса и ключи не показываются. Для доступа нужна сессия администратора, API-токен не подходит. Неизвестная статистика обозначается «—», а не нулём. При ошибке остальные блоки главной продолжают работать.\n\nИнтерфейс проверяет снимок каждые 30 секунд только в открытой вкладке; сервер объединяет одновременные запросы и хранит результат 15 секунд на процесс. Графики общего трафика также используют ограниченный снимок на 15 секунд. Это кеш отображения, который не меняет проверки доступа, квоты или блокировки. Рост ожиданий или времени запроса требует проверки журнала и плана SQL; число подключений само по себе не означает перегрузку.'],
        ['Database diagnostics', 'Home shows application connections, active queries, lock waits and idle transactions. The snapshot covers only the current role and panel database; the diagnostics query excludes itself. SQL text, addresses and keys are not shown. An administrator session is required; API tokens cannot use this endpoint. Unknown statistics appear as “—”, not zero. A diagnostics failure leaves the other Home sections working.\n\nThe interface polls every 30 seconds in a visible tab; the server coalesces concurrent requests and retains a sample for 15 seconds per process. Total traffic charts also use a bounded 15-second snapshot. This display cache does not change access checks, quotas or blocks. Rising wait counts or query times call for log and SQL-plan inspection; a connection count alone does not prove overload.'],
        ['عیب‌یابی پایگاه داده', 'صفحه خانه اتصال‌های برنامه، پرس‌وجوهای فعال، انتظار قفل و تراکنش‌های بیکار را نشان می‌دهد. نمونه فقط نقش فعلی و پایگاه داده پنل را پوشش می‌دهد و پرس‌وجوی تشخیصی خودش را حذف می‌کند. متن SQL، آدرس‌ها و کلیدها نمایش داده نمی‌شوند. نشست مدیر لازم است؛ توکن API به این مسیر دسترسی ندارد. آمار نامشخص با «—» نشان داده می‌شود، نه صفر. خطای این بخش سایر بخش‌های خانه را متوقف نمی‌کند.\n\nرابط هر ۳۰ ثانیه در زبانه قابل مشاهده نمونه می‌گیرد؛ سرور درخواست‌های هم‌زمان را ادغام و نتیجه را برای هر فرایند ۱۵ ثانیه نگه می‌دارد. نمودار ترافیک کل نیز نمونه محدود ۱۵ ثانیه‌ای دارد. این کش نمایشی بررسی دسترسی، سهمیه یا مسدودسازی را تغییر نمی‌دهد. افزایش انتظار یا زمان پرس‌وجو نیازمند بررسی گزارش و طرح SQL است؛ تعداد اتصال به‌تنهایی نشانه اضافه‌بار نیست.'],
        ['数据库诊断', '主页显示应用连接、活动查询、锁等待和空闲事务。快照仅涵盖面板数据库中的当前角色，并排除诊断查询本身。不显示 SQL 文本、地址或密钥。必须使用管理员会话；API 令牌不能访问此端点。未知统计显示为“—”，而不是零。诊断失败不会影响主页其他区块。\n\n界面仅在可见标签页中每 30 秒轮询；服务端合并并发请求，每个进程保留快照 15 秒。总流量图也使用有界的 15 秒快照。这些显示缓存不会改变访问检查、配额或封禁。等待数或查询时间升高时应检查日志与 SQL 执行计划；连接数量本身不能证明过载。']
    ]],
    ['architecture', 'architecture-platform-compatibility', [
        ['Поддерживаемые ОС и PostgreSQL', 'Комплект Installer 1.2.141 принимает Ubuntu 22.04/24.04/26.04 LTS и Debian 12/13, amd64/arm64. Для Docker выбирается официальный репозиторий своего дистрибутива. Промежуточные версии Ubuntu и производные системы не принимаются автоматически. Матрица на amd64 проверяет настоящий userspace, Bash, Python, OpenSSL и модульные сценарии; она не заменяет загрузочный тест ядра, systemd, firewall или arm64.\n\nВсе 195 миграций и сценарии квот, срока доступа и диагностики проверены на PostgreSQL 14.24/15.19/16.15/17.11/18.6 под владельцем БД без superuser. Для новой установки выбирайте поддерживаемую major-версию с текущими исправлениями. Поддержка PostgreSQL 14 заканчивается 12 ноября 2026 года; PostgreSQL 13 не проверен и снят с поддержки. Смена major-версии требует отдельного pg_upgrade или dump/restore. Не открывайте старый data volume новым major-образом; сначала проверьте перенос на копии.'],
        ['Supported operating systems and PostgreSQL', 'Installer 1.2.141 accepts Ubuntu 22.04/24.04/26.04 LTS and Debian 12/13, amd64/arm64. Docker uses the official repository for the installed distribution. Interim Ubuntu releases and derivative distributions are not accepted automatically. The amd64 matrix checks real userspace, Bash, Python, OpenSSL and unit workflows; it does not replace kernel boot, systemd, firewall or arm64 tests.\n\nAll 195 migrations, quota, expiry and diagnostics scenarios were checked on PostgreSQL 14.24/15.19/16.15/17.11/18.6 as a non-superuser database owner. For new installations, choose a supported major version with current fixes. PostgreSQL 14 support ends on November 12, 2026; PostgreSQL 13 was not tested and is end-of-life. Major upgrades require a separate pg_upgrade or dump/restore. Do not open an old data volume with a new major image; verify the migration on a copy first.'],
        ['سیستم‌عامل‌ها و PostgreSQL پشتیبانی‌شده', 'نصب‌کننده 1.2.141 Ubuntu 22.04/24.04/26.04 LTS و Debian 12/13 را برای amd64/arm64 می‌پذیرد. Docker از مخزن رسمی همان توزیع استفاده می‌کند. نسخه‌های میانی Ubuntu و توزیع‌های مشتق خودکار پذیرفته نمی‌شوند. ماتریس amd64 محیط کاربری واقعی، Bash، Python، OpenSSL و سناریوهای واحد را بررسی می‌کند؛ جایگزین آزمون بوت کرنل، systemd، فایروال یا arm64 نیست.\n\nتمام ۱۹۵ مهاجرت و سناریوهای سهمیه، انقضا و عیب‌یابی روی PostgreSQL 14.24/15.19/16.15/17.11/18.6 با مالک پایگاه داده بدون superuser بررسی شدند. برای نصب جدید نسخه اصلی پشتیبانی‌شده با اصلاحات جاری را انتخاب کنید. پشتیبانی PostgreSQL 14 در ۱۲ نوامبر ۲۰۲۶ تمام می‌شود؛ نسخه ۱۳ آزمایش نشده و پایان پشتیبانی است. ارتقای نسخه اصلی به pg_upgrade یا dump/restore جداگانه نیاز دارد. حجم داده قدیمی را با تصویر نسخه اصلی جدید باز نکنید و ابتدا انتقال را روی یک کپی بررسی کنید.'],
        ['受支持的系统与 PostgreSQL', '安装器 1.2.141 支持 Ubuntu 22.04/24.04/26.04 LTS 与 Debian 12/13，架构为 amd64/arm64。Docker 使用当前发行版的官方仓库。不会自动接受 Ubuntu 中间发行版或衍生系统。amd64 矩阵检查真实用户空间、Bash、Python、OpenSSL 与单元流程，不能代替内核启动、systemd、防火墙或 arm64 测试。\n\n已使用非超级用户数据库所有者，在 PostgreSQL 14.24/15.19/16.15/17.11/18.6 上检查全部 195 项迁移以及配额、到期和诊断场景。新安装请选择仍受支持并安装当前修复的主版本。PostgreSQL 14 将于 2026 年 11 月 12 日结束支持；版本 13 未测试且已结束支持。跨主版本升级需要单独使用 pg_upgrade 或导出/恢复。不要让新主版本镜像直接打开旧数据卷，请先在副本上验证迁移。']
    ]]
)

sections.push(['nodes', 'nodes-global-xray-mode', [
    ['Настройка Xray', 'Раздел «Настройка Xray» выбирает ядро сразу для всей панели. По умолчанию используется кастомное ядро Remnacust. Обычный Xray подходит для стандартных протоколов и транспортов. Пользователи, заморозка, подписки, геофайлы и клиентский автовыбор работают в обоих режимах. Лимиты хостов и устройств, отдельный учёт получателя автовыбора, правила доступа к сайтам, хосты для неактивного доступа, планы портов и Xera HTTP требуют кастомного ядра. В обычном режиме их настройки недоступны и не применяются; сохранённые значения не удаляются.\n\nПеред переходом на обычный Xray панель проверяет активные профили, планы портов и журналы квот. Устраните показанные препятствия: данные учёта и резервы нельзя просто удалять ради переключения. Для выбора двух ядер на нашей ноде нужен обновлённый образ Node; обычные Remnawave-ноды сохраняют базовую совместимость. Применение ставится в очередь, а при временной недоступности очереди повторяется планировщиком. Выбор режима не подтверждает успешное применение на каждой ноде: проверьте её состояние.\n\nСмена ядра перезапускает его и может прервать подключения. Сначала сохраните изменения редактора. При смене режима открытый редактор обновляется и загружает валидатор и схему соответствующего ядра. Общий выбор имеет приоритет над старым полем geodata.core в профиле; сохранённый профиль при этом не переписывается. Управление версиями кастомного ядра доступно только в кастомном режиме.'],
    ['Xray settings', 'Xray settings selects one core flavor for the entire panel. The default is the custom Remnacust core. Stock Xray supports standard protocols and transports. Users, freezing, subscriptions, geofiles and client-side autoselect work in both modes. Host/device limits, separate autoselect recipient accounting, destination access rules, inactive-access hosts, port plans and Xera HTTP require the custom core. Stock mode disables their controls and effective policies without deleting saved settings.\n\nBefore switching to stock Xray, the panel checks active profiles, port plans and quota journals. Resolve the listed blockers; never delete accounting data or reserves merely to switch. Dual-core selection on a custom node requires an updated Node image; native Remnawave nodes retain baseline compatibility. Changes are queued and the scheduler retries delivery if the queue is temporarily unavailable. Selection does not prove every node applied it: check node status.\n\nSwitching cores restarts the core and may interrupt connections. Save editor changes first. An open editor refreshes on a mode change and loads the matching validator and schema. The global choice overrides the legacy geodata.core profile selector without rewriting the saved profile. Custom core version management is available only in custom mode.'],
    ['تنظیمات Xray', 'بخش تنظیمات Xray یک نوع هسته را برای کل پنل انتخاب می‌کند. پیش‌فرض هسته سفارشی Remnacust است. Xray معمولی پروتکل‌ها و انتقال‌های استاندارد را پشتیبانی می‌کند. کاربران، انجماد، اشتراک، فایل‌های جغرافیایی و انتخاب خودکار سمت کلاینت در هر دو حالت کار می‌کنند. محدودیت میزبان و دستگاه، حسابداری مستقل گیرنده انتخاب خودکار، قواعد مقصد، میزبان دسترسی غیرفعال، طرح پورت و Xera HTTP به هسته سفارشی نیاز دارند. در حالت معمولی کنترل‌ها و سیاست‌های آن‌ها غیرفعال می‌شوند، اما تنظیمات ذخیره‌شده حذف نمی‌شوند.\n\nپیش از تغییر، پروفایل‌های فعال، طرح پورت و دفترهای سهمیه بررسی می‌شوند. موانع نمایش‌داده‌شده را رفع کنید؛ داده حسابداری و ذخایر را برای تغییر هسته حذف نکنید. انتخاب دو هسته روی نود سفارشی به تصویر Node به‌روز نیاز دارد؛ نود Remnawave معمولی سازگاری پایه را حفظ می‌کند. تغییر در صف قرار می‌گیرد و زمان‌بند هنگام اختلال صف دوباره تلاش می‌کند. انتخاب به‌معنی اعمال موفق روی همه نودها نیست؛ وضعیت نود را بررسی کنید.\n\nتعویض هسته آن را بازراه‌اندازی می‌کند و ممکن است اتصال را قطع کند. ابتدا تغییرات ویرایشگر را ذخیره کنید. ویرایشگر باز نوسازی شده و اعتبارسنج و طرح همان هسته را می‌گیرد. انتخاب عمومی بر geodata.core قدیمی اولویت دارد، بدون بازنویسی پروفایل ذخیره‌شده. مدیریت نسخه هسته سفارشی فقط در حالت سفارشی فعال است.'],
    ['Xray 设置', '“Xray 设置”为整个面板选择统一内核，默认使用 Remnacust 自定义内核。标准 Xray 支持标准协议和传输。用户、冻结、订阅、地理文件和客户端自动选择在两种模式下均可使用。主机和设备限制、自动选择接收对象独立计费、目标访问规则、非活跃访问主机、端口计划和 Xera HTTP 需要自定义内核。标准模式会禁用相关控件和有效策略，但不会删除已保存设置。\n\n切换前会检查活动配置、端口计划和配额日志。请解决列出的阻碍，不要为切换而删除计费数据或预留额度。自定义节点需更新 Node 镜像才能选择双内核；标准 Remnawave 节点保留基本兼容性。更改进入队列，队列暂时不可用时由调度器重试。选中模式并不代表所有节点均已应用，请检查节点状态。\n\n切换内核需要重启内核，可能中断连接。请先保存编辑器修改。打开的编辑器会刷新并加载对应验证器和配置架构。全局选择优先于旧的 geodata.core 字段，但不会重写已保存配置。自定义内核版本管理仅在自定义模式下可用。']
]])

sections.push(['subscription-settings', 'subscription-hwid-delivery', [
    ['Обновление подписки и HWID', 'Выдача подписки приложению проверяет пользователя, устройство, блокировку регистрации и лимит устройств в базе данных, но не ждёт ответа нод. Доставка персональных ключей выполняется отдельно с сохранением задания и повторными попытками. Если нода недоступна, конфигурация всё равно выдаётся; новое подключение на этой ноде станет доступно после доставки ключа. Уже известное устройство не занимает очередь блокировки регистрации нового устройства. Повторные обновления известного устройства не запускают рассылку ключей на все ноды, но заново проверяют права: блокировки HWID и запрет новых устройств не обходятся.\n\nОткрытие сайта или curl без заголовков устройства не проверяет тот же путь, что Happ или INCY. При диагностике сравнивайте одинаковую ссылку с User-Agent и HWID приложения. Не публикуйте ссылку подписки или HWID в открытых журналах.'],
    ['Subscription refresh and HWID', 'Subscription delivery checks the user, device, registration policy and device limit in the database without waiting for nodes. Personal keys are delivered separately through persistent jobs with retries. If a node is unavailable, the subscription is still returned; a new connection on that node becomes usable after its key arrives. Known devices do not wait for the lock used to register new devices. Refreshing a known device does not resend keys to every node, but rechecks authorization: HWID blocks and registration restrictions remain enforced.\n\nA website visit or curl request without device headers does not exercise the same path as Happ or INCY. Compare the same URL with the application User-Agent and HWID when diagnosing failures. Do not publish subscription URLs or HWIDs in public logs.'],
    ['تازه‌سازی اشتراک و HWID', 'ارسال اشتراک، کاربر، دستگاه، سیاست ثبت و سقف دستگاه‌ها را در پایگاه داده بررسی می‌کند و منتظر پاسخ نودها نمی‌ماند. کلیدهای شخصی با کارهای پایدار و تلاش مجدد جداگانه ارسال می‌شوند. اگر نود در دسترس نباشد، اشتراک همچنان برگردانده می‌شود؛ اتصال جدید روی آن نود پس از دریافت کلید ممکن می‌شود. دستگاه شناخته‌شده منتظر قفل ثبت دستگاه جدید نمی‌ماند. تازه‌سازی دستگاه شناخته‌شده کلید را دوباره به همه نودها نمی‌فرستد، اما مجوزها دوباره بررسی می‌شوند و مسدودی HWID و محدودیت ثبت حفظ می‌شود.\n\nبازکردن سایت یا curl بدون سرآیند دستگاه همان مسیر Happ یا INCY را آزمایش نمی‌کند. برای عیب‌یابی، همان نشانی را با User-Agent و HWID برنامه مقایسه کنید. لینک اشتراک و HWID را در گزارش عمومی منتشر نکنید.'],
    ['订阅刷新与 HWID', '向应用返回订阅前，会在数据库中检查用户、设备、注册策略和设备数量限制，无需等待节点响应。个人密钥通过持久化任务单独下发，失败后重试。节点不可用时仍会返回订阅；该节点收到密钥后，新连接才能使用。已知设备无需等待注册新设备使用的锁。已知设备刷新时不会向所有节点重复下发密钥，但每次仍重新检查权限，不会绕过 HWID 封禁或注册限制。\n\n打开网站或不带设备请求头的 curl 请求，与 Happ、INCY 的处理路径不同。排查时应使用相同链接及应用的 User-Agent、HWID 进行对比。不要在公开日志中泄露订阅链接或 HWID。']
]])

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
