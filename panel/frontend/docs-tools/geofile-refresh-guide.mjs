const sections = [
    [
        'geofile-cold-start',
        [
            [
                'Запуск и параллельные запросы',
                'После запуска панели разные сборки геофайлов ожидают ограниченную очередь: до двух задач одновременно и до 32 принятых задач для каждой операции. Одинаковые запросы разделяют одну сборку. Кэш DAT ограничен 16 наборами и 32 MiB. Страница подписки ждёт ответ панели до 30 секунд и отменяет запрос при отключении клиента; ошибки доступа не кешируются. DAT скачиваются через отдельный пул из восьми соединений. Один процесс страницы принимает до 16 скачиваний, включая ожидающие: медленные файлы не занимают соединения запросов страницы и конфигураций. При перегрузке возвращается 503 с Retry-After: 2; повторите запрос позже.'
            ],
            [
                'Startup and concurrent requests',
                'After panel startup, different geofile builds wait in a bounded queue: two active tasks and up to 32 accepted tasks per operation. Identical requests share one build. The DAT cache retains at most 16 bundles and 32 MiB. The subscription page waits up to 30 seconds for the panel and cancels the request when the client disconnects; access failures are not cached. DAT downloads use a separate eight-connection pool. Each page process accepts up to 16 downloads including waiting requests, so slow files do not occupy page and configuration request connections. Overload returns 503 with Retry-After: 2; retry later.'
            ],
            [
                'راه‌اندازی و درخواست‌های هم‌زمان',
                'پس از راه‌اندازی پنل، ساخت فایل‌های متفاوت در صف محدود منتظر می‌ماند: دو کار فعال و حداکثر ۳۲ کار پذیرفته‌شده برای هر عملیات. درخواست‌های یکسان یک ساخت مشترک دارند. کش DAT حداکثر ۱۶ مجموعه و ۳۲ MiB نگه می‌دارد. صفحه اشتراک تا ۳۰ ثانیه منتظر پنل می‌ماند و با قطع کلاینت درخواست را لغو می‌کند؛ خطاهای دسترسی کش نمی‌شوند. دانلود DAT از مخزن مستقل هشت اتصال استفاده می‌کند. هر فرایند صفحه حداکثر ۱۶ دانلود شامل درخواست‌های منتظر می‌پذیرد؛ فایل‌های کند اتصال درخواست‌های صفحه و پیکربندی را اشغال نمی‌کنند. هنگام بار زیاد، پاسخ 503 با Retry-After: 2 برمی‌گردد؛ بعداً دوباره تلاش کنید.'
            ],
            [
                '启动与并发请求',
                '面板启动后，不同地理文件构建在有界队列中等待：每项操作最多同时运行两个任务、接受 32 个任务。相同请求共享一次构建。DAT 缓存最多保留 16 个集合和 32 MiB。订阅页面最多等待面板 30 秒，客户端断开时取消请求；访问失败不会被缓存。DAT 下载使用独立的八连接池。每个页面进程最多接受 16 个下载请求（包括等待中的请求），慢速文件不会占用页面和配置请求的连接。过载时返回 503 和 Retry-After: 2，请稍后重试。'
            ]
        ]
    ],
    [
        'geofile-removal',
        [
            [
                'Удаление геофайла из шаблона',
                'Сохраните шаблон и обновите подписку в приложении. Профиль сохраняет прежнее имя; ссылка и все списки правил удалённого вида GeoIP или GeoSite передаются пустыми. Если удалён один из нескольких файлов одного вида, объединённый DAT содержит только оставшиеся источники. Другие профили приложения и общая библиотека файлов не удаляются.'
            ],
            [
                'Removing a geofile from a template',
                'Save the template and refresh the subscription in the app. The profile keeps its name; the URL and all rule lists for the removed GeoIP or GeoSite kind are explicitly empty. If one of several files of the same kind is removed, the combined DAT contains only the remaining sources. Other app profiles and the shared file library are preserved.'
            ],
            [
                'حذف فایل جغرافیایی از قالب',
                'قالب را ذخیره و اشتراک را در برنامه تازه کنید. نام پروفایل ثابت می‌ماند؛ نشانی و همه فهرست‌های قوانین نوع حذف‌شده GeoIP یا GeoSite به‌صورت خالی ارسال می‌شوند. اگر یکی از چند فایل هم‌نوع حذف شود، فایل DAT ترکیبی فقط منابع باقی‌مانده را دارد. پروفایل‌های دیگر برنامه و کتابخانه مشترک فایل‌ها حفظ می‌شوند.'
            ],
            [
                '从模板移除地理文件',
                '保存模板并在应用内刷新订阅。配置名称保持不变；移除的 GeoIP 或 GeoSite 类型会显式发送空下载地址及所有空规则列表。同一类型的多个文件中移除一个后，合并 DAT 仅包含剩余来源。应用中的其他配置和共享文件库不会被删除。'
            ]
        ]
    ],
    [
        'geofile-geoip-resolution',
        [
            [
                'GeoIP для доменных адресов',
                'При наличии GeoIP итоговый Xray JSON использует IPOnDemand: DNS-разрешение выполняется при достижении IP-правила. Это позволяет DIRECT, REJECT и балансерам по GeoIP срабатывать перед общим правилом TCP/UDP. Способ доставки — встроенные правила или DAT — не меняет это поведение. Ручные правила выше сохраняют приоритет; исходный шаблон не перезаписывается. Только GeoSite и другие форматы клиентов не меняют стратегию DNS. Если IP определить не удалось, действуют следующие правила.'
            ],
            [
                'GeoIP for domain destinations',
                'When geofiles generate GeoIP rules, the final Xray JSON uses IPOnDemand: DNS resolution occurs when an IP rule is reached. DIRECT, REJECT and GeoIP balancers can then match before the TCP/UDP catch-all. Inline rules and downloaded DAT use the same behavior. Earlier manual rules retain priority and the source template is not overwritten. Domain-only GeoSite and other client formats keep their DNS strategy. If resolution fails, subsequent routing rules apply.'
            ],
            [
                'GeoIP برای مقصدهای دامنه‌ای',
                'اگر فایل جغرافیایی قانون GeoIP تولید کند، خروجی Xray JSON از IPOnDemand استفاده می‌کند و هنگام رسیدن به قانون IP، دامنه حل می‌شود. سپس DIRECT، REJECT و متعادل‌ساز GeoIP پیش از قانون عمومی TCP/UDP اعمال می‌شوند. قواعد داخلی و DAT دانلودی رفتار یکسان دارند. اولویت قواعد دستی قبلی و قالب اصلی حفظ می‌شود. GeoSite تنها و دیگر قالب‌ها راهبرد DNS خود را نگه می‌دارند. اگر حل نام ناموفق باشد، قواعد بعدی اجرا می‌شوند.'
            ],
            [
                '域名目标的 GeoIP',
                '地理文件生成 GeoIP 规则时，最终 Xray JSON 使用 IPOnDemand，在处理 IP 规则时解析域名，使 DIRECT、REJECT 和 GeoIP 均衡器能在 TCP/UDP 兜底规则之前匹配。内嵌规则和下载 DAT 的行为相同。此前手动规则的优先级不变，源模板不会被覆盖。仅含域名的 GeoSite 及其他客户端格式保留原有 DNS 策略。解析失败时继续应用后续路由规则。'
            ]
        ]
    ],
    [
        'geofile-client-delivery',
        [
            [
                'Автоматическая доставка и размер геофайлов',
                'Ручного переключателя доставки больше нет. Сначала все выбранные геофайлы преобразуются в правила. В INCY длинные списки без запятых сохраняются в поддерживаемой Xray строковой форме без потери условий. Размер проверяется у каждого итогового профиля с отступами в четыре пробела: порог встраивания геофайлов — 90 000 байт или 20 000 условий; общий бюджет итогового профиля — 900 000 байт с запасом для изменений клиента. Это не опубликованный разработчиком точный лимит INCY. Несколько хостов не суммируются для этого сравнения; отдельный предел полного ответа 16 MiB сохраняется. Если один профиль слишком велик, поддерживаемые Happ/INCY получают объединённые DAT с отдельными именами категорий. Лимиты разворачивания правил также могут переключить доставку. Другие Xray-клиенты получают встроенные правила; неподдерживаемая большая конфигурация возвращает ошибку, а не обрезанные правила. Для sing-box/Mihomo/Clash/Stash небольшие наборы встроены, большие — удалённые; бинарный SRS всегда удалённый. Для совместимости старый Clash получает собственные наборы через загрузку. DIRECT, REJECT, группы и порядок правил сохраняются. Собственный routing и геоданные не перезаписываются: при конфликте и невозможности безопасной выдачи будет ошибка. Профиль использует название подписки из profile-title с переопределениями сквада, иначе домен подписки; короткий стабильный суффикс различает подписки с одинаковым именем. Старое поле downloadToClient принимается для совместимости, но больше не выбирает способ доставки. Интервал клиента действует только при удалённой доставке; загрузка на сервер имеет отдельное расписание. При расчёте размера учитывается обратное разворачивание строковых списков Xray в массивы: маленький ответ HTTP не гарантирует маленькую конфигурацию клиента. Бюджет 900 000 байт применяется отдельно к каждому профилю Happ/INCY. Ссылки геофайлов используют HTTPS-домен текущего запроса подписки, включая CDN. CDN и обратный прокси должны сохранять исходный Host; произвольные Forwarded/X-Forwarded-Host не доверены. Страница подписки передаёт свой адрес панели с действующим API-токеном страницы; обновите оба компонента. Меняется только адрес ссылок этого ответа, а не сервер подключения к панели, подписи или пути DAT и .sha256. Геофайлы и подписки не кешируйте публично на CDN.'
            ],
            [
                'Automatic geofile delivery and size',
                'There is no manual delivery switch. All selected geofiles are first converted to inline rules. INCY receives long comma-free lists in lossless Xray StringList form. Each final profile is measured after four-space formatting against a geofile inline threshold of 90,000 bytes or 20,000 conditions; the full profile retains a conservative 900,000-byte panel budget with room for client patches; this is not a documented exact INCY limit. Host profiles are not added together for this comparison. A separate 16 MiB full-response transport limit remains. If a profile is too large, supported Happ/INCY receive bundled DAT with isolated category names. Inline compilation limits can also trigger downloads. Other Xray apps receive inline rules; an unsupported oversized configuration returns an error instead of losing rules. Small sing-box/Mihomo/Clash/Stash datasets are inline and large ones remote; binary SRS is always remote. Legacy Clash also downloads native providers for compatibility. DIRECT, REJECT, groups and routing order are preserved. Manual routing/geodata are not overwritten: incompatible oversized output fails explicitly. Profile names use the subscription profile-title, including squad overrides, or the subscription domain as fallback; a stable short suffix isolates identical names. Legacy downloadToClient is accepted but no longer chooses delivery. Client intervals apply only to remote delivery; server refresh has a separate schedule. Size accounting includes Xray StringList expansion back into arrays: a small HTTP response can still produce a large client configuration. The 900,000-byte budget applies separately to each Happ/INCY profile. Geofile links use the HTTPS authority of the current subscription request, including CDN. The CDN and reverse proxy must preserve the original Host; arbitrary Forwarded/X-Forwarded-Host are not trusted. A subscription page relays its authority using its current scoped API token; update both components. Only links in that response change, not the configured panel server, signatures or DAT/.sha256 paths. Do not publicly cache subscriptions or geofiles on the CDN.'
            ],
            [
                'تحویل خودکار و اندازه فایل جغرافیایی',
                'کلید انتخاب دستی روش تحویل حذف شده است. ابتدا قوانین همه فایل‌های انتخاب‌شده ساخته می‌شوند. فهرست‌های بلند INCY بدون ویرگول به قالب StringList در Xray تبدیل می‌شوند و شرطی حذف نمی‌شود. هر پروفایل نهایی با تورفتگی چهار فاصله نسبت به آستانه داخلی 90,000 بایت یا 20,000 شرط سنجیده می‌شود؛ بودجه کل پروفایل 900,000 بایت است؛ این سقف رسمی اعلام‌شده INCY نیست. اندازه میزبان‌ها با هم جمع نمی‌شود. سقف انتقال کل پاسخ 16 MiB جداگانه باقی است. پروفایل بزرگ در Happ/INCY پشتیبانی‌شده از DAT ترکیبی با نام دسته‌های جدا استفاده می‌کند؛ محدودیت پردازش قوانین هم می‌تواند دانلود را انتخاب کند. برنامه Xray دیگر قوانین داخلی می‌گیرد و خروجی بزرگ ناسازگار به‌جای حذف قوانین خطا می‌دهد. مجموعه کوچک sing-box/Mihomo/Clash/Stash داخلی و مجموعه بزرگ راه دور است؛ SRS باینری همیشه راه دور است. برای سازگاری، Clash قدیمی مجموعه بومی را دانلود می‌کند. عملکردها و ترتیب قوانین حفظ می‌شوند و routing یا داده جغرافیایی دستی بازنویسی نمی‌شود. نام از profile-title اشتراک با تنظیمات اسکواد، یا دامنه اشتراک گرفته می‌شود؛ پسوند کوتاه ثابت نام‌های یکسان را جدا می‌کند. downloadToClient قدیمی پذیرفته می‌شود ولی روش تحویل را تعیین نمی‌کند. فاصله کلاینت فقط برای دانلود است و تازه‌سازی سرور برنامه جدا دارد. محاسبه اندازه، تبدیل دوباره StringList به آرایه را نیز در بر می‌گیرد؛ پاسخ کوچک HTTP ممکن است در کلاینت بزرگ شود. بودجه ۹۰۰٬۰۰۰ بایت جداگانه برای هر نمایه Happ/INCY است. پیوند فایل‌ها از دامنه HTTPS درخواست فعلی اشتراک، از جمله CDN، استفاده می‌کند. CDN و پراکسی باید Host اصلی را حفظ کنند؛ Forwarded و X-Forwarded-Host دلخواه مورد اعتماد نیستند. صفحه، دامنه را با توکن معتبر و محدود API به پنل می‌دهد؛ هر دو جزء را به‌روز کنید. فقط نشانی پیوندهای همان پاسخ تغییر می‌کند، نه سرور پنل یا امضا و مسیر DAT/.sha256. اشتراک و فایل را در CDN عمومی کش نکنید.'
            ],
            [
                '地理文件自动交付与大小',
                '不再提供手动交付开关。面板先将全部所选地理文件生成为内嵌规则。INCY 的大型无逗号列表使用无损 Xray StringList 格式。每个最终配置按四空格格式化后的大小与内嵌阈值 90,000 字节或 20,000 个条件比较；整个配置仍有 900,000 字节的保守预算，为客户端修改预留空间；这不是 INCY 官方公布的精确上限。此检查不累加多个主机，整个响应仍有独立的 16 MiB 传输上限。配置过大时，受支持的 Happ/INCY 使用分类命名隔离的合并 DAT；内嵌处理限制也可能触发下载。其他 Xray 客户端使用内嵌规则，过大的不兼容配置会明确报错，不会删除规则。sing-box/Mihomo/Clash/Stash 小型数据集内嵌，大型数据集远程加载；二进制 SRS 始终远程加载。为兼容旧版 Clash，原生规则集也采用下载方式。DIRECT、REJECT、分组及规则顺序均保留，不覆盖手动 routing 或地理数据。配置名称使用订阅 profile-title（包含小队覆盖），未设置时使用订阅域名，稳定短后缀用于隔离同名订阅。旧 downloadToClient 字段仍可读取，但不再控制交付方式。客户端间隔仅适用于下载，服务器刷新使用独立计划。 大小计算包含 Xray StringList 重新展开为数组的开销；HTTP 响应较小并不代表客户端配置较小。900,000 字节预算独立用于每个 Happ/INCY 配置。 地理文件链接使用当前订阅请求的 HTTPS 域名，包括 CDN。CDN 和反向代理必须保留原始 Host；不信任任意 Forwarded/X-Forwarded-Host。订阅页面通过有效的受限 API 令牌传递域名，因此需要同时更新两个组件。仅当前响应链接的域名变化，面板上游、签名和 DAT/.sha256 路径保持不变。不要在 CDN 公开缓存订阅或地理文件。'
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
                'Как проверить доставку в Happ и INCY',
                'Отсутствие анимации скачивания у небольшой подписки нормально: правила уже находятся в JSON. Для большого профиля требуется полная JSON-подписка и поддержка routing приложением. Используйте /json либо включите отдачу JSON на базовом пути. Сохраните именно используемый шаблон, затем обновите подписку. Название профиля берётся из названия подписки; уже импортированное старое имя Remnacust приложение может сохранить отдельной записью, которую можно удалить в самом приложении. Если после смены способа нужна проверка фактического применения, используйте предварительный просмотр устройства и журнал приложения. Переподключение выполняйте самостоятельно; сервер не запускает туннель.'
            ],
            [
                'Checking delivery in Happ and INCY',
                'No download animation is expected for a small subscription: its rules are already in JSON. Large profiles require full JSON and client routing support. Use /json or enable JSON at the base subscription path. Save the template actually assigned to the subscription, then refresh it. Routing profiles use the subscription title; a previously imported Remnacust name may remain as a separate entry that can be removed in the app. Check device preview and app logs to confirm delivery. Reconnect yourself if needed; the server never starts the tunnel.'
            ],
            [
                'بررسی تحویل در Happ و INCY',
                'نبود انیمیشن دانلود برای اشتراک کوچک طبیعی است؛ قوانین داخل JSON هستند. پروفایل بزرگ به JSON کامل و پشتیبانی routing برنامه نیاز دارد. از /json یا JSON در مسیر اصلی استفاده کنید. قالب فعال را ذخیره و اشتراک را تازه کنید. نام پروفایل از عنوان اشتراک می‌آید؛ نام قدیمی Remnacust ممکن است به‌صورت ورودی جدا باقی بماند و از داخل برنامه حذف شود. پیش‌نمایش دستگاه و گزارش برنامه روش تحویل را نشان می‌دهد. در صورت نیاز خودتان دوباره متصل شوید؛ سرور تونل را اجرا نمی‌کند.'
            ],
            [
                '检查 Happ 与 INCY 的交付方式',
                '小型订阅没有下载动画是正常现象，规则已在 JSON 内。大型配置需要完整 JSON 和应用 routing 支持。使用 /json 或启用订阅基础路径返回 JSON。保存实际分配的模板并刷新订阅。配置名称使用订阅标题；旧 Remnacust 名称可能保留为单独条目，可在应用内删除。可通过设备预览及应用日志确认交付方式。需要重新连接时请自行操作，服务器不会启动隧道。'
            ]
        ]
    ]
)

