const languages = ['ru', 'en', 'fa', 'zh']

// Keep scope and units identical in all four operator guides.
const sections = [
    [
        'node-actions',
        'node-delete-unreachable',
        [
            [
                'Удаление недоступной ноды',
                'Для удаления записи не требуется связь с сервером ноды. После подтверждения панель ждёт завершения текущей операции управления и не запускает новые доставки для этой ноды. Ожидание может занять до 130 секунд, если прежняя блокировка ещё не истекла. Дождитесь результата: успешное уведомление означает удаление записи из базы.'
            ],
            [
                'Deleting an unreachable node',
                'Deleting the record does not require a connection to the node server. After confirmation, the panel waits for the current management operation and prevents new deliveries to this node. Waiting may take up to 130 seconds while an earlier lease expires. Wait for the result: success means the database record was deleted.'
            ],
            [
                'حذف نود غیرقابل دسترس',
                'برای حذف رکورد نیازی به اتصال به سرور نود نیست. پس از تأیید، پنل منتظر پایان عملیات مدیریتی جاری می‌ماند و ارسال جدید برای این نود را متوقف می‌کند. انتظار برای پایان قفل قبلی ممکن است تا ۱۳۰ ثانیه طول بکشد. منتظر نتیجه بمانید: موفقیت یعنی رکورد از پایگاه داده حذف شده است.'
            ],
            [
                '删除无法访问的节点',
                '删除记录无需连接节点服务器。确认后，面板会等待当前管理操作结束，并阻止向该节点发送新的配置。等待旧锁到期可能需要最多 130 秒。请等待结果；成功通知表示数据库记录已删除。'
            ]
        ]
    ],
    [
        'hosts',
        'hosts-response-rule-inclusion',
        [
            [
                'Хосты по правилу ответа подписки',
                'В параметрах хоста выберите имена правил ответа подписки, для которых он должен выдаваться. Пустой список разрешает все правила. Имя должно точно совпадать с именем правила; для прямой выдачи используется RAW. После переименования правила обновите список хоста. Эта настройка не отменяет права сквадов, отключение хоста, квоты и ограничения формата. Отфильтрованный хост не возвращается через автовыбор. Сохраните изменения и обновите подписку в клиенте.'
            ],
            [
                'Hosts by subscription response rule',
                'In the host options, select response-rule names that may include this host. An empty list allows all rules. Names must match exactly; direct output uses RAW. Update the host list after renaming a rule. This setting never grants squad access or bypasses disabled hosts, quotas or format restrictions. Autoselect cannot restore a filtered host. Save and refresh the client subscription.'
            ],
            [
                'میزبان‌ها بر اساس قانون پاسخ اشتراک',
                'در گزینه‌های میزبان، نام قوانین پاسخ مجاز را انتخاب کنید. فهرست خالی همه قوانین را مجاز می‌کند. نام‌ها باید دقیقاً یکسان باشند؛ خروجی مستقیم از RAW استفاده می‌کند. پس از تغییر نام قانون، فهرست میزبان را به‌روز کنید. این تنظیم دسترسی گروه، غیرفعال بودن میزبان، سهمیه یا محدودیت قالب را دور نمی‌زند. انتخاب خودکار میزبان حذف‌شده را برنمی‌گرداند. ذخیره کنید و اشتراک کلاینت را تازه کنید.'
            ],
            [
                '按订阅响应规则选择主机',
                '在主机选项中选择允许包含该主机的响应规则名称。空列表允许所有规则。名称须完全匹配；直接输出使用 RAW。规则改名后请更新主机列表。该设置不会绕过小队权限、主机禁用状态、配额或格式限制。自动选择也不会重新加入被过滤的主机。保存后在客户端更新订阅。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-settings-active-expiry-remarks',
        [
            [
                'Примечания до окончания активной подписки',
                'В настройках подписки откройте примечания и добавьте правило до окончания. Задайте число дней, включите правило и выберите всех пользователей или конкретные внутренние и внешние сквады. Совпадения с любым выбранным сквадом достаточно. Правило действует только для ACTIVE, пока срок ещё не истёк и до него осталось не больше указанного числа суток. Если подходят несколько правил, применяется правило с меньшим числом дней; при одинаковом числе — первое в списке. После продления подписки окно пересчитывается при следующем запросе. Замороженная, отключённая, истёкшая или ограниченная подписка использует прежние сообщения своего состояния. Блокировка устройства и ограничения регистрации сохраняют приоритет.\n\nДобавьте текстовые строки или HTTPS-ссылки действий. Отдельная строка {HOSTS} вставляет доступные пользователю подключения в этой позиции. Она допустима один раз; переключатель хостов добавляет или удаляет её. Хосты проходят обычные проверки сквадов, квот, доступа и совместимости формата. Маркер не даёт новых прав. Без {HOSTS} клиент получит только примечания; используйте этот режим осознанно, поскольку обычные подключения не будут выданы. Произвольный JSON прокси в этих правилах не поддерживается. Предпросмотр показывает пример, а не реальные подключения пользователя. Сохраните изменения и обновите подписку в клиенте: вид текста и действий зависит от приложения.\n\nВнешний сквад может целиком переопределить глобальные примечания, включая эти правила. Включите наследование, чтобы использовать весь глобальный набор. Выбор внешнего сквада в глобальном правиле не отменяет его собственного переопределения. Сбой сохранения оставляет черновик доступным для повторной попытки; сброс восстанавливает сохранённые значения.'
            ],
            [
                'Remarks before an active subscription expires',
                'Open remarks in subscription settings and add a pre-expiry rule. Set the number of days, enable the rule, and choose all users or specific internal and external squads. Membership in any selected squad is sufficient. A rule applies only to ACTIVE subscriptions that have not expired and have no more than the configured number of days remaining. If several rules match, the smallest day threshold wins; equal thresholds use list order. Renewal recalculates eligibility on the next request. Frozen, disabled, expired and limited subscriptions keep their existing state messages. Device blocks and registration restrictions retain priority.\n\nAdd text rows or HTTPS link actions. A standalone {HOSTS} row inserts the connections available to this user at that position. It is allowed once; the hosts switch inserts or removes it. Hosts still pass normal squad, quota, access and output-format checks. The marker grants no additional permissions. Without {HOSTS}, the client receives remarks only; choose this deliberately because normal connections will not be delivered. Arbitrary proxy JSON is not supported in these rules. Preview shows sample content rather than real user connections. Save changes and refresh the subscription in the client; text and action presentation depends on the application.\n\nAn external squad can replace the entire global remarks configuration, including these rules. Enable inheritance to use the complete global configuration. Selecting that external squad in a global rule does not override its own replacement. Failed saves retain the draft for retry; reset restores saved values.'
            ],
            [
                'یادداشت پیش از پایان اشتراک فعال',
                'در تنظیمات اشتراک، یادداشت‌ها را باز و یک قانون پیش از انقضا اضافه کنید. تعداد روزها را تعیین و قانون را فعال کنید؛ همه کاربران یا اسکوادهای داخلی و خارجی مشخص را انتخاب کنید. عضویت در هرکدام از اسکوادهای انتخاب‌شده کافی است. قانون فقط برای اشتراک ACTIVE اعمال می‌شود که هنوز منقضی نشده و زمان باقی‌مانده آن از تعداد روزهای تعیین‌شده بیشتر نیست. اگر چند قانون منطبق باشند، قانون با آستانه روز کمتر انتخاب می‌شود؛ در تساوی، ترتیب فهرست تعیین‌کننده است. پس از تمدید، شرایط در درخواست بعدی دوباره محاسبه می‌شوند. اشتراک‌های منجمد، غیرفعال، منقضی و محدود همان پیام وضعیت قبلی را دارند. مسدودی دستگاه و محدودیت ثبت اولویت خود را حفظ می‌کنند.\n\nردیف‌های متن یا اقدام با پیوند HTTPS اضافه کنید. ردیف مستقل {HOSTS} اتصال‌های مجاز کاربر را در همان محل قرار می‌دهد. فقط یک بار مجاز است؛ کلید میزبان‌ها آن را اضافه یا حذف می‌کند. کنترل‌های معمول اسکواد، سهمیه، دسترسی و سازگاری قالب خروجی همچنان اعمال می‌شوند. این نشانگر مجوز تازه‌ای نمی‌دهد. بدون {HOSTS} فقط یادداشت‌ها به برنامه ارسال می‌شوند و اتصال‌های معمول حذف خواهند شد؛ این حالت را آگاهانه انتخاب کنید. JSON دلخواه پراکسی در این قوانین پشتیبانی نمی‌شود. پیش‌نمایش نمونه است و اتصال‌های واقعی کاربر را نشان نمی‌دهد. تغییرات را ذخیره و اشتراک را در برنامه تازه کنید؛ نمایش متن و اقدام به برنامه بستگی دارد.\n\nاسکواد خارجی می‌تواند کل تنظیمات یادداشت سراسری، از جمله این قوانین، را جایگزین کند. برای استفاده از کل تنظیمات سراسری، ارث‌بری را فعال کنید. انتخاب آن اسکواد در قانون سراسری، جایگزینی اختصاصی آن را لغو نمی‌کند. خطای ذخیره پیش‌نویس را برای تلاش مجدد نگه می‌دارد و بازنشانی مقادیر ذخیره‌شده را برمی‌گرداند.'
            ],
            [
                '有效订阅到期前的备注',
                '在订阅设置中打开备注并添加到期前规则。设置天数，启用规则，选择所有用户或指定的内部、外部分组。用户属于任一所选分组即可。规则仅适用于尚未到期、剩余时间不超过设定天数的 ACTIVE 订阅。多个规则匹配时，选择天数最少的规则；天数相同时按列表顺序选择。续费后，下次请求会重新计算。已冻结、禁用、到期或受限的订阅仍使用原有状态消息。设备封禁和注册限制保持更高优先级。\n\n添加文本行或 HTTPS 链接操作。单独一行 {HOSTS} 会在该位置插入此用户可用的连接，只允许出现一次；主机开关会添加或移除该行。主机仍需通过通常的分组、配额、访问权限及输出格式检查，此标记不会授予额外权限。没有 {HOSTS} 时，客户端只收到备注，不会收到正常连接，请谨慎选择。此类规则不支持任意代理 JSON。预览仅显示示例，不会显示用户真实连接。保存后请在客户端刷新订阅；文本与操作的显示方式取决于应用。\n\n外部分组可完整替换全局备注设置，包括这些规则。启用继承即可使用整套全局设置。在全局规则中选择该外部分组，并不会取消它自身的覆盖设置。保存失败时会保留草稿以便重试；重置则恢复已保存的值。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-settings-remarks-size',
        [
            [
                'Длина сообщений и совместимость клиентов',
                'Используйте короткие примечания. После подстановки переменных длинные строки могут сокращаться, а часть дополнительных строк не попадёт в выдачу из-за ограничений клиента. Для правила до окончания сохраняются блок {HOSTS}, если он задан, и хотя бы одно предупреждение. Порядок сообщений и подключений одинаков в теле ответа и представлении подписки. Если общая кнопка действия не помещается вместе с сообщениями, она может быть опущена целиком; URL не обрезается. Проверьте итоговый ответ и отображение в нужном приложении.'
            ],
            [
                'Message length and client compatibility',
                'Keep remarks concise. After variable substitution, long text may be shortened and some additional rows omitted to fit client limits. Pre-expiry rules retain {HOSTS}, when configured, and at least one notice. Message and connection order matches between the response body and subscription presentation. A global action that cannot fit alongside the messages may be omitted entirely; its URL is never truncated. Check the resulting response and its display in the intended application.'
            ],
            [
                'طول پیام و سازگاری برنامه',
                'یادداشت‌ها را کوتاه نگه دارید. پس از جایگزینی متغیرها ممکن است متن طولانی کوتاه و برخی ردیف‌های اضافی برای رعایت محدودیت برنامه حذف شوند. قانون پیش از انقضا، در صورت تنظیم، {HOSTS} و حداقل یک اعلان را حفظ می‌کند. ترتیب پیام‌ها و اتصال‌ها در بدنه پاسخ و نمایش اشتراک یکسان است. اگر اقدام سراسری کنار پیام‌ها جا نشود، ممکن است کامل حذف شود؛ نشانی آن هرگز بریده نمی‌شود. پاسخ نهایی و نمایش آن را در برنامه موردنظر بررسی کنید.'
            ],
            [
                '消息长度与客户端兼容性',
                '请保持备注简短。替换变量后，为适应客户端限制，过长文本可能被缩短，部分附加行可能被省略。到期前规则会保留已配置的 {HOSTS} 和至少一条提示。响应正文与订阅展示中的消息及连接顺序一致。如果全局操作无法与消息同时容纳，可能会整体省略；不会截断其 URL。请在目标应用中检查最终响应和显示效果。'
            ]
        ]
    ],
    [
        'nodes',
        'nodes-start-queue-pause',
        [
            [
                'Пауза очереди запуска',
                'Если запуск нод был приостановлен администратором, сохранённые изменения могут ждать возобновления. После завершения обслуживания проверьте состояние и возобновите запуск через инструмент управления очередями. Перезапуск панели сам по себе не отменяет намеренную паузу. Обычное массовое назначение профиля не требует такой паузы; проверяйте результат отдельно у каждой ноды.'
            ],
            [
                'Paused start queue',
                'If an administrator paused node starts, saved changes can wait for resumption. After maintenance, check the state and resume starts through the queue-management tool. Restarting the panel does not cancel an intentional pause. Ordinary bulk profile assignment does not require that pause; check the result on each node.'
            ],
            [
                'توقف صف راه‌اندازی',
                'اگر مدیر شروع نودها را متوقف کرده باشد تغییر ذخیره‌شده ممکن است منتظر ادامه بماند. پس از نگهداری وضعیت را بررسی و از ابزار مدیریت صف شروع را ادامه دهید. راه‌اندازی دوباره پنل توقف عمدی را لغو نمی‌کند. تخصیص گروهی معمول پروفایل به چنین توقفی نیاز ندارد؛ نتیجه هر نود را جداگانه بررسی کنید.'
            ],
            [
                '启动队列暂停',
                '管理员暂停节点启动后，已保存变更可能等待恢复。维护完成后检查状态，并通过队列管理工具恢复启动。重启面板不会取消有意设置的暂停。普通批量分配配置无需此暂停，请分别核对每个节点的结果。'
            ]
        ]
    ],
    [
        'nodes',
        'nodes-local-core-recovery',
        [
            [
                'Восстановление после падения ядра',
                'При подтверждённом падении совместимого ядра агент восстанавливает последнюю приватную конфигурацию без панели. Рабочий процесс не перезапускается; неизвестное состояние и занятое управление откладывают проверку. Пауза администратора и проверки квот сохраняются. Автоматические попытки ограничены: не более трёх восстановлений за час процесса агента. Новое падение после лимита или ошибка восстановления прекращают попытки; проверьте журнал и выполните явный запуск после устранения причины. Обычное применение настроек без перезапуска бюджет попыток не сбрасывает. Повреждённый журнал не обнуляется. Нужны сборки Node и Core с этим исправлением; обновление только панели их не заменяет.'
            ],
            [
                'Recovery after a core crash',
                'After a confirmed crash of a compatible core, the agent restores the last private configuration without the panel. A working process is left running; unknown status or busy management defers the check. Administrative pause and quota checks remain enforced. Automatic attempts are limited to three recoveries per hour of the agent process. A further crash after that limit or a recovery error stops retries; check the log, correct the cause and explicitly start a new process. Hot application of settings does not reset the attempt budget. A corrupt journal is never cleared. Both Node and Core builds must include this fix; updating only the panel does not replace them.'
            ],
            [
                'بازیابی پس از خرابی هسته',
                'پس از خرابی تأییدشده هسته سازگار، عامل آخرین پیکربندی خصوصی را بدون پنل بازیابی می‌کند. فرایند سالم بازراه‌اندازی نمی‌شود و وضعیت نامشخص یا مدیریت مشغول، بررسی را عقب می‌اندازد. توقف مدیر و کنترل سهمیه حفظ می‌شوند. حداکثر سه بازیابی خودکار در هر ساعت فرایند عامل مجاز است. خرابی بعدی پس از حد یا خطای بازیابی، تلاش را متوقف می‌کند؛ گزارش را بررسی و علت را رفع کنید، سپس فرایند جدید را صریح راه‌اندازی کنید. اعمال تنظیمات بدون راه‌اندازی مجدد بودجه تلاش را بازنشانی نمی‌کند. ژورنال خراب هرگز پاک نمی‌شود. ساخت Node و Core هر دو باید این اصلاح را داشته باشند؛ به‌روزرسانی پنل به‌تنهایی آن‌ها را جایگزین نمی‌کند.'
            ],
            [
                '内核崩溃后的恢复',
                '确认兼容内核崩溃后，代理可在没有面板时恢复最后的私有配置。正常进程不会重启；状态未知或管理忙碌时会推迟检查。管理员暂停和配额检查仍有效。每个代理进程每小时最多自动恢复三次。达到上限后再次崩溃，或恢复出错，都会停止重试；请检查日志、排除原因并显式启动新进程。热应用设置不会重置尝试次数。损坏的日志不会被清空。Node 和 Core 都需要包含此修复的新构建；只更新面板不会替换它们。'
            ]
        ]
    ],
    [
        'architecture',
        'architecture-offline-day',
        [
            [
                'Сутки без панели',
                'Автономная политика не отключается просто из-за отсутствия панели. Для планируемых суток нужны применённая политика, постоянные тома, действующие ключи и достаточный локальный резерв каждого лимита пользователя, хоста и тега. Общий остаток пользователя распределён между нодами и не равен запасу каждой ноды. Срок подписки, исчерпание резерва или конец периода квоты продолжают закрывать доступ. После календарного сброса новый резерв выдаёт панель; текущая реализация не финансирует следующий период без связи. CDN, DNS, прокси и сертификаты ноды должны работать независимо. Пересоздание контейнера требует постоянных каталогов состояния. При загрузке ядра через CUSTOM_CORE_URL его источник также должен быть доступен. Изменения блокировки или заморозки во время разрыва доходят после восстановления связи. Проверка готовности перед обслуживанием подтверждает текущее состояние, но не обещает сутки трафика.'
            ],
            [
                'A day without the panel',
                'Autonomous policy does not stop merely because the panel is unreachable. A planned day requires an applied policy, persistent volumes, valid credentials and enough local credit for every user, host and tag limit. A user’s total remaining quota is distributed across nodes and is not the credit of each node. Subscription expiry, exhausted credit and quota-period boundaries still deny access. The panel must fund the next period after a reset; the current implementation does not fund it offline. CDN, DNS, proxy and node certificates must remain independent. Recreating a container requires persistent state directories. A core loaded through CUSTOM_CORE_URL also needs its source to be reachable. Blocks or freezes changed during the outage arrive after reconnection. A maintenance readiness check proves current state, not a guaranteed day of traffic.'
            ],
            [
                'یک روز بدون پنل',
                'سیاست مستقل صرفاً به دلیل قطع پنل متوقف نمی‌شود. برای یک روز برنامه‌ریزی‌شده، سیاست اعمال‌شده، حجم‌های پایدار، کلیدهای معتبر و اعتبار محلی کافی برای هر محدودیت کاربر، میزبان و برچسب لازم است. مانده کل کاربر میان نودها تقسیم می‌شود و اعتبار هر نود نیست. پایان اشتراک، اتمام اعتبار یا مرز دوره سهمیه همچنان دسترسی را می‌بندد. اعتبار دوره بعد پس از بازنشانی باید توسط پنل تأمین شود؛ نسخه فعلی آن را آفلاین تأمین نمی‌کند. CDN، DNS، پروکسی و گواهی نود باید مستقل باشند. ایجاد دوباره کانتینر به مسیرهای پایدار وضعیت نیاز دارد. هسته دانلودشده با CUSTOM_CORE_URL نیز به دسترسی منبع نیاز دارد. مسدودسازی یا تعلیق جدید پس از اتصال مجدد می‌رسد. بررسی آمادگی نگهداری فقط وضعیت فعلی را تأیید می‌کند، نه یک روز ترافیک تضمینی.'
            ],
            [
                '面板离线一天',
                '自主策略不会仅因面板不可达而停止。计划离线一天需要已应用的策略、持久卷、有效密钥，以及用户、主机和标签每项限制的足够本地额度。用户总剩余额度分配在各节点之间，不等于每个节点的额度。订阅到期、额度耗尽及配额周期结束仍会拒绝访问。重置后的下一周期需要面板重新分配额度；当前实现不会在离线时为下一周期授信。CDN、DNS、代理及节点证书必须独立工作。重建容器需要持久状态目录。通过 CUSTOM_CORE_URL 下载的内核还需要源站可达。断连期间新增的封禁或冻结在恢复连接后同步。维护就绪检查只确认当前状态，并不保证一天的流量。'
            ]
        ]
    ],
    [
        'templates',
        'subscription-transient-query-errors',
        [
            [
                'Временная ошибка выдачи',
                'Ошибка чтения пользователя, устройства или хостов не означает, что подписка удалена. Конфигурационная выдача возвращает временную ошибку с предложением повторить запрос через 30 секунд; настоящий отсутствующий пользователь по-прежнему даёт 404. Ошибочная выборка хостов не считается успешной пустой подпиской. Если доступных хостов действительно нет, дополнительные запросы шаблонов и квот пропускаются. При повторяющемся сбое проверьте журнал и связь с базой данных; не создавайте пользователю новые ключи для устранения сетевой ошибки.'
            ],
            [
                'Temporary delivery errors',
                'A failed user, device or host query does not mean the subscription was deleted. Configuration delivery returns a temporary error asking the client to retry after 30 seconds; a genuinely missing user still returns 404. A failed host query is not reported as a successful empty subscription. If there truly are no available hosts, extra template and quota queries are skipped. For repeated failures, check the log and database connectivity; do not replace a user’s keys to solve a network error.'
            ],
            [
                'خطای موقت دریافت',
                'خطای خواندن کاربر، دستگاه یا میزبان به معنی حذف اشتراک نیست. دریافت پیکربندی خطای موقت با درخواست تلاش دوباره پس از 30 ثانیه می‌دهد؛ کاربر واقعاً ناموجود همچنان 404 می‌گیرد. خطای جست‌وجوی میزبان، اشتراک خالی موفق محسوب نمی‌شود. اگر واقعاً میزبانی موجود نباشد، درخواست‌های اضافی قالب و سهمیه انجام نمی‌شود. برای خطای تکراری، گزارش و اتصال پایگاه داده را بررسی کنید؛ برای رفع خطای شبکه کلید کاربر را عوض نکنید.'
            ],
            [
                '临时分发错误',
                '读取用户、设备或主机失败不代表订阅已被删除。配置分发返回临时错误并建议 30 秒后重试；用户确实不存在时仍返回 404。主机查询失败不会被当作成功的空订阅。确实没有可用主机时，会跳过额外的模板和配额查询。重复失败时检查日志及数据库连接，不要为修复网络问题而替换用户密钥。'
            ]
        ]
    ],
    [
        'profiles',
        'editor-unsaved-recovery',
        [
            [
                'Восстановление несохранённых правок',
                'В редакторах профилей и шаблонов подписки откройте «История» → «Несохранённый черновик». Здесь хранится последняя локальная копия текста, включая незавершённый JSON или YAML. Сравните её с сохранённой версией и нажмите «Загрузить в редактор», затем сохраните обычной кнопкой. Автоматического применения нет.\n\nПосле успешного сохранения соответствующая временная копия удаляется. Если во время запроса вы продолжили редактирование, более новые правки остаются восстанавливаемыми. Ошибка сохранения не удаляет копию. Удаление в этой вкладке убирает только локальный черновик.\n\nКопии разделены по администратору, профилю и шаблону; они доступны только в этом браузере и на этом адресе панели, до семи дней и до 8 MiB на документ. Очистка данных сайта удаляет их. Текст хранится зашифрованным в IndexedDB; это не защита от доступа к открытой сессии администратора. Если браузер запрещает хранилище или лимит превышен, интерфейс покажет ошибку. Перед принудительным обновлением интерфейс ожидает запись черновика. При аварийном закрытии последние ещё не записанные нажатия могут потеряться.'
            ],
            [
                'Recovering unsaved edits',
                'In profile and subscription-template editors, open History → Unsaved draft. This contains the most recent local text, including incomplete JSON or YAML. Compare it with the saved version, choose Load into editor, then save normally. Nothing is applied automatically.\n\nA successful save removes its temporary copy. Edits typed while that request is pending remain recoverable. A failed save does not delete the copy. Delete in this tab removes only the local draft.\n\nCopies are separated by administrator and document. They are available only in this browser on this panel origin, for up to seven days and 8 MiB per document. Clearing site data removes them. Text is encrypted in IndexedDB; this does not protect an open administrator session. Storage restrictions or exceeded limits are shown as errors. Before a forced interface refresh, the interface waits for draft persistence. A browser crash can lose recent keystrokes that have not yet been written.'
            ],
            [
                'بازیابی تغییرات ذخیره‌نشده',
                'در ویرایشگر پروفایل و قالب اشتراک، «تاریخچه» ← «پیش‌نویس ذخیره‌نشده» را باز کنید. آخرین متن محلی، حتی JSON یا YAML ناقص، اینجا نگه داشته می‌شود. آن را با نسخه ذخیره‌شده مقایسه کنید، «بارگذاری در ویرایشگر» را بزنید و سپس ذخیره کنید. اعمال خودکار انجام نمی‌شود.\n\nذخیره موفق نسخه موقت مربوط را حذف می‌کند؛ تغییرات جدید هنگام انتظار پاسخ باقی می‌مانند. خطای ذخیره نسخه را حذف نمی‌کند. حذف از این زبانه فقط پیش‌نویس محلی را پاک می‌کند.\n\nنسخه‌ها برای هر مدیر و سند جدا و فقط در همین مرورگر و مبدأ پنل، تا هفت روز و 8 MiB برای هر سند، در دسترس‌اند. پاک‌کردن داده سایت آن‌ها را حذف می‌کند. متن در IndexedDB رمزگذاری می‌شود، اما نشست باز مدیر همچنان باید محافظت شود. محدودیت ذخیره‌سازی با خطا نشان داده می‌شود. پیش از نوسازی اجباری رابط، ثبت پیش‌نویس تکمیل می‌شود؛ خرابی مرورگر ممکن است آخرین کلیدهای ثبت‌نشده را از بین ببرد.'
            ],
            [
                '恢复未保存的编辑',
                '在配置档案或订阅模板编辑器中打开“历史记录”→“未保存草稿”。这里保留最近的本地文本，包括未完成的 JSON 或 YAML。与已保存版本比较后，选择“载入编辑器”，再正常保存；不会自动应用。\n\n保存成功后会删除对应的临时副本。等待保存响应期间输入的新内容仍可恢复；保存失败不会删除副本。本页的删除操作只清除本地草稿。\n\n副本按管理员和文档隔离，仅在当前浏览器及面板来源下可用，最长保留七天，每份上限 8 MiB。清除站点数据会删除副本。文本在 IndexedDB 中加密保存，但这不能保护已打开的管理员会话。存储被禁用或超过上限时会显示错误。强制刷新界面前会等待草稿写入；浏览器崩溃时尚未写入的最后输入仍可能丢失。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-cold-node-discovery',
        [
            [
                'Первый запуск смешанного парка',
                'При первом подключении дождитесь проверки возможностей ноды и применения профиля. Смешанный парк штатных Remnawave и кастомных нод поддерживается, но новые функции зависят от фактически запущенного ядра. Ноды с общими inbound используют совместимый режим; независимые совместимые inbound сохраняют расширения. Если возможности пока неизвестны, прежняя конфигурация сохраняется и панель повторяет проверку. Недоступная нода задерживает только связанные с ней подключения. Ошибка сети не снимает установленные ограничения.'
            ],
            [
                'First start of a mixed node fleet',
                'On first connection, wait for capability checks and profile application. Native Remnawave and custom nodes can coexist, but extensions depend on the core actually running. Nodes sharing an inbound use a compatible mode; independent compatible inbounds retain extensions. Unknown capabilities keep the previous configuration and schedule another check. An unavailable node delays only related connections. Network errors do not remove configured restrictions.'
            ],
            [
                'شروع نخست مجموعه نودهای متفاوت',
                'در اتصال نخست منتظر بررسی قابلیت نود و اعمال پروفایل بمانید. نودهای اصلی Remnawave و سفارشی می‌توانند هم‌زمان کار کنند؛ افزونه‌ها به هسته در حال اجرا وابسته‌اند. نودهای دارای ورودی مشترک از حالت سازگار استفاده می‌کنند و ورودی‌های سازگار مستقل افزونه‌ها را حفظ می‌کنند. اگر قابلیت نامشخص باشد، پیکربندی قبلی حفظ و بررسی تکرار می‌شود. نود در دسترس نبودنی فقط اتصال‌های مرتبط را عقب می‌اندازد. خطای شبکه محدودیت‌های تنظیم‌شده را حذف نمی‌کند.'
            ],
            [
                '混合节点的首次启动',
                '首次连接时，请等待节点能力检测和配置档案应用完成。原生 Remnawave 与自定义节点可以共存，但扩展功能取决于实际运行的核心。共享入站的节点使用兼容模式，独立且兼容的入站仍保留扩展。能力未知时保留原配置并安排重试。不可用节点仅延迟相关连接；网络错误不会解除已配置的限制。'
            ]
        ]
    ],
    [
        'host-tags',
        'host-tags-bounded-accounting',
        [
            [
                'Учёт трафика и пакеты квот',
                'Общая квота тега учитывает расход на хостах, где включён учёт этой квоты. Назначьте тег хостам, включите нужные ограничения и проверьте результат в разделе «Лимиты». Показания обновляются после получения статистики; повторная доставка той же статистики не должна списывать расход дважды. Если нода недоступна, показания могут отставать до восстановления связи. Проверяйте состояние ноды и журнал учёта, а не обнуляйте счётчики вручную в базе данных.'
            ],
            [
                'Traffic accounting and quota batches',
                'A shared tag quota counts usage on hosts where tag accounting is enabled. Assign the tag, enable the required restrictions, and check the Limits page. Values update after statistics arrive; receiving the same statistics again must not charge usage twice. An unavailable node can leave values behind until connectivity returns. Inspect node health and accounting logs instead of manually resetting database counters.'
            ],
            [
                'حسابداری ترافیک و دسته‌های سهمیه',
                'سهمیه مشترک برچسب مصرف میزبان‌هایی را حساب می‌کند که حسابداری برچسب در آن‌ها فعال است. برچسب را اختصاص دهید، محدودیت لازم را فعال کنید و نتیجه را در صفحه محدودیت‌ها ببینید. اعداد پس از دریافت آمار به‌روز می‌شوند؛ دریافت دوباره همان آمار نباید مصرف را دوبار حساب کند. هنگام قطع ارتباط نود ممکن است اعداد عقب بمانند. سلامت نود و گزارش حسابداری را بررسی کنید و شمارنده‌های پایگاه داده را دستی صفر نکنید.'
            ],
            [
                '流量记账与配额批处理',
                '共享标签配额统计已启用标签记账的主机流量。分配标签、启用所需限制后，在“限额”页面检查结果。统计到达后数值才会更新，重复收到同一份统计不应重复扣费。节点不可用时，数值可能暂时落后，直到连接恢复。请检查节点健康状态和记账日志，不要直接在数据库中手动清零计数器。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-access-utc',
        [
            [
                'Срок доступа и устройства',
                'Моменты окончания доступа хранятся в UTC; при выборе даты и времени учитывайте часовой пояс интерфейса. Изменение часового пояса сервера не продлевает подписку. Если устройство заблокировали или зарегистрировали заново после открытия списка, устаревшее массовое удаление его не затронет. Обновите список и проверьте выбранные устройства перед повтором.'
            ],
            [
                'Access lifetime and devices',
                'Access deadlines are stored in UTC; account for the interface timezone when selecting a date and time. Changing the server timezone does not extend a subscription. If a device is blocked or registered again after the list is opened, a stale bulk deletion preserves it. Refresh the list and check the selected devices before retrying.'
            ],
            [
                'مدت دسترسی و دستگاه‌ها',
                'زمان پایان دسترسی با UTC ذخیره می‌شود؛ هنگام انتخاب تاریخ و ساعت منطقه زمانی رابط را در نظر بگیرید. تغییر منطقه زمانی سرور اشتراک را تمدید نمی‌کند. اگر دستگاه پس از باز شدن فهرست مسدود یا دوباره ثبت شود حذف گروهی قدیمی آن را حفظ می‌کند. پیش از تکرار فهرست را تازه و دستگاه‌های انتخاب‌شده را بررسی کنید.'
            ],
            [
                '访问期限与设备',
                '访问截止时间按 UTC 保存；选择日期和时间时请留意界面时区。更改服务器时区不会延长订阅。设备在列表打开后被封禁或重新注册时，旧的批量删除操作会保留它。重试前请刷新列表并核对所选设备。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscription-database-load',
        [
            [
                'Производительность и совместимость подписок',
                'Выдача подписки не ждёт подтверждения нод. Получение профилей в приложении не доказывает, что сервер уже применил их: проверьте здоровье ноды и состояние конфигурации. Используйте совместимые версии панели и страницы подписки. Подтверждённая штатная Remnawave-нода получает обычную конфигурацию: новые ограничения хоста, правила сайтов и неактивные хосты-исключения на её inbound отключены. Если этот inbound используется и нашей нодой, обе используют совместимые обычные ключи. На отдельных совместимых inbound новые функции сохраняются. Старое наше ядро без учёта получателя автовыбора использует ключи и лимиты серверов пула; обновление Node/Core и подписки включает отдельный учёт. Панель показывает режим совместимости. Неизвестная нода и сетевой сбой сами по себе не отключают ограничения. Существующие резервы квот и финансовые блокировки не стираются при понижении версии. Старые страницы подписки сохраняют совместимость. Новых переменных .env для этого режима нет.'
            ],
            [
                'Subscription performance and compatibility',
                'Subscription delivery does not wait for node acknowledgements. Profiles appearing in an app do not prove that a server has applied them: check node health and configuration status. Use compatible panel and subscription-page versions. A confirmed native Remnawave node receives a baseline configuration: new host restrictions, destination rules and inactive-user exceptions are disabled on its inbounds. A custom node sharing such an inbound uses the same compatible baseline credentials; isolated compatible inbounds retain extensions. Older custom cores without autoselect recipient accounting use ordinary pool-server credentials and limits. Upgrade Node/Core and refresh the client subscription for separate recipient accounting. The panel displays compatibility mode. An unknown node or network failure alone never disables restrictions. Existing quota reserves and financial fences are not erased by a downgrade. Older subscription pages remain compatible. This mode needs no new .env variables.'
            ],
            [
                'کارایی و سازگاری اشتراک',
                'تحویل اشتراک منتظر تأیید نود نمی‌ماند. نمایش پروفایل در برنامه به معنی اعمال آن در سرور نیست؛ سلامت نود و وضعیت پیکربندی را بررسی کنید. نسخه پنل و صفحه اشتراک باید سازگار باشند. نود اصلی تأییدشده Remnawave پیکربندی عادی می‌گیرد؛ محدودیت میزبان، قواعد مقصد و استثنای کاربران غیرفعال روی ورودی‌های آن غیرفعال است. نود سفارشی با ورودی مشترک نیز کلید عادی یکسان دارد، اما ورودی سازگار مستقل قابلیت‌ها را حفظ می‌کند. هسته قدیمی بدون حسابداری گیرنده انتخاب خودکار از کلید و محدودیت سرور استخر استفاده می‌کند. برای حسابداری مستقل، Node/Core و اشتراک کلاینت را به‌روز کنید. حالت سازگاری در پنل نمایش داده می‌شود. خطای شبکه یا نود ناشناخته محدودیت‌ها را غیرفعال نمی‌کند. ذخایر سهمیه و حصارهای مالی با کاهش نسخه حذف نمی‌شوند. صفحه‌های اشتراک قدیمی سازگار می‌مانند. این حالت متغیر جدید .env نمی‌خواهد.'
            ],
            [
                '订阅性能与兼容性',
                '订阅下发不等待节点确认。应用中出现配置不代表服务器已应用该配置；请检查节点健康状态与配置状态，并使用相互兼容的面板和订阅页面版本。已确认的原生 Remnawave 节点获得基础配置，其入站不启用新增的主机限额、目标规则和非活跃用户例外。同一入站上的自定义节点使用相同的兼容凭据；独立兼容入站仍保留扩展。缺少自动选择接收主机配额功能的旧版自定义核心使用池内服务器的普通凭据和限额。升级 Node/Core 并刷新客户端订阅可启用独立归属。面板显示兼容模式。未知节点或网络错误本身不会关闭限制。降级不会清除现有配额储备及财务围栏。旧版订阅页面保持兼容，此模式无需新增 .env 变量。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'maintenance-log-download',
        [
            [
                'Технический журнал обновления',
                'В окне обновления панели и у операции страницы подписки «Скачать журнал» загружает настоящий технический вывод, а не JSON со статусом. Скачивание доступно только администратору панели по ID текущей задачи; API-токены доступа не получают. Пароли и токены удаляются из скачиваемой копии. Для больших файлов доступны последние 1 MiB с отметкой об ограничении; полный файл остаётся приватным на сервере до следующей операции того же компонента. При временной недоступности панели повторите скачивание после восстановления связи либо откройте указанный серверный путь. Нужны панель 1.1.7.91 и служба установщика 1.2.129. remnacust-panel-update.service запускает локальный API при загрузке сервера, но начинает обновление только по запросу администратора.'
            ],
            [
                'Technical update log',
                'Download journal in the panel update dialog and subscription page operations downloads real technical output rather than a status JSON. Only a panel administrator can download it for the current job ID; API tokens cannot. Passwords and tokens are removed from the downloaded copy. Large files return the last 1 MiB with a truncation notice; the complete private file remains on the server until the next operation for that component. If the panel is temporarily unreachable, retry after reconnection or open the displayed server path. Requires panel 1.1.7.91 and installer service 1.2.129. remnacust-panel-update.service starts the local API at boot and only starts updates on an administrator request.'
            ],
            [
                'گزارش فنی به‌روزرسانی',
                '«دریافت گزارش» در پنجره به‌روزرسانی پنل و عملیات صفحه اشتراک، خروجی فنی واقعی را دریافت می‌کند، نه JSON وضعیت. فقط مدیر پنل با شناسه کار جاری دسترسی دارد؛ توکن API مجاز نیست. گذرواژه‌ها و توکن‌ها از نسخه دریافتی حذف می‌شوند. برای فایل بزرگ، آخرین 1 MiB با پیام محدودیت دریافت می‌شود؛ فایل کامل تا عملیات بعدی همان مؤلفه در سرور خصوصی می‌ماند. هنگام قطع موقت پنل پس از اتصال دوباره تلاش کنید یا مسیر نمایش‌داده‌شده را در سرور باز کنید. پنل 1.1.7.91 و سرویس نصاب 1.2.129 لازم است. remnacust-panel-update.service هنگام راه‌اندازی سرور فقط API محلی را اجرا می‌کند و به‌روزرسانی را تنها با درخواست مدیر شروع می‌کند.'
            ],
            [
                '更新技术日志',
                '面板更新窗口和订阅页面操作中的“下载日志”会下载真实技术输出，而不是状态 JSON。只有面板管理员可以按当前任务 ID 下载，API 令牌无权访问。下载副本会移除密码和令牌。大文件返回最后 1 MiB 并注明截断；完整私有文件保留在服务器上，直到该组件的下一次操作。面板暂时无法连接时，请在恢复后重试，或打开显示的服务器路径。需要面板 1.1.7.91 和安装服务 1.2.129。remnacust-panel-update.service 开机时启动本地 API，只有收到管理员请求才开始更新。'
            ]
        ]
    ],
    [
        'hosts',
        'hosts-allowed-probe',
        [
            [
                'Пинг ограниченного хоста',
                'HTTP-проверка должна обращаться к разрешённому сайту через сам хост. В режиме «Разрешить только» форма показывает копируемый URL первого разрешённого домена. Для Happ с настоящим Provider ID панель выбирает общий разрешённый URL для всех выданных видимых хостов, сохраняет подходящий настроенный URL и HTTP-метод. Явно выбранные TCP и ICMP не меняются. Если общего домена нет или есть только IP/CIDR, используется TCP-проверка; она подтверждает доступность сервера, а не авторизацию VPN. В INCY выберите HTTP/INCY-пинг и этот URL в настройках подписки: обычные HTTP-заголовки не управляют адресом его проверки, автоматическая настройка доступна только через Premium API самого INCY. Политика сайтов не расширяется, проверка не отправляется через DIRECT. Сайт должен отвечать на выбранный HTTP-метод; перенаправление на запрещённый домен по-прежнему блокируется.'
            ],
            [
                'Restricted host latency',
                'An HTTP check must reach an allowed website through the host itself. In Allow only mode, the form shows a copyable URL for the first allowed domain. For Happ with a real Provider ID, the panel selects a common allowed URL for all delivered visible hosts, preserving a suitable configured URL and HTTP method. Explicit TCP and ICMP choices are unchanged. When no shared domain exists or only IP/CIDR destinations are allowed, it falls back to TCP; TCP confirms server reachability, not VPN authorization. In INCY, choose HTTP/INCY ping and this URL in subscription settings: ordinary HTTP headers cannot set its probe URL; automatic configuration requires INCY’s own Premium API. Website permissions are not widened and the check never goes through DIRECT. The website must respond to the selected HTTP method; redirects to a denied domain remain blocked.'
            ],
            [
                'پینگ میزبان محدود',
                'بررسی HTTP باید از طریق خود میزبان به یک وب‌سایت مجاز برسد. در حالت «فقط مجاز»، فرم نشانی قابل کپی اولین دامنه مجاز را نشان می‌دهد. برای Happ با Provider ID واقعی، پنل نشانی مشترک مجاز همه میزبان‌های قابل‌مشاهده اشتراک را انتخاب و نشانی مناسب و روش HTTP تنظیم‌شده را حفظ می‌کند. انتخاب صریح TCP یا ICMP تغییر نمی‌کند. بدون دامنه مشترک یا با مقصدهای صرفاً IP/CIDR، بررسی TCP به‌کار می‌رود؛ این بررسی فقط دسترسی به سرور را می‌سنجد، نه مجوز VPN. در تنظیمات اشتراک INCY، پینگ HTTP/INCY و این نشانی را انتخاب کنید؛ هدرهای معمولی نشانی بررسی را تنظیم نمی‌کنند و تنظیم خودکار به Premium API خود INCY نیاز دارد. مجوز سایت‌ها گسترش نمی‌یابد و بررسی از DIRECT عبور نمی‌کند. سایت باید به روش HTTP انتخاب‌شده پاسخ دهد؛ تغییر مسیر به دامنه ممنوع همچنان مسدود است.'
            ],
            [
                '受限主机延迟',
                'HTTP 检测必须通过主机本身访问允许的网站。在“仅允许”模式下，表单显示首个允许域名的可复制 URL。Happ 配有真实 Provider ID 时，面板为订阅中所有可见主机选择共同允许的 URL，并保留合适的自定义 URL 与 HTTP 方法。明确选择的 TCP 或 ICMP 不变。没有共同域名或仅允许 IP/CIDR 时，改用 TCP；TCP 只确认服务器可达，不验证 VPN 授权。在 INCY 的订阅设置中选择 HTTP/INCY 检测并填写此 URL；普通 HTTP 标头不能设置其检测地址，自动配置需要 INCY 自身的 Premium API。不会扩大网站权限，也不会通过 DIRECT 检测。网站必须响应所选 HTTP 方法；跳转到禁止域名仍会被阻止。'
            ]
        ]
    ],
    [
        'architecture',
        'architecture-maintenance-logs',
        [
            [
                'Журналы обслуживания',
                'Журналы установщика находятся в /opt/remnacust/logs/: installer-panel.log, installer-node.log и installer-subscription-page.log. При ошибке операция показывает путь к своему журналу. Следующее действие того же компонента может заменить прежний журнал — сохраните нужный файл заранее. Обновление через панель также сохраняет panel-update-<ID>.log; обслуживание ноды через SSH — node-maintenance.log на ноде. Ограничьте доступ к журналам. Перед передачей в поддержку удалите пароли, токены, персональные ссылки и адреса. Вопросы обслуживания пакетов завершайте в интерактивном SSH-сеансе; перезагрузка сервера выполняется отдельно.'
            ],
            [
                'Maintenance logs',
                'Installer logs are under /opt/remnacust/logs/: installer-panel.log, installer-node.log and installer-subscription-page.log. A failed operation shows its log path. The next action for the same component may replace its previous log, so save the file beforehand. Panel updates also retain panel-update-<ID>.log; SSH node maintenance retains node-maintenance.log on the node. Restrict log access. Before sharing logs with support, remove passwords, tokens, personal links and addresses. Complete package-maintenance prompts in an interactive SSH session; reboot the server separately when needed.'
            ],
            [
                'گزارش‌های نگهداری',
                'گزارش‌های نصب‌کننده در /opt/remnacust/logs/ قرار دارند: installer-panel.log، installer-node.log و installer-subscription-page.log. عملیات ناموفق مسیر گزارش خود را نشان می‌دهد. اقدام بعدی همان مؤلفه ممکن است گزارش قبلی را جایگزین کند؛ فایل لازم را از قبل نگه دارید. به‌روزرسانی پنل panel-update-<ID>.log را نیز نگه می‌دارد و نگهداری نود از SSH فایل node-maintenance.log را روی نود ذخیره می‌کند. دسترسی به گزارش‌ها را محدود کنید. پیش از ارسال به پشتیبانی گذرواژه، توکن، پیوند شخصی و نشانی‌ها را حذف کنید. پرسش‌های نگهداری بسته‌ها را در SSH تعاملی پاسخ دهید؛ راه‌اندازی مجدد سرور جداگانه انجام می‌شود.'
            ],
            [
                '维护日志',
                '安装器日志位于 /opt/remnacust/logs/：installer-panel.log、installer-node.log 和 installer-subscription-page.log。操作失败时会显示日志路径。同一组件的下一次操作可能覆盖旧日志，请提前保存所需文件。面板更新还保留 panel-update-<ID>.log；通过 SSH 维护节点时，node-maintenance.log 保存在节点上。限制日志访问，交给支持人员前删除密码、令牌、个人链接和地址。软件包维护提示应在交互式 SSH 会话中完成；服务器重启需另行执行。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-inactive-access',
        [
            [
                'Неактивный доступ и заморозка',
                'Хосты с включённым доступом при неактивной подписке доступны при EXPIRED, DISABLED, FROZEN и LIMITED, а также при истёкшем сроке ACTIVE. Дополнительная настройка скрывает их во время активной подписки. Права сквадов, блокировки устройств и собственные ограничения хоста сохраняются. В своих примечаниях настройте отдельный блок FROZEN и его место в порядке примечаний. Маркер {{FREE_HOST}} вставляет разрешённые хосты в выбранную строку; он не снимает блокировку HWID и не выдаёт права. Добавьте inbound этого хоста во внутренний сквад пользователя. Если inbound общий, ограничьте остальные хосты через их доступ для сквадов, чтобы не открыть лишние подключения. Предпросмотр устройства предупреждает, если после разрешения ключей остались только уведомления. Внешний сквад может переопределять текст и порядок. Старые настройки получают стандартный текст заморозки без замены ваших сохранённых сообщений. При неактивном доступе JSON содержит самостоятельные подключения без общих или назначенных шаблонов, балансеров и геофайлов; ограничения самого хоста сохраняются. Домены, IP и подсети формируются отдельными правилами. Отказ HWID показывает сохранённое предупреждение о лимите или неподдерживаемом устройстве, а не только статус подписки. Happ и INCY на одном ПК используют разные HWID и занимают разные места в лимите устройств.'
            ],
            [
                'Inactive access and freezing',
                'Hosts enabled for inactive subscription access are available for EXPIRED, DISABLED, FROZEN and LIMITED, and for an ACTIVE account whose time has expired. The additional option hides them while the subscription is active. Squad permissions, device blocks and host-specific limits still apply. Configure the FROZEN block and its position in remark order under custom remarks. {{FREE_HOST}} inserts permitted hosts at that line; it cannot bypass an HWID block or grant access. Add that host’s inbound to the user’s internal squad. For a shared inbound, restrict other hosts through their squad access settings to avoid granting extra connections. Device preview warns when only notifications remain after resolving credentials. External squads may override wording and order. Older settings gain default frozen wording without replacing saved messages. Inactive JSON uses standalone connections without shared or assigned templates, balancers or geofiles; host restrictions still apply. Domains, IPs and networks become separate rules. HWID denial shows the saved device-limit or unsupported-device warning instead of only subscription status. Happ and INCY on the same PC use different HWIDs and occupy separate device slots.'
            ],
            [
                'دسترسی غیرفعال و انجماد',
                'میزبان‌های مجاز برای اشتراک غیرفعال در وضعیت‌های EXPIRED، DISABLED، FROZEN و LIMITED و حساب ACTIVE با زمان منقضی در دسترس‌اند. گزینه اضافی آن‌ها را هنگام فعال بودن اشتراک پنهان می‌کند. مجوز گروه، مسدودی دستگاه و محدودیت خود میزبان پابرجاست. در یادداشت‌های سفارشی، بخش FROZEN و جای آن در ترتیب یادداشت‌ها را تنظیم کنید. {{FREE_HOST}} میزبان‌های مجاز را در همان خط قرار می‌دهد و مسدودی HWID را دور نمی‌زند و مجوز نمی‌دهد. ورودی میزبان را به گروه داخلی کاربر اضافه کنید. برای ورودی مشترک، دسترسی گروه به سایر میزبان‌ها را محدود کنید تا اتصال اضافی مجاز نشود. پیش‌نمایش دستگاه در صورت باقی ماندن فقط اعلان هشدار می‌دهد. گروه خارجی می‌تواند متن و ترتیب را بازنویسی کند. تنظیمات قدیمی متن پیش‌فرض انجماد را بدون جایگزینی پیام‌های ذخیره‌شده دریافت می‌کنند. JSON اشتراک غیرفعال اتصال مستقل و بدون قالب مشترک یا اختصاص‌یافته، بالانسر و فایل جغرافیایی می‌دهد؛ محدودیت میزبان پابرجاست. دامنه، IP و زیرشبکه قوانین جدا دارند. رد HWID هشدار ذخیره‌شده سقف دستگاه یا دستگاه پشتیبانی‌نشده را نیز نشان می‌دهد. Happ و INCY روی یک رایانه HWID متفاوت و جایگاه جدا در سقف دستگاه دارند.'
            ],
            [
                '未启用访问与冻结',
                '允许未激活订阅访问的主机适用于 EXPIRED、DISABLED、FROZEN、LIMITED，以及时长已到期的 ACTIVE 账户。附加选项可在订阅激活时隐藏这些主机。组权限、设备封禁和主机自身限制仍然有效。在自定义备注中配置 FROZEN 内容及其顺序。{{FREE_HOST}} 在该行插入获准的主机，不能绕过 HWID 封禁或授予权限。请将该主机的入站添加到用户的内部组。共享入站时，应通过组访问设置限制其他主机，避免额外授权。解析凭据后若仅剩通知，设备预览会显示警告。外部组可以覆盖文字和顺序。旧设置自动获得冻结默认文字，不会替换已保存的消息。未激活订阅的 JSON 使用独立连接，不加载共享或已分配模板、负载均衡或地理文件；主机限制仍然生效。域名、IP 和网段生成独立规则。HWID 拒绝时会显示已保存的设备上限或不支持设备警告，而不只是订阅状态。同一台电脑上的 Happ 和 INCY 使用不同 HWID，各占一个设备名额。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-user-domain-links',
        [
            [
                'Несколько ссылок пользователя',
                'У каждого основного домена может быть только один CDN. API пользователя в subscriptionUrl и ссылка по умолчанию используют доступный CDN назначенного основного домена. Если CDN нет, используется открытый основной адрес. Объект subscriptionDomain в ответе API описывает тот же публичный адрес, что и subscriptionUrl, включая UUID, тип, имя и путь. Поле subscriptionDomainUuid хранит исходное назначение пользователя (null — домен по умолчанию) и не изменяется при выборе CDN. Если доступного адреса нет, subscriptionDomain равен null. SUB_PUBLIC_DOMAIN остаётся адресом источника; заменять его на CDN не нужно. Привязка пользователя, ключи, срок, заморозка, устройства и квоты не меняются. Доступные ссылки можно копировать и открывать как QR-код; закрытие основного домена скрывает всю группу. Если доступного адреса нет, subscriptionUrl пустой. Дополнительные CDN прежних версий автоматически не удаляются и продолжают работать, но добавить или перенести второй CDN нельзя. В старой группе приоритет имеет явно назначенный доступный CDN, затем цель перенаправления, затем первый доступный CDN по имени домена. Права чтения обычных, CDN и всех ссылок остаются раздельными. Чтение каталога не раскрывает ключи подписок.'
            ],
            [
                'Multiple subscription links',
                'Each primary domain can have only one CDN. The user API subscriptionUrl and preferred link use an available CDN of the assigned primary. Without a CDN, they use the open primary URL. The API subscriptionDomain object describes the same public address as subscriptionUrl, including UUID, kind, name and path. subscriptionDomainUuid keeps the persisted user assignment (null means the default domain) and does not change when a CDN is selected. With no accessible address, subscriptionDomain is null. SUB_PUBLIC_DOMAIN remains the origin; do not replace it with a CDN. User assignment, credentials, expiry, freezing, devices and quotas remain unchanged. Available links have copy and QR actions; closing a primary hides its whole family. With no available address, subscriptionUrl is empty. Additional CDNs from older versions remain usable and are not deleted automatically, but a second CDN cannot be created or moved into an occupied family. Legacy families prefer an explicitly assigned available CDN, then the redirect target, then the first available CDN ordered by domain. Read permissions for regular, CDN and all links remain separate. Catalog access does not disclose subscription keys.'
            ],
            [
                'چند پیوند اشتراک',
                'هر دامنه اصلی فقط یک CDN می‌تواند داشته باشد. subscriptionUrl در API کاربر و پیوند پیش‌فرض از CDN مجاز همان دامنه اصلی اختصاص‌یافته استفاده می‌کنند؛ بدون CDN نشانی باز دامنه اصلی انتخاب می‌شود. شیء subscriptionDomain در API همان نشانی عمومی subscriptionUrl را با UUID، نوع، نام و مسیر توصیف می‌کند. subscriptionDomainUuid انتساب ذخیره‌شده کاربر است (null یعنی دامنه پیش‌فرض) و با انتخاب CDN تغییر نمی‌کند. بدون نشانی مجاز، subscriptionDomain برابر null است. SUB_PUBLIC_DOMAIN نشانی مبدأ می‌ماند و نباید با CDN جایگزین شود. انتساب کاربر، کلیدها، انقضا، انجماد، دستگاه‌ها و سهمیه‌ها تغییر نمی‌کنند. نشانی‌های مجاز کپی و QR دارند؛ بستن دامنه اصلی همه گروه را پنهان می‌کند. اگر نشانی در دسترس نباشد subscriptionUrl خالی است. CDNهای اضافی قبلی خودکار حذف نمی‌شوند و کار می‌کنند، ولی ایجاد یا انتقال CDN دوم به گروه پر ممنوع است. در گروه قدیمی اول CDN مجاز اختصاص‌یافته، سپس مقصد تغییرمسیر و بعد اولین CDN مجاز به ترتیب نام دامنه انتخاب می‌شود. مجوز خواندن پیوند عادی، CDN و همه پیوندها جدا می‌ماند و مجوز فهرست کلید اشتراک را آشکار نمی‌کند.'
            ],
            [
                '多个订阅链接',
                '每个主域名只能创建一个 CDN。用户 API 的 subscriptionUrl 和首选链接使用所分配主域名下可用的 CDN；没有 CDN 时使用开放的主域名地址。API 的 subscriptionDomain 对象描述与 subscriptionUrl 相同的公开地址，包括 UUID、类型、名称和路径。subscriptionDomainUuid 保留用户的原始分配（null 表示默认域名），选择 CDN 时不会改变。没有可访问地址时，subscriptionDomain 为 null。SUB_PUBLIC_DOMAIN 仍为源站，无需替换为 CDN。用户分配、密钥、期限、冻结、设备和配额不变。可用地址支持复制和二维码；关闭主域名隐藏整个域名组。没有可用地址时 subscriptionUrl 为空。旧版额外 CDN 不会自动删除并继续可用，但禁止在已有 CDN 的组内创建或移入第二个 CDN。旧组依次优先选择明确分配且可用的 CDN、重定向目标、按域名排序的首个可用 CDN。普通、CDN 和全部链接的读取权限仍独立，目录权限不会公开订阅密钥。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-cdn-gateway',
        [
            [
                'CDN: настройка один раз',
                'В «Настроить CDN» скопируйте индивидуальное случайное имя заголовка и значение UUID. Имя стабильно при обновлениях; при переходе со старого общего имени замените только имя в CDN. В VK добавьте заголовок запросов, в Яндексе — заголовок запроса к источнику. Источник HTTPS, Host и SNI берутся из основного сайта подписки. Отключите принудительное кэширование персональных ответов. Обычные ссылки клиентов сохраняются без замены; файлы, контрольные суммы и ссылки устройств идут через CDN. ID не заменяет ключ, статус, заморозку, срок и HWID. Путь /cdn/<ID> остаётся запасным вариантом для CDN без заголовков. Новых переменных .env нет. Имя формируется с закрытым ключом установки; по одному публичному ID его не вычислить. При отдельной смене APP_SECRET имя нужно заново скопировать в CDN.\n\nВ заголовке profile-web-page-url и переменной {{SUBSCRIPTION_URL}} используется проверенный публичный домен текущего запроса с его путём. При обращении через CDN ссылки остаются на этом CDN; запрос к другому зарегистрированному открытому домену сохраняет его адрес. Подставные Forwarded/Origin/Referer не выбирают домен. В административных операциях без публичного запроса используется доступный CDN назначенного основного домена, а при его отсутствии — открытый основной домен. Явно заданные администратором постоянные URL автоматически не переписываются.'
            ],
            [
                'CDN: configure once',
                'Copy the individual neutral request header name and UUID value from Set up CDN. Add an origin request header in VK or Yandex. The name stays stable across upgrades; replace only the old common header name when migrating. Use the main subscription site for the HTTPS origin, Host and SNI. Disable forced caching of personalized responses. Existing client URLs need no replacement; files, checksums and device URLs retain the CDN. The ID does not bypass keys, status, freezing, expiry or HWID. The /cdn/<ID> path remains a fallback for CDNs without request headers. No new .env variables are needed. The name is generated with the private installation key and cannot be computed from the public ID alone. If APP_SECRET is separately rotated, copy the new header name to the CDN.\n\nThe profile-web-page-url header and {{SUBSCRIPTION_URL}} use the validated public domain and path of the current request. CDN requests keep their CDN URL; another registered open domain keeps its own address. Forwarded, Origin and Referer cannot select the domain. Administrative operations outside a public request prefer an available CDN of the assigned primary, falling back to its open primary URL. Literal URLs explicitly configured by an administrator are not automatically rewritten.'
            ],
            [
                'CDN: تنظیم یک‌باره',
                'در تنظیم CDN نام اختصاصی و خنثای هدر و مقدار UUID را کپی و در VK یا Yandex به درخواست‌های مبدأ اضافه کنید. نام در به‌روزرسانی ثابت می‌ماند؛ هنگام مهاجرت فقط نام مشترک قدیمی را عوض کنید. مبدأ HTTPS و Host و SNI از سایت اصلی اشتراک گرفته می‌شوند. کش اجباری پاسخ شخصی را خاموش کنید. نشانی فعلی کاربران نیاز به تعویض ندارد و فایل‌ها و checksum و نشانی دستگاه‌ها روی CDN می‌مانند. شناسه، کلید و وضعیت و انجماد و انقضا و HWID را دور نمی‌زند. مسیر /cdn/<ID> روش جایگزین CDN بدون هدر است. متغیر جدید .env لازم نیست. نام با کلید خصوصی نصب ساخته می‌شود و فقط از شناسه عمومی قابل محاسبه نیست. اگر APP_SECRET را جداگانه عوض کردید، نام جدید را در CDN وارد کنید.\n\nسرآیند profile-web-page-url و متغیر {{SUBSCRIPTION_URL}} از دامنه عمومی تأییدشده و مسیر درخواست جاری استفاده می‌کنند. درخواست CDN نشانی همان CDN را حفظ می‌کند و دامنه باز ثبت‌شده دیگر نیز نشانی خود را نگه می‌دارد. سرآیندهای Forwarded و Origin و Referer دامنه را انتخاب نمی‌کنند. عملیات مدیریتی خارج از درخواست عمومی CDN مجاز دامنه اصلی اختصاص‌یافته و در نبود آن نشانی باز دامنه اصلی را انتخاب می‌کند. نشانی ثابت تعیین‌شده توسط مدیر خودکار بازنویسی نمی‌شود.'
            ],
            [
                'CDN：一次配置',
                '从配置 CDN 窗口复制专属中性请求头名称和 UUID 值，在 VK 或 Yandex 中添加到源站请求。名称在更新后保持不变；迁移时只需替换旧通用名称。HTTPS 源站、Host 和 SNI 使用主订阅网站，关闭个性化响应的强制缓存。客户端现有链接无需替换，文件、校验和及设备链接仍使用 CDN。ID 不绕过密钥、状态、冻结、期限或 HWID 检查。/cdn/<ID> 路径保留为不支持请求头的备用方式，无需新增 .env 变量。 名称使用安装私钥生成，无法仅凭公开 ID 计算。若单独更换 APP_SECRET，请将新的请求头名称复制到 CDN。\n\nprofile-web-page-url 标头和 {{SUBSCRIPTION_URL}} 使用当前请求经过验证的公开域名及路径。通过 CDN 请求时保留该 CDN 地址；通过其他已注册开放域名请求时保留其地址。Forwarded、Origin 和 Referer 不能选择域名。公开请求之外的管理操作优先使用所分配主域名下可用的 CDN，没有 CDN 时使用开放的主域名地址。管理员明确配置的固定 URL 不会自动重写。'
            ]
        ]
    ],
    [
        'subscription-settings',
        'subscriptions-domain-environment',
        [
            [
                'Домен подписки и .env',
                'Основной домен синхронизируется с SUB_PUBLIC_DOMAIN через службу установщика. Если служба недоступна или файл изменился одновременно, проверьте статус и журнал, обновите сведения и повторите изменение. DNS и сертификат настраиваются отдельно. Источник остаётся основным доменом, а не адресом CDN.\n\nУ основного домена допускается один CDN. Выберите открытый доступ, только через CDN или перенаправление на связанный CDN. Перенаправление сохраняет путь и параметры, включая /json, устройство и геофайлы. Неверный заголовок CDN даёт 403; перенаправление — 307. Режим «Закрыт» запрещает основной домен и его CDN. Последний доступный основной домен нельзя закрыть или удалить.\n\nВ «Настроить CDN» скопируйте выданные имя и значение заголовка в заголовки запросов CDN. Заголовок должен перезаписываться, а не дублироваться. Не помещайте его в ответы, публичные ссылки или клиент. До ограничения источника проверьте через CDN страницу, обычную подписку, /json и геофайлы.\n\nПеред удалением старого основного домена удалите или перенесите его CDN и явно подтвердите перенос пользователей на текущий домен по умолчанию. Ключи, устройства, заморозка, сроки и лимиты сохраняются. Уже импортированные подписки нужно перенести в приложениях отдельно; сохраните старый DNS и сертификат на время перехода.'
            ],
            [
                'Subscription domain and .env',
                'The primary domain synchronizes with SUB_PUBLIC_DOMAIN through the installer service. If the service is unavailable or the file was edited concurrently, inspect the status and log, refresh the details and retry. DNS and certificates are configured separately. Keep the origin set to the primary domain, not its CDN address.\n\nEach primary supports one CDN. Choose public access, CDN only or redirection to its linked CDN. Redirection preserves paths and queries, including /json, devices and geofiles. An invalid CDN header returns 403; redirection returns 307. Closed denies the primary and its CDN. The last available primary cannot be closed or deleted.\n\nIn Configure CDN, copy the issued header name and value to CDN request headers. Overwrite the header rather than duplicating it. Keep it out of responses, public links and client apps. Before restricting the origin, check the page, normal subscription, /json and geofiles through the CDN.\n\nBefore deleting an old primary, remove or move its CDN and explicitly confirm transferring users to the current default domain. Credentials, devices, frozen lifetime, expiry and limits remain. Subscriptions already imported into apps must be migrated separately; retain the old DNS and certificate during transition.'
            ],
            [
                'دامنه اشتراک و .env',
                'دامنه اصلی از طریق سرویس نصب‌کننده با SUB_PUBLIC_DOMAIN همگام می‌شود. اگر سرویس ناموجود است یا فایل هم‌زمان ویرایش شده، وضعیت و گزارش را بررسی، اطلاعات را تازه و تغییر را تکرار کنید. DNS و گواهی جداگانه تنظیم می‌شوند. مبدأ را دامنه اصلی نگه دارید نه نشانی CDN.\n\nهر دامنه اصلی یک CDN دارد. دسترسی عمومی، فقط CDN یا هدایت به CDN مرتبط را انتخاب کنید. هدایت مسیر و پارامترها شامل /json، دستگاه و فایل جغرافیایی را حفظ می‌کند. سربرگ نامعتبر CDN پاسخ 403 و هدایت پاسخ 307 می‌دهد. حالت بسته دامنه اصلی و CDN آن را می‌بندد. آخرین دامنه اصلی فعال قابل بستن یا حذف نیست.\n\nدر تنظیم CDN نام و مقدار سربرگ صادرشده را در سربرگ درخواست CDN قرار دهید؛ آن را جایگزین کنید نه تکرار. سربرگ نباید در پاسخ، پیوند عمومی یا کلاینت باشد. پیش از محدود کردن مبدأ، صفحه، اشتراک عادی، /json و فایل‌ها را از CDN بررسی کنید.\n\nپیش از حذف دامنه اصلی قبلی CDN را حذف یا منتقل و انتقال کاربران به دامنه پیش‌فرض فعلی را صریحاً تأیید کنید. کلید، دستگاه، زمان منجمد، اعتبار و محدودیت حفظ می‌شوند. اشتراک واردشده به برنامه باید جداگانه منتقل شود؛ هنگام انتقال DNS و گواهی قبلی را نگه دارید.'
            ],
            [
                '订阅域名与 .env',
                '主域名通过安装服务与 SUB_PUBLIC_DOMAIN 同步。服务不可用或文件被并发编辑时，请检查状态和日志，刷新信息后重试。DNS 和证书另行配置。源站保持主域名，不要替换为 CDN 地址。\n\n每个主域名支持一个 CDN。可选择公开访问、仅 CDN 或重定向到关联 CDN。重定向保留路径及查询参数，包括 /json、设备和地理文件。无效 CDN 请求头返回 403，重定向返回 307。关闭模式拒绝主域名及其 CDN。最后一个可用主域名不能关闭或删除。\n\n在配置 CDN 中，将生成的请求头名称和值填入 CDN 请求头，并覆盖该头而非重复追加。不要将其放入响应、公开链接或客户端。限制源站前，先通过 CDN 检查页面、普通订阅、/json 和地理文件。\n\n删除旧主域名前，先删除或迁移其 CDN，再明确确认将用户迁移到当前默认域名。凭据、设备、冻结剩余时间、到期时间和限额保留。应用中已有的订阅须另行迁移；过渡期间保留旧 DNS 和证书。'
            ]
        ]
    ],
    [
        'architecture',
        'architecture-node-continuity',
        [
            [
                'Ноды при отключении панели',
                'Нода с подтверждённой автономной политикой продолжает обслуживать сохранённые ключи без панели, включая XHTTP через CDN напрямую на ноду. Локально сохраняются срок доступа, квоты, скорость и правила. Исчерпание резерва или срока по-прежнему закрывает доступ. Новые пользователи, продления и блокировки доходят после восстановления связи. Перед остановкой приложений установщик проверяет автономность нод. При неподтверждённой готовности он предупреждает и продолжает обновление; дополнительный флаг не нужен. Зависимые от панели ноды могут временно потерять связь. Старая политика без локальных резервов истекает через 90 секунд: её срок нельзя просто отключить. Вручную выполненный docker compose down обходит проверку; он также остановит ноду или прокси, если они входят в тот же проект.'
            ],
            [
                'Nodes while the panel is offline',
                'A node with a confirmed autonomous policy continues serving saved keys without the panel, including XHTTP through a CDN pointing directly at the node. Access expiry, quotas, speeds and rules remain enforced locally. Exhausted credit or expiry still denies access. New users, renewals and blocks arrive after reconnection. Before stopping applications, the installer checks node autonomy. Unconfirmed readiness produces a warning and the update continues without an extra flag. Panel-dependent nodes may temporarily lose connectivity. Legacy policy without local reserves expires after 90 seconds; simply disabling that deadline is unsafe. Manual docker compose down bypasses the check and also stops a node or proxy in the same project.'
            ],
            [
                'نودها هنگام قطع پنل',
                'نود با سیاست مستقل تأییدشده، کلیدهای ذخیره‌شده را بدون پنل سرویس می‌دهد؛ از جمله XHTTP با CDN مستقیم به نود. انقضا، سهمیه، سرعت و قواعد محلی حفظ می‌شوند. پایان اعتبار یا سهمیه همچنان دسترسی را می‌بندد. کاربران جدید، تمدیدها و مسدودسازی‌ها پس از اتصال مجدد می‌رسند. نصاب پیش از توقف برنامه‌ها استقلال نودها را بررسی می‌کند. در نبود تأیید، هشدار می‌دهد و به‌روزرسانی بدون گزینه اضافی ادامه می‌یابد. نودهای وابسته به پنل ممکن است موقتاً قطع شوند. سیاست قدیمی بدون ذخیره محلی پس از 90 ثانیه منقضی می‌شود و حذف این مهلت امن نیست. اجرای دستی docker compose down بررسی را دور می‌زند و نود یا پروکسی همان پروژه را نیز متوقف می‌کند.'
            ],
            [
                '面板离线时的节点',
                '已确认自主策略的节点可在面板离线时继续使用已保存的密钥，包括 CDN 直连节点的 XHTTP。访问期限、配额、限速和规则仍在本地执行；额度耗尽或到期仍会拒绝访问。新用户、续期和封禁在恢复连接后同步。安装程序在停止应用前检查节点自主性。未确认就绪时会警告并继续更新，无需额外参数。依赖面板的节点可能暂时断连。没有本地配额的旧策略会在 90 秒后到期，不能简单取消此期限。手动执行 docker compose down 会绕过检查，也会停止同一项目中的节点或代理。'
            ]
        ]
    ],
    [
        'hosts',
        'hosts-device-speed',
        [
            [
                'Динамическая скорость устройств',
                'Лимит скорости пользователя в Mbps — общий потолок всех его соединений на этом хосте. Активные ключи устройств делят его по объёму переданных данных: одно устройство использует свободную скорость, при появлении другого канал перераспределяется; неактивным устройствам доля не резервируется. Отдельный лимит устройства ограничивает все соединения его приватного ключа, включая загрузку и отдачу. При 20 Mbps на пользователя и 15 Mbps на устройство одно активное устройство получит до 15 Mbps; два загружающих устройства смогут делить 20 Mbps, примерно по 10 Mbps при постоянном спросе. Это верхние пределы, а не гарантия скорости сети. Общий лимит хоста или тега делится сначала между пользователями, затем между их устройствами; число потоков не увеличивает долю. Без заданного общего предела физическая ёмкость канала неизвестна ядру.'
            ],
            [
                'Dynamic device bandwidth',
                'The user speed in Mbps is a shared ceiling for all their connections on this host. Active device keys share it by bytes served: one device uses available capacity; when another sends traffic, capacity is redistributed. Idle devices reserve nothing. The device speed limit caps all connections of its private key, combining upload and download. With a 20 Mbps user ceiling and a 15 Mbps device ceiling, one active device gets up to 15 Mbps; two continuously demanding devices can share 20 Mbps, roughly 10 Mbps each. These are ceilings, not guaranteed network rates. A configured host or tag shared ceiling is divided first among users, then their devices; opening more flows does not increase the share. Without a configured shared ceiling the core does not know the physical channel capacity.'
            ],
            [
                'تقسیم پویای سرعت دستگاه‌ها',
                'سرعت کاربر با Mbps سقف مشترک همه اتصال‌های او در این میزبان است. کلیدهای فعال بر پایه بایت‌های انتقال‌یافته سهم می‌گیرند؛ یک دستگاه از ظرفیت آزاد استفاده می‌کند و با شروع ترافیک دستگاه دیگر، سهم‌ها تغییر می‌کنند. دستگاه بیکار ظرفیتی رزرو نمی‌کند. سقف دستگاه همه اتصال‌های کلید خصوصی آن را برای ارسال و دریافت محدود می‌کند. با سقف کاربر 20 Mbps و دستگاه 15 Mbps، یک دستگاه تا 15 Mbps می‌گیرد؛ دو دستگاه پرمصرف می‌توانند 20 Mbps را تقریباً نصف کنند. این سقف است، نه تضمین سرعت شبکه. سقف مشترک میزبان یا برچسب ابتدا بین کاربران و سپس دستگاه‌هایشان تقسیم می‌شود؛ افزایش تعداد اتصال سهم را زیاد نمی‌کند. بدون سقف مشترک، ظرفیت فیزیکی کانال برای هسته معلوم نیست.'
            ],
            [
                '设备动态带宽',
                '以 Mbps 设置的用户速度是此主机上该用户所有连接的共享上限。活跃设备密钥按已服务字节数共享带宽：单个设备使用空闲容量，其他设备产生流量时会重新分配；空闲设备不预留份额。设备上限合计限制其私钥的全部上传和下载连接。若用户上限为 20 Mbps、设备上限为 15 Mbps，一个设备最多使用 15 Mbps；两个持续传输的设备可共享 20 Mbps，约各 10 Mbps。这些是上限，而非网络速率保证。主机或标签的共享上限先在用户间分配，再在用户设备间分配；增加连接数不会增加份额。未配置共享上限时，核心无法知道物理信道容量。'
            ]
        ]
    ],
    [
        'host-tags',
        'host-tags-device-speed',
        [
            [
                'Лимит устройства из тега',
                'Лимит устройства из тега применяется отдельно на каждом хосте с включённым переключателем «Учитывать скорость на устройство из тегов». Он независим от квоты тега, скорости пользователя и общей скорости. Самый строгий из действующих пределов ограничивает передачу; 0 отключает только соответствующий предел. Нужны обновлённые нода и ядро с поддержкой remnacust-device-speed-v1. Несовместимая нода не может подтвердить новый лимит. При нескольких нодах предел консервативно делится между привязками, чтобы сумма не превысила настройку; это не перенос свободной скорости между нодами. HWID используется для выдачи отдельного приватного ключа. Копии одного ключа считаются одним устройством; приложение без отдельного ключа не позволяет различать физические устройства. Правила остаются на ноде при недоступной панели.'
            ],
            [
                'Device speed from tags',
                'A tag device ceiling applies independently on each host with “Apply device speed limit from tags” enabled. It is independent of tag quota, user speed and shared speed. The strictest applicable ceiling wins; 0 disables only the corresponding ceiling. Update node and core to support remnacust-device-speed-v1. An incompatible node cannot confirm the new limit. Across multiple bound nodes, the configured ceiling is conservatively divided so their sum cannot exceed it; spare capacity is not transferred between nodes. HWID enrolls a distinct private key. Copies of one key count as one device; applications without distinct keys cannot identify physical devices separately. Local rules remain active while the panel is unavailable.'
            ],
            [
                'سرعت دستگاه از برچسب',
                'سقف دستگاه برچسب جداگانه روی هر میزبان با کلید مربوط فعال اعمال می‌شود؛ از سهمیه، سرعت کاربر و سرعت مشترک مستقل است. سخت‌گیرانه‌ترین سقف اعمال می‌شود؛ 0 فقط همان سقف را حذف می‌کند. نود و هسته باید از remnacust-device-speed-v1 پشتیبانی کنند؛ نود ناسازگار محدودیت جدید را تأیید نمی‌کند. در چند نود متصل، سقف محافظه‌کارانه تقسیم می‌شود تا مجموع از تنظیم بیشتر نشود؛ ظرفیت آزاد بین نودها جابه‌جا نمی‌شود. HWID کلید خصوصی جدا ثبت می‌کند. نسخه‌های یک کلید یک دستگاه‌اند؛ برنامه بدون کلید جدا امکان تشخیص دستگاه فیزیکی را نمی‌دهد. قوانین محلی هنگام قطعی پنل باقی می‌مانند.'
            ],
            [
                '标签设备限速',
                '启用对应开关后，标签的设备上限在各主机独立生效，与标签配额、用户速度和共享总速度相互独立。采用最严格的有效上限；0 仅关闭对应上限。节点和核心必须支持 remnacust-device-speed-v1；不兼容节点不能确认新限制。多个绑定节点间保守地分配上限，确保总和不超过设置值；空闲带宽不会跨节点转移。HWID 用于签发独立私钥。同一密钥的副本视为一个设备；没有独立密钥的应用无法区分物理设备。面板不可用时本地规则继续生效。'
            ]
        ]
    ],
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
                'Совместимые изменения применяются через ядро без перезапуска процесса. Начиная с Node 1.1.21, обычное обновление профиля при точном отказе ядра из-за смены порта или транспорта автоматически проверяет конфигурацию и перезапускает только Xray. При неудаче восстанавливаются прежний приватный checkpoint и рабочая конфигурация. Возможен краткий обрыв соединений. Таймаут, неизвестный ответ или повреждённый checkpoint не разрешают автоматический restart. Строгий requireLiveApply и управляемые планы портов сохраняют свой контракт: такой отказ не превращается в скрытый полный перезапуск. Обновление контейнера или бинарника ядра также может прервать подключения.'
            ],
            [
                'Changing an active port',
                'Compatible changes apply through the core without restarting its process. From Node 1.1.21, an ordinary profile update with the exact native port-or-transport rejection validates the configuration and automatically restarts Xray only. Failed startup restores the previous private checkpoint and working configuration. Connections may briefly drop. Timeouts, unknown replies and damaged checkpoints do not authorize automatic restart. Strict requireLiveApply and managed port plans retain their contract: such a rejection never becomes a hidden full restart. Updating the container or core binary can also interrupt connections.'
            ],
            [
                'تغییر پورت فعال',
                'تغییرات سازگار بدون راه‌اندازی دوباره فرایند هسته اعمال می‌شوند. از Node 1.1.21، به‌روزرسانی عادی پروفایل پس از خطای دقیق تغییر پورت یا ترنسپورت، پیکربندی را اعتبارسنجی و فقط Xray را خودکار راه‌اندازی دوباره می‌کند. در شکست اجرا، checkpoint خصوصی و پیکربندی سالم قبلی بازگردانده می‌شوند. ممکن است اتصال کوتاه‌مدت قطع شود. مهلت تمام‌شده، پاسخ ناشناخته و checkpoint خراب مجوز restart خودکار نیستند. requireLiveApply سخت‌گیرانه و طرح‌های مدیریت‌شده قرارداد خود را حفظ می‌کنند و این رد شدن به راه‌اندازی کامل پنهان تبدیل نمی‌شود. به‌روزرسانی کانتینر یا باینری نیز ممکن است اتصال‌ها را قطع کند.'
            ],
            [
                '修改正在使用的端口',
                '兼容修改通过内核应用，无需重启进程。从 Node 1.1.21 起，普通配置更新遇到确切的端口或传输变更拒绝时，会先验证配置，再自动仅重启 Xray。启动失败会恢复先前的私有 checkpoint 和工作配置，连接可能短暂中断。超时、未知回复和损坏的 checkpoint 不会授权自动重启。严格 requireLiveApply 和托管端口计划保持原有约定，此类拒绝不会转为隐藏的完整重启。更新容器或内核二进制也可能中断连接。'
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

sections.push([
    'architecture',
    'architecture-browser-refresh',
    [
        [
            'Обновление браузера после выпуска',
            'После обновления открытые вкладки проверяют версию панели и перезагружают страницу после завершения текущего действия. Сохранённые пользователи, настройки и шаблоны остаются на сервере. Старую вкладку может потребоваться обновить вручную.\n\nПеред обслуживанием сохраните текст редактора или его копию. Если доступно восстановление локального черновика, откройте «История → Несохранённый черновик» и проверьте содержимое перед применением. Восстановление не применяется без вашего выбора. Не считайте несохранённый текст резервной копией.'
        ],
        [
            'Browser refresh after an update',
            'After an update, open tabs check the panel version and reload once the current action finishes. Saved users, settings and templates remain on the server. An older tab may need a manual refresh.\n\nBefore maintenance, save editor text or a separate copy. If local draft recovery is available, open History → Unsaved draft and review the content before applying it. Recovery is never applied without your choice. Unsaved text is not a backup.'
        ],
        [
            'تازه‌سازی مرورگر پس از به‌روزرسانی',
            'پس از به‌روزرسانی، زبانه‌های باز نسخه پنل را بررسی و پس از پایان اقدام جاری صفحه را دوباره بارگذاری می‌کنند. کاربران، تنظیمات و قالب‌های ذخیره‌شده روی سرور باقی می‌مانند. زبانه قدیمی ممکن است به تازه‌سازی دستی نیاز داشته باشد.\n\nپیش از نگهداری متن ویرایشگر یا کپی جداگانه آن را ذخیره کنید. اگر بازیابی پیش‌نویس محلی در دسترس است، تاریخچه ← پیش‌نویس ذخیره‌نشده را باز و محتوا را پیش از اعمال بررسی کنید. بازیابی بدون انتخاب شما اعمال نمی‌شود. متن ذخیره‌نشده نسخه پشتیبان نیست.'
        ],
        [
            '更新后的浏览器刷新',
            '更新后，已打开的标签页会检查面板版本，并在当前操作完成后重新加载。已保存的用户、设置和模板仍保留在服务器上。旧标签页可能需要手动刷新。\n\n维护前请保存编辑器文本或另存副本。若支持本地草稿恢复，可打开“历史 → 未保存的草稿”，核对内容后再应用。未经选择不会自动应用恢复。未保存文本不能替代备份。'
        ]
    ]
])

sections.push([
    'api-tokens',
    'api-token-private-configuration',
    [
        [
            'Чтение приватных настроек через API',
            'Ответы API нод не содержат сырые настройки инбаундов и приватные ключи. Для чтения конфигурации используйте API профилей с соответствующим разрешением. Изменение профиля требует права обновления и config-profiles:get; изменение шаблона — права обновления и subscription-template:get, поскольку ответ содержит сохранённый текст. Подходящие права :read, :* или * также разрешают чтение. Без права чтения запрос отклоняется до изменения данных. Изменение пользователя, активация, отключение, продление, сброс трафика и отзыв подписки дополнительно требуют users:by-id. Изменение внешнего сквада требует external-squads:get, изменение порядка — external-squads:list. Соответствующие :read и :* также подходят. Создание пользователя не требует чтения существующих ключей. Сеанс администратора работает как прежде.'
        ],
        [
            'Reading private settings through the API',
            'Node API responses exclude raw inbound settings and private keys. Use the profile API with the appropriate permission to read configuration. Updating a profile requires update permission and config-profiles:get; updating a template requires update permission and subscription-template:get because the response contains stored content. Matching :read, :* or * scopes also permit reading. Without read access, the request is rejected before changing data. Updating, enabling, disabling or extending users, resetting their traffic and revoking subscriptions also require users:by-id. Updating an external squad requires external-squads:get; reordering requires external-squads:list. Matching :read and :* grants also apply. Creating a user does not require reading existing keys. Administrator sessions keep their existing behavior.'
        ],
        [
            'خواندن تنظیمات خصوصی از API',
            'پاسخ API نود تنظیمات خام ورودی و کلید خصوصی را نمایش نمی‌دهد. برای خواندن پیکربندی، از API پروفایل با مجوز مناسب استفاده کنید. ویرایش پروفایل به مجوز تغییر و config-profiles:get و ویرایش قالب به مجوز تغییر و subscription-template:get نیاز دارد، زیرا پاسخ شامل متن ذخیره‌شده است. مجوز متناظر :read یا :* یا * نیز خواندن را مجاز می‌کند. بدون مجوز خواندن، درخواست پیش از تغییر داده رد می‌شود. ویرایش، فعال‌سازی، غیرفعال‌سازی، تمدید، بازنشانی ترافیک کاربر و لغو اشتراک به users:by-id نیز نیاز دارند. ویرایش گروه خارجی به external-squads:get و تغییر ترتیب آن به external-squads:list نیاز دارد. مجوز متناظر :read و :* نیز معتبر است. ایجاد کاربر به خواندن کلیدهای موجود نیاز ندارد. رفتار نشست مدیر تغییر نمی‌کند.'
        ],
        [
            '通过 API 读取私密设置',
            '节点 API 响应不包含原始入站设置及私钥。读取配置请使用具有相应权限的配置档案 API。更新配置档案需要更新权限和 config-profiles:get；更新模板需要更新权限和 subscription-template:get，因为响应包含已保存内容。匹配的 :read、:* 或 * 权限同样允许读取。缺少读取权限时，请求会在修改数据前被拒绝。修改、启用、停用、延长用户期限、重置流量及撤销订阅还需要 users:by-id。修改外部分组需要 external-squads:get，调整顺序需要 external-squads:list；匹配的 :read 和 :* 权限同样适用。创建用户无需读取现有密钥。管理员会话的行为保持不变。'
        ]
    ]
])

sections.push([
    'templates',
    'template-generation-budget',
    [
        [
            'Размер выдачи и ошибки генерации',
            'Готовая подписка ограничена 16 MiB. Разворачивание групп Sing-box, Mihomo, Stash и Clash дополнительно ограничивается во время сборки с запасом на экранирование и форматирование; слишком большой состав может быть отклонён до достижения точного лимита. Уменьшите число групп или серверов в них. При ошибке генерации клиент получает HTTP 503, а не пустую успешную подписку. При недоступном кеше шаблон читается из базы данных.'
        ],
        [
            'Output size and generation errors',
            'A generated subscription is limited to 16 MiB. Sing-box, Mihomo, Stash and Clash group expansion is also bounded during generation with room for escaping and formatting; excessive fanout may be rejected before reaching the exact limit. Reduce the number of groups or their servers. Generation failures return HTTP 503 rather than an empty successful subscription. When the cache is unavailable, templates are read from the database.'
        ],
        [
            'اندازه خروجی و خطای تولید',
            'اندازه اشتراک تولیدشده حداکثر 16 MiB است. گسترش گروه‌های Sing-box، Mihomo، Stash و Clash هنگام تولید نیز با احتساب حاشیه برای قالب‌بندی و نویسه‌های گریز محدود می‌شود؛ ترکیب بیش‌ازحد بزرگ ممکن است پیش از سقف دقیق رد شود. تعداد گروه‌ها یا سرورهای آن‌ها را کاهش دهید. خطای تولید HTTP 503 برمی‌گرداند، نه اشتراک خالی با پاسخ موفق. در دسترس نبودن کش، قالب از پایگاه داده خوانده می‌شود.'
        ],
        [
            '输出大小与生成错误',
            '生成的订阅最大为 16 MiB。Sing-box、Mihomo、Stash 和 Clash 的分组展开在生成期间也有限制，并为转义与格式化预留空间；过多的分组成员可能在达到精确上限前被拒绝。请减少分组数量或组内服务器数量。生成失败返回 HTTP 503，而不是成功的空订阅。缓存不可用时从数据库读取模板。'
        ]
    ]
])

sections.push([
    'nodes',
    'nodes-delivery-confirmation',
    [
        [
            'Подтверждение команд ноды',
            'После запуска, остановки или назначения профиля проверьте итоговый статус ноды. Сообщение о принятом действии не подтверждает его применение. Неподтверждённая остановка остаётся ошибкой и повторяется; отключённая администратором нода не включается автоматически после сбоя. Проверьте связь и журнал перед повторным действием.\n\nОбновление образа Node сохраняет ранее выбранное управляемое ядро. Проверьте запущенную версию в задачах ноды, при необходимости обновите Core отдельно и затем обновите подписку. Предупреждение о лимитах автовыбора исчезает после подтверждения поддержки и успешного применения; ошибка проверки не отменяет ограничения.'
        ],
        [
            'Confirming node commands',
            "After starting, stopping or assigning a profile, check the node's final status. An accepted action does not confirm application. An unconfirmed stop remains an error and is retried; an administrator-disabled node is not automatically enabled after failure. Check connectivity and logs before repeating an action.\n\nUpdating the Node image preserves the previously selected managed core. Check the running version in node tasks, update Core separately when required, then refresh the subscription. An autoselect-limit warning clears after support and successful application are confirmed; a failed check does not remove restrictions."
        ],
        [
            'تأیید فرمان نود',
            'پس از شروع، توقف یا تخصیص پروفایل وضعیت نهایی نود را بررسی کنید. پذیرفتن اقدام اعمال آن را تأیید نمی‌کند. توقف تأییدنشده خطا باقی می‌ماند و تکرار می‌شود؛ نودی که مدیر خاموش کرده پس از خطا خودکار روشن نمی‌شود. پیش از تکرار ارتباط و گزارش را بررسی کنید.\n\nارتقای تصویر Node هسته مدیریت‌شده قبلی را حفظ می‌کند. نسخه در حال اجرا را در کارهای نود بررسی، در صورت نیاز Core را جداگانه ارتقا و سپس اشتراک را تازه کنید. هشدار محدودیت انتخاب خودکار پس از تأیید پشتیبانی و اعمال موفق رفع می‌شود؛ بررسی ناموفق محدودیت را برنمی‌دارد.'
        ],
        [
            '确认节点命令',
            '启动、停止或分配配置后，请检查节点最终状态。操作被接受不代表已经应用。未确认的停止保留为错误并重试；管理员禁用的节点不会因故障自动启用。重复操作前检查连接和日志。\n\n更新 Node 镜像会保留此前选择的托管内核。请在节点任务中核对运行版本，必要时单独更新 Core，再刷新订阅。自动选择限额警告仅在确认支持并成功应用后消失，检查失败不会取消限制。'
        ]
    ]
])

sections.push(
    [
        'profiles',
        'profile-certificate-file-safety',
        [
            [
                'Файлы сертификатов',
                'Если панель должна прочитать PEM-файл для подготовки конфигурации, подключите его только для чтения внутри /var/lib/remnawave и укажите этот путь. Чтение вне каталога, включая выход через символическую ссылку, запрещено. Обычные текстовые файлы, FIFO и PEM больше 128 KiB не принимаются. Это правило относится к файлам, которые читает панель; оно не переносит сертификаты ноды и не настраивает её HTTPS автоматически.'
            ],
            [
                'Certificate files',
                'If the panel needs to read a PEM file while preparing configuration, mount it read-only under /var/lib/remnawave and use that path. Reads outside this directory, including symlink escapes, are denied. Ordinary text files, FIFOs and PEM files over 128 KiB are rejected. This applies to files read by the panel; it does not relocate node certificates or configure node HTTPS automatically.'
            ],
            [
                'فایل‌های گواهی',
                'اگر پنل برای آماده‌سازی پیکربندی باید فایل PEM بخواند، آن را فقط‌خواندنی داخل /var/lib/remnawave متصل و همان مسیر را وارد کنید. خواندن بیرون این پوشه، از جمله خروج از طریق پیوند نمادین، ممنوع است. فایل متن عادی، FIFO و PEM بزرگ‌تر از 128 KiB پذیرفته نمی‌شود. این قاعده مربوط به فایل‌هایی است که پنل می‌خواند؛ گواهی نود را جابه‌جا یا HTTPS آن را خودکار تنظیم نمی‌کند.'
            ],
            [
                '证书文件',
                '如果面板在准备配置时需要读取 PEM 文件，请将其以只读方式挂载到 /var/lib/remnawave 下并使用该路径。禁止读取此目录以外的文件，包括通过符号链接逃逸。普通文本、FIFO 以及超过 128 KiB 的 PEM 文件会被拒绝。此规则只适用于面板读取的文件，不会移动节点证书或自动配置节点 HTTPS。'
            ]
        ]
    ],
    [
        'overview',
        'overview-database-diagnostics',
        [
            [
                'Обновление главной страницы',
                'Кнопка обновления на главной заново запрашивает статистику пользователей, трафик и состояние панели. Дождитесь окончания загрузки перед повторным обновлением. Недоступный показатель не означает нулевое значение. Если данные не появились, проверьте доступность панели и журнал ошибок.'
            ],
            [
                'Refreshing Home',
                'The Home refresh button requests user statistics, traffic and panel status again. Wait for loading to finish before refreshing again. An unavailable metric does not mean zero. If data does not appear, check panel availability and the error log.'
            ],
            [
                'تازه‌سازی صفحه اصلی',
                'دکمه تازه‌سازی صفحه اصلی آمار کاربران، ترافیک و وضعیت پنل را دوباره دریافت می‌کند. پیش از تکرار تازه‌سازی منتظر پایان بارگذاری بمانید. شاخص ناموجود به معنی صفر نیست. اگر داده نمایش داده نشد دسترسی پنل و گزارش خطا را بررسی کنید.'
            ],
            [
                '刷新首页',
                '首页刷新按钮重新获取用户统计、流量和面板状态。请等待加载结束后再刷新。指标不可用不代表值为零。数据未显示时，请检查面板是否可访问以及错误日志。'
            ]
        ]
    ],
    [
        'architecture',
        'architecture-platform-compatibility',
        [
            [
                'ОС и база данных',
                'Установщик поддерживает Ubuntu 22.04/24.04/26.04 LTS и Debian 12/13 на amd64/arm64. Для установки готовых образов нужны Docker Engine и Compose v2; Node.js и Go на сервере не требуются. Учитывайте требования выбранного выпуска установщика.\n\nОбновление панели сохраняет существующую базу и её том. Для новых установок выбирайте поддерживаемую PostgreSQL с текущими исправлениями. Срок поддержки PostgreSQL 14 завершился 12 ноября 2026 года. Смена основной версии БД требует отдельного переноса через pg_upgrade или dump/restore с проверкой на копии. Не открывайте старый том образом другой основной версии.'
            ],
            [
                'Operating system and database',
                'The installer supports Ubuntu 22.04/24.04/26.04 LTS and Debian 12/13 on amd64/arm64. Prebuilt-image installation needs Docker Engine and Compose v2; host Node.js and Go are unnecessary. Check the requirements of the installer release you select.\n\nPanel upgrades preserve the existing database and volume. For new installations, choose a supported PostgreSQL major version with current fixes. PostgreSQL 14 reached its scheduled end of support on November 12, 2026. Changing the database major version requires a separate pg_upgrade or dump/restore verified on a copy. Do not open an old volume with an image of another major version.'
            ],
            [
                'سیستم‌عامل و پایگاه داده',
                'نصب‌کننده از Ubuntu 22.04/24.04/26.04 LTS و Debian 12/13 روی amd64/arm64 پشتیبانی می‌کند. نصب تصاویر آماده به Docker Engine و Compose v2 نیاز دارد؛ Node.js و Go روی سرور لازم نیست. الزامات نسخه انتخاب‌شده نصب‌کننده را بررسی کنید.\n\nارتقای پنل پایگاه داده و volume موجود را حفظ می‌کند. برای نصب جدید نسخه اصلی پشتیبانی‌شده PostgreSQL با اصلاحات جاری را انتخاب کنید. تاریخ پایان پشتیبانی برنامه‌ریزی‌شده PostgreSQL 14 برابر ۱۲ نوامبر ۲۰۲۶ بود. تغییر نسخه اصلی پایگاه داده به انتقال جداگانه با pg_upgrade یا dump/restore و آزمایش روی کپی نیاز دارد. volume قدیمی را با تصویر نسخه اصلی دیگری باز نکنید.'
            ],
            [
                '操作系统与数据库',
                '安装器支持 amd64/arm64 的 Ubuntu 22.04/24.04/26.04 LTS 和 Debian 12/13。安装预构建镜像需要 Docker Engine 和 Compose v2，无需在宿主机安装 Node.js 或 Go。请核对所选安装器版本的要求。\n\n面板升级保留现有数据库及数据卷。新安装请选择仍受支持且包含当前修复的 PostgreSQL 主版本。PostgreSQL 14 的计划支持结束日期为 2026 年 11 月 12 日。更换数据库主版本需要单独执行 pg_upgrade 或 dump/restore，并先在副本上验证。不要用另一主版本的镜像打开旧数据卷。'
            ]
        ]
    ]
)

sections.push([
    'nodes',
    'nodes-global-xray-mode',
    [
        [
            'Настройка Xray',
            'Раздел «Настройка Xray» выбирает ядро сразу для всей панели. По умолчанию используется кастомное ядро Remnacust. Обычный Xray подходит для стандартных протоколов и транспортов. Пользователи, заморозка, подписки, геофайлы и клиентский автовыбор работают в обоих режимах. Лимиты хостов и устройств, отдельный учёт получателя автовыбора, правила доступа к сайтам, хосты для неактивного доступа, планы портов и Xera HTTP требуют кастомного ядра. В обычном режиме их настройки недоступны и не применяются; сохранённые значения не удаляются.\n\nПеред переходом на обычный Xray панель проверяет активные профили, планы портов и журналы квот. Устраните показанные препятствия: данные учёта и резервы нельзя просто удалять ради переключения. Для выбора двух ядер на нашей ноде нужен обновлённый образ Node; обычные Remnawave-ноды сохраняют базовую совместимость. Применение занимает время; дождитесь результата на нодах. Выбор режима не подтверждает успешное применение на каждой ноде: проверьте её состояние.\n\nСмена ядра перезапускает его и может прервать подключения. Сначала сохраните изменения редактора. При смене режима редактор проверяет параметры выбранного ядра. Общий режим имеет приоритет над прежним выбором в профиле; сохранённый профиль не переписывается. Управление версиями кастомного ядра доступно только в кастомном режиме.'
        ],
        [
            'Xray settings',
            'Xray settings selects one core flavor for the entire panel. The default is the custom Remnacust core. Stock Xray supports standard protocols and transports. Users, freezing, subscriptions, geofiles and client-side autoselect work in both modes. Host/device limits, separate autoselect recipient accounting, destination access rules, inactive-access hosts, port plans and Xera HTTP require the custom core. Stock mode disables their controls and effective policies without deleting saved settings.\n\nBefore switching to stock Xray, the panel checks active profiles, port plans and quota journals. Resolve the listed blockers; never delete accounting data or reserves merely to switch. Dual-core selection on a custom node requires an updated Node image; native Remnawave nodes retain baseline compatibility. Applying the change takes time; wait for the node results. Selection does not prove every node applied it: check node status.\n\nSwitching cores restarts the core and may interrupt connections. Save editor changes first. After a mode change, the editor checks options for the selected core. The global mode overrides the previous profile choice without rewriting the saved profile. Custom core version management is available only in custom mode.'
        ],
        [
            'تنظیمات Xray',
            'بخش تنظیمات Xray یک نوع هسته را برای کل پنل انتخاب می‌کند. پیش‌فرض هسته سفارشی Remnacust است. Xray معمولی پروتکل‌ها و انتقال‌های استاندارد را پشتیبانی می‌کند. کاربران، انجماد، اشتراک، فایل‌های جغرافیایی و انتخاب خودکار سمت کلاینت در هر دو حالت کار می‌کنند. محدودیت میزبان و دستگاه، حسابداری مستقل گیرنده انتخاب خودکار، قواعد مقصد، میزبان دسترسی غیرفعال، طرح پورت و Xera HTTP به هسته سفارشی نیاز دارند. در حالت معمولی کنترل‌ها و سیاست‌های آن‌ها غیرفعال می‌شوند، اما تنظیمات ذخیره‌شده حذف نمی‌شوند.\n\nپیش از تغییر، پروفایل‌های فعال، طرح پورت و دفترهای سهمیه بررسی می‌شوند. موانع نمایش‌داده‌شده را رفع کنید؛ داده حسابداری و ذخایر را برای تغییر هسته حذف نکنید. انتخاب دو هسته روی نود سفارشی به تصویر Node به‌روز نیاز دارد؛ نود Remnawave معمولی سازگاری پایه را حفظ می‌کند. اعمال تغییر زمان می‌برد؛ منتظر نتیجه نودها بمانید. انتخاب به‌معنی اعمال موفق روی همه نودها نیست؛ وضعیت نود را بررسی کنید.\n\nتعویض هسته آن را بازراه‌اندازی می‌کند و ممکن است اتصال را قطع کند. ابتدا تغییرات ویرایشگر را ذخیره کنید. پس از تغییر حالت، ویرایشگر گزینه‌های هسته انتخابی را بررسی می‌کند. حالت عمومی بر انتخاب قدیمی پروفایل اولویت دارد و پروفایل ذخیره‌شده بازنویسی نمی‌شود. مدیریت نسخه هسته سفارشی فقط در حالت سفارشی فعال است.'
        ],
        [
            'Xray 设置',
            '“Xray 设置”为整个面板选择统一内核，默认使用 Remnacust 自定义内核。标准 Xray 支持标准协议和传输。用户、冻结、订阅、地理文件和客户端自动选择在两种模式下均可使用。主机和设备限制、自动选择接收对象独立计费、目标访问规则、非活跃访问主机、端口计划和 Xera HTTP 需要自定义内核。标准模式会禁用相关控件和有效策略，但不会删除已保存设置。\n\n切换前会检查活动配置、端口计划和配额日志。请解决列出的阻碍，不要为切换而删除计费数据或预留额度。自定义节点需更新 Node 镜像才能选择双内核；标准 Remnawave 节点保留基本兼容性。应用更改需要时间，请等待节点结果。选中模式并不代表所有节点均已应用，请检查节点状态。\n\n切换内核需要重启内核，可能中断连接。请先保存编辑器修改。切换模式后，编辑器检查所选内核的参数。全局模式优先于配置中原有的内核选择，但不会重写已保存配置。自定义内核版本管理仅在自定义模式下可用。'
        ]
    ]
])

sections.push([
    'subscription-settings',
    'subscription-hwid-delivery',
    [
        [
            'Обновление подписки и HWID',
            'Подписка может обновиться, даже если управляющая связь с нодой недоступна. Персональные ключи доставляются отдельно; новое подключение на этой ноде заработает после получения ключа. При каждом обновлении сохраняются проверки пользователя, блокировки HWID, регистрации и числа устройств. Повторное обновление не отменяет ограничения.\n\nОбычное открытие страницы или запрос без заголовков устройства отличается от запроса Happ или INCY. При диагностике сравнивайте тот же URL, User-Agent приложения и HWID. Не публикуйте персональные ссылки и идентификаторы устройств.'
        ],
        [
            'Subscription refresh and HWID',
            'A subscription can refresh even when the node control connection is unavailable. Personal keys are delivered separately; a new connection on that node works after its key arrives. Every refresh still checks user access, HWID blocks, registration rules and device count. Repeated refreshes do not remove restrictions.\n\nOpening a web page or requesting without device headers differs from a Happ or INCY request. For diagnostics, compare the same URL, application User-Agent and HWID. Keep personal links and device identifiers private.'
        ],
        [
            'تازه‌سازی اشتراک و HWID',
            'اشتراک حتی هنگام قطع ارتباط مدیریتی نود می‌تواند تازه شود. کلیدهای شخصی جداگانه تحویل می‌شوند و اتصال جدید آن نود پس از رسیدن کلید کار می‌کند. هر بار دسترسی کاربر، مسدودی HWID، قواعد ثبت و تعداد دستگاه بررسی می‌شود. تکرار تازه‌سازی محدودیت را برنمی‌دارد.\n\nباز کردن صفحه یا درخواست بدون سربرگ دستگاه با درخواست Happ یا INCY فرق دارد. برای عیب‌یابی همان URL، User-Agent برنامه و HWID را مقایسه کنید. پیوند شخصی و شناسه دستگاه را عمومی نکنید.'
        ],
        [
            '订阅刷新与 HWID',
            '节点管理连接不可用时，订阅仍可刷新。个人密钥另行下发，该节点收到密钥后新连接才能使用。每次刷新仍检查用户权限、HWID 封禁、注册规则和设备数量；重复刷新不会取消限制。\n\n打开网页或不带设备请求头的请求不同于 Happ 或 INCY 请求。诊断时应比较同一 URL、应用 User-Agent 和 HWID。请勿公开个人链接和设备标识。'
        ]
    ]
])

export function explainCurrentWorkflows(articles) {
    const tagSettings = [
        'Настройки тега действуют на связанные хосты, у которых включён соответствующий переключатель: квота, скорость пользователя или общая скорость. Переключатель скорости устройства из тегов также независим. Перед сохранением проверьте участвующие хосты и ограничения. Получатели и персональные исключения доступны в разделе «Лимиты».',
        'Tag settings affect associated hosts with the corresponding quota, user-speed or shared-speed switch enabled. The device-speed inheritance switch is also independent. Check participating hosts and restrictions before saving. Open “Limits” for recipients and personal exceptions.',
        'تنظیمات برچسب روی میزبان‌هایی اعمال می‌شوند که کلید مربوط به سهمیه، سرعت کاربر یا سرعت مشترک را فعال کرده‌اند. کلید سرعت دستگاه نیز مستقل است. پیش از ذخیره، میزبان‌های مشارکت‌کننده و محدودیت‌ها را بررسی کنید. گیرندگان و استثناهای شخصی در «محدودیت‌ها» هستند.',
        '标签设置作用于已启用对应配额、用户速度或共享速度开关的关联主机。设备速度继承开关也相互独立。保存前检查参与主机和限制。接收对象与个人例外位于“限制”页面。'
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
