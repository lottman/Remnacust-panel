const assignedProfileNotes = {
    ru: '\n\nВ карточке редактирования хоста блок «Сохранённое назначение JSON» показывает источник: явный выбор в хосте, назначение из шаблона по UUID или тегу, либо отсутствие отдельного назначения. Название шаблона открывает его редактор; балансер указан рядом. Просмотр не меняет настройки. Несохранённые теги и индивидуальные правила выдачи пользователя не подменяют сохранённое назначение. Для назначенного балансера панель исключает из выдачи неиспользуемые балансеры и доказанно ненужные пулы с явными префиксами. Балансеры из правил сайтов, резервные outbound и цели геофайлов сохраняются. Динамические имена из remark/тегов и сложные неподтверждённые зависимости не обрезаются. Теги балансеров уникальны внутри одного JSON; в разных профилях они могут совпадать.\n\nДля random и roundRobin без fallbackTag наблюдатель не обязателен. При настроенном резервном выходе Xray использует его результаты для исключения недоступных серверов; редактор сохраняет эти проверки. observatory и burstObservatory — альтернативы. Обычная проверка использует интервал и enableConcurrency; burst распределяет пробы во времени и хранит окно sampling результатов. sampling не следует считать простым числом запросов при каждом тике: цикл связан с interval × sampling, что влияет на обнаружение отказа и восстановление. Burst не гарантирует меньший трафик или неразличимость. Уже выбранный наблюдатель, URL, метод и интервалы не заменяются автоматически. Выбирайте режим в настройках проверки и измеряйте через приложение.',
    en: '\n\nThe host edit form shows Saved JSON assignment: an explicit host template, assignment by host UUID, assignment by tag, or no explicit assignment. The template name opens its editor and the balancer appears beside it. Viewing is read-only. Unsaved tags and user-specific response overrides do not replace this saved assignment. Assigned profiles omit unused balancers and provably unused pools with explicit prefixes. Site-specific routing, fallback outbounds and geofile targets are preserved. Dynamic remark/tag names and unproven complex dependencies are retained. Balancer tags must be unique within one JSON configuration; separate profiles may reuse them.\n\nrandom and roundRobin do not require an observer without fallbackTag. With a fallback configured, Xray uses observations to exclude unavailable servers; the editor preserves these checks. observatory and burstObservatory are alternatives. The former uses an interval and enableConcurrency; burst distributes probes over time and retains a sampling window. sampling is not simply requests per tick: a cycle relates to interval × sampling and affects failure detection and recovery. Burst does not guarantee lower traffic or indistinguishability. Existing observer type, URL, method and intervals are not replaced automatically. Select the mode in probe settings and measure through the client.',
    fa: '\n\nدر فرم ویرایش میزبان، انتساب ذخیره‌شده JSON منبع را نشان می‌دهد: قالب صریح میزبان، انتساب با UUID یا برچسب، یا نبود انتساب صریح. نام قالب ویرایشگرش را باز می‌کند و نام متعادل‌کننده کنار آن است. مشاهده تنظیمات را عوض نمی‌کند. برچسب ذخیره‌نشده و قوانین اختصاصی پاسخ جای این وضعیت را نمی‌گیرند. برای پروفایل منتسب، متعادل‌کننده‌های بی‌استفاده و مجموعه‌های با پیشوند صریح که بی‌استفاده بودنشان ثابت شده حذف می‌شوند. قوانین سایت، مسیر پشتیبان و مقصد فایل جغرافیایی حفظ می‌شوند. نام‌های پویا و وابستگی پیچیده نامشخص حذف نمی‌شوند. نام متعادل‌کننده در یک JSON یکتا است؛ پروفایل‌های جدا می‌توانند نام یکسان داشته باشند.\n\nrandom و roundRobin بدون fallbackTag به پایشگر نیاز ندارند. با مسیر پشتیبان، Xray از نتایج پایش برای حذف سرورهای ناموجود استفاده می‌کند و ویرایشگر این بررسی‌ها را حفظ می‌کند. observatory و burstObservatory جایگزین یکدیگرند. اولی interval و enableConcurrency دارد؛ burst زمان بررسی را پخش می‌کند و پنجره sampling نتیجه نگه می‌دارد. sampling صرفاً تعداد درخواست هر تیک نیست؛ چرخه با interval × sampling مرتبط است و روی تشخیص خطا و بازیابی اثر دارد. Burst ترافیک کمتر یا غیرقابل‌تشخیص بودن را تضمین نمی‌کند. نوع پایش، آدرس، روش و فاصله قبلی خودکار عوض نمی‌شوند. حالت را در تنظیمات بررسی انتخاب و در برنامه آزمایش کنید.',
    zh: '\n\n主机编辑表单显示已保存的 JSON 关联：主机显式指定、模板按 UUID 关联、按标签关联或没有单独关联。点击模板名打开编辑器，均衡器名称显示在旁边。查看不会修改配置；未保存的标签及用户特定响应规则不替代此状态。关联配置会排除未使用的均衡器，以及可证明无用的显式前缀池。保留站点路由、备用 outbound 及地理文件目标。动态 remark/标签名称与未确认的复杂依赖不会被截断。同一 JSON 内均衡器标签必须唯一，不同配置可复用。\n\nrandom 和 roundRobin 未配置 fallbackTag 时不要求探测器。配置备用出口后，Xray 使用探测结果排除不可用服务器；编辑器会保留这些检查。observatory 与 burstObservatory 是可选方案。前者使用间隔和 enableConcurrency；burst 将探测分散到不同时间并保存 sampling 结果窗口。sampling 不是简单的每次触发请求数；周期与 interval × sampling 有关，会影响故障检测及恢复。Burst 不保证流量更少或不可识别。已有探测器类型、URL、方法及间隔不会自动替换。请在探测设置中选择并通过客户端验证。'
}

const assignmentMeaning = {
    ru: '\n\nПример назначения: `remnawave.assignments = [{hosts: ["UUID_ХОСТА_ПОЛУЧАТЕЛЯ"], balancerTag: "auto-eu"}]`. Поле hosts здесь — получатели готового автовыбора, а не серверы внутри его пула. Участники выбираются отдельно в remnawave.injectHosts; auto-eu должен совпадать с routing.balancers[].tag. В GUI это блок «Где использовать автовыбор»; вручную писать JSON не требуется.',
    en: '\n\nAssignment example: `remnawave.assignments = [{hosts: ["RECIPIENT_HOST_UUID"], balancerTag: "auto-eu"}]`. Here hosts identifies recipients of the generated autoselect, not its pool members. Pool servers are selected separately in remnawave.injectHosts; auto-eu must match routing.balancers[].tag. The GUI calls this Where to use autoselect; editing JSON manually is optional.',
    fa: '\n\nنمونه انتساب: `remnawave.assignments = [{hosts: ["RECIPIENT_HOST_UUID"], balancerTag: "auto-eu"}]`. hosts گیرنده پروفایل انتخاب خودکار را مشخص می‌کند، نه اعضای مجموعه. اعضا جداگانه در remnawave.injectHosts انتخاب می‌شوند؛ auto-eu باید با routing.balancers[].tag یکی باشد. در رابط از بخش محل استفاده انتخاب خودکار استفاده کنید؛ نوشتن JSON الزامی نیست.',
    zh: '\n\n关联示例：`remnawave.assignments = [{hosts: ["RECIPIENT_HOST_UUID"], balancerTag: "auto-eu"}]`。此处 hosts 表示接收自动选择配置的主机，并非池成员。池服务器另由 remnawave.injectHosts 选择；auto-eu 必须与 routing.balancers[].tag 一致。界面对应“在哪里使用自动选择”，无需手动编写 JSON。'
}

