const sections = [
    [
        "geofile-client-delivery",
        [
            [
                "Автоматическая доставка и размер геофайлов",
                "Ручного переключателя доставки больше нет. Сначала все выбранные геофайлы преобразуются в правила. В INCY длинные списки без запятых сохраняются в поддерживаемой Xray строковой форме без потери условий. Размер проверяется у каждого итогового профиля с отступами в четыре пробела: бюджет совместимости панели — 900 000 байт с запасом для изменений клиента. Это не опубликованный разработчиком точный лимит INCY. Несколько хостов не суммируются для этого сравнения; отдельный предел полного ответа 16 MiB сохраняется. Если один профиль слишком велик, поддерживаемые Happ/INCY получают объединённые DAT с отдельными именами категорий. Лимиты разворачивания правил также могут переключить доставку. Другие Xray-клиенты получают встроенные правила; неподдерживаемая большая конфигурация возвращает ошибку, а не обрезанные правила. Для sing-box/Mihomo/Clash/Stash небольшие наборы встроены, большие — удалённые; бинарный SRS всегда удалённый. Для совместимости старый Clash получает собственные наборы через загрузку. DIRECT, REJECT, группы и порядок правил сохраняются. Собственный routing и геоданные не перезаписываются: при конфликте и невозможности безопасной выдачи будет ошибка. Профиль использует название подписки из profile-title с переопределениями сквада, иначе домен подписки; короткий стабильный суффикс различает подписки с одинаковым именем. Старое поле downloadToClient принимается для совместимости, но больше не выбирает способ доставки. Интервал клиента действует только при удалённой доставке; загрузка на сервер имеет отдельное расписание."
            ],
            [
                "Automatic geofile delivery and size",
                "There is no manual delivery switch. All selected geofiles are first converted to inline rules. INCY receives long comma-free lists in lossless Xray StringList form. Each final profile is measured after four-space formatting against a conservative panel budget of 900,000 bytes, with room for client patches; this is not a documented exact INCY limit. Host profiles are not added together for this comparison. A separate 16 MiB full-response transport limit remains. If a profile is too large, supported Happ/INCY receive bundled DAT with isolated category names. Inline compilation limits can also trigger downloads. Other Xray apps receive inline rules; an unsupported oversized configuration returns an error instead of losing rules. Small sing-box/Mihomo/Clash/Stash datasets are inline and large ones remote; binary SRS is always remote. Legacy Clash also downloads native providers for compatibility. DIRECT, REJECT, groups and routing order are preserved. Manual routing/geodata are not overwritten: incompatible oversized output fails explicitly. Profile names use the subscription profile-title, including squad overrides, or the subscription domain as fallback; a stable short suffix isolates identical names. Legacy downloadToClient is accepted but no longer chooses delivery. Client intervals apply only to remote delivery; server refresh has a separate schedule."
            ],
            [
                "تحویل خودکار و اندازه فایل جغرافیایی",
                "کلید انتخاب دستی روش تحویل حذف شده است. ابتدا قوانین همه فایل‌های انتخاب‌شده ساخته می‌شوند. فهرست‌های بلند INCY بدون ویرگول به قالب StringList در Xray تبدیل می‌شوند و شرطی حذف نمی‌شود. هر پروفایل نهایی با تورفتگی چهار فاصله نسبت به بودجه محافظه‌کارانه 900,000 بایت پنل سنجیده می‌شود؛ این سقف رسمی اعلام‌شده INCY نیست. اندازه میزبان‌ها با هم جمع نمی‌شود. سقف انتقال کل پاسخ 16 MiB جداگانه باقی است. پروفایل بزرگ در Happ/INCY پشتیبانی‌شده از DAT ترکیبی با نام دسته‌های جدا استفاده می‌کند؛ محدودیت پردازش قوانین هم می‌تواند دانلود را انتخاب کند. برنامه Xray دیگر قوانین داخلی می‌گیرد و خروجی بزرگ ناسازگار به‌جای حذف قوانین خطا می‌دهد. مجموعه کوچک sing-box/Mihomo/Clash/Stash داخلی و مجموعه بزرگ راه دور است؛ SRS باینری همیشه راه دور است. برای سازگاری، Clash قدیمی مجموعه بومی را دانلود می‌کند. عملکردها و ترتیب قوانین حفظ می‌شوند و routing یا داده جغرافیایی دستی بازنویسی نمی‌شود. نام از profile-title اشتراک با تنظیمات اسکواد، یا دامنه اشتراک گرفته می‌شود؛ پسوند کوتاه ثابت نام‌های یکسان را جدا می‌کند. downloadToClient قدیمی پذیرفته می‌شود ولی روش تحویل را تعیین نمی‌کند. فاصله کلاینت فقط برای دانلود است و تازه‌سازی سرور برنامه جدا دارد."
            ],
            [
                "地理文件自动交付与大小",
                "不再提供手动交付开关。面板先将全部所选地理文件生成为内嵌规则。INCY 的大型无逗号列表使用无损 Xray StringList 格式。每个最终配置按四空格格式化后的大小与面板保守预算 900,000 字节比较，为客户端修改预留空间；这不是 INCY 官方公布的精确上限。此检查不累加多个主机，整个响应仍有独立的 16 MiB 传输上限。配置过大时，受支持的 Happ/INCY 使用分类命名隔离的合并 DAT；内嵌处理限制也可能触发下载。其他 Xray 客户端使用内嵌规则，过大的不兼容配置会明确报错，不会删除规则。sing-box/Mihomo/Clash/Stash 小型数据集内嵌，大型数据集远程加载；二进制 SRS 始终远程加载。为兼容旧版 Clash，原生规则集也采用下载方式。DIRECT、REJECT、分组及规则顺序均保留，不覆盖手动 routing 或地理数据。配置名称使用订阅 profile-title（包含小队覆盖），未设置时使用订阅域名，稳定短后缀用于隔离同名订阅。旧 downloadToClient 字段仍可读取，但不再控制交付方式。客户端间隔仅适用于下载，服务器刷新使用独立计划。"
            ]
        ]
    ],
    [
        'geofile-server-refresh',
        [
            [
                'Автозагрузка на сервер и защита обновлений',
                'Выберите файл в общей библиотеке и настройте HTTPS-источник, автоматическое обновление и серверный интервал от 15 минут до 30 дней. Эти настройки сохраняются сразу для всех шаблонов с этим файлом. Импорт по URL запоминает источник; для файла с ПК URL задаётся отдельно. Автозагрузка по умолчанию выключена. Планировщик проверяет расписание раз в минуту; сохраняемая аренда не допускает повторной параллельной загрузки одного файла. Ошибка источника, новый запуск панели и ручной повтор не сбрасывают интервал. Проверяются адреса, перенаправления, размер, формат и категории действующих шаблонов. Ошибка оставляет последнюю исправную копию; состояние и время следующей проверки видны в библиотеке. Исходный URL с хешем остаётся неизменным, Обновляемые ссылки и подписанные URL отдают актуальную версию без immutable-кеша. Сервер и клиент имеют разные расписания, поэтому изменение не обязано появиться у клиента мгновенно.'
            ],
            [
                'Server auto downloads and update safety',
                'Select a library file and configure its HTTPS source, automatic updates and server interval from 15 minutes to 30 days. Settings save immediately for every template using that file. URL imports retain their source; PC uploads need a source URL. Auto updates default to off. The scheduler checks once a minute; a persisted lease prevents concurrent duplicate downloads. Source failure, panel restart and manual retries do not reset the interval. Addresses, redirects, size, format and categories used by active templates are validated. Errors retain the last working copy; status and next check are shown in the library. Original hashed URLs remain immutable; Updatable links and signed URLs return the active version without immutable caching. Server and client schedules are separate, so changes need not reach clients immediately.'
            ],
            [
                'دانلود خودکار سرور و ایمنی به‌روزرسانی',
                'فایل کتابخانه را انتخاب و منبع HTTPS، به‌روزرسانی خودکار و فاصله سرور از ۱۵ دقیقه تا ۳۰ روز را تنظیم کنید. تنظیمات فوراً برای همه قالب‌های استفاده‌کننده ذخیره می‌شود. واردکردن URL منبع را نگه می‌دارد؛ فایل رایانه به نشانی منبع نیاز دارد. خودکار به‌صورت پیش‌فرض خاموش است. زمان‌بند هر دقیقه بررسی می‌کند و اجاره پایدار مانع دانلود تکراری هم‌زمان می‌شود. خطای منبع، راه‌اندازی مجدد پنل و تکرار دستی فاصله را بازنشانی نمی‌کند. نشانی، تغییرمسیر، اندازه، قالب و دسته‌های قالب فعال بررسی می‌شوند. خطا آخرین نسخه سالم را حفظ می‌کند؛ وضعیت و زمان بررسی بعدی در کتابخانه است. URL هش‌دار اصلی تغییر نمی‌کند؛ پیوندهای به‌روزشونده و URL امضاشده نسخه فعال را بدون کش immutable می‌دهند. زمان‌بندی سرور و کلاینت جداست و تغییر لزوماً فوراً به کلاینت نمی‌رسد.'
            ],
            [
                '服务端自动下载与更新保护',
                '在库中选择文件，设置 HTTPS 来源、自动更新和 15 分钟至 30 天的服务端间隔。设置立即保存，并作用于使用此文件的所有模板。URL 导入会保存来源；电脑上传需另设来源 URL。自动更新默认关闭。调度器每分钟检查一次，持久租约避免同一文件重复并发下载。来源失败、面板重启和手动重试均不重置间隔。会验证地址、重定向、大小、格式以及活动模板使用的分类。出错时保留上一份可用副本；库中显示状态和下次检查时间。原始哈希 URL 保持不变；可更新链接和已签名 URL 返回当前版本，且不使用 immutable 缓存。服务端与客户端计划独立，因此更改不一定立即传入客户端。'
            ]
        ]
    ]
]

