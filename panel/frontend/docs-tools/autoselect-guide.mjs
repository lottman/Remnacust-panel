const sections = [
    [
        'templates-autoselect',
        [
            [
                'Автовыбор в коде и интерфейсе',
                'В редакторе Xray JSON вкладки Редактирование и Автовыбор используют общий черновик. Изменение существующего пула или балансера сразу меняет соответствующий JSON. Новый пул добавляет injectHosts, балансер, правило маршрутизации и наблюдение для leastPing или leastLoad. Остальные аутбаунды, правила и настройки сохраняются. Справа отображаются отличия от последнего сохранения; на телефоне список расположен под формой. Сохранение применяет корректный черновик; текст с ошибками сохраняется на сервере с предупреждением и доступен в истории.'
            ],
            [
                'Autoselect in code and UI',
                'The Xray JSON Editing and Autoselect tabs share one draft. Editing an existing pool or balancer immediately updates its JSON. A new pool adds injectHosts, a balancer, routing and observation for leastPing or leastLoad. Other outbounds, rules and settings remain intact. The changes panel compares against the last save; on phones it appears below the form. Save publishes a valid draft; text with errors is saved on the server with warnings and remains available in history.'
            ],
            [
                'انتخاب خودکار در کد و رابط',
                'زبانه‌های ویرایش و انتخاب خودکار Xray JSON یک پیش‌نویس مشترک دارند. تغییر مجموعه یا متعادل‌کنندهٔ موجود بلافاصله JSON مربوط را تغییر می‌دهد. مجموعهٔ جدید injectHosts، متعادل‌کننده، مسیریابی و پایش leastPing یا leastLoad را اضافه می‌کند. خروجی‌ها، قوانین و تنظیمات دیگر حفظ می‌شوند. تغییرات نسبت به آخرین ذخیره در کنار فرم و روی تلفن زیر فرم دیده می‌شود. ذخیره پیش‌نویس معتبر را اعمال می‌کند؛ متن دارای خطا روی سرور با هشدار ذخیره و در تاریخچه نگه داشته می‌شود.'
            ],
            [
                '代码和界面中的自动选择',
                'Xray JSON 的编辑和自动选择标签页共享同一草稿。修改现有池或均衡器会立即更新对应 JSON。新池添加 injectHosts、均衡器、路由及 leastPing 或 leastLoad 所需的观测。其他出站、规则和设置保留。更改面板与上次保存内容比较，在手机上位于表单下方。保存会应用有效草稿；含错误的文本会带警告保存在服务器和历史记录中。'
            ]
        ]
    ],
    [
        'templates-selection-modes',
        [
            [
                'Пулы хостов и теги',
                'selector.type поддерживает uuids, tags с точным совпадением, tagRegex, remarkRegex и sameTagAsRecipient. Все способы поддерживают all/random/group; у tags группы содержат теги, у остальных — UUID хостов после фильтрации. mode all добавляет все доступные источники, random выбирает не более selector.expected уникальных хостов, group выбирает одну непустую доступную группу из selector.groups. Группы задаются объектом с именами или массивом массивов. Без mode работает прежний all; без selectFrom выбираются скрытые хосты. Доступ, видимость, ограничения и исключения проверяются до выбора. Случайный набор выбирается при каждой выдаче подписки, а не при VPN-подключении. Если явный режим не нашёл источников, профиль не выдаётся.'
            ],
            [
                'Host pools and tags',
                'selector.type supports uuids, exact tags, tagRegex, remarkRegex and sameTagAsRecipient. All support all/random/group; tag groups contain tags, other groups contain eligible host UUIDs. mode all injects all eligible sources, random selects at most selector.expected unique hosts, and group chooses one nonempty eligible group from selector.groups. Groups can be a named object or an array of arrays. Missing mode keeps legacy all; missing selectFrom selects hidden hosts. Access, visibility, limits and exclusions are checked before selection. Sampling occurs when a subscription is generated, not for each VPN connection. A profile with an explicit mode and no eligible sources is omitted.'
            ],
            [
                'مجموعهٔ میزبان و برچسب‌ها',
                'selector.type از uuids، برچسب دقیق tags، tagRegex، remarkRegex و sameTagAsRecipient پشتیبانی می‌کند. همهٔ روش‌ها all/random/group را می‌پذیرند؛ گروه‌های tags شامل برچسب و گروه‌های دیگر شامل UUID میزبان‌های مجاز هستند. all همهٔ منابع مجاز را اضافه می‌کند، random حداکثر selector.expected میزبان یکتا و group یک گروه مجاز غیرخالی از selector.groups را انتخاب می‌کند. گروه‌ها شیء نام‌دار یا آرایهٔ آرایه‌ها هستند. نبود mode رفتار قبلی all و نبود selectFrom میزبان‌های مخفی را حفظ می‌کند. دسترسی، نمایش، محدودیت‌ها و استثناها پیش از انتخاب بررسی می‌شوند. انتخاب در زمان تولید اشتراک است، نه هر اتصال VPN. پروفایل با حالت صریح و بدون منبع مجاز حذف می‌شود.'
            ],
            [
                '主机池和标签',
                'selector.type 支持 uuids、精确标签 tags、tagRegex、remarkRegex 和 sameTagAsRecipient。所有方式均支持 all/random/group；tags 分组包含标签，其他分组包含筛选后的主机 UUID。all 注入所有符合条件的来源，random 最多选择 selector.expected 个不重复主机，group 从 selector.groups 选择一个非空且符合条件的组。组可以是命名对象或二维数组。省略 mode 保持旧版 all；省略 selectFrom 选择隐藏主机。访问权限、可见性、限制和排除在选择前检查。随机选择在生成订阅时发生，而非每次 VPN 连接。显式模式没有可用来源时省略该配置。'
            ]
        ]
    ],
    [
        'templates-assignments',
        [
            [
                'Назначение и балансировка',
                'remnawave.assignTo.hosts назначает шаблон хостам, assignTo.tags — получателям с указанными тегами, включая будущие хосты. Приоритет: явный шаблон в карточке хоста, назначение UUID в шаблоне, затем назначение по тегу. При конфликте выигрывает первый шаблон по порядку в списке. Эти назначения не расширяют доступ пользователя. Клиентский балансер работает только с уже выбранными аутбаундами: random, roundRobin, leastPing или leastLoad. Для двух последних нужно наблюдение; random и roundRobin не требуют проверок. GUI leastLoad показывает текущие expected, tolerance, baselines и maxRTT; остальные поля сохраняются. fallbackTag задаёт резервный аутбаунд.'
            ],
            [
                'Assignment and balancing',
                'remnawave.assignTo.hosts assigns the template to recipient hosts; assignTo.tags also covers future recipients with those tags. Priority is the host card’s explicit template, then template UUID assignment, then tag assignment. Conflicts use the first template in list order. Assignments never expand user access. The client balancer uses already selected outbounds: random, roundRobin, leastPing or leastLoad. The last two need observation; random and roundRobin do not. The leastLoad GUI edits current expected, tolerance, baselines and maxRTT without replacing other fields. fallbackTag specifies a fallback outbound.'
            ],
            [
                'انتساب و متعادل‌سازی',
                'remnawave.assignTo.hosts الگو را به میزبان‌های گیرنده و assignTo.tags به گیرنده‌های دارای برچسب، از جمله میزبان‌های آینده، نسبت می‌دهد. اولویت با الگوی صریح کارت میزبان، سپس انتساب UUID و سپس برچسب است. در تعارض اولین الگوی فهرست برنده است. انتساب دسترسی کاربر را گسترش نمی‌دهد. متعادل‌کنندهٔ کلاینت از خروجی‌های انتخاب‌شده با random، roundRobin، leastPing یا leastLoad استفاده می‌کند. دو مورد آخر پایش می‌خواهند؛ random و roundRobin به پایش نیاز ندارند. رابط leastLoad مقادیر فعلی expected، tolerance، baselines و maxRTT را تغییر می‌دهد و فیلدهای دیگر را حفظ می‌کند. fallbackTag خروجی جایگزین را مشخص می‌کند.'
            ],
            [
                '分配与均衡',
                'remnawave.assignTo.hosts 将模板分配给接收主机；assignTo.tags 也适用于以后具有这些标签的主机。优先级为主机卡片的显式模板、模板中的 UUID 分配、标签分配。冲突时采用列表中最靠前的模板。分配不会扩大用户访问权限。客户端均衡器仅使用已选出站，支持 random、roundRobin、leastPing 和 leastLoad。后两者需要观测；random 和 roundRobin 不需要探测。leastLoad 界面编辑当前 expected、tolerance、baselines 和 maxRTT，并保留其他字段。fallbackTag 指定备用出站。'
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

export function explainAutoselect(articles) {
    const template = articles.find((article) => article.id === 'templates')
    for (const [id, translations] of sections)
        template.sections.push({
            id,
            ...Object.fromEntries(
                ['ru', 'en', 'fa', 'zh'].map((language, index) => [
                    language,
                    { title: translations[index][0], body: translations[index][1] }
                ])
            )
        })
}