const addressFamilyNotes = {
    ru: '\n\nСемейство адресов задаётся отдельно для каждого пула: «Любые адреса» (any, по умолчанию), IPv4 или IPv6. Строгие IPv4/IPv6 оставляют только хосты с явно указанным IP в поле адреса хоста; IPv6 допускается со скобками или без них. Домены остаются только в any: панель не выполняет DNS-поиск и не берёт дополнительные API-адреса ноды. Адреса с zone ID не входят в строгие пулы. Фильтр состава не меняет стратегию балансировки: сначала отбираются подходящие адреса, затем применяются режим выбора и стратегия клиента. Если нужен один сервер в обоих семействах, создайте отдельные хосты с IPv4 и IPv6 и назначьте их соответствующим пулам. Само разделение хостов не создаёт общей квоты: общие лимиты задаются существующими настройками пользователя, получателя автовыбора или тегов в поддерживаемой политике хостов.',
    en: '\n\nEach pool has an independent host address family: Any address (any, the default), IPv4 or IPv6. Strict IPv4/IPv6 retains only hosts whose address field is an explicit IP literal; IPv6 may be bare or bracketed. Domains remain only in any: the panel does not resolve DNS or infer addresses from secondary node API IPs. Zone IDs are excluded from strict pools. This membership filter does not change the balancing strategy: address filtering precedes selection mode and the client strategy. To expose one server over both families, create separate hosts with IPv4 and IPv6 addresses and assign them to the corresponding pools. Separate hosts do not create a shared quota: shared limits use the existing user, autoselect recipient or tag settings within the supported host policy.',
    fa: '\n\nهر مجموعه خانواده آدرس مستقل دارد: هر آدرس (any، پیش‌فرض)، IPv4 یا IPv6. حالت سخت‌گیرانه IPv4/IPv6 فقط میزبان‌هایی را نگه می‌دارد که فیلد آدرس آن‌ها یک IP صریح است؛ IPv6 با کروشه یا بدون آن پذیرفته می‌شود. دامنه فقط در any می‌ماند: پنل DNS را جست‌وجو نمی‌کند و از IPهای اضافی API نود آدرس استنتاج نمی‌کند. آدرس دارای zone ID وارد مجموعه سخت‌گیرانه نمی‌شود. این فیلتر اعضا راهبرد توزیع بار را تغییر نمی‌دهد؛ ابتدا آدرس فیلتر می‌شود، سپس حالت انتخاب و راهبرد برنامه اعمال می‌شوند. برای یک سرور با هر دو خانواده، دو میزبان مجزا با آدرس IPv4 و IPv6 بسازید و در مجموعه‌های مربوط قرار دهید. جدا کردن میزبان‌ها سهمیه مشترک جدید ایجاد نمی‌کند؛ محدودیت مشترک از تنظیمات موجود کاربر، گیرنده انتخاب خودکار یا برچسب‌ها در سیاست پشتیبانی‌شده میزبان استفاده می‌کند.',
    zh: '\n\n每个池可独立选择主机地址族：任意地址（any，默认）、IPv4 或 IPv6。严格 IPv4/IPv6 仅保留地址字段为明确 IP 字面量的主机；IPv6 可带方括号或不带。域名仅保留在 any 中：面板不查询 DNS，也不根据节点的备用 API IP 推断主机地址。严格池不接受 zone ID。此成员过滤不改变负载均衡策略：先过滤地址，再应用选择模式和客户端策略。如需通过两种地址族使用同一服务器，请分别创建 IPv4 和 IPv6 主机并加入对应池。拆分主机不会自动创建共享配额；共享限制继续使用受支持主机策略中现有的用户、自动选择接收主机或标签设置。'
}