sections.push([
    'subscription-refresh-integrity',
    [
        [
            'Обновление и целостность файлов',
            'Страница подписки передаёт DAT отдельно от JSON: предел JSON 16 MiB не ограничивает DAT, для которого действует предел 64 MiB. Прерванная загрузка не считается успешной. Ошибка EOF или отсутствующая категория может означать неполный либо старый локальный файл; после обновления панели обновите и отдельную страницу подписки, затем подписку в приложении. Сверяйте DAT с соответствующим .sha256. Одновременные запросы одного набора используют одну сборку, разные наборы остаются ограниченными по ресурсам. Массовое изменение хостов сохраняется в БД до ответа API; синхронизация правил нод выполняется отдельно. Карточки хостов перечитываются при открытии, а сохранение отправляет только изменённые поля, чтобы не вернуть старые значения после bulk. Некоторые массовые операции над пользователями используют фоновую очередь; это не означает, что все операции панели отложены.'
        ],
        [
            'Refresh and file integrity',
            'The subscription page streams DAT separately from JSON: the 16 MiB JSON budget does not restrict DAT, which has a 64 MiB limit. Interrupted downloads are not successful. EOF or a missing category can indicate an incomplete or stale local file. Update both the panel and a separately installed subscription page, then refresh the subscription in the app. Compare DAT with its .sha256. Concurrent requests for the same bundle share one build; distinct work remains resource bounded. Bulk host updates commit to the database before the API response; node policy synchronization runs separately. Host editors fetch fresh data on open and save only changed fields to avoid restoring stale values after bulk updates. Some bulk user operations run in background queues; panel operations are not all deferred.'
        ],
        [
            'به‌روزرسانی و صحت فایل‌ها',
            'صفحه اشتراک DAT را جدا از JSON منتقل می‌کند: سقف JSON برابر 16 MiB است و DAT سقف مستقل 64 MiB دارد. دانلود ناقص موفق محسوب نمی‌شود. خطای EOF یا نبود دسته می‌تواند از فایل محلی ناقص یا قدیمی باشد. پنل و صفحه اشتراک مستقل را به‌روز کنید و سپس اشتراک برنامه را تازه‌سازی کنید. DAT را با .sha256 مقایسه کنید. درخواست‌های هم‌زمان یک بسته از یک ساخت مشترک استفاده می‌کنند و کارهای متفاوت محدود می‌مانند. تغییر گروهی میزبان پیش از پاسخ API در پایگاه داده ذخیره می‌شود؛ همگام‌سازی نود جداست. ویرایشگر هنگام باز شدن داده تازه می‌گیرد و فقط فیلدهای تغییرکرده را ذخیره می‌کند. برخی عملیات گروهی کاربران صف پس‌زمینه دارند، نه همه عملیات پنل.'
        ],
        [
            '更新与文件完整性',
            '订阅页面将 DAT 与 JSON 分开传输：JSON 的 16 MiB 限制不再截断 DAT，DAT 有独立的 64 MiB 上限。中断的下载不算成功。EOF 或缺少分类可能表示本地文件不完整或过期。请同时更新面板和独立安装的订阅页面，再在客户端更新订阅，并将 DAT 与对应的 .sha256 比较。同一数据包的并发请求共用一次构建，不同构建仍受资源限制。批量修改主机在 API 返回前写入数据库，节点规则同步独立执行。主机编辑器打开时重新读取数据，只提交修改的字段，避免覆盖批量更新。部分用户批量操作使用后台队列，并非所有操作都排队。'
        ]
    ]
])

