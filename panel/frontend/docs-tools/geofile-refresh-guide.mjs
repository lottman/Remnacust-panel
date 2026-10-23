const sections = [
    [
        'geofile-client-delivery',
        [
            [
                'Загрузка geofiles на клиент',
                'В новой привязке «Загружать клиенту» выключено: правила встроены в полную подписку, выбранные категории идут в DIRECT. Включите переключатель для удалённого набора и выберите действие: DIRECT, блокировку или группу. DAT преобразуется на сервере в JSON для sing-box или YAML для Mihomo/Clash/Stash. Клиентский интервал — 5 минут–30 дней, по умолчанию сутки; он записывается в update_interval / interval. Это расписание приложения, его ручной повтор может обойти интервал. Встроенные правила меняются после обновления самой подписки. Старые привязки без поля сохраняют прежнее поведение. Xray JSON получает встроенные правила: geodata обновляет уже существующие файлы и не гарантирует первоначальную установку произвольного DAT. SRS остаётся удалённым бинарным набором; для встраивания импортируйте исходный JSON.'
            ],
            [
                'Downloading geofiles to the client',
                'New attachments have Download to client off: rules are embedded in the full subscription and selected categories use DIRECT. Turn it on for a remote rule set and choose DIRECT, reject or a group. The server converts DAT to sing-box JSON or Mihomo/Clash/Stash YAML. The client interval is 5 minutes–30 days, default one day, written as update_interval / interval. This is the app schedule; manual retries may bypass it. Embedded rules change after the subscription itself is updated. Legacy attachments without the field retain their behavior. Xray JSON embeds rules: geodata updates existing files and cannot guarantee initial installation of arbitrary DAT. SRS remains a remote binary set; import its source JSON for inline delivery.'
            ],
            [
                'دانلود فایل جغرافیایی در کلاینت',
                'در اتصال جدید، دانلود در کلاینت خاموش است: قوانین در اشتراک کامل قرار می‌گیرند و دسته‌های منتخب به DIRECT می‌روند. برای مجموعه راه‌دور روشن کنید و DIRECT، مسدودسازی یا گروه را انتخاب کنید. سرور DAT را به JSON برای sing-box یا YAML برای Mihomo/Clash/Stash تبدیل می‌کند. فاصله کلاینت از ۵ دقیقه تا ۳۰ روز و پیش‌فرض یک روز است و در update_interval / interval نوشته می‌شود. این زمان‌بندی برنامه است و تکرار دستی ممکن است آن را نادیده بگیرد. قوانین داخلی با به‌روزرسانی خود اشتراک تغییر می‌کنند. اتصال‌های قدیمی بدون فیلد رفتار قبلی دارند. Xray JSON قوانین را داخلی می‌کند؛ geodata فایل موجود را به‌روز می‌کند و نصب اولیه DAT دلخواه را تضمین نمی‌کند. SRS دودویی راه‌دور می‌ماند؛ برای حالت داخلی JSON منبع را وارد کنید.'
            ],
            [
                '将地理文件下载到客户端',
                '新附件默认关闭“下载到客户端”：规则嵌入完整订阅，所选分类直连 DIRECT。开启后使用远程规则集，可选择 DIRECT、拦截或组。服务端将 DAT 转为 sing-box JSON 或 Mihomo/Clash/Stash YAML。客户端间隔为 5 分钟至 30 天，默认一天，写入 update_interval / interval。这是应用的计划，手动重试可能绕过间隔。内嵌规则在订阅本身更新后改变。没有新字段的旧附件保留原有行为。Xray JSON 使用内嵌规则；geodata 更新已有文件，无法保证任意 DAT 的首次安装。SRS 保持为远程二进制集；若要内嵌，请导入源 JSON。'
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

export function explainGeofileRefresh(articles) {
    const article = articles.find((item) => item.id === 'templates')
    if (!article) throw new Error('Missing templates article')
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