const sections = [
    [
        'templates-http-response-time',
        [
            [
                'Выбор по полному времени HTTP-ответа',
                'Режим «Минимальное время ответа (ping + TTFB)» выбирает по HTTP-проверке через каждый сервер пула. В Xray это leastPing с observatory или burstObservatory; в Mihomo/Clash/Stash — url-test, в sing-box — urltest. Замер выполняет приложение пользователя, а не панель. В него входят установление соединения, TLS при HTTPS и ожидание HTTP-ответа. Это не отдельный ICMP-ping и не сумма двух независимо измеренных показателей.\n\nДля leastPing и leastLoad панель дополняет отсутствующее наблюдение и включает селекторы этих балансеров в HTTP-проверки даже в JSON, написанном вручную. Для random и roundRobin проверки нужны при наличии резервного outbound; без резерва дополнительные проверки не добавляются. URL, интервал и явный HTTP-метод сохраняются. По умолчанию используются https://www.gstatic.com/generate_204 и 30s; у burstObservatory — HEAD, timeout 5s и sampling 2. HEAD не загружает тело ответа; явный GET у burstObservatory включает его чтение в задержку. Выберите один небольшой ответ, желательно 204, доступный через весь пул. Запрет сайта проверки нельзя исправить измерением от панели.\n\nПосле первоначальных измерений приложение обновляет результаты по интервалу. Новые соединения используют последний выбор без обновления подписки; уже открытые потоки не переносятся. Burst использует среднее по выборке; у нативных url-test/urltest порог tolerance уменьшает частые переключения. Настройки проверки и допустимые значения зависят от ядра клиента. Таймаут проверки и резервный маршрут задают поведение при отказе. Состав пула по-прежнему ограничен доступом пользователя и применимыми квотами.'
            ],
            [
                'Selection by total HTTP response time',
                'Lowest response time (ping + TTFB) selects by an HTTP probe through each pool server. Xray uses leastPing with observatory or burstObservatory; Mihomo/Clash/Stash use url-test and sing-box uses urltest. The user app measures the route, not the panel. Timing includes connection setup, TLS for HTTPS and waiting for the HTTP response. It is not separate ICMP ping or a sum of two independently measured values.\n\nFor leastPing and leastLoad, the panel supplies a missing observer and enrolls those balancer selectors in HTTP checks, including hand-written JSON. Random and roundRobin need observations when a fallback outbound is configured; without a fallback no extra probes are added. Custom URLs, intervals and explicit HTTP methods are preserved. Defaults are https://www.gstatic.com/generate_204 and 30s; burstObservatory uses HEAD, a 5s timeout and sampling 2. HEAD does not download the response body; an explicit burstObservatory GET includes reading the body in its delay. Choose the same small response, preferably 204, reachable through the entire pool. Measuring from the panel cannot bypass a blocked probe site.\n\nAfter initial measurements, the app refreshes results on its configured interval. New connections use the current selection without refreshing the subscription; existing streams do not move. Burst uses the sample mean; native url-test/urltest tolerance reduces frequent switching. Probe settings and supported values depend on the client core. Probe timeout and fallback configure failure behavior. Pool membership still respects user access and applicable quotas.'
            ],
            [
                'انتخاب بر اساس زمان کامل پاسخ HTTP',
                'حالت کمترین زمان پاسخ (ping + TTFB) از بررسی HTTP از مسیر هر سرور مجموعه استفاده می‌کند. در Xray از leastPing با observatory یا burstObservatory، در Mihomo/Clash/Stash از url-test و در sing-box از urltest استفاده می‌شود. اندازه‌گیری توسط برنامه کاربر انجام می‌شود، نه پنل. این زمان شامل برقراری اتصال، TLS برای HTTPS و انتظار پاسخ HTTP است؛ پینگ ICMP جداگانه یا مجموع دو معیار مستقل نیست.\n\nبرای leastPing و leastLoad، پنل پایش غایب را اضافه می‌کند و انتخابگرهای همان متعادل‌کننده‌ها را حتی در JSON دستی پوشش می‌دهد. random و roundRobin تنها با خروجی پشتیبان به پایش نیاز دارند؛ بدون آن بررسی اضافه نمی‌شود. نشانی، فاصله و روش HTTP صریح حفظ می‌شوند. پیش‌فرض https://www.gstatic.com/generate_204 و 30s است؛ burstObservatory از HEAD، مهلت 5s و sampling برابر 2 استفاده می‌کند. HEAD بدنه را بارگیری نمی‌کند؛ GET صریح در burstObservatory زمان خواندن بدنه را نیز حساب می‌کند. پاسخ کوچک یکسان، ترجیحاً 204، باید از همه سرورها در دسترس باشد. اندازه‌گیری از پنل مسدود بودن سایت بررسی را رفع نمی‌کند.\n\nپس از اندازه‌گیری اولیه، نتایج با فاصله تعیین‌شده به‌روز می‌شوند. اتصال‌های جدید بدون تازه‌سازی اشتراک از انتخاب فعلی استفاده می‌کنند و جریان‌های باز منتقل نمی‌شوند. Burst میانگین نمونه‌ها را به کار می‌برد؛ tolerance در url-test/urltest از تغییر مکرر جلوگیری می‌کند. تنظیمات به هسته برنامه وابسته‌اند. مهلت بررسی و مسیر پشتیبان رفتار خطا را تعیین می‌کنند. دسترسی کاربر و سهمیه‌های مربوط همچنان اعضای مجموعه را محدود می‌کنند.'
            ],
            [
                '按完整 HTTP 响应时间选择',
                '最低响应时间（ping + TTFB）通过池内每台服务器执行 HTTP 探测。Xray 使用 leastPing 与 observatory 或 burstObservatory，Mihomo/Clash/Stash 使用 url-test，sing-box 使用 urltest。测量发生在用户应用中，而非面板。时间包括建立连接、HTTPS 的 TLS 和等待 HTTP 响应，并非独立 ICMP ping 或两个独立测量值之和。\n\n对于 leastPing 和 leastLoad，面板会补全缺失的观测器，并将这些均衡器的选择器加入 HTTP 探测，手写 JSON 也适用。random 和 roundRobin 配置备用出站时才需要观测；没有备用项时不会额外添加探测。保留自定义地址、间隔和明确指定的 HTTP 方法。默认使用 https://www.gstatic.com/generate_204 和 30s；burstObservatory 使用 HEAD、5s 超时和 sampling 2。HEAD 不下载响应体，明确设置的 burstObservatory GET 会将读取响应体计入延迟。请使用整个池都能访问的同一个小响应，最好返回 204。面板测量无法绕过探测网站被阻止的问题。\n\n首次测量后，应用按设置的间隔更新结果。新连接使用最新选择，无需刷新订阅；现有流不会迁移。Burst 使用样本平均值；原生 url-test/urltest 的 tolerance 可减少频繁切换。支持的设置和值取决于客户端内核。探测超时和备用路由决定失败时的行为。池成员仍受用户权限和适用配额限制。'
            ]
        ]
    ],
    [
        'templates-autoselect',
        [
            [
                'Автовыбор в коде и интерфейсе',
                'В редакторе Xray JSON вкладки Редактирование и Автовыбор используют общий черновик. Изменение существующего пула или балансера сразу меняет соответствующий JSON. Новый пул добавляет injectHosts, балансер, правило маршрутизации и наблюдение для leastPing или leastLoad. Повторное добавление балансера того же пула не создаёт вторую карточку. Незавершённый балансер с именем пула дополняется на месте. Созданные и скопированные шаблоны сразу появляются в списке. Остальные аутбаунды, правила и настройки сохраняются. Справа отображаются отличия от последнего сохранения; на телефоне список расположен под формой. Сохранение применяет корректный черновик; текст с ошибками сохраняется на сервере с предупреждением и доступен в истории.'
            ],
            [
                'Autoselect in code and UI',
                'The Xray JSON Editing and Autoselect tabs share one draft. Editing an existing pool or balancer immediately updates its JSON. A new pool adds injectHosts, a balancer, routing and observation for leastPing or leastLoad. Adding a balancer for the same pool again does not create a second card. An unfinished balancer named after its pool is completed in place. Created and copied templates appear in the list immediately. Other outbounds, rules and settings remain intact. The changes panel compares against the last save; on phones it appears below the form. Save publishes a valid draft; text with errors is saved on the server with warnings and remains available in history.'
            ],
            [
                'انتخاب خودکار در کد و رابط',
                'زبانه‌های ویرایش و انتخاب خودکار Xray JSON یک پیش‌نویس مشترک دارند. تغییر مجموعه یا متعادل‌کنندهٔ موجود بلافاصله JSON مربوط را تغییر می‌دهد. مجموعهٔ جدید injectHosts، متعادل‌کننده، مسیریابی و پایش leastPing یا leastLoad را اضافه می‌کند. افزودن دوبارهٔ متعادل‌کننده برای همان مجموعه کارت دوم ایجاد نمی‌کند. متعادل‌کنندهٔ ناقص هم‌نام مجموعه در همان محل تکمیل می‌شود. قالب‌های ایجادشده و کپی‌شده بلافاصله در فهرست ظاهر می‌شوند. خروجی‌ها، قوانین و تنظیمات دیگر حفظ می‌شوند. تغییرات نسبت به آخرین ذخیره در کنار فرم و روی تلفن زیر فرم دیده می‌شود. ذخیره پیش‌نویس معتبر را اعمال می‌کند؛ متن دارای خطا روی سرور با هشدار ذخیره و در تاریخچه نگه داشته می‌شود.'
            ],
            [
                '代码和界面中的自动选择',
                'Xray JSON 的编辑和自动选择标签页共享同一草稿。修改现有池或均衡器会立即更新对应 JSON。新池添加 injectHosts、均衡器、路由及 leastPing 或 leastLoad 所需的观测。再次为同一池添加均衡器不会创建第二张卡片。与池同名的未完成均衡器会在原位置补全。创建和复制的模板会立即出现在列表中。其他出站、规则和设置保留。更改面板与上次保存内容比较，在手机上位于表单下方。保存会应用有效草稿；含错误的文本会带警告保存在服务器和历史记录中。'
            ]
        ]
    ],
    [
        'templates-selection-modes',
        [
            [
                'Пулы хостов и теги',
                'selector.type поддерживает uuids, tags с точным совпадением, tagRegex, remarkRegex и sameTagAsRecipient. Все способы поддерживают all/random/group; у tags группы содержат теги, у остальных — UUID хостов после фильтрации. mode all добавляет все доступные источники, random выбирает не более selector.expected уникальных хостов, group выбирает одну непустую доступную группу из selector.groups. Группы задаются объектом с именами или массивом массивов. Без mode работает прежний all; без selectFrom выбираются скрытые хосты. Доступ, видимость и исключения проверяются до выбора. Квоты получателя и участников учитываются раздельно. Случайный набор выбирается при каждой выдаче подписки, а не при VPN-подключении. Если явный режим не нашёл источников, профиль не выдаётся.'
            ],
            [
                'Host pools and tags',
                'selector.type supports uuids, exact tags, tagRegex, remarkRegex and sameTagAsRecipient. All support all/random/group; tag groups contain tags, other groups contain eligible host UUIDs. mode all injects all eligible sources, random selects at most selector.expected unique hosts, and group chooses one nonempty eligible group from selector.groups. Groups can be a named object or an array of arrays. Missing mode keeps legacy all; missing selectFrom selects hidden hosts. Access, visibility and exclusions are checked before selection. Recipient and source quotas are separate. Sampling occurs when a subscription is generated, not for each VPN connection. A profile with an explicit mode and no eligible sources is omitted.'
            ],
            [
                'مجموعهٔ میزبان و برچسب‌ها',
                'selector.type از uuids، برچسب دقیق tags، tagRegex، remarkRegex و sameTagAsRecipient پشتیبانی می‌کند. همهٔ روش‌ها all/random/group را می‌پذیرند؛ گروه‌های tags شامل برچسب و گروه‌های دیگر شامل UUID میزبان‌های مجاز هستند. all همهٔ منابع مجاز را اضافه می‌کند، random حداکثر selector.expected میزبان یکتا و group یک گروه مجاز غیرخالی از selector.groups را انتخاب می‌کند. گروه‌ها شیء نام‌دار یا آرایهٔ آرایه‌ها هستند. نبود mode رفتار قبلی all و نبود selectFrom میزبان‌های مخفی را حفظ می‌کند. دسترسی، نمایش و استثناها پیش از انتخاب بررسی می‌شوند. سهمیه گیرنده و منبع جداست. انتخاب در زمان تولید اشتراک است، نه هر اتصال VPN. پروفایل با حالت صریح و بدون منبع مجاز حذف می‌شود.'
            ],
            [
                '主机池和标签',
                'selector.type 支持 uuids、精确标签 tags、tagRegex、remarkRegex 和 sameTagAsRecipient。所有方式均支持 all/random/group；tags 分组包含标签，其他分组包含筛选后的主机 UUID。all 注入所有符合条件的来源，random 最多选择 selector.expected 个不重复主机，group 从 selector.groups 选择一个非空且符合条件的组。组可以是命名对象或二维数组。省略 mode 保持旧版 all；省略 selectFrom 选择隐藏主机。选择前检查访问权限、可见性和排除规则。接收主机和来源主机配额分别计算。随机选择在生成订阅时发生，而非每次 VPN 连接。显式模式没有可用来源时省略该配置。'
            ]
        ]
    ],
    [
        'templates-assignments',
        [
            [
                'Назначение и балансировка',
                'В блоке «Где использовать автовыбор» выберите конкретный автовыбор и получателей. remnawave.assignments содержит balancerTag и список получателей. В GUI сначала выберите «Хосты» или «Теги»: показывается только соответствующий список. При смене способа второй список удаляется из этого назначения. Старое смешанное назначение видно с предупреждением и меняется только после явного выбора. Прямое назначение хосту приоритетнее тега, шаблон в карточке хоста приоритетнее другого шаблона. Один хост можно назначить нескольким автовыборам: каждый выдаётся отдельным профилем. Повторные совпадения тегов не дублируют профиль. Квота и скорость задаются в хосте-получателе. Через автовыбор квота участников пула не расходуется; их лимиты скорости не наследуются. Несколько автовыборов одного получателя делят его предел. Без собственных и включённых лимитов тегов получателя предела автовыбора нет. Общая квота аккаунта сохраняется. Источники выбираются выше и по-прежнему ограничены доступом пользователя. При переименовании или удалении автовыбора назначения обновляются вместе с ним. Старый assignTo читается; при редактировании выберите его автовыбор. Через меню карточки можно дублировать шаблон любого поддерживаемого формата: настройки, черновик, теги и ссылки на геофайлы сохраняются, назначения получателей очищаются. Сохранение доступно и при ошибке кода; некорректный конфиг остаётся черновиком. Путь ошибки указывает номер пула и открывает нужное поле в коде. Доля неудачных проверок tolerance задаётся от 0 до 1: 0.01 означает 1%. Значение 0 отключает эту проверку. Числовое значение вне 0–1 сохраняется в JSON без замены; Xray ограничивает его внутри ядра при чтении конфига (например, 2 становится 1).'
            ],
            [
                'Assignment and balancing',
                'In Where to use autoselect, choose a specific selection and its recipients. remnawave.assignments contains balancerTag and a recipient list. In the GUI, choose Hosts or Tags first; only that list is shown. Switching mode removes the other list from this assignment. Existing mixed assignments show a warning and change only after an explicit choice. Direct host assignment beats a tag match; an explicit template in the host card beats another template. One host can receive multiple autoselects, each as a separate profile. Repeated tag matches do not duplicate profiles. Quota and speed are configured on the recipient host. Autoselect does not debit pool members or inherit their speed limits. Multiple autoselects for one recipient share its allowance. Without recipient limits or enabled recipient tag limits, autoselect has no host-level ceiling. The account quota still applies. Source pools remain limited by user access. Renaming or deleting a balancer updates its assignments. Legacy assignTo remains readable; choose its selection when editing. The card menu can duplicate any supported template format: settings, draft, tags and geofile references are preserved, while recipient assignments are cleared. Save remains available with code errors; invalid content stays a draft. Error paths identify the pool and reveal its field in code. The failed-probe fraction tolerance is between 0 and 1: 0.01 means 1%. Zero disables this check. A numeric value outside 0–1 is preserved in JSON; Xray clamps it internally when reading the configuration (for example, 2 becomes 1).'
            ],
            [
                'انتساب و متعادل‌سازی',
                'در بخش محل استفاده، انتخاب خودکار مشخص و گیرندگان را تعیین کنید. remnawave.assignments شامل balancerTag و فهرست گیرندگان است. در رابط ابتدا میزبان یا برچسب را انتخاب کنید؛ فقط همان فهرست نمایش داده می‌شود. با تغییر روش، فهرست دیگر از این انتساب حذف می‌شود. انتساب ترکیبی قدیمی هشدار دارد و فقط با انتخاب صریح تغییر می‌کند. انتساب مستقیم میزبان بر برچسب اولویت دارد و الگوی صریح کارت میزبان بر الگوهای دیگر مقدم است. یک میزبان می‌تواند چند انتخاب خودکار با پروفایل‌های جدا دریافت کند. تطبیق تکراری برچسب پروفایل را تکرار نمی‌کند. سهمیه و سرعت روی میزبان گیرنده تنظیم می‌شوند. انتخاب خودکار از سهمیه اعضای مجموعه کم نمی‌کند و محدودیت سرعت آن‌ها را به ارث نمی‌برد. چند انتخاب خودکار برای یک گیرنده سقف مشترک دارند. بدون محدودیت گیرنده یا برچسب فعال آن، سقف میزبان اعمال نمی‌شود. سهمیه کلی حساب همچنان برقرار است. مجموعه منبع به دسترسی کاربر محدود می‌ماند. تغییر نام یا حذف متعادل‌کننده، انتساب آن را هم به‌روز می‌کند. assignTo قدیمی قابل خواندن است؛ هنگام ویرایش انتخاب خودکار آن را مشخص کنید. از منوی کارت می‌توان هر قالب پشتیبانی‌شده را تکثیر کرد؛ تنظیمات، پیش‌نویس، برچسب‌ها و ارجاع فایل‌ها حفظ و انتساب گیرندگان پاک می‌شود. ذخیره با خطای کد نیز ممکن است و محتوای نامعتبر پیش‌نویس می‌ماند. مسیر خطا مجموعه و فیلد کد را مشخص می‌کند. tolerance نسبت آزمون ناموفق بین 0 و 1 است؛ 0.01 یعنی 1٪. مقدار 0 این بررسی را غیرفعال می‌کند. مقدار عددی خارج از 0–1 در JSON حفظ می‌شود؛ Xray هنگام خواندن آن را در هسته محدود می‌کند (مثلاً 2 به 1).'
            ],
            [
                '分配与均衡',
                '在自动选择使用位置中指定具体配置及接收主机。remnawave.assignments 包含 balancerTag 和接收方列表。在界面中先选择主机或标签，只显示相应列表。切换方式会从此分配中移除另一列表。旧的混合分配会显示警告，仅在明确选择后更改。主机直接分配优先于标签匹配；主机卡片中的显式模板优先于其他模板。同一主机可分配多个自动选择，每个生成独立配置。重复标签匹配不会生成重复配置。流量与速度限制在接收主机上设置。通过自动选择使用池成员时，不扣除成员主机配额，也不继承其速度限制。同一接收主机的多个自动选择共享额度。未设置接收主机限制且未启用其标签限制时，不设主机级上限。账户总配额仍然生效。 源池仍受用户访问权限限制。重命名或删除均衡器时会同步更新分配。旧版 assignTo 仍可读取；编辑时请为它选择具体配置。可从卡片菜单复制任意受支持格式的模板，保留设置、草稿、标签和地理文件引用，并清除接收主机分配。代码存在错误时仍可保存，错误内容作为草稿保留。错误路径会显示池编号，并可跳转到对应代码字段。tolerance 是 0 到 1 的探测失败比例，0.01 表示 1%。0 关闭此检查。0–1 外的数值在 JSON 中保留，Xray 读取配置时在内核中限制该值（例如 2 变为 1）。'
            ]
        ]
    ],
    [
        'templates-autoselect-limits',
        [
            [
                'Лимиты автовыбора',
                'Квота и скорость задаются в хосте-получателе. Через автовыбор квота участников пула не расходуется; их лимиты скорости не наследуются. Несколько автовыборов одного получателя делят его предел. Без собственных и включённых лимитов тегов получателя предела автовыбора нет. Общая квота аккаунта сохраняется. В Xray JSON отдельные ключи отличают прямое подключение от подключения через автовыбор. Прямое подключение списывает квоту участника, а подключение через автовыбор — только квоту получателя с его коэффициентом и включёнными лимитами тегов. Пользователь и устройство сохраняют общий предел при смене участника. Разные получатели имеют независимые лимиты. Права доступа, блокировка устройства, статус пользователя и ограничения сайтов продолжают проверяться. Для раздельного учёта нужен Node/Core с remnacust-routed-device-speed-v1; старый комплект отклоняет маршруты автовыбора. Обновите Node/Core перед включением режима и обновите подписку в приложении. Старые ключи учитываются по прежней схеме; ранее записанная история не перераспределяется. Если DENY одного хоста пересекает более широкое ALLOW_ONLY другого, пересекающаяся разрешающая запись исключается целиком.'
            ],
            [
                'Autoselect limits',
                'Quota and speed are configured on the recipient host. Autoselect does not debit pool members or inherit their speed limits. Multiple autoselects for one recipient share its allowance. Without recipient limits or enabled recipient tag limits, autoselect has no host-level ceiling. The account quota still applies. Xray JSON uses separate credentials for direct and autoselect connections. Direct access debits the member; autoselect debits only its recipient, with the recipient multiplier and enabled tag limits. User and device ceilings remain shared when switching members. Different recipients have independent limits. Access permissions, device bans, account status and destination restrictions still apply. Separate route accounting requires Node/Core with remnacust-routed-device-speed-v1; older components refuse routed policies. Update Node/Core before enabling it and refresh the subscription in the app. Old credentials retain their previous accounting; recorded history is not reassigned. If one host’s DENY overlaps a broader ALLOW_ONLY entry on the other, the overlapping allow entry is removed entirely.'
            ],
            [
                'محدودیت‌های انتخاب خودکار',
                'سهمیه و سرعت روی میزبان گیرنده تنظیم می‌شوند. انتخاب خودکار از سهمیه اعضای مجموعه کم نمی‌کند و محدودیت سرعت آن‌ها را به ارث نمی‌برد. چند انتخاب خودکار برای یک گیرنده سقف مشترک دارند. بدون محدودیت گیرنده یا برچسب فعال آن، سقف میزبان اعمال نمی‌شود. سهمیه کلی حساب همچنان برقرار است. در Xray JSON کلید اتصال مستقیم از انتخاب خودکار جداست. اتصال مستقیم از سهمیه عضو و انتخاب خودکار فقط از سهمیه گیرنده با ضریب و محدودیت برچسب فعال آن کم می‌کند. سقف کاربر و دستگاه هنگام تغییر عضو مشترک می‌ماند. گیرندگان متفاوت محدودیت مستقل دارند. دسترسی، مسدودی دستگاه، وضعیت حساب و محدودیت مقصد همچنان بررسی می‌شوند. حسابداری جداگانه مسیر به Node/Core با remnacust-routed-device-speed-v1 نیاز دارد؛ نسخه قدیمی سیاست مسیر را رد می‌کند. پیش از فعال‌سازی Node/Core را به‌روز و سپس اشتراک را در برنامه تازه کنید. کلیدهای قدیمی با روش قبلی محاسبه می‌شوند و تاریخچه ثبت‌شده جابه‌جا نمی‌شود. اگر DENY یک میزبان با ورودی گسترده‌تر ALLOW_ONLY دیگری هم‌پوشانی داشته باشد، ورودی مجاز هم‌پوشان کاملاً حذف می‌شود.'
            ],
            [
                '自动选择限额',
                '流量与速度限制在接收主机上设置。通过自动选择使用池成员时，不扣除成员主机配额，也不继承其速度限制。同一接收主机的多个自动选择共享额度。未设置接收主机限制且未启用其标签限制时，不设主机级上限。账户总配额仍然生效。 Xray JSON 使用不同凭据区分直连和自动选择。直连扣除成员主机配额，自动选择只按接收主机的倍率及已启用标签限额计费。切换成员仍共享用户和设备上限，不同接收主机限额独立。访问权限、设备封禁、账户状态和目标限制始终有效。独立路由计费需要支持 remnacust-routed-device-speed-v1 的 Node/Core，旧版拒绝应用路由策略。启用前请更新 Node/Core，再在应用内刷新订阅。旧凭据仍按原方式计费，已记录的历史不会重新分配。若一台主机的 DENY 与另一台主机更宽泛的 ALLOW_ONLY 条目重叠，将移除整个重叠的允许条目。'
            ]
        ]
    ],
    [
        'templates-history',
        [
            [
                'История и восстановление',
                'Для Xray JSON, Singbox, Mihomo, Clash и Stash сохраняются последние 30 версий. Обновление базы сохраняет существующий код как первую версию. История показывает дату и сравнение выбранной версии с текущим черновиком. Открыть в редакторе восстанавливает весь код, включая автовыбор, балансеры и назначения. Несохранённый черновик заменяется только после предупреждения. Сохранение создаёт новую версию, поэтому восстановление тоже можно отменить. История сохраняется вместе с изменением кода в одной транзакции.'
            ],
            [
                'History and recovery',
                'Xray JSON, Singbox, Mihomo, Clash and Stash retain the last 30 saved versions. The database upgrade preserves existing code as the first version. History shows dates and a comparison with the current draft. Open in editor restores all code, including autoselect, balancers and assignments. Replacing an unsaved draft requires confirmation. Saving creates a new version, so a restore can itself be undone. An unsuccessful save changes neither code nor history.'
            ],
            [
                'تاریخچه و بازیابی',
                'Xray JSON، Singbox، Mihomo، Clash و Stash آخرین ۳۰ نسخهٔ ذخیره‌شده را نگه می‌دارند. ارتقای پایگاه داده کد فعلی را به عنوان نسخهٔ اول حفظ می‌کند. تاریخچه زمان و مقایسه با پیش‌نویس فعلی را نشان می‌دهد. باز کردن در ویرایشگر همهٔ کد شامل انتخاب خودکار، متعادل‌کننده‌ها و انتساب را بازیابی می‌کند. جایگزینی پیش‌نویس ذخیره‌نشده تأیید می‌خواهد. ذخیره نسخهٔ جدید می‌سازد تا بازیابی نیز قابل بازگشت باشد. کد و تاریخچه در یک تراکنش ذخیره می‌شوند.'
            ],
            [
                '历史与恢复',
                'Xray JSON、Singbox、Mihomo、Clash 和 Stash 保留最近 30 个已保存版本。数据库升级将现有代码保留为首个版本。历史显示日期和与当前草稿的比较。在编辑器中打开会恢复全部代码，包括自动选择、均衡器和分配。替换未保存草稿前需要确认。保存会创建新版本，因此恢复操作本身也可以撤销。代码与历史在同一事务中保存。'
            ]
        ]
    ]
]
sections.push(
    [
        'templates-native-groups',
        [
            [
                'Автовыбор во всех форматах',
                'Вкладка Автовыбор доступна для Xray JSON, sing-box, Mihomo, Clash и Stash. sing-box использует urltest/selector; YAML-клиенты — url-test/select/fallback/load-balance. В группе можно включить отбор по UUID, тегам или regex, задать all/random/group и видимость источников. Доступ проверяется до отбора; пустой явный пул не заменяется DIRECT. Ручные участники сохраняются. Имя группы и маршрут по умолчанию редактируются отдельно. Все вкладки имеют один черновик; тестовый Xray-пул удаляется вместе с зависимым балансером без предварительного сохранения. На форме показаны Сохранить и Сбросить черновик; инструменты кода доступны во вкладке Редактирование.'
            ],
            [
                'Autoselect in every editable format',
                'Autoselect is available for Xray JSON, sing-box, Mihomo, Clash and Stash. sing-box uses urltest/selector; YAML clients use url-test/select/fallback/load-balance. Groups can filter UUIDs, tags or regex with all/random/group and source visibility. Access is checked before selection; an empty explicit pool never becomes DIRECT. Manual members remain intact. Group name and default route are separate controls. All tabs share a draft; an unsaved Xray test pool can be removed with its dependent balancer. Forms show Save and Discard draft; code tools appear only in Editing.'
            ],
            [
                'انتخاب خودکار در همهٔ قالب‌ها',
                'انتخاب خودکار برای Xray JSON، sing-box، Mihomo، Clash و Stash در دسترس است. sing-box از urltest/selector و کلاینت‌های YAML از url-test/select/fallback/load-balance استفاده می‌کنند. انتخاب UUID، برچسب یا regex با all/random/group و تنظیم نمایانی منابع ممکن است. دسترسی پیش از انتخاب بررسی می‌شود؛ مجموعهٔ خالی به DIRECT تبدیل نمی‌شود. اعضای دستی حفظ می‌شوند. همهٔ زبانه‌ها یک پیش‌نویس دارند؛ مجموعهٔ آزمایشی Xray همراه متعادل‌کنندهٔ وابسته بدون ذخیره قابل حذف است. ابزارهای کد فقط در ویرایش نمایش داده می‌شوند.'
            ],
            [
                '所有可编辑格式的自动选择',
                'Xray JSON、sing-box、Mihomo、Clash 和 Stash 均提供自动选择。sing-box 使用 urltest/selector；YAML 客户端使用 url-test/select/fallback/load-balance。组可按 UUID、标签或正则筛选，设置 all/random/group 和来源可见性。先检查权限；显式空池不会变成 DIRECT。手动成员保留。所有标签页共享草稿；未保存的 Xray 测试池可连同专用均衡器一起删除。表单显示保存和放弃草稿，代码工具仅在编辑页显示。'
            ]
        ]
    ],
    [
        'templates-geofiles',
        [
            [
                'Библиотека geofiles',
                'В Готовых наборах доступны опубликованные GeoIP/GeoSite V2Fly и MetaCubeX; импорт использует ту же проверку HTTPS и содержимого, не включает правила автоматически. Для файла с ПК нажмите «Нажмите, чтобы загрузить». На вкладке Геофайлы загрузите файл с компьютера или по прямой HTTPS-ссылке, укажите имя и формат. Выберите готовый файл из общей библиотеки, добавьте в шаблон, для DAT выберите категории и явно задайте DIRECT, REJECT или группу. Можно использовать несколько файлов и повторно привязывать один файл. DAT превращается в нативные правила на сервере; JSON/SRS sing-box и YAML/text Mihomo выдаются по URL через rule_set/rule-providers. Clash/Stash поддерживают YAML payload. Существующие настройки сохраняются. Для применения сохраните шаблон и обновите подписку. Файлы публичны по ссылке: не загружайте секреты. До 32 файлов по 64 MiB, текст до 8 MiB; локальные адреса, архивы и неподходящий контент отклоняются. Библиотека в backups/geofiles сохраняется в томе, но не входит в резервную копию только БД. Старой версии истории после удаления файла может потребоваться новая привязка.'
            ],
            [
                'Geofiles library',
                'Ready-made datasets include published V2Fly and MetaCubeX GeoIP/GeoSite. Import uses the same HTTPS and content checks and never enables rules automatically. Use Click to upload for a local file. In Geofiles, upload from your computer or import a direct HTTPS URL, with a name and content format. Select a library item, attach it, select DAT categories and explicitly choose DIRECT, REJECT or a group. Multiple files and reuse across templates are supported. DAT becomes native rules on the server; sing-box JSON/SRS and Mihomo YAML/text use remote rule_set/rule-providers. Clash/Stash support YAML payload. Existing settings remain intact. Save the template and refresh the subscription to apply. File URLs are public: never upload secrets. Up to 32 files of 64 MiB, text up to 8 MiB; local addresses, archives and unrelated content are rejected. Preserve backups/geofiles when migrating: database-only backups exclude binary files. Historical versions may require reattachment after a file is deleted.'
            ],
            [
                'کتابخانهٔ فایل‌های جغرافیایی',
                'مجموعه‌های آماده شامل GeoIP/GeoSite منتشرشدهٔ V2Fly و MetaCubeX هستند. وارد کردن همان بررسی HTTPS و محتوا را دارد و قانونی را خودکار فعال نمی‌کند. برای فایل محلی «برای بارگذاری کلیک کنید» را بزنید. در فایل‌های جغرافیایی از رایانه یا نشانی مستقیم HTTPS با نام و قالب محتوا بارگذاری کنید. فایل کتابخانه را به قالب اضافه کرده، دسته‌های DAT و عمل DIRECT، REJECT یا گروه را مشخص کنید. چند فایل و استفادهٔ دوباره ممکن است. DAT روی سرور به قوانین بومی تبدیل می‌شود؛ JSON/SRS در sing-box و YAML/text در Mihomo از rule_set/rule-providers راه دور استفاده می‌کنند. Clash/Stash از YAML payload پشتیبانی می‌کنند. قالب را ذخیره و اشتراک را تازه کنید. نشانی فایل عمومی است؛ اسرار بارگذاری نکنید. حداکثر ۳۲ فایل 64 MiB و متن 8 MiB؛ نشانی محلی، آرشیو و محتوای نامناسب رد می‌شود. برای انتقال، backups/geofiles را جداگانه حفظ کنید؛ پشتیبان فقط پایگاه داده شامل فایل‌ها نیست.'
            ],
            [
                '地理文件库',
                '现成数据集提供已发布的 V2Fly 和 MetaCubeX GeoIP/GeoSite；导入同样检查 HTTPS 和内容，不会自动启用规则。本地文件可点击“点击上传”。在地理文件页从电脑上传或通过直接 HTTPS 链接导入，填写名称和内容格式。选择库中已有文件并附加到模板，选择 DAT 分类及 DIRECT、REJECT 或组。支持多个文件和跨模板复用。DAT 在服务器端转换为原生规则；sing-box JSON/SRS 和 Mihomo YAML/text 通过远程 rule_set/rule-providers 提供。Clash/Stash 支持 YAML payload。保存模板并刷新订阅后生效。文件链接公开，请勿上传秘密。最多 32 个 64 MiB 文件，文本最多 8 MiB；拒绝本地地址、压缩包和不相关内容。迁移时另行保留 backups/geofiles，数据库备份不包含二进制文件。删除文件后，历史版本可能需要重新绑定。'
            ]
        ]
    ]
)
sections.push([
    'templates-priority',
    [
        [
            'Приоритет и резервные серверы',
            'Стратегия «По приоритету: первый доступный» выбирает первый работающий сервер. Для точного порядка выберите Хосты и Все выбранные хосты, затем переставьте их стрелками. Префиксы нескольких пулов также можно упорядочить в балансере. Теги и regex используют порядок общего списка хостов; случайные режимы сначала выбирают подмножество. Переключение и возврат на основной происходят после проверок доступности и затрагивают новые соединения; открытые соединения не переносятся. Xray JSON преобразуется при выдаче в стандартные leastPing-балансеры с одним кандидатом и цепочку Loopback. До первой успешной проверки и при отказе всех серверов соединение блокируется. Явный fallbackTag используется последним. При выборе приоритета GUI убирает автоматически заданный резерв на тот же пул; собственный резерв сохраняет. Параметры проверок сохраняются. Предел — 128 кандидатов на балансер и 256 на конфигурацию. Routing script и конфликтующие общие селекторы других балансеров несовместимы. В Mihomo/Clash/Stash используется native fallback с порядком proxies: явные участники из кода идут до пула. sing-box не поддерживает автоматический строгий приоритет в конфигурации; его selector ручной, URLTest выбирает по задержке. Нужна полная JSON/YAML-подписка.'
        ],
        [
            'Priority and backup servers',
            'Priority: first available selects the first working server. For an exact order, choose Hosts and All selected hosts, then reorder them with the arrows. Multiple pool prefixes can also be reordered in the balancer. Tags and regex follow the main host list; random modes select a subset first. Failover and return to the primary follow health checks and affect new connections; existing connections are not migrated. Xray JSON is rendered as standard single-candidate leastPing balancers with a Loopback chain. Connections are blocked before the first successful probe and when every server is unavailable. An explicit fallbackTag is used last. Selecting priority in the GUI removes the generated fallback to the same pool and preserves custom fallbacks. Probe settings are preserved. Limits: 128 candidates per balancer and 256 per configuration. Routing scripts and conflicting broad selectors of other balancers are incompatible. Mihomo/Clash/Stash use native fallback in proxies order: explicit code members precede pool members. sing-box has no automatic strict priority mode in its configuration; selector is manual and URLTest uses latency. A full JSON/YAML subscription is required.'
        ],
        [
            'اولویت و سرورهای جایگزین',
            'حالت اولویت نخستین سرور سالم را انتخاب می‌کند. برای ترتیب دقیق، میزبان‌ها و همه میزبان‌های انتخاب‌شده را انتخاب و با فلش جابه‌جا کنید. پیشوند چند مخزن نیز در بالانسر مرتب می‌شود. تگ و regex از ترتیب فهرست اصلی استفاده می‌کنند؛ حالت تصادفی ابتدا زیرمجموعه را انتخاب می‌کند. تغییر سرور و بازگشت به اصلی پس از بررسی سلامت است و فقط اتصال جدید را تغییر می‌دهد. Xray JSON هنگام تحویل به بالانسرهای استاندارد leastPing تک‌عضوی و زنجیره Loopback تبدیل می‌شود. پیش از بررسی موفق و با قطع همه سرورها اتصال مسدود می‌شود. fallbackTag صریح در پایان استفاده می‌شود. رابط، جایگزین خودکار همان مخزن را حذف و جایگزین سفارشی را حفظ می‌کند. تنظیمات بررسی حفظ می‌شوند. حد: ۱۲۸ عضو در بالانسر و ۲۵۶ در پیکربندی. routing script و انتخابگر گسترده متداخل سایر بالانسرها سازگار نیستند. Mihomo/Clash/Stash از fallback بومی به ترتیب proxies استفاده می‌کنند؛ اعضای صریح کد قبل از مخزن هستند. sing-box اولویت خودکار دقیق ندارد؛ selector دستی و URLTest بر اساس تأخیر است. اشتراک کامل JSON/YAML لازم است.'
        ],
        [
            '优先级和备用服务器',
            '“按优先级：首个可用服务器”选择第一台健康服务器。需要精确顺序时，选择主机及所有选定主机，再用箭头排序。多个池的前缀也可在均衡器中排序。标签和正则遵循主机总列表顺序，随机模式先选子集。故障切换和恢复主服务器取决于健康检查，仅影响新连接，已有连接不会迁移。Xray JSON 在输出时转换为标准单候选 leastPing 均衡器及 Loopback 链。首次检查成功前或全部服务器不可用时阻断连接，显式 fallbackTag 最后使用。界面会移除指向同一池的自动备用项，保留自定义备用项和检查设置。每个均衡器最多 128 个候选，每份配置最多 256 个。routing script 及其他均衡器冲突的宽泛选择器不兼容。Mihomo/Clash/Stash 使用原生 fallback，遵循 proxies 顺序，代码显式成员在池成员之前。sing-box 配置不支持自动严格优先级，selector 为手动选择，URLTest 按延迟选择。需要完整 JSON/YAML 订阅。'
        ]
    ]
])

