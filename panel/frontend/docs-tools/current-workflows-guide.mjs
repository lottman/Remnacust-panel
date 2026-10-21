const languages = ['ru', 'en', 'fa', 'zh']

// Keep scope and units identical in all four operator guides.
const sections = [
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
                'В плане портов каждой привязке назначаются порт, профиль и inbound. Совместимые изменения применяются через ядро с сохранением существующих соединений. Реальная смена порта, транспорта или несовместимых настроек занятого listener требует отдельного порта и тега либо явного перезапуска с возможным обрывом соединений. Сообщение об отказе не запускает скрытый перезапуск. Последняя техническая ошибка показывается в исходном виде. Обновление контейнера или бинарника ядра может прервать подключения.'
            ],
            [
                'Changing an active port',
                'Each port-plan binding selects a port, profile and inbound. Compatible changes are applied through the core while preserving existing connections. A real port, transport or incompatible active-listener change requires a separate port and tag, or an explicit restart that may interrupt connections. A rejection does not trigger a hidden restart. The original technical error is shown verbatim. Updating the container or core binary may interrupt connections.'
            ],
            [
                'تغییر پورت فعال',
                'هر اتصال در طرح پورت، یک پورت، پروفایل و inbound دارد. تغییرات سازگار از طریق هسته با حفظ اتصال‌های موجود اعمال می‌شوند. تغییر واقعی پورت، ترنسپورت یا تنظیم ناسازگار شنونده فعال، به پورت و تگ جدا یا راه‌اندازی دوباره صریح با احتمال قطع اتصال نیاز دارد. خطای رد شدن، راه‌اندازی پنهان انجام نمی‌دهد. آخرین خطای فنی عیناً نمایش داده می‌شود. به‌روزرسانی کانتینر یا باینری هسته ممکن است اتصال‌ها را قطع کند.'
            ],
            [
                '修改正在使用的端口',
                '端口计划的每个绑定选择端口、配置和 inbound。兼容修改通过内核应用，并保留现有连接。真正修改端口、传输方式或活动监听器的不兼容设置时，需要独立端口和标签，或明确执行可能中断连接的重启。拒绝应用不会暗中重启。最后一条技术错误按原文显示。更新容器或内核二进制文件可能中断连接。'
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
        'Настройки тега действуют на связанные хосты, у которых включён соответствующий переключатель: квота, скорость пользователя или общая скорость. Эти три переключателя независимы. Перед сохранением проверьте участвующие хосты и ограничения. Получатели и персональные исключения доступны в разделе «Лимиты».',
        'Tag settings affect associated hosts with the corresponding quota, user-speed or shared-speed switch enabled. These three switches are independent. Check participating hosts and restrictions before saving. Open “Limits” for recipients and personal exceptions.',
        'تنظیمات برچسب روی میزبان‌هایی اعمال می‌شوند که کلید مربوط به سهمیه، سرعت کاربر یا سرعت مشترک را فعال کرده‌اند. این سه کلید مستقل هستند. پیش از ذخیره، میزبان‌های مشارکت‌کننده و محدودیت‌ها را بررسی کنید. گیرندگان و استثناهای شخصی در «محدودیت‌ها» هستند.',
        '标签设置作用于已启用对应配额、用户速度或共享速度开关的关联主机。这三个开关相互独立。保存前检查参与主机和限制。接收对象与个人例外位于“限制”页面。'
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
