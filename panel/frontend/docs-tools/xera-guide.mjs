export const xeraGuide = {
    "id": "xera-transport",
    "category": "profiles",
    "ru": "Транспорт Xera HTTP",
    "en": "Xera HTTP transport",
    "fa": "انتقال Xera HTTP",
    "zh": "Xera HTTP 传输",
    "sources": [
        "src/widgets/dashboard/config-profiles/config-editor/",
        "src/shared/ui/forms/hosts/base-host-form/"
    ],
    "route": "/dashboard/management/config-profiles",
    "resources": [
        "config-profiles",
        "hosts"
    ],
    "sections": [
        {
            "id": "xera-origin",
            "ru": {
                "title": "Происхождение и место в соединении",
                "body": "Xera HTTP — форк транспорта XHTTP (SplitHTTP) из Xray-core, который развивается в Remnacust Core. Основа — передача данных соединения через HTTP-запросы и ответы. Исходная реализация XHTTP находится в [Xray-core](https://github.com/XTLS/Xray-core/tree/v26.9.30/transport/internet/splithttp), наш форк — в [xerahttp](https://github.com/lottman/Remnacust-core/tree/main/xray/transport/internet/xerahttp).\n\nВ профиле VLESS задаёт протокол соединения и пользователя, Xera HTTP — транспорт, TLS или REALITY — защиту соединения. Поэтому protocol: \"vless\", streamSettings.network: \"xera-http\" и streamSettings.security: \"tls\" могут использоваться вместе. При переходе на Xera не заменяйте protocol на xera-http; меняйте транспорт и его настройки в streamSettings. TLS, UUID пользователя и маршрутизация сохраняют свои отдельные задачи."
            },
            "en": {
                "title": "Origin and place in a connection",
                "body": "Xera HTTP is a fork of the XHTTP (SplitHTTP) transport from Xray-core, developed in Remnacust Core. It carries connection data in HTTP requests and responses. The original XHTTP implementation is in [Xray-core](https://github.com/XTLS/Xray-core/tree/v26.9.30/transport/internet/splithttp); our fork is in [xerahttp](https://github.com/lottman/Remnacust-core/tree/main/xray/transport/internet/xerahttp).\n\nIn a profile, VLESS specifies the connection protocol and user, Xera HTTP specifies the transport, and TLS or REALITY protects the connection. Thus protocol: \"vless\", streamSettings.network: \"xera-http\" and streamSettings.security: \"tls\" can be used together. When switching to Xera, do not replace protocol with xera-http; change the transport and its options inside streamSettings. TLS, the user UUID and routing retain their separate roles."
            },
            "fa": {
                "title": "منشأ و جایگاه در اتصال",
                "body": "Xera HTTP یک فورک از انتقال XHTTP (SplitHTTP) در Xray-core است که در Remnacust Core توسعه می‌یابد. داده اتصال را با درخواست‌ها و پاسخ‌های HTTP منتقل می‌کند. پیاده‌سازی اصلی XHTTP در [Xray-core](https://github.com/XTLS/Xray-core/tree/v26.9.30/transport/internet/splithttp) و فورک ما در [xerahttp](https://github.com/lottman/Remnacust-core/tree/main/xray/transport/internet/xerahttp) قرار دارد.\n\nدر پروفایل، VLESS پروتکل اتصال و کاربر را مشخص می‌کند، Xera HTTP انتقال را تعیین می‌کند و TLS یا REALITY از اتصال محافظت می‌کند. بنابراین protocol: \"vless\"، streamSettings.network: \"xera-http\" و streamSettings.security: \"tls\" می‌توانند هم‌زمان استفاده شوند. هنگام تغییر به Xera، protocol را با xera-http جایگزین نکنید؛ انتقال و گزینه‌های آن را در streamSettings تغییر دهید. TLS، شناسه UUID کاربر و مسیریابی وظایف جداگانه خود را دارند."
            },
            "zh": {
                "title": "来源与连接中的位置",
                "body": "Xera HTTP 是 Xray-core 中 XHTTP（SplitHTTP）传输的分支，在 Remnacust Core 中继续开发。它通过 HTTP 请求和响应传递连接数据。原始实现位于 [Xray-core](https://github.com/XTLS/Xray-core/tree/v26.9.30/transport/internet/splithttp)，我们的分支位于 [xerahttp](https://github.com/lottman/Remnacust-core/tree/main/xray/transport/internet/xerahttp)。\n\n配置中，VLESS 指定连接协议和用户，Xera HTTP 指定传输，TLS 或 REALITY 保护连接。因此 protocol: \"vless\"、streamSettings.network: \"xera-http\" 与 streamSettings.security: \"tls\" 可以同时使用。切换到 Xera 时，不要将 protocol 改成 xera-http；应修改 streamSettings 中的传输及其参数。TLS、用户 UUID 和路由各自承担不同职责。"
            }
        },
        {
            "id": "xera-fork-changes",
            "ru": {
                "title": "Что изменено в форке",
                "body": "Xera зарегистрирован отдельно: network: \"xera-http\", блок xeraHttpSettings. Обычный XHTTP остаётся отдельным транспортом. Изменения форка включают режим stream-auto, дополнительное заполнение блоков customDownlinkPadding, проверку параметров и ограничение ресурсов: сессий, очередей upload, размеров заголовков и блоков. Идентификаторы сессий создаются криптографическим генератором и проверяются на допустимые символы и достаточную энтропию.\n\nHTTP padding запросов xPaddingBytes и customDownlinkPadding выполняют разные задачи: второй параметр добавляет заполнение к блокам передаваемых данных и требует совместимой обработки на обеих сторонах. Общий исходный код XHTTP не означает, что любой XHTTP-клиент понимает эти расширения. Скорость и устойчивость зависят от сети, режима, прокси и параметров; форк сам по себе не обещает ускорение или гарантированный обход блокировок."
            },
            "en": {
                "title": "Changes in the fork",
                "body": "Xera is registered separately as network: \"xera-http\" with xeraHttpSettings. Standard XHTTP remains a separate transport. The fork includes stream-auto, customDownlinkPadding for data blocks, configuration validation and resource limits for sessions, upload queues, headers and blocks. Session identifiers use a cryptographic random generator and are checked for allowed characters and sufficient entropy.\n\nRequest padding xPaddingBytes and customDownlinkPadding serve different purposes: the latter pads transmitted data blocks and needs compatible processing on both ends. Shared XHTTP ancestry does not mean every XHTTP client understands these extensions. Speed and reliability depend on the network, mode, proxy and settings; the fork alone does not promise faster connections or guaranteed circumvention."
            },
            "fa": {
                "title": "تغییرات فورک",
                "body": "Xera جداگانه با network: \"xera-http\" و xeraHttpSettings ثبت شده است. XHTTP استاندارد همچنان انتقالی جدا است. این فورک شامل stream-auto، افزودن داده تصادفی به بلوک‌ها با customDownlinkPadding، اعتبارسنجی تنظیمات و محدودیت منابع برای نشست‌ها، صف ارسال، هدرها و بلوک‌ها است. شناسه نشست با مولد تصادفی رمزنگاری ساخته می‌شود و نویسه‌های مجاز و آنتروپی کافی آن بررسی می‌شوند.\n\nxPaddingBytes برای پرکردن درخواست HTTP و customDownlinkPadding برای بلوک‌های داده کاربردهای متفاوتی دارند؛ دومی به پردازش سازگار در هر دو طرف نیاز دارد. منشأ مشترک XHTTP به معنی پشتیبانی همه کلاینت‌های XHTTP از این افزونه‌ها نیست. سرعت و پایداری به شبکه، حالت، پروکسی و تنظیمات بستگی دارند؛ خود فورک افزایش سرعت یا عبور قطعی از مسدودسازی را وعده نمی‌دهد."
            },
            "zh": {
                "title": "分支中的改动",
                "body": "Xera 使用独立的 network: \"xera-http\" 和 xeraHttpSettings 注册，标准 XHTTP 仍是单独的传输。分支包含 stream-auto、用于数据块的 customDownlinkPadding、配置验证，以及会话、上传队列、请求头和数据块的资源限制。会话标识由密码学随机生成器创建，并检查允许字符及足够的熵。\n\n请求填充 xPaddingBytes 与 customDownlinkPadding 用途不同：后者填充传输的数据块，需要两端兼容处理。共同的 XHTTP 来源不代表所有 XHTTP 客户端都能识别这些扩展。速度和稳定性取决于网络、模式、代理和参数；分支本身不承诺提速或保证绕过封锁。"
            }
        },
        {
            "id": "xera-transport-1",
            "ru": {
                "title": "Совместимость",
                "body": "Xera HTTP — форк XHTTP в нашем ядре Xray. Для подключения он должен поддерживаться и ядром ноды, и ядром клиентского приложения. Обычный Xray с поддержкой XHTTP не обязательно понимает Xera. Проверяйте наличие network: \"xera-http\" в обеих сборках. Не меняйте действующий профиль для всех пользователей сразу: сначала клонируйте его и проверьте отдельный хост."
            },
            "en": {
                "title": "Compatibility",
                "body": "Xera HTTP is an XHTTP fork in our Xray core. Both the node core and the client application core must support it. XHTTP support in a regular Xray build does not imply Xera support. Check that both builds accept network: \"xera-http\". Clone a working profile and test a separate host before changing it for all users."
            },
            "fa": {
                "title": "سازگاری",
                "body": "Xera HTTP یک فورک XHTTP در هسته Xray ما است. هسته نود و هسته برنامه کاربر هر دو باید از آن پشتیبانی کنند. پشتیبانی XHTTP در Xray معمولی به معنی پشتیبانی Xera نیست. بررسی کنید هر دو بیلد network: \"xera-http\" را می‌پذیرند. پیش از تغییر برای همه کاربران، پروفایل فعال را کپی و یک هاست جدا را آزمایش کنید."
            },
            "zh": {
                "title": "兼容性",
                "body": "Xera HTTP 是我们 Xray 内核中的 XHTTP 分支。节点内核和客户端内核都必须支持它。普通 Xray 支持 XHTTP 不代表支持 Xera。确认两端构建都接受 network: \"xera-http\"。先克隆可用配置并测试独立主机，再为所有用户切换。"
            }
        },
        {
            "id": "xera-transport-2",
            "ru": {
                "title": "Настройка профиля",
                "body": "В [профиле](/dashboard/management/config-profiles) откройте JSON и задайте network: \"xera-http\" в streamSettings нужного inbound. Параметры находятся в xeraHttpSettings. Ниже показан фрагмент streamSettings, а не полный inbound: сохраните свои tlsSettings, клиентов, порт и остальные параметры. Для TLS нужны действительный сертификат и соответствующий домен. Для REALITY используйте security: \"reality\" и свои realitySettings.\n\n```json\n{\n  \"network\": \"xera-http\",\n  \"security\": \"tls\",\n  \"xeraHttpSettings\": {\n    \"path\": \"/connect\",\n    \"mode\": \"auto\"\n  }\n}\n```"
            },
            "en": {
                "title": "Profile configuration",
                "body": "Open JSON in a [profile](/dashboard/management/config-profiles) and set network: \"xera-http\" in the inbound streamSettings. Transport options belong in xeraHttpSettings. The example below is a streamSettings fragment, not a complete inbound: retain your tlsSettings, clients, port and other settings. TLS requires a valid certificate and a matching domain. For REALITY, use security: \"reality\" and your realitySettings.\n\n```json\n{\n  \"network\": \"xera-http\",\n  \"security\": \"tls\",\n  \"xeraHttpSettings\": {\n    \"path\": \"/connect\",\n    \"mode\": \"auto\"\n  }\n}\n```"
            },
            "fa": {
                "title": "تنظیم پروفایل",
                "body": "در [پروفایل](/dashboard/management/config-profiles) ویرایشگر JSON را باز کنید و در streamSettings ورودی موردنظر، network: \"xera-http\" را قرار دهید. گزینه‌ها در xeraHttpSettings هستند. نمونه زیر فقط بخشی از streamSettings است و ورودی کامل نیست؛ tlsSettings، کاربران، پورت و تنظیمات دیگر خود را حفظ کنید. TLS به گواهی معتبر و دامنه منطبق نیاز دارد. برای REALITY از security: \"reality\" و realitySettings خود استفاده کنید.\n\n```json\n{\n  \"network\": \"xera-http\",\n  \"security\": \"tls\",\n  \"xeraHttpSettings\": {\n    \"path\": \"/connect\",\n    \"mode\": \"auto\"\n  }\n}\n```"
            },
            "zh": {
                "title": "配置设置",
                "body": "在[配置](/dashboard/management/config-profiles)中打开 JSON，将对应入站的 streamSettings.network 设为 \"xera-http\"。传输参数放在 xeraHttpSettings 中。下面只是 streamSettings 片段，并非完整入站，请保留自己的 tlsSettings、用户、端口和其他设置。TLS 需要有效证书及匹配域名。使用 REALITY 时设置 security: \"reality\" 并保留自己的 realitySettings。\n\n```json\n{\n  \"network\": \"xera-http\",\n  \"security\": \"tls\",\n  \"xeraHttpSettings\": {\n    \"path\": \"/connect\",\n    \"mode\": \"auto\"\n  }\n}\n```"
            }
        },
        {
            "id": "xera-transport-3",
            "ru": {
                "title": "Нода, хост и подписка",
                "body": "Активируйте inbound на совместимой ноде, разрешите его во внутреннем скваде и привяжите к нему [хост](/dashboard/management/hosts). В хосте укажите внешний адрес, порт и SNI. Поля «Путь» и «Host» могут переопределить значения профиля для клиента; они должны соответствовать тому, что принимает сервер или прокси. Обновите подписку тестового пользователя. Xray JSON сохраняет xeraHttpSettings; ссылки подключения содержат type=xera-http и xeraSettings. Клиент должен понимать этот формат. Генераторы Sing-box, Clash и Mihomo такие хосты пропускают, поскольку не поддерживают этот транспорт."
            },
            "en": {
                "title": "Node, host and subscription",
                "body": "Activate the inbound on a compatible node, permit it in an internal squad and link a [host](/dashboard/management/hosts). Set the public address, port and SNI on the host. Path and Host fields can override profile values for the client; they must match what the server or proxy accepts. Refresh a test user subscription. Xray JSON retains xeraHttpSettings; share links carry type=xera-http and xeraSettings. The client must understand this format. Sing-box, Clash and Mihomo generators skip these hosts because they do not support this transport."
            },
            "fa": {
                "title": "نود، هاست و اشتراک",
                "body": "ورودی را روی نود سازگار فعال کنید، در گروه داخلی اجازه دهید و یک [هاست](/dashboard/management/hosts) به آن وصل کنید. آدرس عمومی، پورت و SNI را در هاست تنظیم کنید. فیلدهای Path و Host می‌توانند مقادیر پروفایل را برای کاربر جایگزین کنند؛ باید با مقادیر پذیرفته‌شده سرور یا پروکسی یکسان باشند. اشتراک کاربر آزمایشی را به‌روز کنید. Xray JSON گزینه xeraHttpSettings را حفظ می‌کند؛ لینک‌ها type=xera-http و xeraSettings دارند. برنامه کاربر باید این قالب را بشناسد. تولیدکننده‌های Sing-box، Clash و Mihomo این هاست‌ها را حذف می‌کنند چون این انتقال را پشتیبانی نمی‌کنند."
            },
            "zh": {
                "title": "节点、主机与订阅",
                "body": "在兼容节点启用入站，在内部群组中授权，并关联一个[主机](/dashboard/management/hosts)。填写公网地址、端口和 SNI。主机的 Path 与 Host 可覆盖配置中发送给客户端的值，必须与服务器或代理接受的值一致。更新测试用户的订阅。Xray JSON 保留 xeraHttpSettings；分享链接包含 type=xera-http 和 xeraSettings，客户端必须识别此格式。Sing-box、Clash 和 Mihomo 生成器会跳过这些主机，因为它们不支持此传输。"
            }
        },
        {
            "id": "xera-transport-4",
            "ru": {
                "title": "Режимы и HTTP-прокси",
                "body": "Начните с mode: \"auto\". В нашей реализации без REALITY он выбирает packet-up; с REALITY — stream-one, а при отдельном downloadSettings — stream-up. Сервер с auto принимает поддерживаемые режимы клиента.\n\n- packet-up: upload разбивается на конечные HTTP-запросы, download передаётся отдельным потоком.\n- stream-up: upload и download идут отдельными длительными потоковыми запросами.\n- stream-one: upload и download используют один двунаправленный потоковый запрос.\n- stream-auto: при HTTP/2 с REALITY выбирает stream-one либо stream-up при downloadSettings; в остальных случаях выбирает packet-up. Поддержка HTTP/2 на входе CDN не означает, что CDN передаёт тело запроса на ноду без буферизации.\n\nПередача upload в заголовке или cookie и метод GET требуют явного packet-up. На обеих сторонах согласуйте path, host и изменённые параметры заголовков. host HTTP-запроса и SNI TLS — разные настройки; Host задавайте через host, а не headers.Host.\n\nЗа HTTP-прокси проверьте нужный путь, заголовки, ограничения тела запроса и времени ожидания. Для потоковых режимов важна передача тела без ожидания его завершения и ответа без буферизации. REALITY требует передачи защищённого соединения до ядра; обычное завершение TLS на CDN не заменяет её. Если прокси не пропускает выбранный режим, проверьте packet-up на отдельном хосте."
            },
            "en": {
                "title": "Modes and HTTP proxies",
                "body": "Start with mode: \"auto\". In our implementation it selects packet-up without REALITY; with REALITY it selects stream-one, or stream-up when separate downloadSettings are configured. A server using auto accepts supported client modes.\n\n- packet-up: upload is split into finite HTTP requests; download uses a separate stream.\n- stream-up: upload and download use separate long-running streaming requests.\n- stream-one: upload and download share one bidirectional streaming request.\n- stream-auto: for HTTP/2 with REALITY, selects stream-one or stream-up with downloadSettings; otherwise selects packet-up. HTTP/2 support at a CDN edge does not establish that the CDN forwards request bodies without buffering.\n\nUpload in headers or cookies and GET require explicit packet-up. Match path, host and customized header options on both ends. The HTTP host and TLS SNI are distinct settings; specify Host through host, not headers.Host.\n\nBehind an HTTP proxy, check the route, headers, request-body limits and timeouts. Streaming modes require forwarding request bodies before completion and unbuffered responses. REALITY needs the protected connection to reach the core; ordinary CDN TLS termination does not replace it. If the proxy cannot forward a mode, test packet-up on a separate host."
            },
            "fa": {
                "title": "حالت‌ها و پروکسی HTTP",
                "body": "با mode: \"auto\" شروع کنید. در پیاده‌سازی ما بدون REALITY، حالت packet-up انتخاب می‌شود؛ با REALITY، حالت stream-one و در صورت downloadSettings جداگانه، stream-up انتخاب می‌شود. سرور در حالت auto حالت‌های پشتیبانی‌شده کلاینت را می‌پذیرد.\n\n- packet-up: ارسال به درخواست‌های محدود HTTP تقسیم می‌شود و دریافت جریان جداگانه دارد.\n- stream-up: ارسال و دریافت از دو درخواست جریانی طولانی جدا استفاده می‌کنند.\n- stream-one: ارسال و دریافت در یک درخواست جریانی دوطرفه انجام می‌شوند.\n- stream-auto: برای HTTP/2 همراه REALITY، حالت stream-one یا با downloadSettings حالت stream-up را انتخاب می‌کند؛ در موارد دیگر packet-up را انتخاب می‌کند. پشتیبانی HTTP/2 در ورودی CDN ثابت نمی‌کند که CDN بدنه درخواست را بدون بافر به نود می‌فرستد.\n\nارسال در هدر یا cookie و روش GET به packet-up صریح نیاز دارند. path، host و تنظیمات هدر تغییرکرده را در دو طرف هماهنگ کنید. host در HTTP و SNI در TLS دو تنظیم جدا هستند؛ Host را از طریق host تنظیم کنید، نه headers.Host.\n\nپشت پروکسی HTTP، مسیر، هدرها، محدودیت بدنه و مهلت انتظار را بررسی کنید. حالت جریانی به ارسال بدنه پیش از پایان درخواست و پاسخ بدون بافر نیاز دارد. REALITY باید اتصال محافظت‌شده را تا هسته دریافت کند؛ پایان‌دادن معمولی TLS در CDN جایگزین آن نیست. اگر پروکسی حالت انتخابی را عبور نمی‌دهد، packet-up را روی هاست جدا آزمایش کنید."
            },
            "zh": {
                "title": "模式与 HTTP 代理",
                "body": "先使用 mode: \"auto\"。我们的实现中，没有 REALITY 时选择 packet-up；使用 REALITY 时选择 stream-one，配置独立 downloadSettings 时选择 stream-up。auto 模式的服务器接受受支持的客户端模式。\n\n- packet-up：上传拆分为有限长度的 HTTP 请求，下载使用独立流。\n- stream-up：上传和下载使用两个独立的长时间流式请求。\n- stream-one：上传和下载共用一个双向流式请求。\n- stream-auto：HTTP/2 配合 REALITY 时选择 stream-one，存在 downloadSettings 时选择 stream-up；其他情况选择 packet-up。CDN 边缘支持 HTTP/2，不代表它向节点转发请求体时不会缓冲。\n\n通过请求头或 cookie 上传，以及 GET 方法，都要求显式 packet-up。两端的 path、host 和修改过的请求头参数必须一致。HTTP host 与 TLS SNI 是不同设置；请通过 host 设置 Host，不要使用 headers.Host。\n\n使用 HTTP 代理时，检查路径、请求头、请求体限制和超时。流式模式要求在请求结束前转发请求体，并禁用响应缓冲。REALITY 要求受保护连接到达内核；普通 CDN TLS 终止不能代替它。如果代理无法转发所选模式，请在独立主机测试 packet-up。"
            }
        },
        {
            "id": "xera-transport-5",
            "ru": {
                "title": "Дополнительное заполнение трафика",
                "body": "customDownlinkPadding добавляет случайные байты к передаваемым блокам и увеличивает расход трафика. Начинайте без него. При включении задайте одинаковые header и token на обеих сторонах: header должен начинаться с X- и содержать 3–64 символа, token — 16–128 символов base64url. Не используйте служебные заголовки прокси. bytes допускает 0–1024, blockBytes — 1024–16384; budgetPercent ограничивает дополнительный расход (до 100%), burstBytes — начальный запас (до 1 МиБ), uplink включает заполнение upload. Эти параметры не заменяют TLS/REALITY и не гарантируют обход блокировки.\n\nbytes и blockBytes принимают число или диапазон \"от-до\". budgetPercent: 0 или отсутствие этого поля отключает процентное ограничение, а не само заполнение. Для ограниченного расхода задайте budgetPercent от 1 до 100. burstBytes допустим только с ненулевым бюджетом; начальный запас может дать больший процент на коротком соединении. token согласует обработку заполнения, но не заменяет UUID, пароль протокола или защиту TLS. Не включайте padding при первом тесте.\n\nПри ненулевом budgetPercent и нулевом либо отсутствующем burstBytes ядро использует начальный запас 4096 байт. Бюджет относится к байтам заполнения; заголовки HTTP, TLS и обрамление данных тоже расходуют трафик."
            },
            "en": {
                "title": "Additional traffic padding",
                "body": "customDownlinkPadding adds random bytes to transmitted blocks and increases traffic usage. Start without it. When enabled, set matching header and token values on both sides: header must start with X- and contain 3–64 characters; token must contain 16–128 base64url characters. Avoid reserved proxy headers. bytes accepts 0–1024 and blockBytes 1024–16384; budgetPercent caps overhead (up to 100%), burstBytes is the initial allowance (up to 1 MiB), and uplink enables upload padding. These settings do not replace TLS/REALITY or guarantee that a connection bypasses blocking.\n\nbytes and blockBytes accept a number or a \"from-to\" range. budgetPercent: 0 or an omitted field disables the percentage cap, not padding itself. Set budgetPercent from 1 to 100 to constrain overhead. burstBytes requires a nonzero budget; the initial allowance may yield a higher percentage on a short connection. token coordinates padding processing; it does not replace the user UUID, protocol password or TLS. Leave padding disabled for the first test.\n\nWith a nonzero budgetPercent and zero or omitted burstBytes, the core uses a 4096-byte initial allowance. The budget concerns padding bytes; HTTP headers, TLS and framing also consume traffic."
            },
            "fa": {
                "title": "افزودن داده تصادفی",
                "body": "customDownlinkPadding به بلوک‌های انتقال داده بایت‌های تصادفی اضافه می‌کند و مصرف ترافیک را افزایش می‌دهد. ابتدا بدون آن شروع کنید. هنگام فعال‌سازی، header و token یکسان در دو طرف قرار دهید؛ header باید با X- شروع شود و ۳–۶۴ نویسه داشته باشد و token شامل ۱۶–۱۲۸ نویسه base64url باشد. از هدرهای رزروشده پروکسی استفاده نکنید. bytes محدوده ۰–۱۰۲۴ و blockBytes محدوده ۱۰۲۴–۱۶۳۸۴ را می‌پذیرند. budgetPercent سربار را تا ۱۰۰٪ محدود می‌کند، burstBytes ذخیره اولیه تا ۱ MiB است و uplink افزودن داده در ارسال را فعال می‌کند. این تنظیمات جایگزین TLS/REALITY نیستند و عبور از مسدودسازی را تضمین نمی‌کنند.\n\nbytes و blockBytes عدد یا بازه \"از-تا\" می‌پذیرند. budgetPercent: 0 یا حذف این فیلد، سقف درصدی را غیرفعال می‌کند، نه خود افزودن داده را. برای محدودکردن سربار، budgetPercent را بین ۱ و ۱۰۰ قرار دهید. burstBytes به بودجه غیرصفر نیاز دارد؛ ذخیره اولیه می‌تواند در اتصال کوتاه درصد بیشتری ایجاد کند. token پردازش داده افزوده را هماهنگ می‌کند و جایگزین UUID کاربر، گذرواژه پروتکل یا TLS نیست. در آزمایش اول آن را فعال نکنید.\n\nاگر budgetPercent غیرصفر و burstBytes صفر یا حذف‌شده باشد، هسته ذخیره اولیه ۴۰۹۶ بایت را به‌کار می‌برد. بودجه مربوط به بایت‌های افزوده است؛ هدر HTTP، TLS و قاب‌بندی نیز ترافیک مصرف می‌کنند."
            },
            "zh": {
                "title": "额外流量填充",
                "body": "customDownlinkPadding 在传输块中添加随机字节，会增加流量消耗。先不启用它。启用时两端设置相同的 header 和 token：header 必须以 X- 开头，长度 3–64 字符；token 为 16–128 个 base64url 字符。不要使用代理保留请求头。bytes 范围为 0–1024，blockBytes 为 1024–16384；budgetPercent 限制额外开销，最大 100%；burstBytes 为初始额度，最大 1 MiB；uplink 启用上传填充。这些参数不能代替 TLS/REALITY，也不保证绕过封锁。\n\nbytes 和 blockBytes 接受数字或 \"起始-结束\" 范围。budgetPercent: 0 或省略该字段会关闭百分比上限，而不是关闭填充。限制额外开销时设为 1–100。burstBytes 要求非零预算；初始额度可能使短连接的实际百分比更高。token 用于协调填充处理，不能代替用户 UUID、协议密码或 TLS。首次测试不要启用填充。\n\nbudgetPercent 非零而 burstBytes 为零或省略时，内核使用 4096 字节初始额度。预算针对填充字节；HTTP 请求头、TLS 和数据帧也会消耗流量。"
            }
        },
        {
            "id": "xera-transport-6",
            "ru": {
                "title": "Проверка результата",
                "body": "Проверьте JSON в редакторе и сохраните профиль. Сохранение в базе и применение на ноде — разные этапы: проверьте очередь, состояние и журнал ноды. Затем заново скачайте подписку и сравните network, path, mode и SNI в клиентском конфиге. «Неизвестный транспорт» означает, что выбранное ядро не поддерживает Xera. Если хост отсутствует, проверьте сквад, доступ, фильтры и тип подписки. При нестабильности вернитесь к auto без дополнительного заполнения и меняйте по одному параметру.\n\nПереход с XHTTP: клонируйте профиль и хост, сохраните рабочий вариант. В нужном inbound измените streamSettings.network с xhttp на xera-http и перенесите проверенные параметры из xhttpSettings в xeraHttpSettings; protocol, UUID, порт и TLS/REALITY не меняйте без отдельной причины. Не оставляйте оба блока настроек в одном варианте. Обычный XHTTP не превращается в Xera от одного переименования: проверьте ядра обеих сторон и конфигурацию, которую действительно импортировал клиент. Начните с прежних path и host, mode: \"auto\" и без новых расширений. Проверьте соединение, upload и download, переподключение и журнал ноды; только затем переключайте остальных пользователей. Для возврата используйте сохранённый XHTTP-профиль и обновите подписку.\n\nДля параллельного теста используйте отдельную ноду или свободный порт. Два inbound не должны одновременно слушать один адрес и порт."
            },
            "en": {
                "title": "Verify the result",
                "body": "Validate JSON in the editor and save the profile. Database persistence and application on a node are separate stages: check the queue, node status and logs. Download the subscription again and compare network, path, mode and SNI in the client configuration. “Unknown transport” means the selected core does not support Xera. If the host is missing, check squads, access, filters and subscription format. For unstable connections, return to auto without additional padding and change one option at a time.\n\nTo migrate from XHTTP, clone the profile and host and keep the working configuration. Change streamSettings.network from xhttp to xera-http in the intended inbound and move verified xhttpSettings options to xeraHttpSettings. Do not change protocol, UUID, port or TLS/REALITY without a separate reason. Do not retain both settings blocks in the same variant. Renaming alone cannot give a standard XHTTP core Xera support: check both cores and the configuration the client actually imported. Start with the previous path and host, mode: \"auto\" and no new extensions. Verify connection, upload, download, reconnection and node logs before switching other users. To revert, use the saved XHTTP profile and refresh the subscription.\n\nFor a parallel test, use a separate node or a free port. Two inbounds must not listen on the same address and port at the same time."
            },
            "fa": {
                "title": "بررسی نتیجه",
                "body": "JSON را در ویرایشگر بررسی و پروفایل را ذخیره کنید. ذخیره در پایگاه داده و اعمال روی نود دو مرحله جدا هستند؛ صف، وضعیت و گزارش نود را بررسی کنید. اشتراک را دوباره دریافت و network، path، mode و SNI را در تنظیمات کاربر مقایسه کنید. «انتقال ناشناخته» یعنی هسته انتخاب‌شده Xera را پشتیبانی نمی‌کند. اگر هاست نیست، گروه، دسترسی، فیلترها و قالب اشتراک را بررسی کنید. برای ارتباط ناپایدار به auto بدون داده تصادفی برگردید و هر بار یک گزینه را تغییر دهید.\n\nبرای انتقال از XHTTP، پروفایل و هاست را کپی و تنظیمات فعال را نگه دارید. در ورودی موردنظر streamSettings.network را از xhttp به xera-http تغییر دهید و گزینه‌های بررسی‌شده xhttpSettings را به xeraHttpSettings منتقل کنید. protocol، UUID، پورت یا TLS/REALITY را بدون دلیل جداگانه تغییر ندهید. هر دو بلوک تنظیمات را در یک نسخه نگه ندارید. تغییر نام به‌تنهایی هسته XHTTP استاندارد را سازگار با Xera نمی‌کند؛ هسته دو طرف و تنظیماتی را که کلاینت واقعاً وارد کرده بررسی کنید. با path و host قبلی، mode: \"auto\" و بدون افزونه جدید شروع کنید. اتصال، ارسال، دریافت، اتصال مجدد و گزارش نود را پیش از انتقال بقیه کاربران بررسی کنید. برای بازگشت، از پروفایل XHTTP ذخیره‌شده استفاده و اشتراک را تازه کنید.\n\nبرای آزمایش موازی از نود جدا یا پورت آزاد استفاده کنید. دو ورودی نباید هم‌زمان روی یک آدرس و پورت گوش دهند."
            },
            "zh": {
                "title": "验证结果",
                "body": "在编辑器验证 JSON 并保存配置。数据库保存与节点应用是不同阶段，请检查队列、节点状态和日志。重新下载订阅，比较客户端配置中的 network、path、mode 和 SNI。“未知传输”表示所选内核不支持 Xera。主机缺失时检查群组、访问权限、筛选条件和订阅格式。连接不稳定时回到 auto，关闭额外填充，每次只调整一个参数。\n\n从 XHTTP 迁移时，克隆配置和主机，保留可用版本。在目标入站中将 streamSettings.network 从 xhttp 改为 xera-http，将已核对的 xhttpSettings 参数移到 xeraHttpSettings。没有单独原因时，不要修改 protocol、UUID、端口或 TLS/REALITY。同一个配置版本不要保留两个传输设置块。仅重命名不能让标准 XHTTP 内核支持 Xera：请检查两端内核及客户端实际导入的配置。先沿用原 path 和 host，使用 mode: \"auto\"，不启用新扩展。切换其他用户前，检查连接、上传、下载、重连和节点日志。需要回退时使用保存的 XHTTP 配置，并更新订阅。\n\n并行测试请使用独立节点或空闲端口。两个入站不能同时监听相同地址和端口。"
            }
        }
    ]
}
