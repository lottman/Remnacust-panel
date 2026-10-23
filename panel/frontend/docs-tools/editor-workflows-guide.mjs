const additions = [
    [
        'templates',
        'templates-saved-drafts',
        [
            [
                'Сохранение с предупреждениями',
                'Кнопка Сохранить доступна даже при ошибках JSON/YAML, пустой выборке хостов и незаполненном действии geofiles. Ошибочный текст сохраняется на сервере как черновик и попадает в историю; после перезагрузки открывается этот же текст. Подписки используют последнюю рабочую конфигурацию. Исправьте предупреждения и сохраните снова: корректная версия заменит рабочую и очистит черновик. Ошибка сети или БД не считается успешным сохранением.'
            ],
            [
                'Saving with warnings',
                'Save remains available for invalid JSON/YAML, empty host selections and incomplete geofile actions. Text with errors is saved on the server as a draft and included in history; reopening restores the same text. Subscriptions keep the last working configuration. Fix the warnings and save again: valid content replaces the working version and clears the draft. Network and database failures are not reported as successful saves.'
            ],
            [
                'ذخیره با هشدار',
                'ذخیره برای JSON/YAML نامعتبر، انتخاب خالی میزبان و عمل ناقص فایل جغرافیایی در دسترس است. متن دارای خطا به‌عنوان پیش‌نویس روی سرور و در تاریخچه ذخیره می‌شود و پس از بازگشایی همان متن نمایش داده می‌شود. اشتراک‌ها آخرین پیکربندی سالم را نگه می‌دارند. هشدارها را رفع و دوباره ذخیره کنید تا نسخه سالم اعمال و پیش‌نویس پاک شود. خطای شبکه یا پایگاه داده ذخیره موفق محسوب نمی‌شود.'
            ],
            [
                '带警告保存',
                '即使 JSON/YAML 无效、未选择主机或地理文件操作未填写，仍可保存。含错误的文本会作为草稿保存在服务器和历史记录中，重新打开时恢复相同文本。订阅继续使用上一份可用配置。修复警告并再次保存后，有效内容会替换工作版本并清除草稿。网络或数据库错误不会被报告为保存成功。'
            ]
        ]
    ],
    [
        'templates',
        'templates-unified-autoselect',
        [
            [
                'Автовыбор и балансировка в одной карточке',
                'Источники хостов и связанная стратегия находятся в общем блоке. Пулы с общим балансером объединены; ручные балансеры остаются видимыми. Удаление блока убирает его источники и балансеры со связанными правилами, сохраняя независимые группы и ручные outbounds. leastLoad.expected задаёт количество выбираемых нод; tolerance — долю неудачных проверок от 0 до 1: 0.01 означает 1%, а 2 не означает две ноды. Xray ограничивает конечное числовое значение вне диапазона до 0–1; такой шаблон применяется с предупреждением и сохраняет исходное число. Новый пул сразу получает доступные для формата включённые хосты по UUID. Если хостов нет, настройка остаётся черновиком до выбора источников.'
            ],
            [
                'Host selection and balancing in one card',
                'Host sources and their strategy share one block. Pools using a shared balancer are grouped together; manual balancers remain visible. Deleting the block removes its sources, balancers and linked rules while retaining independent groups and manual outbounds. leastLoad.expected is the selected node count; tolerance is the allowed failed probe fraction from 0 to 1: 0.01 means 1%, and 2 does not mean two nodes. Xray clamps finite numeric values outside the range to 0–1; such templates apply with a warning while retaining the original number. New pools start with enabled hosts supported by the format, selected by UUID. With no eligible hosts, the setup remains a draft until sources are selected.'
            ],
            [
                'انتخاب میزبان و توزیع بار در یک کارت',
                'منابع میزبان و راهبرد مرتبط در یک بخش قرار دارند. مجموعه‌های دارای متعادل‌کننده مشترک کنار هم هستند و متعادل‌کننده‌های دستی نیز دیده می‌شوند. حذف بخش، منابع و متعادل‌کننده‌ها و قوانین مرتبط را حذف می‌کند و گروه‌ها و خروجی‌های مستقل را نگه می‌دارد. leastLoad.expected تعداد نودهای منتخب و tolerance نسبت شکست از 0 تا 1 است؛ 0.01 یعنی 1٪ و 2 به معنی دو نود نیست. Xray عدد متناهی خارج از بازه را به 0–1 محدود می‌کند؛ این قالب با هشدار اعمال و عدد اصلی حفظ می‌شود. مجموعه جدید میزبان‌های فعال سازگار با قالب را با UUID انتخاب می‌کند. اگر میزبان مناسبی نباشد، تنظیمات تا انتخاب منبع پیش‌نویس می‌ماند.'
            ],
            [
                '在同一卡片中选择主机与均衡流量',
                '主机来源与其策略位于同一块区域。使用共享均衡器的池会合并显示，手动均衡器仍可见。删除区域会移除其来源、均衡器及关联规则，同时保留独立组和手动出站。leastLoad.expected 表示所选节点数量；tolerance 是 0 到 1 的允许探测失败比例，0.01 表示 1%，2 不表示两个节点。Xray 会将超出范围的有限数值限制为 0–1；此类模板可带警告应用，并保留原始数值。新建池会按 UUID 选择格式支持的已启用主机。没有合适主机时，设置会保持为草稿，直到选择来源。'
            ]
        ]
    ],
    [
        'templates',
        'templates-client-downloads',
        [
            [
                'Когда приложение скачивает geofiles',
                'Категории GeoIP/GeoSite DAT превращаются в обычные правила внутри полной конфигурации: отдельного скачивания DAT в приложении нет. Нативные sing-box JSON/SRS передаются как remote rule_set, а совместимые Mihomo/Clash/Stash YAML/text — как HTTP rule-providers с публичным URL. Способ доставки виден у файла. Нужна подписка полной JSON/YAML-конфигурации: отдельная ссылка VLESS не передаёт эти правила. Новую версию набора импортируйте и прикрепите заново, сохраните корректный шаблон и обновите подписку.'
            ],
            [
                'When the app downloads geofiles',
                'GeoIP/GeoSite DAT categories become ordinary rules inside the full configuration, so the app makes no separate DAT download. Native sing-box JSON/SRS use remote rule_set; compatible Mihomo/Clash/Stash YAML/text use HTTP rule-providers with a public URL. Each file shows its delivery mode. Use a full JSON/YAML configuration subscription: an individual VLESS link cannot carry these rules. Import and attach a new dataset version, save a valid template and update the subscription.'
            ],
            [
                'زمان دانلود فایل‌های جغرافیایی در برنامه',
                'دسته‌های GeoIP/GeoSite DAT به قوانین داخل پیکربندی کامل تبدیل می‌شوند؛ دانلود جداگانه DAT وجود ندارد. JSON/SRS بومی sing-box از remote rule_set و YAML/text سازگار Mihomo/Clash/Stash از HTTP rule-providers با نشانی عمومی استفاده می‌کنند. روش تحویل کنار فایل دیده می‌شود. اشتراک کامل JSON/YAML لازم است و پیوند تکی VLESS این قوانین را ندارد. نسخه جدید مجموعه را وارد و متصل، قالب سالم را ذخیره و اشتراک را به‌روزرسانی کنید.'
            ],
            [
                '应用何时下载地理文件',
                'GeoIP/GeoSite DAT 分类会转换为完整配置中的普通规则，因此应用不会单独下载 DAT。sing-box 原生 JSON/SRS 使用 remote rule_set，兼容的 Mihomo/Clash/Stash YAML/text 使用带公共 URL 的 HTTP rule-providers。每个文件会显示传递方式。需要完整 JSON/YAML 配置订阅；单独的 VLESS 链接不能携带这些规则。导入并重新附加新版数据集、保存有效模板，然后更新订阅。'
            ]
        ]
    ],
    [
        'hosts',
        'hosts-fast-actions-and-flags',
        [
            [
                'Массовые действия и поиск стран',
                'Включение, отключение и удаление отвечают после записи в БД; доставка политики нодам запускается в фоне с повторной синхронизацией недоступных нод. Подтверждение сохранения не означает, что отключённая от панели нода уже получила изменение. Кнопки показывают выполнение, список обновляется после подтверждения API. Клонирование выполняет не более трёх запросов одновременно; успешно обработанные источники снимаются с выбора, неудачные остаются для повтора. Во флагах ищите страну на RU/EN/FA/ZH или по двухбуквенному коду независимо от языка интерфейса.'
            ],
            [
                'Bulk actions and country search',
                'Enable, disable and delete return after the database commit; node policy delivery starts in the background and unavailable nodes are retried. A saved action does not mean a disconnected node already received it. Buttons show progress and the list updates after API acknowledgement. Cloning runs at most three requests at once; successful sources are deselected and failed sources remain for retry. Search flags by country name in RU/EN/FA/ZH or two-letter code independently of the UI language.'
            ],
            [
                'عملیات گروهی و جستجوی کشور',
                'فعال‌سازی، غیرفعال‌سازی و حذف پس از ثبت پایگاه داده پاسخ می‌دهند؛ ارسال سیاست به نودها در پس‌زمینه شروع و برای نودهای در دسترس‌نبوده تکرار می‌شود. ذخیره به معنی دریافت تغییر توسط نود قطع‌شده نیست. دکمه‌ها پیشرفت را نشان می‌دهند و فهرست پس از تأیید API به‌روز می‌شود. تکثیر حداکثر سه درخواست هم‌زمان دارد؛ منابع موفق از انتخاب خارج و موارد ناموفق برای تلاش مجدد باقی می‌مانند. پرچم‌ها را مستقل از زبان رابط با نام کشور در RU/EN/FA/ZH یا کد دوحرفی جستجو کنید.'
            ],
            [
                '批量操作与国家搜索',
                '启用、禁用和删除在数据库提交后返回；节点策略在后台发送，并重试不可用节点。保存成功不表示已断开连接的节点已收到更改。按钮显示进度，列表在 API 确认后更新。克隆最多同时发送三个请求；成功来源取消选择，失败来源保留以便重试。国旗搜索支持 RU/EN/FA/ZH 国家名称或两字母代码，与界面语言无关。'
            ]
        ]
    ],
    [
        'profiles',
        'profiles-x25519-password',
        [
            [
                'X25519: пароль и приватный ключ',
                'Генератор показывает два значения: Приватный ключ для сервера и Пароль (публичный ключ) для клиента REALITY. В X25519 password и publicKey обозначают одинаковые байты, поэтому отдельного дублирующего поля нет. Копирование всех значений содержит privateKey и password. Приватный ключ не передавайте клиентам.'
            ],
            [
                'X25519 password and private key',
                'The generator shows two values: Private key for the server and Password (public key) for the REALITY client. For X25519, password and publicKey identify the same bytes, so no duplicate field is shown. Copy all contains privateKey and password. Do not distribute the private key to clients.'
            ],
            [
                'گذرواژه و کلید خصوصی X25519',
                'مولد دو مقدار نشان می‌دهد: کلید خصوصی برای سرور و گذرواژه (کلید عمومی) برای کلاینت REALITY. در X25519، password و publicKey بایت‌های یکسانی هستند و فیلد تکراری نمایش داده نمی‌شود. کپی همه شامل privateKey و password است. کلید خصوصی را به کلاینت‌ها ندهید.'
            ],
            [
                'X25519 密码与私钥',
                '生成器显示两个值：服务端私钥和 REALITY 客户端的密码（公钥）。X25519 中 password 与 publicKey 表示相同字节，因此不再显示重复字段。复制全部仅包含 privateKey 和 password。不要向客户端分发私钥。'
            ]
        ]
    ]
]

export function explainEditorWorkflows(articles) {
    for (const [articleId, id, translations] of additions) {
        const article = articles.find((item) => item.id === articleId)
        if (!article) throw new Error(`Missing guide article: ${articleId}`)
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
}