sections.push(
    [
        'geofile-shared-catalog',
        [
            [
                'Общий каталог и состав пула',
                'Готовые наборы — единая библиотека всех шаблонов: загрузки с ПК, по ссылке и опубликованные источники. Импорт выбирает запись, но не меняет шаблон. Добавьте файл, выберите категории и действие, затем сохраните. Неподходящие форматы остаются видимыми. Удаление из библиотеки действует везде; файл с сохранённой привязкой сначала нужно убрать из шаблона и сохранить. Несохранённая привязка текущего редактора удаляется вместе с файлом. Состав пула выбирает подключения; получатели всего шаблона задаются отдельно в свёрнутом разделе под редактором кода. Он необязателен. Счётчик пула исключает отключённые хосты, повторы и исключения XRAY_JSON; доступ пользователя и случайная выборка могут уменьшить результат. Для старого режима имён хостов направляйте правила на балансер, а не на неиспользуемый префикс.'
            ],
            [
                'Shared catalog and pool members',
                'Ready-made datasets is one library for every template: PC uploads, URL imports and published sources. Import selects the entry without changing the template. Attach the file, choose categories and action, then save. Incompatible formats remain visible. Library deletion applies everywhere; detach files used by saved templates and save first. An unsaved attachment in the current editor is removed with the file. Pool members select connections; recipients of the entire template are separate optional settings below the code editor. The pool count excludes disabled hosts, duplicates and XRAY_JSON exclusions; user access and random selection can reduce the result. With legacy host naming, target the balancer rather than an unused prefix.'
            ],
            [
                'فهرست مشترک و اعضای مخزن',
                'مجموعه‌های آماده یک کتابخانه برای همه قالب‌هاست: فایل رایانه، واردکردن URL و منابع منتشرشده. واردکردن فقط فایل را انتخاب می‌کند و قالب را تغییر نمی‌دهد. فایل را اضافه کنید، دسته و اقدام را انتخاب و ذخیره کنید. قالب ناسازگار همچنان دیده می‌شود. حذف از کتابخانه سراسری است؛ اتصال قالب ذخیره‌شده را ابتدا بردارید و ذخیره کنید. اتصال ذخیره‌نشده ویرایشگر فعلی همراه فایل حذف می‌شود. اعضای مخزن اتصال‌ها را انتخاب می‌کنند؛ دریافت‌کنندگان کل قالب در بخش اختیاری زیر ویرایشگر کد هستند. شمارنده، میزبان خاموش، تکراری و موارد مستثنای XRAY_JSON را حذف می‌کند؛ دسترسی کاربر و انتخاب تصادفی ممکن است نتیجه را کمتر کند. در نام‌گذاری قدیمی، قانون را به بالانسر هدایت کنید، نه پیشوند استفاده‌نشده.'
            ],
            [
                '共享目录和池成员',
                '“现成数据集”是所有模板共用的库，包括电脑上传、URL 导入和已发布来源。导入只选择条目，不修改模板。添加文件、选择分类和动作后保存。不兼容格式仍然可见。删除库文件会影响所有模板；已保存的引用必须先移除并保存。当前编辑器中未保存的引用随文件删除。池成员决定连接；整个模板的接收主机在代码编辑器下方的可选设置中配置。池计数排除停用主机、重复项和 XRAY_JSON 排除项，用户权限及随机选择可能进一步减少结果。旧版主机命名模式应将规则指向负载均衡器，而不是无效前缀。'
            ]
        ]
    ],
    [
        "geofile-happ-download-check",
        [
            [
                "Как проверить доставку в Happ и INCY",
                "Отсутствие анимации скачивания у небольшой подписки нормально: правила уже находятся в JSON. Для большого профиля требуется полная JSON-подписка и поддержка routing приложением. Используйте /json либо включите отдачу JSON на базовом пути. Сохраните именно используемый шаблон, затем обновите подписку. Название профиля берётся из названия подписки; уже импортированное старое имя Remnacust приложение может сохранить отдельной записью, которую можно удалить в самом приложении. Если после смены способа нужна проверка фактического применения, используйте предварительный просмотр устройства и журнал приложения. Переподключение выполняйте самостоятельно; сервер не запускает туннель."
            ],
            [
                "Checking delivery in Happ and INCY",
                "No download animation is expected for a small subscription: its rules are already in JSON. Large profiles require full JSON and client routing support. Use /json or enable JSON at the base subscription path. Save the template actually assigned to the subscription, then refresh it. Routing profiles use the subscription title; a previously imported Remnacust name may remain as a separate entry that can be removed in the app. Check device preview and app logs to confirm delivery. Reconnect yourself if needed; the server never starts the tunnel."
            ],
            [
                "بررسی تحویل در Happ و INCY",
                "نبود انیمیشن دانلود برای اشتراک کوچک طبیعی است؛ قوانین داخل JSON هستند. پروفایل بزرگ به JSON کامل و پشتیبانی routing برنامه نیاز دارد. از /json یا JSON در مسیر اصلی استفاده کنید. قالب فعال را ذخیره و اشتراک را تازه کنید. نام پروفایل از عنوان اشتراک می‌آید؛ نام قدیمی Remnacust ممکن است به‌صورت ورودی جدا باقی بماند و از داخل برنامه حذف شود. پیش‌نمایش دستگاه و گزارش برنامه روش تحویل را نشان می‌دهد. در صورت نیاز خودتان دوباره متصل شوید؛ سرور تونل را اجرا نمی‌کند."
            ],
            [
                "检查 Happ 与 INCY 的交付方式",
                "小型订阅没有下载动画是正常现象，规则已在 JSON 内。大型配置需要完整 JSON 和应用 routing 支持。使用 /json 或启用订阅基础路径返回 JSON。保存实际分配的模板并刷新订阅。配置名称使用订阅标题；旧 Remnacust 名称可能保留为单独条目，可在应用内删除。可通过设备预览及应用日志确认交付方式。需要重新连接时请自行操作，服务器不会启动隧道。"
            ]
        ]
    ]
)