sections.push([
    'templates-recipient-outbound',
    [
        [
            'Когда добавлять хост-получатель как proxy',
            'Переключатель «Также добавить хост-получатель как proxy» соответствует remnawave.addVirtualHostAsOutbound. При включении генератор дополнительно строит самостоятельный outbound с тегом proxy из адреса, порта, транспорта и параметров защиты хоста-получателя. Это не обязательное условие автовыбора и не автоматическое включение TLS. Для служебного хоста «Автоматический», представляющего только балансер, оставьте переключатель выключенным. Реальные серверы injectHosts и балансер остаются в конфигурации. Включать нужно лишь для полноценного дополнительного подключения, совместимого с клиентом. Публичный VLESS без TLS/REALITY или VLESS encryption может быть отклонён ядром; Happ iOS при проверке «через прокси» сообщает failed to build outbound config with tag proxy / vless without TLS. Обычная проверка или работа на другом устройстве не доказывает, что этот дополнительный outbound корректен. Если хост служебный — выключите переключатель; если он реальный — исправьте его транспорт и защиту. Сохраните шаблон и обновите подписку в приложении. Сам переключатель не меняет настройки серверов и не устанавливает сертификаты.'
        ],
        [
            'When to add the recipient host as proxy',
            'Also add the recipient host as proxy maps to remnawave.addVirtualHostAsOutbound. When enabled, the generator additionally builds a separate outbound tagged proxy from the recipient host’s address, port, transport and security settings. Autoselect does not require this switch; it does not enable TLS automatically. Leave it off for an Automatic placeholder representing a balancer. Real injectHosts pool members and the balancer remain in the configuration. Enable it only for a real additional connection supported by the client. A core may reject public VLESS without TLS/REALITY or VLESS encryption; Happ iOS proxy-based checks can report failed to build outbound config with tag proxy / vless without TLS. A successful ordinary test or another device does not validate this extra outbound. Disable the switch for a placeholder, or correct transport and security for a real host. Save the template and update the subscription in the app. The switch does not reconfigure servers or install certificates.'
        ],
        [
            'چه زمانی میزبان گیرنده را به‌عنوان proxy اضافه کنیم',
            'کلید افزودن میزبان گیرنده به‌عنوان proxy برابر remnawave.addVirtualHostAsOutbound است. با فعال‌سازی، خروجی مستقلی با تگ proxy از نشانی، درگاه، انتقال و تنظیمات امنیتی میزبان گیرنده ساخته می‌شود. انتخاب خودکار به این کلید نیاز ندارد و TLS خودکار فعال نمی‌شود. برای میزبان نمایشی «خودکار» که تنها نشان‌دهنده متعادل‌کننده است خاموش بماند؛ اعضای واقعی injectHosts و متعادل‌کننده حفظ می‌شوند. فقط برای اتصال اضافی واقعی و سازگار با برنامه فعال کنید. هسته ممکن است VLESS عمومی بدون TLS/REALITY یا VLESS encryption را رد کند؛ آزمون از طریق پروکسی در Happ iOS می‌تواند خطای failed to build outbound config with tag proxy / vless without TLS بدهد. موفقیت آزمون عادی یا دستگاه دیگر درستی این خروجی اضافی را ثابت نمی‌کند. برای میزبان نمایشی کلید را خاموش کنید؛ برای میزبان واقعی انتقال و امنیت را اصلاح کنید. الگو را ذخیره و اشتراک را در برنامه به‌روز کنید. این کلید سرورها را تنظیم و گواهی نصب نمی‌کند.'
        ],
        [
            '何时将接收主机添加为 proxy',
            '“同时将接收主机添加为 proxy”对应 remnawave.addVirtualHostAsOutbound。启用后，生成器根据接收主机的地址、端口、传输和安全设置额外创建一个标签为 proxy 的独立出站。自动选择不要求启用此开关，开关也不会自动启用 TLS。对于仅代表均衡器的“自动”占位主机，请保持关闭；真实的 injectHosts 池成员和均衡器仍会保留。仅当它是客户端支持的额外真实连接时启用。内核可能拒绝未使用 TLS/REALITY 或 VLESS encryption 的公网 VLESS；Happ iOS 的“通过代理”检测可能报告 failed to build outbound config with tag proxy / vless without TLS。普通检测通过或其他设备可用，并不能验证这个额外出站。占位主机应关闭开关，真实主机应修正传输与安全设置，然后保存模板并在应用中更新订阅。此开关不会配置服务器或安装证书。'
        ]
    ]
])

