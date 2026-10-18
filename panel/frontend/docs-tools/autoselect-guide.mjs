const sections = [
  [
    "templates-autoselect",
    [
      [
        "Автовыбор в коде и интерфейсе",
        "В редакторе Xray JSON вкладки Редактирование и Автовыбор используют общий черновик. Изменение существующего пула или балансера сразу меняет соответствующий JSON. Новый пул добавляет injectHosts, балансер, правило маршрутизации и наблюдение для leastPing или leastLoad. Остальные аутбаунды, правила и настройки сохраняются. Справа отображаются отличия от последнего сохранения; на телефоне список расположен под формой. Сохранение применяет весь черновик."
      ],
      [
        "Autoselect in code and UI",
        "The Xray JSON Editing and Autoselect tabs share one draft. Editing an existing pool or balancer immediately updates its JSON. A new pool adds injectHosts, a balancer, routing and observation for leastPing or leastLoad. Other outbounds, rules and settings remain intact. The changes panel compares against the last save; on phones it appears below the form. Save applies the entire draft."
      ],
      [
        "انتخاب خودکار در کد و رابط",
        "زبانه‌های ویرایش و انتخاب خودکار Xray JSON یک پیش‌نویس مشترک دارند. تغییر مجموعه یا متعادل‌کنندهٔ موجود بلافاصله JSON مربوط را تغییر می‌دهد. مجموعهٔ جدید injectHosts، متعادل‌کننده، مسیریابی و پایش leastPing یا leastLoad را اضافه می‌کند. خروجی‌ها، قوانین و تنظیمات دیگر حفظ می‌شوند. تغییرات نسبت به آخرین ذخیره در کنار فرم و روی تلفن زیر فرم دیده می‌شود. ذخیره کل پیش‌نویس را اعمال می‌کند."
      ],
      [
        "代码和界面中的自动选择",
        "Xray JSON 的编辑和自动选择标签页共享同一草稿。修改现有池或均衡器会立即更新对应 JSON。新池添加 injectHosts、均衡器、路由及 leastPing 或 leastLoad 所需的观测。其他出站、规则和设置保留。更改面板与上次保存内容比较，在手机上位于表单下方。保存会应用整个草稿。"
      ]
    ]
  ],
  [
    "templates-selection-modes",
    [
      [
        "Пулы хостов и теги",
        "selector.type поддерживает uuids, tags с точным совпадением, tagRegex, remarkRegex и sameTagAsRecipient. Все способы поддерживают all/random/group; у tags группы содержат теги, у остальных — UUID хостов после фильтрации. mode all добавляет все доступные источники, random выбирает не более selector.expected уникальных хостов, group выбирает одну непустую доступную группу из selector.groups. Группы задаются объектом с именами или массивом массивов. Без mode работает прежний all; без selectFrom выбираются скрытые хосты. Доступ, видимость, ограничения и исключения проверяются до выбора. Случайный набор выбирается при каждой выдаче подписки, а не при VPN-подключении. Если явный режим не нашёл источников, профиль не выдаётся."
      ],
      [
        "Host pools and tags",
        "selector.type supports uuids, exact tags, tagRegex, remarkRegex and sameTagAsRecipient. All support all/random/group; tag groups contain tags, other groups contain eligible host UUIDs. mode all injects all eligible sources, random selects at most selector.expected unique hosts, and group chooses one nonempty eligible group from selector.groups. Groups can be a named object or an array of arrays. Missing mode keeps legacy all; missing selectFrom selects hidden hosts. Access, visibility, limits and exclusions are checked before selection. Sampling occurs when a subscription is generated, not for each VPN connection. A profile with an explicit mode and no eligible sources is omitted."
      ],
      [
        "مجموعهٔ میزبان و برچسب‌ها",
        "selector.type از uuids، برچسب دقیق tags، tagRegex، remarkRegex و sameTagAsRecipient پشتیبانی می‌کند. همهٔ روش‌ها all/random/group را می‌پذیرند؛ گروه‌های tags شامل برچسب و گروه‌های دیگر شامل UUID میزبان‌های مجاز هستند. all همهٔ منابع مجاز را اضافه می‌کند، random حداکثر selector.expected میزبان یکتا و group یک گروه مجاز غیرخالی از selector.groups را انتخاب می‌کند. گروه‌ها شیء نام‌دار یا آرایهٔ آرایه‌ها هستند. نبود mode رفتار قبلی all و نبود selectFrom میزبان‌های مخفی را حفظ می‌کند. دسترسی، نمایش، محدودیت‌ها و استثناها پیش از انتخاب بررسی می‌شوند. انتخاب در زمان تولید اشتراک است، نه هر اتصال VPN. پروفایل با حالت صریح و بدون منبع مجاز حذف می‌شود."
      ],
      [
        "主机池和标签",
        "selector.type 支持 uuids、精确标签 tags、tagRegex、remarkRegex 和 sameTagAsRecipient。所有方式均支持 all/random/group；tags 分组包含标签，其他分组包含筛选后的主机 UUID。all 注入所有符合条件的来源，random 最多选择 selector.expected 个不重复主机，group 从 selector.groups 选择一个非空且符合条件的组。组可以是命名对象或二维数组。省略 mode 保持旧版 all；省略 selectFrom 选择隐藏主机。访问权限、可见性、限制和排除在选择前检查。随机选择在生成订阅时发生，而非每次 VPN 连接。显式模式没有可用来源时省略该配置。"
      ]
    ]
  ],
  [
    "templates-assignments",
    [
      [
        "Назначение и балансировка",
        "remnawave.assignTo.hosts назначает шаблон хостам, assignTo.tags — получателям с указанными тегами, включая будущие хосты. Приоритет: явный шаблон в карточке хоста, назначение UUID в шаблоне, затем назначение по тегу. При конфликте выигрывает первый шаблон по порядку в списке. Эти назначения не расширяют доступ пользователя. Клиентский балансер работает только с уже выбранными аутбаундами: random, roundRobin, leastPing или leastLoad. Для двух последних нужно наблюдение; random и roundRobin не требуют проверок. GUI leastLoad показывает текущие expected, tolerance, baselines и maxRTT; остальные поля сохраняются. fallbackTag задаёт резервный аутбаунд."
      ],
      [
        "Assignment and balancing",
        "remnawave.assignTo.hosts assigns the template to recipient hosts; assignTo.tags also covers future recipients with those tags. Priority is the host card’s explicit template, then template UUID assignment, then tag assignment. Conflicts use the first template in list order. Assignments never expand user access. The client balancer uses already selected outbounds: random, roundRobin, leastPing or leastLoad. The last two need observation; random and roundRobin do not. The leastLoad GUI edits current expected, tolerance, baselines and maxRTT without replacing other fields. fallbackTag specifies a fallback outbound."
      ],
      [
        "انتساب و متعادل‌سازی",
        "remnawave.assignTo.hosts الگو را به میزبان‌های گیرنده و assignTo.tags به گیرنده‌های دارای برچسب، از جمله میزبان‌های آینده، نسبت می‌دهد. اولویت با الگوی صریح کارت میزبان، سپس انتساب UUID و سپس برچسب است. در تعارض اولین الگوی فهرست برنده است. انتساب دسترسی کاربر را گسترش نمی‌دهد. متعادل‌کنندهٔ کلاینت از خروجی‌های انتخاب‌شده با random، roundRobin، leastPing یا leastLoad استفاده می‌کند. دو مورد آخر پایش می‌خواهند؛ random و roundRobin به پایش نیاز ندارند. رابط leastLoad مقادیر فعلی expected، tolerance، baselines و maxRTT را تغییر می‌دهد و فیلدهای دیگر را حفظ می‌کند. fallbackTag خروجی جایگزین را مشخص می‌کند."
      ],
      [
        "分配与均衡",
        "remnawave.assignTo.hosts 将模板分配给接收主机；assignTo.tags 也适用于以后具有这些标签的主机。优先级为主机卡片的显式模板、模板中的 UUID 分配、标签分配。冲突时采用列表中最靠前的模板。分配不会扩大用户访问权限。客户端均衡器仅使用已选出站，支持 random、roundRobin、leastPing 和 leastLoad。后两者需要观测；random 和 roundRobin 不需要探测。leastLoad 界面编辑当前 expected、tolerance、baselines 和 maxRTT，并保留其他字段。fallbackTag 指定备用出站。"
      ]
    ]
  ],
  [
    "templates-history",
    [
      [
        "История и восстановление",
        "Для Xray JSON, Singbox, Mihomo, Clash и Stash сохраняются последние 30 версий. Обновление базы сохраняет существующий код как первую версию. История показывает дату и сравнение выбранной версии с текущим черновиком. Открыть в редакторе восстанавливает весь код, включая автовыбор, балансеры и назначения. Несохранённый черновик заменяется только после предупреждения. Сохранение создаёт новую версию, поэтому восстановление тоже можно отменить. История сохраняется вместе с изменением кода в одной транзакции."
      ],
      [
        "History and recovery",
        "Xray JSON, Singbox, Mihomo, Clash and Stash retain the last 30 saved versions. The database upgrade preserves existing code as the first version. History shows dates and a comparison with the current draft. Open in editor restores all code, including autoselect, balancers and assignments. Replacing an unsaved draft requires confirmation. Saving creates a new version, so a restore can itself be undone. An unsuccessful save changes neither code nor history."
      ],
      [
        "تاریخچه و بازیابی",
        "Xray JSON، Singbox، Mihomo، Clash و Stash آخرین ۳۰ نسخهٔ ذخیره‌شده را نگه می‌دارند. ارتقای پایگاه داده کد فعلی را به عنوان نسخهٔ اول حفظ می‌کند. تاریخچه زمان و مقایسه با پیش‌نویس فعلی را نشان می‌دهد. باز کردن در ویرایشگر همهٔ کد شامل انتخاب خودکار، متعادل‌کننده‌ها و انتساب را بازیابی می‌کند. جایگزینی پیش‌نویس ذخیره‌نشده تأیید می‌خواهد. ذخیره نسخهٔ جدید می‌سازد تا بازیابی نیز قابل بازگشت باشد. کد و تاریخچه در یک تراکنش ذخیره می‌شوند."
      ],
      [
        "历史与恢复",
        "Xray JSON、Singbox、Mihomo、Clash 和 Stash 保留最近 30 个已保存版本。数据库升级将现有代码保留为首个版本。历史显示日期和与当前草稿的比较。在编辑器中打开会恢复全部代码，包括自动选择、均衡器和分配。替换未保存草稿前需要确认。保存会创建新版本，因此恢复操作本身也可以撤销。代码与历史在同一事务中保存。"
      ]
    ]
  ]
]
export function explainAutoselect(articles) {
 const template = articles.find(article => article.id === 'templates')
 for (const [id, translations] of sections) template.sections.push({ id,
  ...Object.fromEntries(['ru','en','fa','zh'].map((language, index) => [language, { title: translations[index][0], body: translations[index][1] }]))
 })
}
