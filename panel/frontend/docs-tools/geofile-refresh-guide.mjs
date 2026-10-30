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
        'geofile-happ-download-check',
        [
            [
                'Если Happ не скачивает файл',
                'V2Fly DAT поддерживается. Нужна полная JSON-подписка с заголовком routing. Для обычной ссылки включите «Отдавать JSON на базовом пути подписки» в настройках подписки либо используйте ссылку с окончанием /json. Правила ответов и внешний сквад могут переопределить формат. Сохраните переключатель в том шаблоне, который действительно используется: шаблон в карточке хоста имеет приоритет. Редактор показывает общую JSON-настройку и открывает её в новой вкладке, сохраняя черновик. После сохранения обновите подписку в приложении. Обновите панель и отдельно установленную страницу подписки. В 1.1.7.51 компактные имена категорий уменьшают профиль загрузки; старые подписанные URL сохраняют поддержку. Обновите подписку и переподключитесь. Если загрузка не начинается, проверьте наличие профиля Remnacust, заголовок x-remnacust-geofiles-delivery и журнал приложения. При несовместимости или превышении лимита панель возвращает встроенные правила; это не отдельное скачивание.'
            ],
            [
                'If Happ does not download the file',
                'V2Fly DAT is supported. A full JSON subscription with a routing header is required. For the regular subscription URL, enable “Serve JSON at base subscription” in subscription settings, or use a URL ending in /json. Response rules and external squads can override the format. Save the switch in the template actually used: a template selected in the host card takes priority. The editor shows the global JSON setting and opens settings in a new tab, keeping the draft. After saving, refresh the subscription in the app. Update the panel and a separately installed subscription page. In 1.1.7.51 compact category names reduce profile size; old signed URLs remain supported. Refresh the subscription and reconnect. If downloading does not start, check the Remnacust profile, x-remnacust-geofiles-delivery header and app logs. Incompatible settings or size limits trigger inline rules instead of a separate download.'
            ],
            [
                'اگر Happ فایل را دانلود نمی‌کند',
                'V2Fly DAT پشتیبانی می‌شود. اشتراک کامل JSON با سرآیند routing لازم است. برای پیوند معمولی، «ارائه JSON در لینک پایه پیشفرض» را در تنظیمات اشتراک روشن کنید یا از پیوندی با پسوند /json استفاده کنید. قوانین پاسخ و اسکواد خارجی می‌توانند قالب را تغییر دهند. کلید را در قالبی ذخیره کنید که واقعاً استفاده می‌شود؛ قالب کارت میزبان اولویت دارد. ویرایشگر تنظیم عمومی JSON را نشان می‌دهد و تنظیمات را بدون از دست رفتن پیش‌نویس در زبانه جدید باز می‌کند. پس از ذخیره، اشتراک را در برنامه تازه کنید. پنل و صفحه اشتراک جداگانه را به‌روز کنید. در 1.1.7.51 نام کوتاه دسته‌ها اندازه نمایه را کاهش می‌دهد؛ URL امضاشده قدیمی پشتیبانی می‌شود. اشتراک را تازه و دوباره متصل کنید. در صورت نبود دانلود، نمایه Remnacust، سرآیند x-remnacust-geofiles-delivery و گزارش برنامه را بررسی کنید. تنظیم ناسازگار یا محدودیت اندازه باعث قوانین داخلی به‌جای دانلود جداگانه می‌شود.'
            ],
            [
                'Happ 未下载文件时',
                '支持 V2Fly DAT。需要包含 routing 响应头的完整 JSON 订阅。 普通订阅链接需在订阅设置中开启“在基础订阅提供 JSON”，或使用以 /json 结尾的链接。响应规则和外部组可能覆盖格式。请在实际使用的模板中保存开关，主机卡片中选择的模板优先。编辑器显示全局 JSON 设置，并在新标签页打开设置以保留草稿。保存后在应用中刷新订阅。请更新面板和独立安装的订阅页面。1.1.7.51 使用较短的分类名称缩小配置，旧签名 URL 仍受支持。刷新订阅后重新连接。若未下载，请检查 Remnacust 路由配置、x-remnacust-geofiles-delivery 响应头和应用日志。设置不兼容或超过大小限制时，面板改为内嵌规则，不会单独下载。'
            ]
        ]
    ]
)