const routeReferenceNotes = {
    ru:
        ' Ссылки правил на выходы и балансеры проверяются также при сохранении через API. Несуществующее имя не подменяется DIRECT или другим маршрутом: текст редактора сохраняется как черновик с точным путём ошибки, а рабочий шаблон остаётся прежним. Имена, получаемые из названий или тегов хостов, окончательно определяются при формировании подписки.' +
        ' Если при выдаче ссылка перестала существовать после изменения состава или видимости пула, профиль исключается целиком; другие рабочие профили остаются доступны. В предпросмотре устройства администратор увидит причину. Для балансировки используйте balancerTag, а outboundTag с номером участника — только когда этот участник действительно присутствует. Если все профили некорректны, сохраняется 503. Ошибки прав, хранилища, размеров и компиляции не скрываются.',
    en:
        ' Rule references to outbounds and balancers are also checked on API saves. An unknown name is not replaced with DIRECT or another route: editor text is kept as a draft with the exact error path while the live template remains unchanged. Names derived from host remarks or tags are resolved when generating the subscription.' +
        ' If pool membership or visibility changes leave a route unresolved, its complete profile is omitted while other valid profiles remain available. Administrator device preview shows the reason. Use balancerTag for balancing; a numbered outboundTag requires that exact member to exist. If every profile is invalid, the response remains 503. Authorization, storage, size and compilation failures are not suppressed.',
    fa:
        ' ارجاع قوانین به خروجی‌ها و متعادل‌کننده‌ها هنگام ذخیره از API نیز بررسی می‌شود. نام ناموجود با DIRECT یا مسیر دیگری جایگزین نمی‌شود: متن ویرایشگر با مسیر دقیق خطا به‌عنوان پیش‌نویس ذخیره می‌شود و قالب فعال تغییر نمی‌کند. نام‌های برگرفته از عنوان یا تگ میزبان هنگام تولید اشتراک تعیین می‌شوند.' +
        ' اگر تغییر اعضا یا نمایش مجموعه ارجاع مسیر را نامعتبر کند، کل همان پروفایل حذف می‌شود و پروفایل‌های سالم باقی می‌مانند. پیش‌نمایش دستگاه مدیر علت را نشان می‌دهد. برای توزیع از balancerTag استفاده کنید؛ outboundTag شماره‌دار به وجود همان عضو نیاز دارد. اگر همه پروفایل‌ها نامعتبر باشند، پاسخ 503 باقی می‌ماند. خطای مجوز، ذخیره‌سازی، حجم و کامپایل پنهان نمی‌شود.',
    zh:
        ' 通过 API 保存时也会检查规则引用的出站和均衡器。不存在的名称不会被替换为 DIRECT 或其他路由：编辑器文本作为草稿保留并显示准确的错误路径，生效模板保持不变。由主机备注或标签生成的名称在生成订阅时确定。' +
        ' 若池成员或可见性变化导致路由引用失效，会排除整份受影响配置，其余有效配置仍可获取。管理员可在设备预览中查看原因。负载均衡应使用 balancerTag；带编号的 outboundTag 要求对应成员实际存在。全部配置无效时仍返回 503，不会隐藏权限、存储、大小或编译错误。'
}