sections.push(['subscription-refresh-integrity', [
    ['Обновление и целостность файлов', 'Страница подписки передаёт DAT отдельно от JSON: предел JSON 16 MiB не ограничивает DAT, для которого действует предел 64 MiB. Прерванная загрузка не считается успешной. Ошибка EOF или отсутствующая категория может означать неполный либо старый локальный файл; после обновления панели обновите и отдельную страницу подписки, затем подписку в приложении. Сверяйте DAT с соответствующим .sha256. Одновременные запросы одного набора используют одну сборку, разные наборы остаются ограниченными по ресурсам. Массовое изменение хостов сохраняется в БД до ответа API; синхронизация правил нод выполняется отдельно. Карточки хостов перечитываются при открытии, а сохранение отправляет только изменённые поля, чтобы не вернуть старые значения после bulk. Некоторые массовые операции над пользователями используют фоновую очередь; это не означает, что все операции панели отложены.'],
    ['Refresh and file integrity', 'The subscription page streams DAT separately from JSON: the 16 MiB JSON budget does not restrict DAT, which has a 64 MiB limit. Interrupted downloads are not successful. EOF or a missing category can indicate an incomplete or stale local file. Update both the panel and a separately installed subscription page, then refresh the subscription in the app. Compare DAT with its .sha256. Concurrent requests for the same bundle share one build; distinct work remains resource bounded. Bulk host updates commit to the database before the API response; node policy synchronization runs separately. Host editors fetch fresh data on open and save only changed fields to avoid restoring stale values after bulk updates. Some bulk user operations run in background queues; panel operations are not all deferred.'],
    ['به‌روزرسانی و صحت فایل‌ها', 'صفحه اشتراک DAT را جدا از JSON منتقل می‌کند: سقف JSON برابر 16 MiB است و DAT سقف مستقل 64 MiB دارد. دانلود ناقص موفق محسوب نمی‌شود. خطای EOF یا نبود دسته می‌تواند از فایل محلی ناقص یا قدیمی باشد. پنل و صفحه اشتراک مستقل را به‌روز کنید و سپس اشتراک برنامه را تازه‌سازی کنید. DAT را با .sha256 مقایسه کنید. درخواست‌های هم‌زمان یک بسته از یک ساخت مشترک استفاده می‌کنند و کارهای متفاوت محدود می‌مانند. تغییر گروهی میزبان پیش از پاسخ API در پایگاه داده ذخیره می‌شود؛ همگام‌سازی نود جداست. ویرایشگر هنگام باز شدن داده تازه می‌گیرد و فقط فیلدهای تغییرکرده را ذخیره می‌کند. برخی عملیات گروهی کاربران صف پس‌زمینه دارند، نه همه عملیات پنل.'],
    ['更新与文件完整性', '订阅页面将 DAT 与 JSON 分开传输：JSON 的 16 MiB 限制不再截断 DAT，DAT 有独立的 64 MiB 上限。中断的下载不算成功。EOF 或缺少分类可能表示本地文件不完整或过期。请同时更新面板和独立安装的订阅页面，再在客户端更新订阅，并将 DAT 与对应的 .sha256 比较。同一数据包的并发请求共用一次构建，不同构建仍受资源限制。批量修改主机在 API 返回前写入数据库，节点规则同步独立执行。主机编辑器打开时重新读取数据，只提交修改的字段，避免覆盖批量更新。部分用户批量操作使用后台队列，并非所有操作都排队。']
]])