sections.push(
    [
        'geofile-library-editor',
        [
            [
                'Редактирование файлов библиотеки',
                'Откройте «Геофайлы», выберите файл в общей библиотеке и нажмите «Редактировать файл». Та же кнопка есть в карточке подключённого файла. Для готового набора обязательно укажите новое имя: сохранится независимая копия, которая заменит исходный набор только в текущем черновике шаблона. Сохраните шаблон, чтобы применить эту замену. Другие шаблоны продолжат использовать оригинал. Правки обычного загруженного файла сохраняются сразу и затрагивают все использующие его шаблоны.\n\nВ DAT выберите категорию: записи показаны постранично, с поиском. Можно менять домены и IP, тип доменной записи, удалять и добавлять записи. Атрибуты и остальные категории сохраняются. Для перехода к другой категории сначала сохраните или отмените правки. Текстовые JSON/YAML-наборы редактируются целиком до 8 MiB; SRS и более крупные текстовые файлы заменяются файлом того же формата, до 64 MiB.\n\nПосле ручной правки автообновление из источника выключается, чтобы не затереть изменения. Если файл уже изменён другим администратором или обновлением, сохранение отклоняется: закройте и заново откройте редактор. Нельзя удалить используемую сохранённым шаблоном категорию без перенастройки шаблона.'
            ],
            [
                'Editing library files',
                'Open Geofiles, choose a file in the shared library and select Edit file. The same action appears on an attached file. A preset requires a new name: saving creates an independent copy and replaces the source only in the current template draft. Save the template to apply that replacement. Other templates retain the original. Editing an ordinary uploaded file saves immediately and affects every template using it.\n\nFor DAT, select a category and browse or search paginated records. Edit domains, IPs and domain record types, remove records or add new ones. Attributes and other categories are preserved. Save or discard edits before changing categories. Text JSON/YAML sets can be edited in full up to 8 MiB; SRS and larger text files require a same-format replacement up to 64 MiB.\n\nManual editing disables automatic source refresh to preserve the changes. Concurrent administrator edits or refreshes cause a conflict rather than overwriting a newer revision: close and reopen the editor. A category used by a saved template cannot be removed without reconfiguring that template.'
            ],
            [
                'ویرایش فایل‌های کتابخانه',
                'در فایل‌های جغرافیایی، فایل کتابخانه مشترک را انتخاب و «ویرایش فایل» را بزنید. همین گزینه در کارت فایل متصل هم هست. مجموعه آماده به نام جدید نیاز دارد: کپی مستقل ساخته و فقط در پیش‌نویس قالب جاری جایگزین اصل می‌شود. برای اعمال جایگزینی، قالب را ذخیره کنید. قالب‌های دیگر اصل را نگه می‌دارند. ویرایش فایل بارگذاری‌شده عادی فوری ذخیره و در همه قالب‌های استفاده‌کننده اعمال می‌شود.\n\nبرای DAT، دسته را انتخاب کنید؛ رکوردها با صفحه‌بندی و جست‌وجو نمایش داده می‌شوند. دامنه، IP و نوع رکورد دامنه را ویرایش، حذف یا اضافه کنید. ویژگی‌ها و دسته‌های دیگر حفظ می‌شوند. پیش از تغییر دسته، ویرایش‌ها را ذخیره یا کنار بگذارید. JSON/YAML متنی تا 8 MiB کامل ویرایش می‌شود؛ SRS و متن بزرگ‌تر با فایل هم‌قالب تا 64 MiB جایگزین می‌شوند.\n\nویرایش دستی به‌روزرسانی خودکار منبع را برای حفظ تغییرات خاموش می‌کند. ویرایش یا تازه‌سازی هم‌زمان باعث تعارض می‌شود، نه بازنویسی نسخه جدید؛ ویرایشگر را ببندید و دوباره باز کنید. دسته مورد استفاده قالب ذخیره‌شده بدون تنظیم دوباره آن قالب قابل حذف نیست.'
            ],
            [
                '编辑库文件',
                '打开地理文件，从共享文件库选择文件并点击编辑文件。已附加文件的卡片中也有此操作。修改预设必须使用新名称：保存后创建独立副本，仅替换当前模板草稿中的原文件。请保存模板以应用替换。其他模板继续使用原文件。编辑普通上传文件会立即保存，并影响所有使用它的模板。\n\nDAT 按分类分页显示，可搜索、修改域名、IP 及域名记录类型，也可删除和新增记录。属性及其他分类会保留。切换分类前请保存或放弃更改。最大 8 MiB 的文本 JSON/YAML 可完整编辑；SRS 及更大的文本文件需用相同格式文件替换，最大 64 MiB。\n\n手动编辑后自动源更新会关闭，以保留更改。并发编辑或刷新会返回冲突，不会覆盖新版本；请关闭并重新打开编辑器。删除已保存模板所使用的分类前，必须先重新配置该模板。'
            ]
        ]
    ],
    [
        'geofile-manual-addresses',
        [
            [
                'Дополнительные адреса и маршруты',
                'На вкладке «Геофайлы» находится блок «Дополнительные адреса». Кнопка «Импорт» принимает JSON-правило Xray, массив или фрагменты через запятую, в том числе с завершающей запятой. Выберите действие для всех адресов либо сохраните маршруты из правил. Импорт добавляет отдельные правила текущего шаблона; дополнительные условия не отбрасываются молча, неподдерживаемый блок отклоняется целиком. Добавьте по одному домену, IP или CIDR на строку и выберите DIRECT, REJECT либо существующий маршрут VPN/автовыбора. example.com включает поддомены, full:example.com означает точное совпадение; доступны keyword: и regexp:. Домен и IP создают независимые правила, а не условие обязательного совпадения обоих. Правила добавляются перед геофайлами и общим маршрутом, поэтому подходят для исключений.\n\nЭто правила текущего шаблона: сохраните его и обновите подписку в приложении. Они не меняют общий файл библиотеки. В одном блоке не более 20 000 адресов и 2 MiB текста; большие списки загружайте файлом. Сложные ручные правила с дополнительными условиями остаются в редакторе кода. Для VPN выберите существующий рабочий выход или группу: название DIRECT либо REJECT не создаёт VPN-сервер.'
            ],
            [
                'Additional addresses and routes',
                'The Geofiles tab contains the Additional addresses section. Import accepts an Xray JSON rule, an array or comma-separated fragments, including a final comma. Choose one action for every address or retain the routes from the rules. Import creates separate rules in the current template; unsupported conditions reject the whole block rather than being silently dropped. Enter one domain, IP or CIDR per line and choose DIRECT, REJECT or an existing VPN/autoselect route. example.com includes subdomains; full:example.com is an exact match. keyword: and regexp: are also available. Domain and IP matches become independent rules rather than requiring both. Rules precede geofiles and the catch-all, making them useful exceptions.\n\nThese are rules in the current template: save it and refresh the app subscription. They do not change the shared library file. A block accepts at most 20,000 addresses and 2 MiB of text; upload larger lists as files. Complex manual rules with extra conditions remain in the code editor. For VPN, choose an existing working outbound or group: DIRECT or REJECT does not create a VPN server.'
            ],
            [
                'نشانی‌ها و مسیرهای تکمیلی',
                'بخش نشانی‌های تکمیلی در زبانه فایل‌های جغرافیایی قرار دارد. واردسازی قانون JSON مربوط به Xray، آرایه یا قطعه‌های جداشده با ویرگول، حتی با ویرگول پایانی را می‌پذیرد. یک عمل برای همه نشانی‌ها انتخاب کنید یا مسیرهای داخل قوانین را نگه دارید. قوانین جداگانه در قالب جاری ایجاد می‌شوند؛ شرط پشتیبانی‌نشده باعث رد کامل بلوک می‌شود و پنهانی حذف نمی‌شود. هر دامنه، IP یا CIDR را در یک خط وارد و DIRECT، REJECT یا مسیر موجود VPN/انتخاب خودکار را انتخاب کنید. example.com شامل زیردامنه‌هاست؛ full:example.com تطبیق دقیق است. keyword: و regexp: نیز موجودند. دامنه و IP قوانین مستقل می‌سازند، نه الزام تطبیق هم‌زمان هر دو. این قوانین پیش از فایل جغرافیایی و مسیر نهایی قرار می‌گیرند و برای استثنا مناسب‌اند.\n\nقوانین متعلق به قالب جاری‌اند؛ آن را ذخیره و اشتراک برنامه را تازه‌سازی کنید. فایل مشترک کتابخانه تغییر نمی‌کند. هر بلوک حداکثر 20٬000 نشانی و 2 MiB متن دارد؛ فهرست بزرگ‌تر را فایل بارگذاری کنید. قوانین پیچیده با شرط اضافه در ویرایشگر کد باقی می‌مانند. برای VPN خروجی یا گروه کاری موجود را انتخاب کنید؛ DIRECT و REJECT سرور VPN ایجاد نمی‌کنند.'
            ],
            [
                '附加地址与路由',
                '附加地址区域位于地理文件选项卡。导入支持 Xray JSON 规则、数组或以逗号分隔的片段，包括末尾逗号。可为所有地址选择同一操作，或保留规则中的路由。导入会在当前模板中添加独立规则；不支持的条件会使整个块被拒绝，不会被静默删除。每行输入一个域名、IP 或 CIDR，选择 DIRECT、REJECT 或已有的 VPN/自动选择路由。example.com 包括子域名，full:example.com 为精确匹配；也支持 keyword: 和 regexp:。域名与 IP 会生成独立规则，不要求同时匹配。规则位于地理文件及兜底规则之前，适合设置例外。\n\n这些规则属于当前模板：请保存模板并刷新客户端订阅，不会更改共享库文件。每块最多 20,000 个地址及 2 MiB 文本；更大的列表请上传为文件。带附加条件的复杂手动规则仍在代码编辑器中。使用 VPN 时请选择已有且可用的出站或分组；DIRECT 或 REJECT 不会创建 VPN 服务器。'
            ]
        ]
    ]
)