const observerNotes = {
    ru: 'Для «Наиболее стабильного соединения», а также «По очереди» и «Случайного подключения» с резервным выходом нужны HTTP-проверки. Панель добавляет отсутствующие проверки, сохраняя выбранную стратегию и пользовательский адрес проверки. Обычные round-robin/random без резервного выхода не получают дополнительных запросов. Недоступный сайт проверки может сделать рабочий сервер недоступным для выбора.',
    en: 'Least load, and round robin or random with a fallback outbound, require HTTP observations. The panel supplies missing probes while preserving the selected strategy and custom probe address. Plain round-robin/random without a fallback do not gain extra requests. An unreachable probe site can exclude an otherwise working server.',
    fa: 'حالت پایدارترین اتصال و همچنین حالت چرخشی یا تصادفی همراه خروجی پشتیبان به پایش HTTP نیاز دارند. پنل پایش غایب را با حفظ راهبرد و نشانی دلخواه اضافه می‌کند. حالت چرخشی یا تصادفی بدون خروجی پشتیبان درخواست اضافه ندارد. در دسترس نبودن سایت بررسی می‌تواند سرور سالم را از انتخاب خارج کند.',
    zh: '最低负载模式以及带备用出站的轮询或随机模式需要 HTTP 观测。面板会补全缺失的探测，同时保留所选策略和自定义探测地址。不带备用出站的普通轮询或随机模式不会增加请求。探测网站不可达可能使正常服务器被排除。'
}