export function explainGeofileRefresh(articles) {
    const article = articles.find((item) => item.id === 'templates')
    if (!article) throw new Error('Missing templates article')
    const sizes = {
        ru: [
            'Размер встроенных правил',
            'Одинаковые условия выбранных категорий DAT включаются один раз; разные типы доменных условий сохраняются. Лимит набора — 50 000 уникальных условий и 2 MiB текста UTF-8. Приложение может иметь меньший предел. Если INCY сообщает The configuration is too large, выберите меньше категорий или включите поддерживаемую загрузку DAT с полной JSON-подпиской. Точный предел INCY iOS 2.6.2 в официальной документации не указан. Выключенная загрузка остаётся встроенным режимом: правила не удаляются и скачивание не включается автоматически. Ручной routing или несовместимые геоданные могут оставить встроенную выдачу даже при включённом переключателе. Правила геофайлов вставляются перед общим маршрутом TCP/UDP в любом порядке протоколов, сохраняя предыдущие ограничения.'
        ],
        en: [
            'Embedded rule size',
            'Identical matchers in selected DAT categories are included once; different domain match types remain distinct. Each set allows 50,000 unique matchers and 2 MiB of UTF-8 text. Apps may have lower limits. If INCY reports The configuration is too large, select fewer categories or enable supported DAT downloads with a full JSON subscription. Official documentation does not specify the INCY iOS 2.6.2 limit. Disabling downloads keeps rules embedded: rules are not removed and downloads are not enabled automatically. Manual routing or incompatible geodata may retain inline delivery even with the switch on. Geofile rules precede the TCP/UDP catch-all in either protocol order while retaining earlier restrictions.'
        ],
        fa: [
            'حجم قوانین داخلی',
            'شرط‌های یکسان در دسته‌های انتخاب‌شده DAT فقط یک بار اضافه می‌شوند؛ انواع متفاوت شرط دامنه جدا می‌مانند. سقف هر مجموعه ۵۰٬۰۰۰ شرط یکتا و 2 MiB متن UTF-8 است. برنامه ممکن است سقف کمتری داشته باشد. اگر INCY خطای The configuration is too large داد، دسته‌های کمتری انتخاب کنید یا دانلود DAT پشتیبانی‌شده را با اشتراک کامل JSON روشن کنید. مستندات رسمی سقف INCY iOS 2.6.2 را مشخص نمی‌کند. با خاموش بودن دانلود، قوانین داخلی می‌مانند؛ حذف قانون یا روشن کردن خودکار دانلود انجام نمی‌شود. routing دستی یا داده جغرافیایی ناسازگار ممکن است حتی با کلید روشن باعث تحویل داخلی شود. قوانین فایل پیش از مسیر عمومی TCP/UDP با هر ترتیب پروتکل قرار می‌گیرند و محدودیت‌های قبلی حفظ می‌شوند.'
        ],
        zh: [
            '内嵌规则大小',
            '所选 DAT 分类中的相同匹配条件只添加一次；不同域名匹配类型仍分别保留。每个集合最多包含 50,000 条唯一条件和 2 MiB UTF-8 文本。应用的限制可能更低。INCY 提示 The configuration is too large 时，请减少分类或使用完整 JSON 订阅启用受支持的 DAT 下载。官方文档未说明 INCY iOS 2.6.2 的大小上限。关闭下载后仍内嵌规则，不会自动删除规则或启用下载。手动 routing 或不兼容的地理数据可能使开启开关后仍以内嵌方式提供。地理文件规则插入到任一 TCP/UDP 排列顺序的默认路由之前，并保留先前的限制。'
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