export function explainGeofileRefresh(articles) {
    const article = articles.find((item) => item.id === 'templates')
    if (!article) throw new Error('Missing templates article')
    const sizes = {
    "ru": [
        "Автоматическая доставка и размер геофайлов",
        "Ручного переключателя доставки больше нет. Сначала все выбранные геофайлы преобразуются в правила. В INCY длинные списки без запятых сохраняются в поддерживаемой Xray строковой форме без потери условий. Размер проверяется у каждого итогового профиля с отступами в четыре пробела: бюджет совместимости панели — 900 000 байт с запасом для изменений клиента. Это не опубликованный разработчиком точный лимит INCY. Несколько хостов не суммируются для этого сравнения; отдельный предел полного ответа 16 MiB сохраняется. Если один профиль слишком велик, поддерживаемые Happ/INCY получают объединённые DAT с отдельными именами категорий. Лимиты разворачивания правил также могут переключить доставку. Другие Xray-клиенты получают встроенные правила; неподдерживаемая большая конфигурация возвращает ошибку, а не обрезанные правила. Для sing-box/Mihomo/Clash/Stash небольшие наборы встроены, большие — удалённые; бинарный SRS всегда удалённый. Для совместимости старый Clash получает собственные наборы через загрузку. DIRECT, REJECT, группы и порядок правил сохраняются. Собственный routing и геоданные не перезаписываются: при конфликте и невозможности безопасной выдачи будет ошибка. Профиль использует название подписки из profile-title с переопределениями сквада, иначе домен подписки; короткий стабильный суффикс различает подписки с одинаковым именем. Старое поле downloadToClient принимается для совместимости, но больше не выбирает способ доставки. Интервал клиента действует только при удалённой доставке; загрузка на сервер имеет отдельное расписание."
    ],
    "en": [
        "Automatic geofile delivery and size",
        "There is no manual delivery switch. All selected geofiles are first converted to inline rules. INCY receives long comma-free lists in lossless Xray StringList form. Each final profile is measured after four-space formatting against a conservative panel budget of 900,000 bytes, with room for client patches; this is not a documented exact INCY limit. Host profiles are not added together for this comparison. A separate 16 MiB full-response transport limit remains. If a profile is too large, supported Happ/INCY receive bundled DAT with isolated category names. Inline compilation limits can also trigger downloads. Other Xray apps receive inline rules; an unsupported oversized configuration returns an error instead of losing rules. Small sing-box/Mihomo/Clash/Stash datasets are inline and large ones remote; binary SRS is always remote. Legacy Clash also downloads native providers for compatibility. DIRECT, REJECT, groups and routing order are preserved. Manual routing/geodata are not overwritten: incompatible oversized output fails explicitly. Profile names use the subscription profile-title, including squad overrides, or the subscription domain as fallback; a stable short suffix isolates identical names. Legacy downloadToClient is accepted but no longer chooses delivery. Client intervals apply only to remote delivery; server refresh has a separate schedule."
    ],
    "fa": [
        "تحویل خودکار و اندازه فایل جغرافیایی",
        "کلید انتخاب دستی روش تحویل حذف شده است. ابتدا قوانین همه فایل‌های انتخاب‌شده ساخته می‌شوند. فهرست‌های بلند INCY بدون ویرگول به قالب StringList در Xray تبدیل می‌شوند و شرطی حذف نمی‌شود. هر پروفایل نهایی با تورفتگی چهار فاصله نسبت به بودجه محافظه‌کارانه 900,000 بایت پنل سنجیده می‌شود؛ این سقف رسمی اعلام‌شده INCY نیست. اندازه میزبان‌ها با هم جمع نمی‌شود. سقف انتقال کل پاسخ 16 MiB جداگانه باقی است. پروفایل بزرگ در Happ/INCY پشتیبانی‌شده از DAT ترکیبی با نام دسته‌های جدا استفاده می‌کند؛ محدودیت پردازش قوانین هم می‌تواند دانلود را انتخاب کند. برنامه Xray دیگر قوانین داخلی می‌گیرد و خروجی بزرگ ناسازگار به‌جای حذف قوانین خطا می‌دهد. مجموعه کوچک sing-box/Mihomo/Clash/Stash داخلی و مجموعه بزرگ راه دور است؛ SRS باینری همیشه راه دور است. برای سازگاری، Clash قدیمی مجموعه بومی را دانلود می‌کند. عملکردها و ترتیب قوانین حفظ می‌شوند و routing یا داده جغرافیایی دستی بازنویسی نمی‌شود. نام از profile-title اشتراک با تنظیمات اسکواد، یا دامنه اشتراک گرفته می‌شود؛ پسوند کوتاه ثابت نام‌های یکسان را جدا می‌کند. downloadToClient قدیمی پذیرفته می‌شود ولی روش تحویل را تعیین نمی‌کند. فاصله کلاینت فقط برای دانلود است و تازه‌سازی سرور برنامه جدا دارد."
    ],
    "zh": [
        "地理文件自动交付与大小",
        "不再提供手动交付开关。面板先将全部所选地理文件生成为内嵌规则。INCY 的大型无逗号列表使用无损 Xray StringList 格式。每个最终配置按四空格格式化后的大小与面板保守预算 900,000 字节比较，为客户端修改预留空间；这不是 INCY 官方公布的精确上限。此检查不累加多个主机，整个响应仍有独立的 16 MiB 传输上限。配置过大时，受支持的 Happ/INCY 使用分类命名隔离的合并 DAT；内嵌处理限制也可能触发下载。其他 Xray 客户端使用内嵌规则，过大的不兼容配置会明确报错，不会删除规则。sing-box/Mihomo/Clash/Stash 小型数据集内嵌，大型数据集远程加载；二进制 SRS 始终远程加载。为兼容旧版 Clash，原生规则集也采用下载方式。DIRECT、REJECT、分组及规则顺序均保留，不覆盖手动 routing 或地理数据。配置名称使用订阅 profile-title（包含小队覆盖），未设置时使用订阅域名，稳定短后缀用于隔离同名订阅。旧 downloadToClient 字段仍可读取，但不再控制交付方式。客户端间隔仅适用于下载，服务器刷新使用独立计划。"
    ]
}
    article.sections.push({
        id: 'geofile-inline-size',
        ...Object.fromEntries(
            Object.entries(sizes).map(([language, [title, body]]) => [language, { title, body }])
        )
    })
    for (const [id, translations] of sections)
        article.sections.push({
            id,
            ...Object.fromEntries(
                ['ru', 'en', 'fa', 'zh'].map((language, index) => [
                    language,
                    { title: translations[index][0], body: translations[index][1] }
                ])
            )
        })
}