const orderNotes = {
    ru: 'Порядок серверов настраивается в отдельном окне кнопкой «Порядок серверов»: стрелки меняют позиции, длинный список разбит на страницы. Для точного порядка отдельных серверов выберите хосты и все выбранные хосты. «По очереди» распределяет новые соединения по кругу; это не резервирование до отказа первого сервера. Для такого поведения выберите «По приоритету: первый доступный». Явно настроенный порядок round-robin сохраняется и после сортировки тегов ядром. До 128 участников одного балансера и 256 на конфигурацию. После изменения сохраните шаблон и обновите подписку.',
    en: 'Use Server order to open the ordering dialog. Arrows move members and long lists are paginated. Select explicit hosts and all selected hosts for precise per-server order. Round robin rotates new connections; it does not retain the first server until failure. Use Priority: first available for failover. Explicit round-robin order is retained after native tag sorting, with up to 128 members per balancer and 256 per configuration. Save the template and refresh the subscription after changing the order.',
    fa: 'با دکمه «ترتیب سرورها» پنجره تنظیم ترتیب را باز کنید. پیکان‌ها ترتیب را تغییر می‌دهند و فهرست بلند صفحه‌بندی می‌شود. برای ترتیب دقیق، میزبان‌های مشخص و همه میزبان‌های انتخاب‌شده را برگزینید. حالت چرخشی اتصال‌های جدید را بین سرورها پخش می‌کند؛ برای استفاده از سرور اول تا زمان قطع، حالت اولین سرور در دسترس را انتخاب کنید. ترتیب صریح چرخشی پس از مرتب‌سازی تگ‌های هسته حفظ می‌شود؛ حداکثر ۱۲۸ عضو در هر متعادل‌ساز و ۲۵۶ عضو در هر پیکربندی. الگو را ذخیره و اشتراک را به‌روز کنید.',
    zh: '点击“服务器顺序”在独立窗口调整顺序，使用箭头移动成员，长列表分页显示。若需精确的服务器顺序，请选择具体主机及全部已选主机。轮询会循环分配新连接；若只想在前一台不可用时切换，请选择“优先级：首个可用”。显式轮询顺序在内核排序标签后仍保持，每个均衡器最多 128 个成员，每个配置最多 256 个。修改后保存模板并刷新订阅。'
}

export function explainAutoselect(articles) {
    const template = articles.find((article) => article.id === 'templates')
    for (const [id, translations] of sections)
        template.sections.push({
            id,
            ...Object.fromEntries(
                ['ru', 'en', 'fa', 'zh'].map((language, index) => [
                    language,
                    {
                        title: translations[index][0],
                        body:
                            translations[index][1] +
                            (id === 'templates-autoselect' ? addressFamilyNotes[language] : '') +
                            (id === 'templates-assignments'
                                ? routeReferenceNotes[language] +
                                  assignmentMeaning[language] +
                                  assignedProfileNotes[language]
                                : '') +
                            (id === 'templates-priority' ? '\n\n' + orderNotes[language] : '') +
                            (id === 'templates-http-response-time'
                                ? '\n\n' + observerNotes[language]
                                : '')
                    }
                ])
            )
        })
}
