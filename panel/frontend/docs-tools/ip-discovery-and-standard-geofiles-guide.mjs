const sections = [
    {
        article: 'nodes',
        id: 'nodes-ip-discovery',
        before: 'nodes-2',
        translations: {
            ru: {
                title: 'IP-адреса и повторный поиск',
                body: 'В компактном списке IP-адресов можно хранить IPv4, IPv6 и имена хостов. Фиолетовая метка «Панельный» отмечает первый включённый адрес — предпочтительный адрес управления в порядке списка. Переключатель разрешает панели использовать соответствующий адрес; порядок меняется стрелками. Сохранённые адреса, добавленные вручную, можно выключить или переставить. Для исправления добавьте новый адрес и выключите старый: обычное редактирование не удаляет сохранённые строки.\n\nС Node 1.1.38 панель получает назначенные IPv4 и IPv6 при первом успешном получении сведений от ноды. Далее при доступной ноде новые IP добавляются не чаще одного раза в 30 минут после последнего успешного поиска. Уже сохранённые адреса остаются в списке. Этот интервал сохраняется после перезапуска панели.\n\n«Повторно найти IP» запрашивает свежий список немедленно. Эта операция удаляет только исчезнувшие IP, ранее добавленные поиском. Ручные IP и имена хостов, порядок оставшихся строк и их выключенное состояние сохраняются. Сначала сохраните изменения адреса, порта или прокси. При ошибке поиска список остаётся прежним; для старого агента обновите Node либо продолжайте вводить адреса вручную.'
            },
            en: {
                title: 'IP addresses and rescanning',
                body: 'The compact IP list accepts IPv4, IPv6 and hostnames. The purple Panel badge marks the first enabled address, preferred for node management in list order. Each toggle permits the panel to use that address; arrows change priority. Saved manual addresses can be disabled or reordered. To correct one, add a new address and disable the old one: ordinary editing keeps saved rows.\n\nWith Node 1.1.38, assigned IPv4 and IPv6 addresses are discovered when the panel first receives successful node information. While the node is available, new IPs are then appended no more often than once every 30 minutes after the last successful scan. Existing addresses remain. The interval survives a panel restart.\n\nRescan IPs requests a fresh list immediately. It removes only disappeared IPs previously added by discovery. Manual IPs and hostnames, the order of surviving rows and their disabled state are preserved. Save address, port or proxy changes first. A failed scan keeps the existing list; update an older Node agent or continue adding addresses manually.'
            },
            fa: {
                title: 'نشانی‌های IP و جستجوی دوباره',
                body: 'فهرست فشردهٔ IP، نشانی‌های IPv4 و IPv6 و نام میزبان را می‌پذیرد. نشان بنفش «پنل» نخستین نشانی فعال و اولویت اتصال مدیریتی را مشخص می‌کند. کلید هر ردیف اجازهٔ استفادهٔ پنل از آن نشانی را تعیین می‌کند و پیکان‌ها ترتیب اولویت را تغییر می‌دهند. نشانی‌های دستی ذخیره‌شده را می‌توان غیرفعال یا جابه‌جا کرد. برای اصلاح، نشانی تازه را اضافه و قبلی را غیرفعال کنید؛ ویرایش عادی ردیف‌های ذخیره‌شده را حذف نمی‌کند.\n\nاز Node 1.1.38، پنل هنگام نخستین دریافت موفق اطلاعات نود، IPv4 و IPv6 تخصیص‌یافته را پیدا می‌کند. سپس، هنگامی که نود در دسترس است، IPهای تازه حداکثر یک‌بار در هر ۳۰ دقیقه پس از آخرین جستجوی موفق افزوده می‌شوند. نشانی‌های قبلی باقی می‌مانند و فاصلهٔ بررسی پس از راه‌اندازی مجدد پنل نیز حفظ می‌شود.\n\n«جستجوی دوباره IPها» فهرست تازه را بی‌درنگ درخواست می‌کند. فقط IPهایی حذف می‌شوند که قبلاً با جستجو اضافه شده‌اند و دیگر وجود ندارند. IP و نام میزبان دستی، ترتیب ردیف‌های باقی‌مانده و وضعیت غیرفعال آن‌ها حفظ می‌شود. ابتدا تغییرات نشانی، پورت یا پروکسی را ذخیره کنید. در صورت خطا، فهرست قبلی باقی می‌ماند؛ عامل قدیمی Node را به‌روز کنید یا نشانی‌ها را دستی اضافه کنید.'
            },
            zh: {
                title: 'IP 地址与重新扫描',
                body: '紧凑的 IP 列表支持 IPv4、IPv6 和主机名。紫色“面板”标记表示列表中第一个已启用地址，也是面板优先使用的节点管理地址。每行开关决定面板是否可以使用该地址，箭头用于调整优先顺序。已保存的手动地址可以停用或排序。需要更正时，添加新地址并停用旧地址；普通编辑会保留已保存的行。\n\n从 Node 1.1.38 开始，面板首次成功取得节点信息时会发现已分配的 IPv4 和 IPv6。节点可用时，后续检查在上次成功扫描后至少间隔 30 分钟，只追加新 IP，保留已有地址。面板重启后仍保留此检查间隔。\n\n“重新扫描 IP”会立即请求最新列表。它只移除先前由扫描添加、目前已消失的 IP。手动 IP、主机名、保留行的顺序和停用状态均保持不变。请先保存地址、端口或代理的更改。扫描失败会保留原列表；旧版代理可升级 Node，或继续手动添加地址。'
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
