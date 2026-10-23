const sections = [
    [
        'geofile-client-delivery',
        [
            [
                'Загрузка geofiles на клиент',
                'В новой привязке «Загружать клиенту» выключено: правила встроены в полную подписку. Включите переключатель для удалённого набора. В обоих режимах отдельно выберите DIRECT, REJECT (блокировку), настроенную группу или прокси. Смена доставки сохраняет действие; новая привязка использует DIRECT по умолчанию. DAT преобразуется на сервере в JSON для sing-box или YAML для Mihomo/Clash/Stash. Клиентский интервал — 5 минут–30 дней, по умолчанию сутки; он записывается в update_interval / interval. Это расписание приложения, его ручной повтор может обойти интервал. Встроенные правила меняются после обновления самой подписки. Старые привязки без поля сохраняют прежнее поведение. Для Xray JSON загрузка доступна в Happ и INCY с поддержкой профилей из подписки: приложение получает подписанный DAT и заголовок routing для первоначального скачивания. Несколько файлов объединяются с раздельными именами категорий; действия остаются в JSON. Другие Xray-клиенты получают встроенные правила. Ручной routing или существующие geosite/geoip не заменяются. Большой профиль либо недоступный набор возвращает весь ответ во встроенный режим. Интервал Happ определяет метку ревизии при обновлении подписки; приложение управляет фактическими загрузками. INCY получает отдельный интервал геофайлов в целых часах с округлением вверх, минимум 1 час; локальный выбор пользователя приоритетнее. Общий профиль использует наибольший интервал файлов. SHA-256 позволяет не скачивать неизменившиеся наборы. Переподключитесь после обновления. SRS остаётся удалённым бинарным набором; для встраивания импортируйте исходный JSON.'
            ],
            [
                'Downloading geofiles to the client',
                'New attachments have Download to client off: rules are embedded in the full subscription. Turn it on for a remote rule set. In either mode, choose DIRECT, REJECT (block), a configured group or proxy separately. Changing delivery preserves the action; new attachments default to DIRECT. The server converts DAT to sing-box JSON or Mihomo/Clash/Stash YAML. The client interval is 5 minutes–30 days, default one day, written as update_interval / interval. This is the app schedule; manual retries may bypass it. Embedded rules change after the subscription itself is updated. Legacy attachments without the field retain their behavior. For Xray JSON, Happ and INCY versions supporting subscription routing profiles receive signed DAT files and a routing header for the initial download. Files are bundled with isolated categories; actions remain in JSON. Other Xray clients receive inline rules. Manual routing or existing geosite/geoip settings are preserved. Oversized profiles or unavailable bundles fall back entirely to inline rules. The Happ interval controls a revision stamp on subscription refresh; the app controls actual downloads. INCY receives a separate geo interval in whole hours rounded up, minimum 1 hour; the local user override takes precedence. The shared profile uses the longest file interval. SHA-256 avoids re-downloading unchanged sets. Reconnect after updating. SRS remains a remote binary set; import its source JSON for inline delivery.'
            ],
            [
                'دانلود فایل جغرافیایی در کلاینت',
                'در اتصال جدید، دانلود در کلاینت خاموش است: قوانین در اشتراک کامل قرار می‌گیرند. برای مجموعه راه‌دور آن را روشن کنید. در هر دو حالت DIRECT، REJECT (مسدودسازی)، گروه یا پروکسی تنظیم‌شده را جدا انتخاب کنید. تغییر روش تحویل، اقدام را حفظ می‌کند؛ پیش‌فرض اتصال جدید DIRECT است. سرور DAT را به JSON برای sing-box یا YAML برای Mihomo/Clash/Stash تبدیل می‌کند. فاصله کلاینت از ۵ دقیقه تا ۳۰ روز و پیش‌فرض یک روز است و در update_interval / interval نوشته می‌شود. این زمان‌بندی برنامه است و تکرار دستی ممکن است آن را نادیده بگیرد. قوانین داخلی با به‌روزرسانی خود اشتراک تغییر می‌کنند. اتصال‌های قدیمی بدون فیلد رفتار قبلی دارند. برای Xray JSON، نسخه‌های Happ و INCY با پشتیبانی نمایه اشتراک، DAT امضاشده و سرآیند routing برای دانلود اولیه دریافت می‌کنند. فایل‌ها با دسته‌های جدا ترکیب می‌شوند و اقدام‌ها در JSON می‌مانند. سایر کلاینت‌های Xray قوانین داخلی می‌گیرند. routing دستی و geosite/geoip موجود حفظ می‌شوند. نمایه بزرگ یا مجموعه ناموجود کاملاً به قوانین داخلی برمی‌گردد. فاصله Happ نشان بازبینی هنگام تازه‌سازی اشتراک را تعیین می‌کند؛ دانلود واقعی با برنامه است. برای INCY فاصله جداگانه فایل‌ها با ساعت کامل و گرد کردن رو به بالا، حداقل ۱ ساعت، ارسال می‌شود؛ انتخاب محلی کاربر اولویت دارد. نمایه مشترک از طولانی‌ترین فاصله استفاده می‌کند. SHA-256 از دانلود دوباره فایل بدون تغییر جلوگیری می‌کند. پس از به‌روزرسانی دوباره وصل شوید. SRS دودویی راه‌دور می‌ماند؛ برای حالت داخلی JSON منبع را وارد کنید.'
            ],
            [
                '将地理文件下载到客户端',
                '新附件默认关闭“下载到客户端”：规则嵌入完整订阅。开启后使用远程规则集。两种模式均可独立选择 DIRECT、REJECT（拦截）、已配置的组或代理。更改传递方式会保留动作；新附件默认使用 DIRECT。服务端将 DAT 转为 sing-box JSON 或 Mihomo/Clash/Stash YAML。客户端间隔为 5 分钟至 30 天，默认一天，写入 update_interval / interval。这是应用的计划，手动重试可能绕过间隔。内嵌规则在订阅本身更新后改变。没有新字段的旧附件保留原有行为。对于 Xray JSON，支持订阅路由配置的 Happ 和 INCY 版本接收带签名的 DAT 和 routing 响应头以完成首次下载。文件合并时分类相互隔离；动作保留在 JSON 中。其他 Xray 客户端获得内嵌规则。手动 routing 和现有 geosite/geoip 设置保持不变。配置过大或集合不可用时整体回退为内嵌规则。Happ 间隔控制订阅刷新时的修订标记；实际下载由应用管理。INCY 接收独立的地理文件间隔，向上取整为小时，至少 1 小时；用户本地设置优先。共享配置使用最长文件间隔。SHA-256 避免重复下载未变更的文件。更新后请重新连接。SRS 保持为远程二进制集；若要内嵌，请导入源 JSON。'
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