const addressWorkflowNotes = {
    ru: 'Дополнительные адреса и импорт находятся только на вкладке «Геофайлы». Кроме адреса на каждой строке можно вставить JSON-массив строк или строки в кавычках через запятую, включая фрагмент списка без квадратных скобок. Настоящие объекты правил импортируются отдельной кнопкой «Импорт». Для Xray JSON действие «Через хост» направляет выбранные адреса или категории файла через конкретный хост. Он должен быть доступен пользователю; действуют собственные ключи, ограничения и квоты этого хоста. Выбор не выдаёт дополнительный доступ и не подменяется DIRECT при недоступном хосте. Другие форматы используют свои существующие группы и маршруты. Пустая панель изменений после сохранения не отображается. При переходе на DAT старые ссылки geosite/geoip из других профилей используют категорию выбранного файла только при единственном совпадении; действие и порядок исходного правила сохраняются. Неизвестные или неоднозначные категории и собственные геоданные не подменяются.',
    en: 'Additional addresses and import are available only on the Geofiles tab. Paste one address per line, a JSON array of strings, or comma-separated quoted strings, including a fragment without brackets. Use Import for actual routing-rule objects. In Xray JSON, Via host routes selected addresses or file categories through a particular host. The host must be available to that user; its own credentials, restrictions and quotas apply. Selecting it grants no additional access and never falls back to DIRECT when unavailable. Other formats use their existing groups and routes. The empty changes panel disappears after saving. When switching to DAT, legacy geosite/geoip references in other profiles use a selected file category only when the match is unique; the original rule action and order remain intact. Unknown or ambiguous categories and custom geodata are never substituted.',
    fa: 'نشانی‌های اضافی و وارد کردن فقط در زبانه فایل‌های جغرافیایی قرار دارند. یک نشانی در هر خط، آرایه JSON رشته‌ها یا رشته‌های داخل گیومه با ویرگول، حتی بدون براکت، قابل ورود است. اشیای قواعد مسیریابی را با دکمه وارد کردن اضافه کنید. در Xray JSON گزینه «از طریق میزبان» نشانی‌ها یا دسته‌های فایل را از میزبان مشخص عبور می‌دهد. میزبان باید برای کاربر مجاز باشد و کلیدها، محدودیت‌ها و سهمیه خودش اعمال می‌شود؛ انتخاب آن دسترسی اضافی نمی‌دهد و هنگام نبود میزبان به DIRECT تغییر نمی‌کند. قالب‌های دیگر از گروه‌ها و مسیرهای موجود خود استفاده می‌کنند. پنل تغییرات خالی پس از ذخیره نمایش داده نمی‌شود. هنگام تغییر به DAT، ارجاع‌های قدیمی geosite/geoip در پروفایل‌های دیگر فقط با تطبیق یکتا به دسته فایل انتخاب‌شده وصل می‌شوند؛ عمل و ترتیب قانون حفظ می‌شود. دسته ناشناخته یا مبهم و داده جغرافیایی سفارشی جایگزین نمی‌شود.',
    zh: '附加地址与导入功能仅位于地理文件选项卡。支持每行一个地址、JSON 字符串数组，或不带方括号的逗号分隔引号字符串。实际路由规则对象请使用“导入”。Xray JSON 的“通过主机”可让地址或文件分类经过指定主机。用户必须有权使用该主机，并适用该主机自己的凭据、限制和配额；选择不会授予额外访问权限，主机不可用时也不会退回 DIRECT。其他格式使用各自已有的分组和路由。保存后不显示空的变更面板。 切换到 DAT 时，其他配置中的旧 geosite/geoip 引用仅在唯一匹配时使用已选文件的分类，保留原规则的操作和顺序。不会替换未知、歧义分类或自定义地理数据。'
}

