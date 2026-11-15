const sections = [
    {
        article: 'hosts',
        id: 'host-binding-readiness',
        before: 'hosts-2',
        translations: {
            ru: {
                title: 'Привязка хоста и статус DANGLING',
                body: 'Хост должен ссылаться на существующий inbound выбранного профиля. Если профиль или inbound удалён либо inbound больше не принадлежит этому профилю, карточка и строка таблицы получают красное выделение и пометку DANGLING. Выключенный хост или недоступная нода сами по себе не означают повреждённую привязку.\n\nОткройте хост, выберите действующий профиль и его inbound, затем сохраните. До исправления привязки клонирование недоступно. Имя профиля служит подписью и не определяет действительность привязки.'
            },
            en: {
                title: 'Host binding and the DANGLING state',
                body: 'A host must reference an existing inbound of its selected profile. If the profile or inbound is removed, or the inbound no longer belongs to that profile, the card and table row receive a red highlight and a DANGLING badge. A disabled host or an unavailable node alone does not invalidate its binding.\n\nOpen the host, select a valid profile and one of its inbounds, then save. Cloning is unavailable until the binding is repaired. The profile name is a display label and does not determine binding validity.'
            },
            fa: {
                title: 'اتصال هاست به پروفایل و وضعیت DANGLING',
                body: 'هاست باید به یک inbound موجود در پروفایل انتخاب‌شده اشاره کند. اگر پروفایل یا inbound حذف شود یا inbound دیگر متعلق به آن پروفایل نباشد، کارت و ردیف جدول با رنگ قرمز و نشان DANGLING نمایش داده می‌شوند. غیرفعال بودن هاست یا در دسترس نبودن نود به‌تنهایی اتصال را نامعتبر نمی‌کند.\n\nهاست را باز کنید، یک پروفایل معتبر و inbound همان پروفایل را انتخاب و ذخیره کنید. تا اصلاح اتصال، تکثیر هاست در دسترس نیست. نام پروفایل فقط برچسب نمایشی است و اعتبار اتصال را تعیین نمی‌کند.'
            },
            zh: {
                title: '主机绑定与 DANGLING 状态',
                body: '主机必须引用所选配置中实际存在的入站。配置或入站被删除，或者入站不再属于该配置时，卡片和表格行会显示红色高亮及 DANGLING 标记。仅禁用主机或节点不可用不会使绑定失效。\n\n打开主机，选择有效配置及其入站，然后保存。修复绑定之前无法克隆主机。配置名称仅用于显示，不决定绑定是否有效。'
            }
        }
    },
    {
        article: 'navigation',
        id: 'long-session-recovery',
        before: 'navigation-2',
        translations: {
            ru: {
                title: 'Долгое открытие страницы и повторный вход',
                body: 'Если после сна устройства или обрыва связи список не загрузился, восстановите сеть и нажмите «Повторить». Неизвестные показатели ноды показываются без подстановки нулей или здорового состояния. Если сессия закончилась, войдите снова: предыдущие списки очищаются и запрашиваются заново с правами новой сессии.\n\nСообщение о несовпадении формата ответа требует проверки согласованности версии интерфейса и API. После обновления панели обновите страницу. Не отключайте проверку формата и не меняйте ключи нод из-за ошибки отображения списка.'
            },
            en: {
                title: 'Long-open pages and signing in again',
                body: 'If a list fails to load after device sleep or a lost connection, restore the network and select Retry. Unknown node metrics are shown without substituting zero values or a healthy state. If the session has expired, sign in again: previous lists are cleared and fetched with the new session permissions.\n\nA response-format mismatch requires checking that the interface and API versions belong together. Refresh the page after a panel update. Do not disable response validation or replace node keys because a list failed to display.'
            },
            fa: {
                title: 'صفحه‌های طولانی‌مدت باز و ورود دوباره',
                body: 'اگر پس از خواب دستگاه یا قطع ارتباط، فهرست بارگیری نشد، شبکه را برقرار و «تلاش دوباره» را انتخاب کنید. معیارهای نامعلوم نود با صفر یا وضعیت سالم جایگزین نمی‌شوند. اگر نشست منقضی شده است، دوباره وارد شوید: فهرست‌های قبلی پاک می‌شوند و با مجوزهای نشست جدید دریافت می‌شوند.\n\nپیام ناسازگاری قالب پاسخ نیازمند بررسی هماهنگی نسخهٔ رابط و API است. پس از به‌روزرسانی پنل، صفحه را تازه کنید. به‌خاطر نمایش داده نشدن فهرست، اعتبارسنجی پاسخ را غیرفعال یا کلیدهای نود را تعویض نکنید.'
            },
            zh: {
                title: '长时间打开页面与重新登录',
                body: '设备休眠或断网后列表加载失败时，请恢复网络并选择“重试”。未知的节点指标不会被替换为零值或健康状态。会话过期时请重新登录：之前的列表会被清除，再根据新会话的权限获取。\n\n响应格式不匹配时，需要检查界面与 API 是否属于同一版本。更新面板后请刷新页面。不要因为列表显示失败而禁用响应校验或更换节点密钥。'
            }
        }
    },
    {
        article: 'nodes',
        id: 'nodes-ip-discovery',
        before: 'nodes-2',
        translations: {
            ru: {
                title: 'IP-адреса и повторный поиск',
                body: 'В компактном списке IP-адресов можно хранить IPv4, IPv6 и имена хостов. Фиолетовая метка «Панельный» отмечает первый включённый адрес — предпочтительный адрес управления в порядке списка. Переключатель разрешает панели использовать соответствующий адрес; порядок меняется стрелками. Сохранённые адреса, добавленные вручную, можно выключить или переставить. Для исправления добавьте новый адрес и выключите старый: обычное редактирование не удаляет сохранённые строки.\n\nС Node 1.1.38 панель получает полный список назначенных IPv4 и IPv6 отдельным защищённым запросом, который работает и при остановленном Xray. При доступном API ноды успешные автоматические проверки выполняются с интервалом 30 минут; время последней успешной проверки сохраняется после перезапуска панели. Новые IP добавляются, исчезнувшие ранее подтверждённые нодой адреса удаляются. IP, введённый вручную, после подтверждения нодой также участвует в этой сверке. Ручные IP, которые нода никогда не подтверждала, и имена хостов сохраняются. Источник списка — сетевые интерфейсы ОС ноды: изменение в панели хостера станет видно после обновления интерфейсов самой ОС.\n\nКнопка со значком обновления «Повторно найти IP» немедленно запускает ту же сверку. Порядок оставшихся строк и их выключенное состояние сохраняются. Сначала сохраните изменения адреса, порта или прокси. Ошибка, неполный список или устаревший ответ не очищают адреса. Старый агент без поддержки поиска оставляет список прежним; обновите Node либо продолжайте вводить адреса вручную. Если полный ответ не содержит ни одного ранее подтверждённого адреса и ручных записей не осталось, панель не возвращает старый IP скрытым резервом — добавьте доступный адрес вручную.\n\nИнтерфейс не позволяет выключить последний включённый адрес управления. Чтобы сменить его, сначала включите другой адрес. Существующий полностью выключенный список можно восстановить, включив нужный адрес.'
            },
            en: {
                title: 'IP addresses and rescanning',
                body: 'The compact IP list accepts IPv4, IPv6 and hostnames. The purple Panel badge marks the first enabled address, preferred for node management in list order. Each toggle permits the panel to use that address; arrows change priority. Saved manual addresses can be disabled or reordered. To correct one, add a new address and disable the old one: ordinary editing keeps saved rows.\n\nWith Node 1.1.38, the panel obtains the complete assigned IPv4/IPv6 inventory through a separate authenticated request that also works while Xray is stopped. Successful automatic checks use a 30-minute interval while the node API is available; the last successful check survives a panel restart. New IPs are added and disappeared addresses previously confirmed by the node are removed. A manually entered IP joins this reconciliation after the node confirms it. Manual IPs never confirmed by the node and hostnames are preserved. The inventory comes from the node OS network interfaces: provider-side changes appear after those interfaces are updated.\n\nThe refresh icon button (Rescan IPs) immediately runs the same reconciliation. Surviving row order and disabled states remain. Save address, port or proxy changes first. Failed, incomplete or stale responses do not clear saved addresses. An older agent without discovery support leaves the list intact; update Node or continue adding addresses manually. If a complete reply contains none of the previously confirmed addresses and no manual entries remain, the panel does not revive the old IP as a hidden fallback; add a reachable address manually.\n\nThe interface keeps the last enabled management address on. Enable another address first when changing it. An existing all-disabled list can be repaired by enabling the required address.'
            },
            fa: {
                title: 'نشانی‌های IP و جستجوی دوباره',
                body: 'فهرست فشردهٔ IP، نشانی‌های IPv4 و IPv6 و نام میزبان را می‌پذیرد. نشان بنفش «پنل» نخستین نشانی فعال و اولویت اتصال مدیریتی را مشخص می‌کند. کلید هر ردیف اجازهٔ استفادهٔ پنل از آن نشانی را تعیین می‌کند و پیکان‌ها ترتیب اولویت را تغییر می‌دهند. نشانی‌های دستی ذخیره‌شده را می‌توان غیرفعال یا جابه‌جا کرد. برای اصلاح، نشانی تازه را اضافه و قبلی را غیرفعال کنید؛ ویرایش عادی ردیف‌های ذخیره‌شده را حذف نمی‌کند.\n\nاز Node 1.1.38، پنل فهرست کامل IPv4 و IPv6 تخصیص‌یافته را با درخواست احراز هویت‌شدهٔ جداگانه دریافت می‌کند؛ این درخواست هنگام توقف Xray نیز کار می‌کند. تا زمانی که API نود در دسترس است، بررسی‌های خودکار موفق با فاصلهٔ ۳۰ دقیقه انجام می‌شوند و زمان آخرین بررسی موفق پس از راه‌اندازی دوبارهٔ پنل حفظ می‌شود. IP تازه اضافه و نشانی ناپدیدشده‌ای که قبلاً نود تأیید کرده حذف می‌شود. IP دستی نیز پس از تأیید نود وارد این همگام‌سازی می‌شود. IP دستی که نود هرگز تأیید نکرده و نام میزبان حفظ می‌شوند. منبع فهرست، رابط‌های شبکهٔ سیستم‌عامل نود است؛ تغییر ارائه‌دهنده پس از به‌روزرسانی این رابط‌ها دیده می‌شود.\n\nدکمهٔ نماد تازه‌سازی «جستجوی دوباره IPها» همین همگام‌سازی را بی‌درنگ اجرا می‌کند. ترتیب و حالت غیرفعال ردیف‌های باقی‌مانده حفظ می‌شود. ابتدا تغییر نشانی، پورت یا پروکسی را ذخیره کنید. پاسخ ناموفق، ناقص یا قدیمی فهرست را پاک نمی‌کند. عامل قدیمی بدون این قابلیت نیز فهرست را دست‌نخورده نگه می‌دارد؛ Node را به‌روز کنید یا نشانی را دستی اضافه کنید. اگر پاسخ کامل هیچ نشانی تأییدشدهٔ قبلی نداشته باشد و ردیف دستی باقی نمانده باشد، پنل IP قبلی را به‌عنوان مسیر پنهان برنمی‌گرداند؛ نشانی در دسترس را دستی اضافه کنید.\n\nرابط اجازهٔ غیرفعال کردن آخرین نشانی فعال مدیریتی را نمی‌دهد. برای تعویض آن، ابتدا نشانی دیگری را فعال کنید. اگر فهرست قبلی کاملاً غیرفعال است، نشانی موردنیاز را فعال کنید.'
            },
            zh: {
                title: 'IP 地址与重新扫描',
                body: '紧凑的 IP 列表支持 IPv4、IPv6 和主机名。紫色“面板”标记表示列表中第一个已启用地址，也是面板优先使用的节点管理地址。每行开关决定面板是否可以使用该地址，箭头用于调整优先顺序。已保存的手动地址可以停用或排序。需要更正时，添加新地址并停用旧地址；普通编辑会保留已保存的行。\n\n从 Node 1.1.38 开始，面板通过独立的已认证请求获取完整的已分配 IPv4/IPv6 列表；Xray 停止时也可获取。节点 API 可用时，成功的自动检查间隔为 30 分钟，面板重启后仍保留上次成功检查时间。系统添加新 IP，并移除节点以前确认过、现在已消失的地址。手动输入的 IP 经节点确认后，也会参与此同步。节点从未确认的手动 IP 和主机名保持不变。列表来自节点操作系统的网络接口；服务商侧的变更需要反映到操作系统接口后才会出现。\n\n刷新图标按钮“重新扫描 IP”立即执行相同的同步。保留行的顺序和停用状态不变。请先保存地址、端口或代理的更改。失败、不完整或过期的响应不会清空已保存地址。不支持此功能的旧代理也会保留原列表；请升级 Node，或继续手动添加地址。如果完整响应中不再包含任何以前确认的地址，且没有剩余手动条目，面板不会通过隐藏备用路径重新使用旧 IP；请手动添加可访问的地址。\n\n界面不允许关闭最后一个已启用的管理地址。需要更换时，请先启用另一个地址。以前全部停用的列表可以通过启用所需地址来恢复。'
            }
        }
    },
    {
        article: 'nodes',
        id: 'nodes-host-policy-quarantine',
        before: 'nodes-2',
        translations: {
            ru: {
                title: 'Нода работает, но часть хостов заблокирована',
                body: 'Если Xray запущен, а полную общую политику нельзя подтвердить из-за другой недоступной ноды, независимые хосты могут продолжать работу. Зависимые хосты остаются закрытыми: квоты и ограничения не отключаются ради запуска. В панели появляется отдельное предупреждение, а оценка состояния не показывает полностью исправную ноду.\n\nПроверьте доступность зависимых нод и подробности предупреждения. Панель повторяет применение автоматически и снимает блокировку только после подтверждения полной политики. Обычное обновление страницы или повторный запуск не отменяют ограничения.'
            },
            en: {
                title: 'The node is running but some hosts are blocked',
                body: 'When Xray is running but a complete shared policy cannot be confirmed because another node is unavailable, independent hosts can keep working. Dependent hosts remain closed: startup does not disable quotas or restrictions. The panel shows a distinct warning and does not rate the node as fully healthy.\n\nCheck dependent nodes and the warning details. The panel retries automatically and removes the block only after the complete policy is confirmed. Reloading the page or starting the node again does not cancel restrictions.'
            },
            fa: {
                title: 'نود اجرا می‌شود اما برخی میزبان‌ها مسدود هستند',
                body: 'اگر Xray اجرا شده باشد اما به‌دلیل در دسترس نبودن نود دیگری نتوان سیاست مشترک کامل را تأیید کرد، میزبان‌های مستقل می‌توانند به کار ادامه دهند. میزبان‌های وابسته بسته می‌مانند؛ راه‌اندازی، سهمیه‌ها یا محدودیت‌ها را غیرفعال نمی‌کند. پنل هشدار جداگانه نشان می‌دهد و نود را کاملاً سالم ارزیابی نمی‌کند.\n\nدسترسی به نودهای وابسته و جزئیات هشدار را بررسی کنید. پنل به‌طور خودکار دوباره تلاش می‌کند و فقط پس از تأیید سیاست کامل مسدودی را برمی‌دارد. تازه‌کردن صفحه یا اجرای دوبارهٔ نود محدودیت‌ها را لغو نمی‌کند.'
            },
            zh: {
                title: '节点正在运行，但部分主机被阻止',
                body: 'Xray 已运行，但由于其他节点不可用而无法确认完整共享策略时，独立主机可以继续工作。依赖该策略的主机仍被阻止；启动不会关闭配额或限制。面板会显示独立警告，并且不会将节点评为完全健康。\n\n请检查相关节点的可用性和警告详情。面板会自动重试，只有完整策略得到确认后才会解除阻止。刷新页面或再次启动节点不会取消限制。'
            }
        }
    },
    {
        article: 'templates',
        id: 'geofile-standard-recovery',
        before: 'templates-client-downloads',
        translations: {
            ru: {
                title: 'Стандартные геофайлы и восстановление Happ',
                body: 'Для автоматической доставки включите общий переключатель геофайлов и JSON на базовом адресе подписки, затем включите геофайлы в нужном шаблоне. Полные стандартные GeoSite и GeoIP остаются доступны вместе с категориями пользовательских файлов: обычные имена, включая CATEGORY-RU, сохраняются, а пользовательские категории получают отдельные имена.\n\nДля готовых стандартных наборов задайте интервал 48 часов и включите автообновление у файла. Интервал можно изменить. «Обновить сейчас» проверяет источник немедленно. Если SHA-256 не изменился, действующий файл не заменяется. После изменения содержимого сохраните шаблон при необходимости и обновите подписку в приложении.\n\nЕсли Happ после использования пользовательских файлов не находит стандартную категорию, обновите подписку. При включённом общем переключателе геофайлов и доступных полных стандартных наборах панель может восстановить стандартные файлы, в том числе после перезапуска панели. Явно заданные настройки Routing и собственные geodata остаются приоритетными. Ручные правила geosite:, geoip: и ext: сохраняются; переписывать их для восстановления стандартных наборов не требуется.'
            },
            en: {
                title: 'Standard geofiles and Happ recovery',
                body: 'For automatic delivery, enable the geofile master switch and JSON at the base subscription URL, then enable geofiles for the required template. Full standard GeoSite and GeoIP datasets remain available alongside custom categories: ordinary names, including CATEGORY-RU, are retained, and custom categories receive separate names.\n\nSet a 48-hour refresh interval and enable automatic updates for standard datasets. The interval can be changed per file. Update now checks the source immediately. If SHA-256 is unchanged, the active file is not replaced. After content changes, save the template if needed and refresh the subscription in the app.\n\nIf Happ cannot find a standard category after using custom files, refresh its subscription. With the geofile master switch enabled and full standard datasets available, the panel can restore the standard files, including after a panel restart. Explicit Routing settings and custom geodata retain priority. Manual geosite:, geoip: and ext: rules are preserved; restoring standard datasets does not require rewriting them.'
            },
            fa: {
                title: 'فایل‌های استاندارد و بازیابی Happ',
                body: 'برای تحویل خودکار، کلید اصلی فایل‌های جغرافیایی و JSON در نشانی پایهٔ اشتراک را فعال کنید و سپس این قابلیت را در قالب موردنظر روشن کنید. مجموعه‌های کامل استاندارد GeoSite و GeoIP در کنار دسته‌های سفارشی در دسترس می‌مانند. نام‌های عادی، از جمله CATEGORY-RU، حفظ می‌شوند و دسته‌های سفارشی نام‌های جداگانه می‌گیرند.\n\nبرای مجموعه‌های استاندارد، فاصلهٔ ۴۸ ساعته را تنظیم و به‌روزرسانی خودکار فایل را فعال کنید. این فاصله برای هر فایل قابل تغییر است. «به‌روزرسانی اکنون» منبع را بی‌درنگ بررسی می‌کند. اگر SHA-256 تغییر نکرده باشد، فایل فعال جایگزین نمی‌شود. پس از تغییر محتوا، در صورت نیاز قالب را ذخیره و اشتراک را در برنامه تازه کنید.\n\nاگر Happ پس از استفاده از فایل سفارشی یک دستهٔ استاندارد را پیدا نمی‌کند، اشتراک را تازه کنید. با فعال بودن کلید اصلی فایل‌های جغرافیایی و وجود مجموعه‌های کامل استاندارد، پنل می‌تواند فایل‌های استاندارد را بازیابی کند؛ این کار پس از راه‌اندازی مجدد پنل نیز امکان‌پذیر است. تنظیم صریح Routing و geodata اختصاصی اولویت دارد. قواعد دستی geosite:، geoip: و ext: حفظ می‌شوند و برای بازیابی مجموعه‌های استاندارد نیازی به بازنویسی آن‌ها نیست.'
            },
            zh: {
                title: '标准地理文件与 Happ 恢复',
                body: '自动交付需要启用地理文件总开关和订阅基础地址的 JSON，再为所需模板启用地理文件。完整的标准 GeoSite 和 GeoIP 与自定义分类一同保留。CATEGORY-RU 等普通分类名仍然可用，自定义分类使用独立名称。\n\n可为标准数据集设置 48 小时的间隔并启用自动更新，也可以逐文件修改间隔。“立即更新”会马上检查来源；SHA-256 未变化时不会替换当前文件。内容变化后，如有需要请保存模板，再在应用中更新订阅。\n\n如果 Happ 使用自定义文件后找不到标准分类，请更新订阅。地理文件总开关已启用且完整标准数据集可用时，面板能够恢复标准文件，面板重启后也可恢复。显式 Routing 设置和自有 geodata 保持优先。手动 geosite:、geoip: 和 ext: 规则保持不变，恢复标准数据集无需改写这些规则。'
            }
        }
    },
    {
        article: 'templates',
        id: 'geofile-public-paths',
        before: 'templates-client-downloads',
        translations: {
            ru: {
                title: 'Публичный путь геофайлов',
                body: 'Клиент загружает геофайлы по HTTPS с домена подписки через /geofiles/. Если сайт использует отдельный CUSTOM_SUB_PREFIX, ссылки от корня сайта и ранее сохранённые ссылки с префиксом поддерживаются вместе. Правила доступа к домену применяются к обоим адресам.\n\nВ reverse proxy передавайте GET и HEAD для /geofiles/* на сайт подписки, даже если остальные страницы доступны только под отдельным префиксом. При ошибке 404 проверьте этот маршрут. Для проверки доставки загрузите DAT и его .sha256: контрольная сумма должна соответствовать файлу. После исправления обновите подписку в приложении.'
            },
            en: {
                title: 'Public geofile path',
                body: 'Clients download geofiles over HTTPS from the subscription domain through /geofiles/. If the website uses a separate CUSTOM_SUB_PREFIX, root links and previously saved prefixed links remain supported together. Domain access rules apply to both addresses.\n\nForward GET and HEAD requests for /geofiles/* to the subscription website in your reverse proxy, even when other pages use a separate prefix. Check this route if downloads return 404. To verify delivery, download the DAT and its .sha256: the checksum must match the file. Refresh the subscription in the app after correcting the route.'
            },
            fa: {
                title: 'مسیر عمومی فایل‌های جغرافیایی',
                body: 'کلاینت فایل‌های جغرافیایی را با HTTPS از دامنهٔ اشتراک و مسیر /geofiles/ دریافت می‌کند. اگر سایت CUSTOM_SUB_PREFIX جداگانه دارد، پیوندهای ریشهٔ سایت و پیوندهای ذخیره‌شده با پیشوند هر دو پشتیبانی می‌شوند. قواعد دسترسی دامنه برای هر دو نشانی اعمال می‌شود.\n\nدر پراکسی معکوس، درخواست‌های GET و HEAD مسیر /geofiles/* را به سایت اشتراک هدایت کنید، حتی اگر صفحه‌های دیگر فقط با پیشوند جداگانه در دسترس‌اند. هنگام خطای 404 این مسیر را بررسی کنید. برای بررسی دریافت، DAT و .sha256 آن را بارگیری کنید؛ مجموع بررسی باید با فایل مطابقت داشته باشد. پس از اصلاح مسیر، اشتراک را در برنامه تازه کنید.'
            },
            zh: {
                title: '地理文件的公共路径',
                body: '客户端通过 HTTPS 从订阅域名的 /geofiles/ 路径下载地理文件。网站配置了单独的 CUSTOM_SUB_PREFIX 时，根路径链接和以前保存的带前缀链接均可使用。域名访问规则对这两种地址都生效。\n\n在反向代理中，将 /geofiles/* 的 GET 和 HEAD 请求转发到订阅网站，即使其他页面只在单独的前缀下开放。下载返回 404 时，请检查此路由。验证交付时，下载 DAT 及其 .sha256，校验和应与文件相符。修正路由后，请在应用中更新订阅。'
            }
        }
    }
]

export function explainIpDiscoveryAndStandardGeofiles(articles) {
    for (const { article: articleId, id, before, translations } of sections) {
        const article = articles.find((entry) => entry.id === articleId)
        if (!article) throw new Error(`Missing operator article: ${articleId}`)
        const index = article.sections.findIndex((section) => section.id === before)
        if (index < 0) throw new Error(`Missing operator section: ${before}`)
        article.sections.splice(index, 0, { id, ...translations })
    }
}
