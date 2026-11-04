const languages = ['ru', 'en', 'fa', 'zh']

// Keep scope and units identical in all four operator guides.
const sections = [
    ['subscription-settings', 'subscription-cold-node-discovery', [
        ['Первый запуск смешанного парка', 'Перед подготовкой политики и ключей панель проверяет возможности ноды и других нод с теми же входящими подключениями. Проверки выполняются вне SQL-транзакций, с ограничением параллельности и времени. Политика и конфигурация используют один снимок совместимости. Недоступная нода задерживает только затронутые входящие подключения; независимые исправные ноды продолжают запуск. При неизвестной совместимости сохраняется прежняя конфигурация и назначается повторная проверка. Сетевой сбой не превращает ноду в обычную Remnawave-ноду и не снимает ограничения.'],
        ['First start of a mixed node fleet', 'Before preparing policy and credentials, the panel discovers capabilities of the node and peers sharing its inbounds. Discovery runs outside SQL transactions with bounded concurrency and time. Policy and configuration use the same compatibility snapshot. An unavailable node delays only affected inbounds; independent healthy nodes continue starting. Unknown compatibility keeps the previous configuration and schedules a retry. A network failure never classifies a node as native Remnawave or removes restrictions.'],
        ['شروع نخست مجموعه نودهای متفاوت', 'پنل پیش از آماده‌سازی سیاست و کلیدها، قابلیت‌های نود و همتایان دارای ورودی مشترک را بررسی می‌کند. بررسی خارج از تراکنش SQL و با زمان و هم‌زمانی محدود انجام می‌شود. سیاست و پیکربندی از یک تصویر سازگاری استفاده می‌کنند. نود در دسترس نبودنی فقط ورودی‌های مرتبط را عقب می‌اندازد و نودهای سالم مستقل راه‌اندازی می‌شوند. سازگاری نامشخص پیکربندی قبلی را نگه می‌دارد و بررسی دوباره زمان‌بندی می‌شود. خطای شبکه نود را Remnawave عادی تلقی نمی‌کند و محدودیت را برنمی‌دارد.'],
        ['混合节点的首次启动', '准备策略和凭据前，面板先检测当前节点及共享入站的其他节点的能力。检测在 SQL 事务外进行，并限制并发与时间。策略和配置使用同一份兼容性快照。节点不可用时仅延迟受影响的入站，独立的健康节点继续启动。兼容性未知时保留原配置并安排重试；网络故障不会将节点识别为原生 Remnawave，也不会解除限制。']
    ]],
    ['host-tags', 'host-tags-bounded-accounting', [
        ['Учёт трафика и пакеты квот', 'Накопленный трафик фиксируется пакетами до восьми квитанций в транзакции. Квитанция может содержать несколько пользователей; удаление подтверждения в Redis происходит после фиксации PostgreSQL, а повтор не списывает расход дважды. Результат свежего снятия счётчиков остаётся под блокировкой до сохранения. Эпохи квот записываются пакетами до 500 строк в общей транзакции ревизии. Координатор фиксирует финансирование и курсор по владельцу, проверяет поколение и продлевает аренду между областями. Бюджет проверяется между владельцами; один владелец с множеством областей может обрабатываться дольше 20 секунд.'],
        ['Traffic accounting and quota batches', 'Pending traffic commits at most eight receipts per transaction. A receipt may contain several users. Redis acknowledgements are removed after PostgreSQL commits, and retries do not charge usage twice. Fresh counter collection remains locked until its result is saved. Quota epochs are written in batches of up to 500 rows within the revision transaction. The coordinator commits funding and its cursor per owner, checks the generation and renews its lease between scopes. The budget is checked between owners; one owner with many scopes may take longer than 20 seconds.'],
        ['حسابداری ترافیک و دسته‌های سهمیه', 'ترافیک معوق در هر تراکنش با حداکثر هشت رسید ثبت می‌شود. هر رسید می‌تواند چند کاربر داشته باشد. تأیید Redis پس از ثبت PostgreSQL حذف می‌شود و تلاش دوباره مصرف را دوبار حساب نمی‌کند. خواندن شمارنده تازه تا ذخیره نتیجه قفل می‌ماند. دوره‌های سهمیه در دسته‌های حداکثر 500 ردیفی در تراکنش همان بازبینی ثبت می‌شوند. هماهنگ‌کننده اعتبار و نشانگر را برای هر مالک ثبت، نسل را بررسی و اجاره را بین محدوده‌ها تمدید می‌کند. بودجه بین مالکان بررسی می‌شود؛ پردازش یک مالک با محدوده‌های فراوان ممکن است بیش از 20 ثانیه طول بکشد.'],
        ['流量记账与配额批处理', '积压流量每个事务最多提交八张收据，每张收据可包含多个用户。PostgreSQL 提交后才删除 Redis 确认记录，重试不会重复扣除流量。读取新计数器时，锁保留到结果保存。配额 epoch 在同一修订事务内每批最多写入 500 行。协调器按所有者提交额度和游标，检查代次并在各作用域之间续租。处理预算在所有者之间检查；单个所有者拥有很多作用域时可能超过 20 秒。']
    ]],
    ['subscription-settings', 'subscription-access-utc', [
        ['Срок доступа и устройства: UTC', 'Проверка срока доступа и дат выбранных устройств использует UTC независимо от часового пояса PostgreSQL. Обновление применяет миграцию функций доступа, не меняя сохранённые даты, остаток заморозки и квоты. Если устройство заблокировали или зарегистрировали заново после открытия списка, старое массовое удаление его не затронет.'],
        ['Access lifetime and devices: UTC', 'Access expiry and selected device timestamps use UTC independently of the PostgreSQL timezone. The update migrates access functions without changing stored dates, frozen lifetime or quotas. If a device is blocked or registered again after the list is opened, a stale bulk deletion preserves it.'],
        ['مدت دسترسی و دستگاه‌ها: UTC', 'انقضای دسترسی و زمان دستگاه‌های انتخاب‌شده مستقل از منطقه زمانی PostgreSQL با UTC بررسی می‌شوند. به‌روزرسانی توابع دسترسی را بدون تغییر تاریخ‌های ذخیره‌شده، زمان منجمد یا سهمیه مهاجرت می‌دهد. اگر دستگاه پس از باز شدن فهرست مسدود یا دوباره ثبت شود، حذف گروهی قدیمی آن را حفظ می‌کند.'],
        ['访问期限与设备：UTC', '访问到期时间和选中设备的时间戳统一按 UTC 检查，不受 PostgreSQL 时区影响。更新会迁移访问函数，不更改已保存日期、冻结剩余时长或配额。设备若在打开列表后被封禁或重新注册，旧的批量删除请求会保留该设备。']
    ]],
    ['subscription-settings', 'subscription-database-load', [
        ["Производительность и совместимость подписок", "Панель 1.1.7.95 проверяет выданные ключи и пользователей массовой конфигурации наборами SQL. Срок, статус, сквады, блокировка HWID и смена ключей продолжают учитываться. Проверка поддержки ноды выполняется перед тяжёлой сборкой; паузы лимитов читаются одним запросом на ноду. Синхронизации объединяются, одновременно обрабатываются не более трёх нод на процесс, занятая advisory-блокировка повторяется вне транзакции. Подтверждённая штатная Remnawave-нода получает обычную конфигурацию: новые ограничения хоста, правила сайтов и неактивные хосты-исключения на её inbound отключены. Если этот inbound используется и нашей нодой, обе используют совместимые обычные ключи. На отдельных совместимых inbound новые функции сохраняются. Старое наше ядро без учёта получателя автовыбора использует ключи и лимиты серверов пула; обновление Node/Core и подписки включает отдельный учёт. Панель показывает режим совместимости. Неизвестная нода и сетевой сбой сами по себе не отключают ограничения. Существующие резервы квот и финансовые блокировки не стираются при понижении версии. API старых страниц подписки сохранён; страницы со скрытыми ключами не строят ненужные ссылки. Новых переменных .env для этого режима нет; миграция проверки срока UTC описана отдельно."],
        ["Subscription performance and compatibility", "Panel 1.1.7.95 checks issued identities and bulk configuration users using SQL sets while preserving expiry, status, squads, HWID blocks and key rotation. Node preflight precedes expensive configuration compilation; limit pauses are read in one query per node. Updates coalesce, at most three nodes synchronize per process, and a busy advisory lock is retried outside the transaction. A confirmed native Remnawave node receives a baseline configuration: new host restrictions, destination rules and inactive-user exceptions are disabled on its inbounds. A custom node sharing such an inbound uses the same compatible baseline credentials; isolated compatible inbounds retain extensions. Older custom cores without autoselect recipient accounting use ordinary pool-server credentials and limits. Upgrade Node/Core and refresh the client subscription for separate recipient accounting. The panel displays compatibility mode. An unknown node or network failure alone never disables restrictions. Existing quota reserves and financial fences are not erased by a downgrade. Older subscription-page APIs remain compatible, and pages hiding connection keys skip unused link generation. This mode needs no new .env variables; the UTC access-expiry migration is described separately."],
        ["کارایی و سازگاری اشتراک", "پنل 1.1.7.95 کلیدهای صادرشده و کاربران پیکربندی گروهی را با مجموعه‌های SQL بررسی می‌کند و انقضا، وضعیت، اسکوا‌د، مسدودسازی HWID و تعویض کلید حفظ می‌شوند. بررسی پشتیبانی نود پیش از ساخت سنگین انجام می‌شود و توقف سهمیه‌ها با یک پرس‌وجو برای هر نود خوانده می‌شود. همگام‌سازی‌ها ادغام می‌شوند، هر پردازش حداکثر سه نود را هم‌زمان بررسی می‌کند و قفل اشغال‌شده بیرون تراکنش دوباره امتحان می‌شود. نود اصلی تأییدشده Remnawave پیکربندی عادی می‌گیرد؛ محدودیت میزبان، قواعد مقصد و استثنای کاربران غیرفعال روی ورودی‌های آن غیرفعال است. نود سفارشی با ورودی مشترک نیز کلید عادی یکسان دارد، اما ورودی سازگار مستقل قابلیت‌ها را حفظ می‌کند. هسته قدیمی بدون حسابداری گیرنده انتخاب خودکار از کلید و محدودیت سرور استخر استفاده می‌کند. برای حسابداری مستقل، Node/Core و اشتراک کلاینت را به‌روز کنید. حالت سازگاری در پنل نمایش داده می‌شود. خطای شبکه یا نود ناشناخته محدودیت‌ها را غیرفعال نمی‌کند. ذخایر سهمیه و حصارهای مالی با کاهش نسخه حذف نمی‌شوند. API صفحات قدیمی حفظ شده و صفحات با کلید مخفی، لینک غیرضروری نمی‌سازند. این حالت متغیر جدید .env نمی‌خواهد؛ مهاجرت بررسی انقضای UTC جداگانه توضیح داده شده است."],
        ["订阅性能与兼容性", "面板 1.1.7.95 使用 SQL 集合检查已签发凭据及批量配置用户，保留期限、状态、分组、HWID 封禁与密钥轮换检查。节点预检先于昂贵的配置构建，暂停限额按节点一次读取。同步请求合并，每个进程最多同时处理三个节点；占用中的 advisory 锁在事务外重试。已确认的原生 Remnawave 节点获得基础配置，其入站不启用新增的主机限额、目标规则和非活跃用户例外。同一入站上的自定义节点使用相同的兼容凭据；独立兼容入站仍保留扩展。缺少自动选择接收主机配额功能的旧版自定义核心使用池内服务器的普通凭据和限额。升级 Node/Core 并刷新客户端订阅可启用独立归属。面板显示兼容模式。未知节点或网络错误本身不会关闭限制。降级不会清除现有配额储备及财务围栏。旧版订阅页面 API 保持兼容，隐藏密钥的页面不生成无用链接。此模式无需新增 .env 变量；UTC 到期检查迁移另有说明。"],
    ]],
    ['subscription-settings', 'maintenance-log-download', [
        ['Технический журнал обновления', 'В окне обновления панели и у операции страницы подписки «Скачать журнал» загружает настоящий технический вывод, а не JSON со статусом. Скачивание доступно только администратору панели по ID текущей задачи; API-токены доступа не получают. Пароли и токены удаляются из скачиваемой копии. Для больших файлов доступны последние 1 MiB с отметкой об ограничении; полный файл остаётся приватным на сервере до следующей операции того же компонента. При временной недоступности панели повторите скачивание после восстановления связи либо откройте указанный серверный путь. Нужны панель 1.1.7.91 и служба установщика 1.2.129. remnacust-panel-update.service запускает локальный API при загрузке сервера, но начинает обновление только по запросу администратора.'],
        ['Technical update log', 'Download journal in the panel update dialog and subscription page operations downloads real technical output rather than a status JSON. Only a panel administrator can download it for the current job ID; API tokens cannot. Passwords and tokens are removed from the downloaded copy. Large files return the last 1 MiB with a truncation notice; the complete private file remains on the server until the next operation for that component. If the panel is temporarily unreachable, retry after reconnection or open the displayed server path. Requires panel 1.1.7.91 and installer service 1.2.129. remnacust-panel-update.service starts the local API at boot and only starts updates on an administrator request.'],
        ['گزارش فنی به‌روزرسانی', '«دریافت گزارش» در پنجره به‌روزرسانی پنل و عملیات صفحه اشتراک، خروجی فنی واقعی را دریافت می‌کند، نه JSON وضعیت. فقط مدیر پنل با شناسه کار جاری دسترسی دارد؛ توکن API مجاز نیست. گذرواژه‌ها و توکن‌ها از نسخه دریافتی حذف می‌شوند. برای فایل بزرگ، آخرین 1 MiB با پیام محدودیت دریافت می‌شود؛ فایل کامل تا عملیات بعدی همان مؤلفه در سرور خصوصی می‌ماند. هنگام قطع موقت پنل پس از اتصال دوباره تلاش کنید یا مسیر نمایش‌داده‌شده را در سرور باز کنید. پنل 1.1.7.91 و سرویس نصاب 1.2.129 لازم است. remnacust-panel-update.service هنگام راه‌اندازی سرور فقط API محلی را اجرا می‌کند و به‌روزرسانی را تنها با درخواست مدیر شروع می‌کند.'],
        ['更新技术日志', '面板更新窗口和订阅页面操作中的“下载日志”会下载真实技术输出，而不是状态 JSON。只有面板管理员可以按当前任务 ID 下载，API 令牌无权访问。下载副本会移除密码和令牌。大文件返回最后 1 MiB 并注明截断；完整私有文件保留在服务器上，直到该组件的下一次操作。面板暂时无法连接时，请在恢复后重试，或打开显示的服务器路径。需要面板 1.1.7.91 和安装服务 1.2.129。remnacust-panel-update.service 开机时启动本地 API，只有收到管理员请求才开始更新。']
    ]],
    ['hosts', 'hosts-allowed-probe', [
        ['Пинг ограниченного хоста', 'HTTP-проверка должна обращаться к разрешённому сайту через сам хост. В режиме «Разрешить только» форма показывает копируемый URL первого разрешённого домена. Для Happ с настоящим Provider ID панель выбирает общий разрешённый URL для всех выданных видимых хостов, сохраняет подходящий настроенный URL и HTTP-метод. Явно выбранные TCP и ICMP не меняются. Если общего домена нет или есть только IP/CIDR, используется TCP-проверка; она подтверждает доступность сервера, а не авторизацию VPN. В INCY выберите HTTP/INCY-пинг и этот URL в настройках подписки: обычные HTTP-заголовки не управляют адресом его проверки, автоматическая настройка доступна только через Premium API самого INCY. Политика сайтов не расширяется, проверка не отправляется через DIRECT. Сайт должен отвечать на выбранный HTTP-метод; перенаправление на запрещённый домен по-прежнему блокируется.'],
        ['Restricted host latency', 'An HTTP check must reach an allowed website through the host itself. In Allow only mode, the form shows a copyable URL for the first allowed domain. For Happ with a real Provider ID, the panel selects a common allowed URL for all delivered visible hosts, preserving a suitable configured URL and HTTP method. Explicit TCP and ICMP choices are unchanged. When no shared domain exists or only IP/CIDR destinations are allowed, it falls back to TCP; TCP confirms server reachability, not VPN authorization. In INCY, choose HTTP/INCY ping and this URL in subscription settings: ordinary HTTP headers cannot set its probe URL; automatic configuration requires INCY’s own Premium API. Website permissions are not widened and the check never goes through DIRECT. The website must respond to the selected HTTP method; redirects to a denied domain remain blocked.'],
        ['پینگ میزبان محدود', 'بررسی HTTP باید از طریق خود میزبان به یک وب‌سایت مجاز برسد. در حالت «فقط مجاز»، فرم نشانی قابل کپی اولین دامنه مجاز را نشان می‌دهد. برای Happ با Provider ID واقعی، پنل نشانی مشترک مجاز همه میزبان‌های قابل‌مشاهده اشتراک را انتخاب و نشانی مناسب و روش HTTP تنظیم‌شده را حفظ می‌کند. انتخاب صریح TCP یا ICMP تغییر نمی‌کند. بدون دامنه مشترک یا با مقصدهای صرفاً IP/CIDR، بررسی TCP به‌کار می‌رود؛ این بررسی فقط دسترسی به سرور را می‌سنجد، نه مجوز VPN. در تنظیمات اشتراک INCY، پینگ HTTP/INCY و این نشانی را انتخاب کنید؛ هدرهای معمولی نشانی بررسی را تنظیم نمی‌کنند و تنظیم خودکار به Premium API خود INCY نیاز دارد. مجوز سایت‌ها گسترش نمی‌یابد و بررسی از DIRECT عبور نمی‌کند. سایت باید به روش HTTP انتخاب‌شده پاسخ دهد؛ تغییر مسیر به دامنه ممنوع همچنان مسدود است.'],
        ['受限主机延迟', 'HTTP 检测必须通过主机本身访问允许的网站。在“仅允许”模式下，表单显示首个允许域名的可复制 URL。Happ 配有真实 Provider ID 时，面板为订阅中所有可见主机选择共同允许的 URL，并保留合适的自定义 URL 与 HTTP 方法。明确选择的 TCP 或 ICMP 不变。没有共同域名或仅允许 IP/CIDR 时，改用 TCP；TCP 只确认服务器可达，不验证 VPN 授权。在 INCY 的订阅设置中选择 HTTP/INCY 检测并填写此 URL；普通 HTTP 标头不能设置其检测地址，自动配置需要 INCY 自身的 Premium API。不会扩大网站权限，也不会通过 DIRECT 检测。网站必须响应所选 HTTP 方法；跳转到禁止域名仍会被阻止。']
    ]],
    ['architecture', 'architecture-maintenance-logs', [
        ['Журналы обслуживания и длительная работа', 'Подробный журнал CLI хранится в /opt/remnacust/logs/installer-panel.log, installer-node.log или installer-subscription-page.log. Проверка состояния использует отдельный журнал и не удаляет журнал последнего обновления. Следующее действие с тем же компонентом заменяет предыдущий журнал; параллельный запуск не может затереть работающий журнал. Обновление панели через браузер сохраняет panel-update-<ID>.log, страницы — page-<ID страницы>-<ID задачи>.log, SSH-обновление ноды — node-maintenance.log на самой ноде. Ошибка показывает путь; журналы доступны только root и не входят в публичную подписку. Ввод и трассировка секретов не записываются. Подтверждение APT автоматическое, вопросы настройки остаются интерактивными в SSH. Кеш конфигураций ограничен количеством и размером; крупная запись пропускает локальный кеш, но выдаётся из основного источника. Завершение, ошибка и разрыв запроса освобождают ёмкость после завершения работы. Проверено совпадение исходной истории SQL Remnawave 3.0.0, 3.4.3 и 3.4.8; неизвестная или изменённая история останавливает перенос до изменения приложений.'],
        ['Maintenance logs and long-running service', 'Detailed CLI logs are /opt/remnacust/logs/installer-panel.log, installer-node.log and installer-subscription-page.log. Status checks use a separate log and retain the last update log. The next action for the same component replaces its previous log; a parallel invocation cannot erase an active log. Browser panel updates retain panel-update-<ID>.log, page operations retain page-<page ID>-<job ID>.log, and SSH node maintenance retains node-maintenance.log on that node. Failures show the path. Logs are root-only and never part of public subscriptions. Input and secret tracing are not recorded. APT confirmation is automatic; configuration questions remain interactive over SSH. Configuration caches are bounded by count and size; oversized entries bypass the local cache but remain available from the source. Completion, errors and disconnects release capacity when work settles. Original SQL histories match published Remnawave 3.0.0, 3.4.3 and 3.4.8; unknown or modified history stops migration before application changes.'],
        ['گزارش نگهداری و اجرای طولانی', 'گزارش CLI در /opt/remnacust/logs/installer-panel.log، installer-node.log یا installer-subscription-page.log است. بررسی وضعیت گزارش جداگانه دارد. عملیات بعدی همان مؤلفه گزارش قبلی را جایگزین می‌کند و اجرای هم‌زمان آن را پاک نمی‌کند. به‌روزرسانی پنل panel-update-<ID>.log، عملیات صفحه page-<page ID>-<job ID>.log و نگهداری نود node-maintenance.log را روی نود نگه می‌دارند. هنگام خطا مسیر نمایش داده می‌شود. فقط root دسترسی دارد و گزارش وارد اشتراک عمومی نمی‌شود. ورودی و ردیابی اسرار ثبت نمی‌شود. تأیید APT خودکار است؛ پرسش‌های تنظیمات از SSH پاسخ داده می‌شوند. کش تنظیمات از نظر تعداد و اندازه محدود است؛ داده بزرگ بدون کش محلی از منبع دریافت می‌شود. پس از پایان کار، خطا یا قطع اتصال ظرفیت آزاد می‌شود. تاریخچه SQL نسخه‌های رسمی Remnawave 3.0.0، 3.4.3 و 3.4.8 تطبیق داده شده است؛ تاریخچه ناشناخته یا تغییرکرده انتقال را قبل از تغییر برنامه متوقف می‌کند.'],
        ['维护日志与长期运行', 'CLI 详细日志位于 /opt/remnacust/logs/installer-panel.log、installer-node.log 或 installer-subscription-page.log。状态检查使用独立日志，不覆盖上次更新日志。同一组件下次操作才替换旧日志，并行执行无法覆盖正在使用的日志。面板更新保留 panel-update-<ID>.log，页面操作保留 page-<页面 ID>-<任务 ID>.log，SSH 节点维护在节点上保留 node-maintenance.log。失败时显示路径。日志仅 root 可读，不包含在公开订阅中，不记录输入或密钥跟踪。APT 自动确认；配置问题仍需通过 SSH 交互回答。配置缓存限制条数和大小，过大的条目绕过本地缓存，仍从原始来源返回。工作结束后，成功、错误或连接断开均释放容量。已比对官方 Remnawave 3.0.0、3.4.3 和 3.4.8 的 SQL 历史；未知或修改过的历史会在更改应用前停止迁移。']
    ]],
    ['subscription-settings', 'subscriptions-inactive-access', [
        ['Неактивный доступ и заморозка', 'Хосты с включённым доступом при неактивной подписке доступны при EXPIRED, DISABLED, FROZEN и LIMITED, а также при истёкшем сроке ACTIVE. Дополнительная настройка скрывает их во время активной подписки. Права сквадов, блокировки устройств и собственные ограничения хоста сохраняются. В своих примечаниях настройте отдельный блок FROZEN и его место в порядке примечаний. Маркер {{FREE_HOST}} вставляет разрешённые хосты в выбранную строку; он не снимает блокировку HWID и не выдаёт права. Добавьте inbound этого хоста во внутренний сквад пользователя. Если inbound общий, ограничьте остальные хосты через их доступ для сквадов, чтобы не открыть лишние подключения. Предпросмотр устройства предупреждает, если после разрешения ключей остались только уведомления. Внешний сквад может переопределять текст и порядок. Старые настройки получают стандартный текст заморозки без замены ваших сохранённых сообщений. При неактивном доступе JSON содержит самостоятельные подключения без общих или назначенных шаблонов, балансеров и геофайлов; ограничения самого хоста сохраняются. Домены, IP и подсети формируются отдельными правилами. Отказ HWID показывает сохранённое предупреждение о лимите или неподдерживаемом устройстве, а не только статус подписки. Happ и INCY на одном ПК используют разные HWID и занимают разные места в лимите устройств.'],
        ['Inactive access and freezing', 'Hosts enabled for inactive subscription access are available for EXPIRED, DISABLED, FROZEN and LIMITED, and for an ACTIVE account whose time has expired. The additional option hides them while the subscription is active. Squad permissions, device blocks and host-specific limits still apply. Configure the FROZEN block and its position in remark order under custom remarks. {{FREE_HOST}} inserts permitted hosts at that line; it cannot bypass an HWID block or grant access. Add that host’s inbound to the user’s internal squad. For a shared inbound, restrict other hosts through their squad access settings to avoid granting extra connections. Device preview warns when only notifications remain after resolving credentials. External squads may override wording and order. Older settings gain default frozen wording without replacing saved messages. Inactive JSON uses standalone connections without shared or assigned templates, balancers or geofiles; host restrictions still apply. Domains, IPs and networks become separate rules. HWID denial shows the saved device-limit or unsupported-device warning instead of only subscription status. Happ and INCY on the same PC use different HWIDs and occupy separate device slots.'],
        ['دسترسی غیرفعال و انجماد', 'میزبان‌های مجاز برای اشتراک غیرفعال در وضعیت‌های EXPIRED، DISABLED، FROZEN و LIMITED و حساب ACTIVE با زمان منقضی در دسترس‌اند. گزینه اضافی آن‌ها را هنگام فعال بودن اشتراک پنهان می‌کند. مجوز گروه، مسدودی دستگاه و محدودیت خود میزبان پابرجاست. در یادداشت‌های سفارشی، بخش FROZEN و جای آن در ترتیب یادداشت‌ها را تنظیم کنید. {{FREE_HOST}} میزبان‌های مجاز را در همان خط قرار می‌دهد و مسدودی HWID را دور نمی‌زند و مجوز نمی‌دهد. ورودی میزبان را به گروه داخلی کاربر اضافه کنید. برای ورودی مشترک، دسترسی گروه به سایر میزبان‌ها را محدود کنید تا اتصال اضافی مجاز نشود. پیش‌نمایش دستگاه در صورت باقی ماندن فقط اعلان هشدار می‌دهد. گروه خارجی می‌تواند متن و ترتیب را بازنویسی کند. تنظیمات قدیمی متن پیش‌فرض انجماد را بدون جایگزینی پیام‌های ذخیره‌شده دریافت می‌کنند. JSON اشتراک غیرفعال اتصال مستقل و بدون قالب مشترک یا اختصاص‌یافته، بالانسر و فایل جغرافیایی می‌دهد؛ محدودیت میزبان پابرجاست. دامنه، IP و زیرشبکه قوانین جدا دارند. رد HWID هشدار ذخیره‌شده سقف دستگاه یا دستگاه پشتیبانی‌نشده را نیز نشان می‌دهد. Happ و INCY روی یک رایانه HWID متفاوت و جایگاه جدا در سقف دستگاه دارند.'],
        ['未启用访问与冻结', '允许未激活订阅访问的主机适用于 EXPIRED、DISABLED、FROZEN、LIMITED，以及时长已到期的 ACTIVE 账户。附加选项可在订阅激活时隐藏这些主机。组权限、设备封禁和主机自身限制仍然有效。在自定义备注中配置 FROZEN 内容及其顺序。{{FREE_HOST}} 在该行插入获准的主机，不能绕过 HWID 封禁或授予权限。请将该主机的入站添加到用户的内部组。共享入站时，应通过组访问设置限制其他主机，避免额外授权。解析凭据后若仅剩通知，设备预览会显示警告。外部组可以覆盖文字和顺序。旧设置自动获得冻结默认文字，不会替换已保存的消息。未激活订阅的 JSON 使用独立连接，不加载共享或已分配模板、负载均衡或地理文件；主机限制仍然生效。域名、IP 和网段生成独立规则。HWID 拒绝时会显示已保存的设备上限或不支持设备警告，而不只是订阅状态。同一台电脑上的 Happ 和 INCY 使用不同 HWID，各占一个设备名额。']
    ]],
    ["subscription-settings","subscriptions-user-domain-links",[["Несколько ссылок пользователя","Карточка пользователя показывает обычный адрес и до трёх CDN выбранного основного домена. Каждую ссылку можно скопировать или открыть как QR-код; выбранный домен отмечен отдельно. Все адреса сохраняют общий срок, заморозку, устройства и квоты. В токене отдельно разрешаются обычные ссылки, только CDN или все ссылки; маршруты и фильтры приведены в справочнике API. Чтение каталога доменов не открывает ключи подписок. Четвёртый CDN нельзя создать или перенести в заполненную группу. Лишние старые записи удаляются вручную."],["Multiple subscription links","The user card shows the regular URL and up to three CDNs of the selected primary domain. Each link has copy and QR actions; the preferred domain is marked. Expiration, freezing, devices and quotas remain shared. API tokens may grant regular links only, CDN links only or all links; routes and filters are described in the API reference. Catalog access alone never grants access to subscription keys. A fourth CDN cannot be created or moved into a full family. Remove existing excess records manually."],["چند پیوند اشتراک","کارت کاربر نشانی عادی و حداکثر سه CDN دامنه اصلی انتخاب‌شده را نشان می‌دهد. هر پیوند امکان کپی و QR دارد و دامنه منتخب مشخص است. انقضا، انجماد، دستگاه‌ها و سهمیه مشترک‌اند. توکن API می‌تواند فقط پیوند عادی، فقط CDN یا همه پیوندها را مجاز کند؛ مسیرها و فیلترها در مرجع API هستند. مجوز فهرست به‌تنهایی دسترسی به کلید اشتراک نمی‌دهد. ایجاد یا انتقال CDN چهارم به گروه پر رد می‌شود. رکوردهای اضافی قبلی را دستی حذف کنید."],["多个订阅链接","用户卡片显示所选主域名的普通地址及最多三个 CDN。每个链接均支持复制和二维码，并标记首选域名。到期时间、冻结、设备及配额保持共用。API 令牌可分别授予仅普通链接、仅 CDN 或全部链接的权限；接口路径和筛选条件见 API 参考。仅有目录权限不能读取订阅密钥。禁止创建第四个 CDN 或将其移入已满的域名组。已有超额记录需要手动删除。"]]],
    ["subscription-settings","subscriptions-cdn-gateway",[["CDN: настройка один раз","В «Настроить CDN» скопируйте индивидуальное случайное имя заголовка и значение UUID. Имя стабильно при обновлениях; при переходе со старого общего имени замените только имя в CDN. В VK добавьте заголовок запросов, в Яндексе — заголовок запроса к источнику. Источник HTTPS, Host и SNI берутся из основного сайта подписки. Отключите принудительное кэширование персональных ответов. Обычные ссылки клиентов сохраняются без замены; файлы, контрольные суммы и ссылки устройств идут через CDN. ID не заменяет ключ, статус, заморозку, срок и HWID. Путь /cdn/<ID> остаётся запасным вариантом для CDN без заголовков. Новых переменных .env нет. Имя формируется с закрытым ключом установки; по одному публичному ID его не вычислить. При отдельной смене APP_SECRET имя нужно заново скопировать в CDN."],["CDN: configure once","Copy the individual neutral request header name and UUID value from Set up CDN. Add an origin request header in VK or Yandex. The name stays stable across upgrades; replace only the old common header name when migrating. Use the main subscription site for the HTTPS origin, Host and SNI. Disable forced caching of personalized responses. Existing client URLs need no replacement; files, checksums and device URLs retain the CDN. The ID does not bypass keys, status, freezing, expiry or HWID. The /cdn/<ID> path remains a fallback for CDNs without request headers. No new .env variables are needed. The name is generated with the private installation key and cannot be computed from the public ID alone. If APP_SECRET is separately rotated, copy the new header name to the CDN."],["CDN: تنظیم یک‌باره","در تنظیم CDN نام اختصاصی و خنثای هدر و مقدار UUID را کپی و در VK یا Yandex به درخواست‌های مبدأ اضافه کنید. نام در به‌روزرسانی ثابت می‌ماند؛ هنگام مهاجرت فقط نام مشترک قدیمی را عوض کنید. مبدأ HTTPS و Host و SNI از سایت اصلی اشتراک گرفته می‌شوند. کش اجباری پاسخ شخصی را خاموش کنید. نشانی فعلی کاربران نیاز به تعویض ندارد و فایل‌ها و checksum و نشانی دستگاه‌ها روی CDN می‌مانند. شناسه، کلید و وضعیت و انجماد و انقضا و HWID را دور نمی‌زند. مسیر /cdn/<ID> روش جایگزین CDN بدون هدر است. متغیر جدید .env لازم نیست. نام با کلید خصوصی نصب ساخته می‌شود و فقط از شناسه عمومی قابل محاسبه نیست. اگر APP_SECRET را جداگانه عوض کردید، نام جدید را در CDN وارد کنید."],["CDN：一次配置","从配置 CDN 窗口复制专属中性请求头名称和 UUID 值，在 VK 或 Yandex 中添加到源站请求。名称在更新后保持不变；迁移时只需替换旧通用名称。HTTPS 源站、Host 和 SNI 使用主订阅网站，关闭个性化响应的强制缓存。客户端现有链接无需替换，文件、校验和及设备链接仍使用 CDN。ID 不绕过密钥、状态、冻结、期限或 HWID 检查。/cdn/<ID> 路径保留为不支持请求头的备用方式，无需新增 .env 变量。 名称使用安装私钥生成，无法仅凭公开 ID 计算。若单独更换 APP_SECRET，请将新的请求头名称复制到 CDN。"]]],
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