export function explainGeofileRefresh(articles) {
    const article = articles.find((item) => item.id === 'templates')
    if (!article) throw new Error('Missing templates article')
    const sizes = {
        ru: [
            'Автоматическая доставка и размер геофайлов',
            'Ручного переключателя доставки больше нет. Сначала все выбранные геофайлы преобразуются в правила. В INCY длинные списки без запятых сохраняются в поддерживаемой Xray строковой форме без потери условий. Размер проверяется у каждого итогового профиля с отступами в четыре пробела: порог встраивания геофайлов — 90 000 байт или 20 000 условий; общий бюджет итогового профиля — 900 000 байт с запасом для изменений клиента. Это не опубликованный разработчиком точный лимит INCY. Несколько хостов не суммируются для этого сравнения; отдельный предел полного ответа 16 MiB сохраняется. Если один профиль слишком велик, поддерживаемые Happ/INCY получают объединённые DAT с отдельными именами категорий. Лимиты разворачивания правил также могут переключить доставку. Другие Xray-клиенты получают встроенные правила; неподдерживаемая большая конфигурация возвращает ошибку, а не обрезанные правила. Для sing-box/Mihomo/Clash/Stash небольшие наборы встроены, большие — удалённые; бинарный SRS всегда удалённый. Для совместимости старый Clash получает собственные наборы через загрузку. DIRECT, REJECT, группы и порядок правил сохраняются. Собственный routing и геоданные не перезаписываются: при конфликте и невозможности безопасной выдачи будет ошибка. Профиль использует название подписки из profile-title с переопределениями сквада, иначе домен подписки; короткий стабильный суффикс различает подписки с одинаковым именем. Старое поле downloadToClient принимается для совместимости, но больше не выбирает способ доставки. Интервал клиента действует только при удалённой доставке; загрузка на сервер имеет отдельное расписание.'
        ],
        en: [
            'Automatic geofile delivery and size',
            'There is no manual delivery switch. All selected geofiles are first converted to inline rules. INCY receives long comma-free lists in lossless Xray StringList form. Each final profile is measured after four-space formatting against a geofile inline threshold of 90,000 bytes or 20,000 conditions; the full profile retains a conservative 900,000-byte panel budget with room for client patches; this is not a documented exact INCY limit. Host profiles are not added together for this comparison. A separate 16 MiB full-response transport limit remains. If a profile is too large, supported Happ/INCY receive bundled DAT with isolated category names. Inline compilation limits can also trigger downloads. Other Xray apps receive inline rules; an unsupported oversized configuration returns an error instead of losing rules. Small sing-box/Mihomo/Clash/Stash datasets are inline and large ones remote; binary SRS is always remote. Legacy Clash also downloads native providers for compatibility. DIRECT, REJECT, groups and routing order are preserved. Manual routing/geodata are not overwritten: incompatible oversized output fails explicitly. Profile names use the subscription profile-title, including squad overrides, or the subscription domain as fallback; a stable short suffix isolates identical names. Legacy downloadToClient is accepted but no longer chooses delivery. Client intervals apply only to remote delivery; server refresh has a separate schedule.'
        ],
        fa: [
            'تحویل خودکار و اندازه فایل جغرافیایی',
            'کلید انتخاب دستی روش تحویل حذف شده است. ابتدا قوانین همه فایل‌های انتخاب‌شده ساخته می‌شوند. فهرست‌های بلند INCY بدون ویرگول به قالب StringList در Xray تبدیل می‌شوند و شرطی حذف نمی‌شود. هر پروفایل نهایی با تورفتگی چهار فاصله نسبت به آستانه داخلی 90,000 بایت یا 20,000 شرط سنجیده می‌شود؛ بودجه کل پروفایل 900,000 بایت است؛ این سقف رسمی اعلام‌شده INCY نیست. اندازه میزبان‌ها با هم جمع نمی‌شود. سقف انتقال کل پاسخ 16 MiB جداگانه باقی است. پروفایل بزرگ در Happ/INCY پشتیبانی‌شده از DAT ترکیبی با نام دسته‌های جدا استفاده می‌کند؛ محدودیت پردازش قوانین هم می‌تواند دانلود را انتخاب کند. برنامه Xray دیگر قوانین داخلی می‌گیرد و خروجی بزرگ ناسازگار به‌جای حذف قوانین خطا می‌دهد. مجموعه کوچک sing-box/Mihomo/Clash/Stash داخلی و مجموعه بزرگ راه دور است؛ SRS باینری همیشه راه دور است. برای سازگاری، Clash قدیمی مجموعه بومی را دانلود می‌کند. عملکردها و ترتیب قوانین حفظ می‌شوند و routing یا داده جغرافیایی دستی بازنویسی نمی‌شود. نام از profile-title اشتراک با تنظیمات اسکواد، یا دامنه اشتراک گرفته می‌شود؛ پسوند کوتاه ثابت نام‌های یکسان را جدا می‌کند. downloadToClient قدیمی پذیرفته می‌شود ولی روش تحویل را تعیین نمی‌کند. فاصله کلاینت فقط برای دانلود است و تازه‌سازی سرور برنامه جدا دارد.'
        ],
        zh: [
            '地理文件自动交付与大小',
            '不再提供手动交付开关。面板先将全部所选地理文件生成为内嵌规则。INCY 的大型无逗号列表使用无损 Xray StringList 格式。每个最终配置按四空格格式化后的大小与内嵌阈值 90,000 字节或 20,000 个条件比较；整个配置仍有 900,000 字节的保守预算，为客户端修改预留空间；这不是 INCY 官方公布的精确上限。此检查不累加多个主机，整个响应仍有独立的 16 MiB 传输上限。配置过大时，受支持的 Happ/INCY 使用分类命名隔离的合并 DAT；内嵌处理限制也可能触发下载。其他 Xray 客户端使用内嵌规则，过大的不兼容配置会明确报错，不会删除规则。sing-box/Mihomo/Clash/Stash 小型数据集内嵌，大型数据集远程加载；二进制 SRS 始终远程加载。为兼容旧版 Clash，原生规则集也采用下载方式。DIRECT、REJECT、分组及规则顺序均保留，不覆盖手动 routing 或地理数据。配置名称使用订阅 profile-title（包含小队覆盖），未设置时使用订阅域名，稳定短后缀用于隔离同名订阅。旧 downloadToClient 字段仍可读取，但不再控制交付方式。客户端间隔仅适用于下载，服务器刷新使用独立计划。'
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
                    {
                        title: translations[index][0],
                        body:
                            translations[index][1] +
                            (id === 'geofile-manual-addresses'
                                ? '\n\n' + addressWorkflowNotes[language]
                                : '')
                    }
                ])
            )
        })
}
