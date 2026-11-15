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
                "body": "Xera HTTP — транспорт на основе Xray-core XHTTP (SplitHTTP), развиваемый в Remnacust Core. Он передаёт данные через HTTP-запросы и ответы и требует поддержки в ядре ноды и приложении пользователя.\n\nВ профиле VLESS задаёт протокол подключения и пользователя, Xera HTTP — способ передачи, TLS или REALITY — защиту соединения. Учётные данные и правила маршрутизации настраиваются отдельно."
            },
            "en": {
                "title": "Origin and place in a connection",
                "body": "Xera HTTP is a transport based on Xray-core XHTTP (SplitHTTP), developed in Remnacust Core. It carries data through HTTP requests and responses and requires support in both the node core and the user application.\n\nIn a profile, VLESS defines the connection protocol and user, Xera HTTP the transport, and TLS or REALITY the connection protection. Credentials and routing rules are separate settings."
            },
            "fa": {
                "title": "منشأ و جایگاه در اتصال",
                "body": "Xera HTTP انتقالی بر پایه XHTTP یا SplitHTTP در Xray-core است که در Remnacust Core توسعه می‌یابد. داده را با درخواست‌ها و پاسخ‌های HTTP جابه‌جا می‌کند و هسته نود و برنامه کاربر باید آن را پشتیبانی کنند.\n\nدر پروفایل، VLESS پروتکل اتصال و کاربر، Xera HTTP روش انتقال و TLS یا REALITY حفاظت اتصال را تعیین می‌کنند. اطلاعات دسترسی و قواعد مسیریابی جداگانه تنظیم می‌شوند."
            },
            "zh": {
                "title": "来源与连接中的位置",
                "body": "Xera HTTP 是在 Remnacust Core 中开发的传输方式，基于 Xray-core 的 XHTTP（SplitHTTP），通过 HTTP 请求和响应传输数据。节点内核和用户应用均须支持它。\n\n在配置中，VLESS 确定连接协议和用户，Xera HTTP 确定传输方式，TLS 或 REALITY 保护连接。凭据和路由规则分别设置。"
            }
        },
        {
            "id": "xera-fork-changes",
            "ru": {
                "title": "Возможности и ограничения",
                "body": "Xera HTTP и стандартный XHTTP выбираются отдельно. Xera предлагает режимы передачи HTTP, необязательное дополнение передаваемых данных и адаптивное ограничение параллельных запросов. Поддержка XHTTP в обычном клиенте не добавляет поддержку Xera.\n\nДополнение HTTP-запросов и дополнительное заполнение блоков данных — разные настройки. Расширения должны поддерживаться обеими сторонами. Скорость и устойчивость зависят от сети, выбранного режима и прокси; проверяйте результат на своей сети."
            },
            "en": {
                "title": "Features and limits",
                "body": "Xera HTTP and standard XHTTP are separate transport choices. Xera offers HTTP transfer modes, optional data padding and adaptive limits on concurrent requests. XHTTP support in a regular client does not add Xera support.\n\nHTTP request padding and additional data-block padding are separate settings. Both peers must support the extensions in use. Speed and stability depend on the network, selected mode and proxy; verify the result on your network."
            },
            "fa": {
                "title": "قابلیت‌ها و محدودیت‌ها",
                "body": "Xera HTTP و XHTTP استاندارد دو انتخاب جداگانه‌اند. Xera حالت‌های انتقال HTTP، پدینگ اختیاری داده و محدودیت تطبیقی درخواست‌های هم‌زمان را ارائه می‌دهد. پشتیبانی XHTTP در یک کلاینت عادی به معنی پشتیبانی Xera نیست.\n\nپدینگ درخواست HTTP و پدینگ اضافی بلوک داده دو تنظیم جدا هستند. هر دو طرف باید افزونه‌های استفاده‌شده را پشتیبانی کنند. سرعت و پایداری به شبکه، حالت انتخابی و پروکسی بستگی دارند؛ نتیجه را در شبکه خود بررسی کنید."
            },
            "zh": {
                "title": "功能与限制",
                "body": "Xera HTTP 与标准 XHTTP 是独立的传输选项。Xera 提供 HTTP 传输模式、可选数据填充及自适应并发请求限制。普通客户端支持 XHTTP，并不表示支持 Xera。\n\nHTTP 请求填充与额外数据块填充是不同设置。双方均须支持所用扩展。速度和稳定性取决于网络、所选模式和代理，请在自己的网络验证效果。"
            }
        },
        {
            "id": "xera-transport-1",
            "ru": {
                "title": "Совместимость",
                "body": "Для Xera HTTP нужны совместимые ядра ноды и клиентского приложения. Обычная сборка Xray с XHTTP может не поддерживать Xera. Проверьте версии и возможности обеих сторон. Перед изменением для всех пользователей сделайте копию рабочего профиля и проверьте отдельный хост."
            },
            "en": {
                "title": "Compatibility",
                "body": "Xera HTTP requires compatible node and application cores. A regular Xray build supporting XHTTP may lack Xera support. Check the versions and capabilities of both peers. Clone a working profile and test a separate host before changing it for all users."
            },
            "fa": {
                "title": "سازگاری",
                "body": "Xera HTTP به هسته سازگار در نود و برنامه کاربر نیاز دارد. نسخه عادی Xray با پشتیبانی XHTTP ممکن است Xera را نپذیرد. نسخه و قابلیت هر دو طرف را بررسی کنید. پیش از تغییر برای همه کاربران، از پروفایل فعال کپی بگیرید و یک هاست جدا را آزمایش کنید."
            },
            "zh": {
                "title": "兼容性",
                "body": "Xera HTTP 需要兼容的节点内核和应用内核。支持 XHTTP 的普通 Xray 版本可能不支持 Xera。请检查双方的版本和能力。为所有用户更改前，先复制可用配置并测试单独的主机。"
            }
        },
        {
            "id": "xera-transport-2",
            "ru": {
                "title": "Настройка профиля",
                "body": "Откройте [профили](/dashboard/management/config-profiles) и выберите проверенный профиль Xera HTTP для установленного ядра. Сохраните рабочую копию перед изменениями. Для TLS нужен действующий сертификат и совпадающий домен; для REALITY — соответствующие настройки обеих сторон. Внешний адрес, порт, путь, Host и SNI должны соответствовать принимающему серверу и прокси.\n\nПанель «Адаптивный Xera HTTP» работает с уже существующим транспортом профиля. Выберите нужный inbound или outbound. Для inbound форма задаёт клиентские параметры в подписках связанных хостов; серверные ограничения запросов задаются отдельно. Для outbound параметры относятся к этому исходящему транспорту. Само открытие формы не меняет ручную конфигурацию."
            },
            "en": {
                "title": "Profile configuration",
                "body": "Open [profiles](/dashboard/management/config-profiles) and select a verified Xera HTTP profile for the installed core. Keep a working copy before making changes. TLS needs a valid certificate and matching domain; REALITY needs matching settings on both peers. The public address, port, path, Host and SNI must match the receiving server and proxy.\n\nThe Adaptive Xera HTTP panel edits an existing transport in the profile. Select the intended inbound or outbound. For an inbound, the form sets client options in subscriptions for linked hosts; server request limits are configured separately. For an outbound, the options apply to that outgoing transport. Opening the form leaves manual configuration unchanged."
            },
            "fa": {
                "title": "تنظیم پروفایل",
                "body": "[پروفایل‌ها](/dashboard/management/config-profiles) را باز کنید و پروفایل تأییدشده Xera HTTP مناسب هسته نصب‌شده را انتخاب کنید. پیش از تغییر، یک کپی سالم نگه دارید. TLS به گواهی معتبر و دامنه مطابق و REALITY به تنظیمات سازگار دو طرف نیاز دارد. آدرس عمومی، پورت، مسیر، Host و SNI باید با سرور و پروکسی مقصد یکسان باشند.\n\nپنل Xera HTTP تطبیقی، انتقال موجود در پروفایل را ویرایش می‌کند. inbound یا outbound موردنظر را انتخاب کنید. برای inbound، فرم گزینه‌های کلاینت را در اشتراک هاست‌های مرتبط تعیین می‌کند؛ محدودیت درخواست سرور جدا تنظیم می‌شود. برای outbound، گزینه‌ها به همان انتقال خروجی مربوط‌اند. باز کردن فرم تنظیمات دستی را تغییر نمی‌دهد."
            },
            "zh": {
                "title": "配置设置",
                "body": "打开[配置](/dashboard/management/config-profiles)，选择适合已安装内核且已验证可用的 Xera HTTP 配置。更改前保留可用副本。TLS 需要有效证书和匹配域名，REALITY 需要双方设置匹配。公网地址、端口、路径、Host 和 SNI 须符合接收服务器与代理的要求。\n\n“自适应 Xera HTTP”面板编辑配置中已有的传输。请选择所需 inbound 或 outbound。对于 inbound，表单设置会用于关联主机订阅中的客户端参数，服务器请求限制另行配置。对于 outbound，设置作用于该出站传输。仅打开表单不会改变手动配置。"
            }
        },
        {
            "id": "xera-transport-3",
            "ru": {
                "title": "Нода, хост и подписка",
                "body": "Активируйте inbound на совместимой ноде, разрешите его во внутреннем скваде и привяжите [хост](/dashboard/management/hosts). Укажите внешний адрес, порт и SNI. Поля «Путь» и «Host» могут переопределять значения профиля для клиента; они должны соответствовать серверу или прокси. Обновите подписку тестового пользователя и проверьте фактически импортированные настройки.\n\nИспользуйте Xray JSON или ссылку подключения, которую поддерживает ваше приложение с Xera HTTP. Стандартные клиенты без Xera несовместимы. Шаблоны Sing-box, Clash и Mihomo пропускают такие хосты. Обновление панели само по себе не добавляет клиенту новый транспорт."
            },
            "en": {
                "title": "Node, host and subscription",
                "body": "Activate the inbound on a compatible node, permit it in an internal squad and link a [host](/dashboard/management/hosts). Set the public address, port and SNI. Path and Host can override profile values for the client and must match the server or proxy. Refresh a test user subscription and check the settings actually imported.\n\nUse Xray JSON or a connection link supported by your Xera HTTP application. Standard clients without Xera are incompatible. Sing-box, Clash and Mihomo templates skip these hosts. Updating the panel alone does not add a transport to the client."
            },
            "fa": {
                "title": "نود، هاست و اشتراک",
                "body": "inbound را روی نود سازگار فعال کنید، در گروه داخلی اجازه دهید و یک [هاست](/dashboard/management/hosts) متصل کنید. آدرس عمومی، پورت و SNI را تنظیم کنید. Path و Host می‌توانند مقادیر پروفایل را برای کلاینت جایگزین کنند و باید با سرور یا پروکسی مطابق باشند. اشتراک کاربر آزمایشی را به‌روز و تنظیمات واقعاً واردشده را بررسی کنید.\n\nاز Xray JSON یا لینک اتصالی استفاده کنید که برنامه دارای Xera HTTP شما می‌پذیرد. کلاینت استاندارد بدون Xera سازگار نیست. قالب‌های Sing-box، Clash و Mihomo این هاست‌ها را حذف می‌کنند. ارتقای پنل به‌تنهایی انتقال جدیدی به کلاینت اضافه نمی‌کند."
            },
            "zh": {
                "title": "节点、主机与订阅",
                "body": "在兼容节点启用 inbound，在内部群组中授权，并关联[主机](/dashboard/management/hosts)。填写公网地址、端口和 SNI。Path 和 Host 可覆盖发给客户端的配置值，必须与服务器或代理匹配。更新测试用户订阅并检查实际导入的设置。\n\n使用支持 Xera HTTP 的应用能够读取的 Xray JSON 或连接链接。不支持 Xera 的标准客户端无法使用。Sing-box、Clash 和 Mihomo 模板会跳过这些主机。仅更新面板不会为客户端增加传输能力。"
            }
        },
        {
            "id": "xera-transport-4",
            "ru": {
                "title": "Режимы и HTTP-прокси",
                "body": "Начните с mode: \"auto\". В нашей реализации без REALITY он выбирает packet-up; с REALITY — stream-one, а при отдельном downloadSettings — stream-up. Сервер с auto принимает поддерживаемые режимы клиента.\n\n- packet-up: upload разбивается на конечные HTTP-запросы, download передаётся отдельным потоком.\n- stream-up: upload и download идут отдельными длительными потоковыми запросами.\n- stream-one: upload и download используют один двунаправленный потоковый запрос.\n- stream-auto: при HTTP/2 с REALITY выбирает stream-one либо stream-up при downloadSettings; в остальных случаях выбирает packet-up. Поддержка HTTP/2 на входе CDN не означает, что CDN передаёт тело запроса на ноду без буферизации.\n\nПередача upload в заголовке или cookie и метод GET требуют явного packet-up. На обеих сторонах согласуйте path, host и изменённые параметры заголовков. host HTTP-запроса и SNI TLS — разные настройки; Host задавайте через host, а не headers.Host.\n\nЗа HTTP-прокси проверьте нужный путь, заголовки, ограничения тела запроса и времени ожидания. Для потоковых режимов важна передача тела без ожидания его завершения и ответа без буферизации. REALITY требует передачи защищённого соединения до ядра; обычное завершение TLS на CDN не заменяет её. Если прокси не пропускает выбранный режим, проверьте packet-up на отдельном хосте.\n\nstream-auto остаётся доступен: это выбор режима по HTTP/REALITY и downloadSettings, а не измерение DPI, задержки или буферизации. Он не переключает уже открытый поток после сетевой ошибки.\n\nВ Core 1.1.21 pacing packet-up по умолчанию выбирает интервал 20–40 мс со средней точкой 30 мс вместо постоянных 30 мс. Явный scMinPostsIntervalMs сохраняется, включая фиксированный интервал и отключение ограничения. Streaming-режимы этим параметром не задерживаются. Такой разброс убирает один фиксированный ритм; он не скрывает объём, длительность или нагрузку соединения."
            },
            "en": {
                "title": "Modes and HTTP proxies",
                "body": "Start with mode: \"auto\". In our implementation it selects packet-up without REALITY; with REALITY it selects stream-one, or stream-up when separate downloadSettings are configured. A server using auto accepts supported client modes.\n\n- packet-up: upload is split into finite HTTP requests; download uses a separate stream.\n- stream-up: upload and download use separate long-running streaming requests.\n- stream-one: upload and download share one bidirectional streaming request.\n- stream-auto: for HTTP/2 with REALITY, selects stream-one or stream-up with downloadSettings; otherwise selects packet-up. HTTP/2 support at a CDN edge does not establish that the CDN forwards request bodies without buffering.\n\nUpload in headers or cookies and GET require explicit packet-up. Match path, host and customized header options on both ends. The HTTP host and TLS SNI are distinct settings; specify Host through host, not headers.Host.\n\nBehind an HTTP proxy, check the route, headers, request-body limits and timeouts. Streaming modes require forwarding request bodies before completion and unbuffered responses. REALITY needs the protected connection to reach the core; ordinary CDN TLS termination does not replace it. If the proxy cannot forward a mode, test packet-up on a separate host.\n\nstream-auto remains available: it selects a mode from HTTP/REALITY and downloadSettings; it does not measure DPI, latency or buffering, and does not change an open stream after a network error.\n\nCore 1.1.21 defaults packet-up pacing to a sampled 20–40 ms interval with a 30 ms midpoint instead of a constant 30 ms. Explicit scMinPostsIntervalMs is preserved, including fixed intervals and disabled pacing. Streaming modes are not delayed by this setting. The range removes one fixed cadence; it does not hide connection volume, duration or workload."
            },
            "fa": {
                "title": "حالت‌ها و پروکسی HTTP",
                "body": "با mode: \"auto\" شروع کنید. در پیاده‌سازی ما بدون REALITY، حالت packet-up انتخاب می‌شود؛ با REALITY، حالت stream-one و در صورت downloadSettings جداگانه، stream-up انتخاب می‌شود. سرور در حالت auto حالت‌های پشتیبانی‌شده کلاینت را می‌پذیرد.\n\n- packet-up: ارسال به درخواست‌های محدود HTTP تقسیم می‌شود و دریافت جریان جداگانه دارد.\n- stream-up: ارسال و دریافت از دو درخواست جریانی طولانی جدا استفاده می‌کنند.\n- stream-one: ارسال و دریافت در یک درخواست جریانی دوطرفه انجام می‌شوند.\n- stream-auto: برای HTTP/2 همراه REALITY، حالت stream-one یا با downloadSettings حالت stream-up را انتخاب می‌کند؛ در موارد دیگر packet-up را انتخاب می‌کند. پشتیبانی HTTP/2 در ورودی CDN ثابت نمی‌کند که CDN بدنه درخواست را بدون بافر به نود می‌فرستد.\n\nارسال در هدر یا cookie و روش GET به packet-up صریح نیاز دارند. path، host و تنظیمات هدر تغییرکرده را در دو طرف هماهنگ کنید. host در HTTP و SNI در TLS دو تنظیم جدا هستند؛ Host را از طریق host تنظیم کنید، نه headers.Host.\n\nپشت پروکسی HTTP، مسیر، هدرها، محدودیت بدنه و مهلت انتظار را بررسی کنید. حالت جریانی به ارسال بدنه پیش از پایان درخواست و پاسخ بدون بافر نیاز دارد. REALITY باید اتصال محافظت‌شده را تا هسته دریافت کند؛ پایان‌دادن معمولی TLS در CDN جایگزین آن نیست. اگر پروکسی حالت انتخابی را عبور نمی‌دهد، packet-up را روی هاست جدا آزمایش کنید.\n\nstream-auto همچنان موجود است: حالت را از HTTP/REALITY و downloadSettings انتخاب می‌کند؛ DPI، تأخیر یا بافر را اندازه نمی‌گیرد و جریان باز را پس از خطای شبکه تغییر نمی‌دهد.\n\nدر Core 1.1.21 فاصله پیش‌فرض packet-up به‌جای ۳۰ میلی‌ثانیه ثابت، از بازه ۲۰ تا ۴۰ میلی‌ثانیه با نقطه میانی ۳۰ انتخاب می‌شود. مقدار صریح scMinPostsIntervalMs، از جمله فاصله ثابت یا غیرفعال‌کردن محدودیت، حفظ می‌شود. این گزینه حالت‌های streaming را به تأخیر نمی‌اندازد. بازه یک ریتم ثابت را حذف می‌کند، اما حجم، مدت یا بار اتصال را پنهان نمی‌کند."
            },
            "zh": {
                "title": "模式与 HTTP 代理",
                "body": "先使用 mode: \"auto\"。我们的实现中，没有 REALITY 时选择 packet-up；使用 REALITY 时选择 stream-one，配置独立 downloadSettings 时选择 stream-up。auto 模式的服务器接受受支持的客户端模式。\n\n- packet-up：上传拆分为有限长度的 HTTP 请求，下载使用独立流。\n- stream-up：上传和下载使用两个独立的长时间流式请求。\n- stream-one：上传和下载共用一个双向流式请求。\n- stream-auto：HTTP/2 配合 REALITY 时选择 stream-one，存在 downloadSettings 时选择 stream-up；其他情况选择 packet-up。CDN 边缘支持 HTTP/2，不代表它向节点转发请求体时不会缓冲。\n\n通过请求头或 cookie 上传，以及 GET 方法，都要求显式 packet-up。两端的 path、host 和修改过的请求头参数必须一致。HTTP host 与 TLS SNI 是不同设置；请通过 host 设置 Host，不要使用 headers.Host。\n\n使用 HTTP 代理时，检查路径、请求头、请求体限制和超时。流式模式要求在请求结束前转发请求体，并禁用响应缓冲。REALITY 要求受保护连接到达内核；普通 CDN TLS 终止不能代替它。如果代理无法转发所选模式，请在独立主机测试 packet-up。\n\nstream-auto 仍然可用：它根据 HTTP/REALITY 和 downloadSettings 选择模式，不检测 DPI、延迟或缓冲，也不会在网络错误后更改已建立流的模式。\n\nCore 1.1.21 的 packet-up 默认发送间隔从固定 30 毫秒改为在 20–40 毫秒内取样，中点仍为 30 毫秒。保留明确配置的 scMinPostsIntervalMs，包括固定间隔和关闭节流。流式模式不受此设置延迟。该范围消除一种固定节奏，但不会隐藏连接的数据量、时长或负载。"
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
                "body": "Проверьте конфигурацию в редакторе и сохраните профиль. После сохранения убедитесь, что нода приняла настройки и работает без ошибок. Обновите подписку в приложении и проверьте транспорт, путь, режим и SNI. Ошибка «неизвестный транспорт» означает отсутствие поддержки Xera в выбранном ядре. Если хоста нет в подписке, проверьте сквады, доступ, фильтры и формат.\n\nПри переходе с XHTTP сначала проверьте копию профиля на отдельном хосте. Сохраните рабочий вариант для возврата. Начните без дополнительных расширений, затем проверьте подключение, загрузку, отправку данных и повторное соединение. Изменяйте одну настройку за раз. Для параллельной проверки используйте отдельную ноду или свободный порт: два inbound не могут одновременно слушать один адрес и порт."
            },
            "en": {
                "title": "Verify the result",
                "body": "Validate the configuration in the editor and save the profile. After saving, check that the node accepted the settings and operates without errors. Refresh the application subscription and check transport, path, mode and SNI. “Unknown transport” means the selected core lacks Xera support. If a host is missing from the subscription, check squads, access, filters and format.\n\nWhen moving from XHTTP, test a profile copy on a separate host first. Retain the working variant for rollback. Start without extra extensions, then check connection, download, upload and reconnection. Change one setting at a time. For parallel testing, use another node or a free port: two inbounds cannot listen on the same address and port at once."
            },
            "fa": {
                "title": "بررسی نتیجه",
                "body": "تنظیمات را در ویرایشگر اعتبارسنجی و پروفایل را ذخیره کنید. پس از ذخیره، پذیرش تنظیمات و کارکرد بدون خطای نود را بررسی کنید. اشتراک برنامه را به‌روز و انتقال، مسیر، حالت و SNI را کنترل کنید. خطای «انتقال ناشناخته» یعنی هسته انتخابی Xera را پشتیبانی نمی‌کند. اگر هاست در اشتراک نیست، گروه‌ها، دسترسی، فیلترها و قالب را بررسی کنید.\n\nبرای مهاجرت از XHTTP ابتدا کپی پروفایل را روی هاست جدا آزمایش کنید. نسخه سالم را برای بازگشت نگه دارید. بدون افزونه اضافی شروع کنید و اتصال، دریافت، ارسال و اتصال مجدد را بررسی کنید. هر بار یک گزینه را تغییر دهید. برای آزمایش موازی از نود جدا یا پورت آزاد استفاده کنید؛ دو inbound نمی‌توانند هم‌زمان یک آدرس و پورت را اشغال کنند."
            },
            "zh": {
                "title": "验证结果",
                "body": "在编辑器中验证并保存配置。保存后确认节点接受设置且运行正常。更新应用订阅并检查传输、路径、模式和 SNI。“未知传输”表示所选内核不支持 Xera。订阅缺少主机时，请检查群组、权限、过滤器和格式。\n\n从 XHTTP 迁移时，先用配置副本测试单独主机，并保留可用版本以便恢复。先不启用额外扩展，再验证连接、下载、上传和重连。每次只改一项设置。并行测试请使用另一节点或空闲端口，两个 inbound 不能同时监听相同地址和端口。"
            }
        },
        {
            "id": "xera-current-wire-profile",
            "ru": {
                "title": "Совместимость параметров HTTP",
                "body": "Проверяйте совместимость ядра клиента и сервера перед обновлением. Устаревшие xPaddingObfsMode, noGRPCHeader, noSSEHeader и способ repeat-x больше не принимаются. Обновление только одной стороны может нарушить подключение. Эти изменения формата независимы от необязательной адаптации запросов.\n\nНастройки пути, служебных заголовков, размещения данных и HTTP-метода должны совпадать на обеих сторонах. Неподдерживаемые и конфликтующие параметры отклоняются при проверке. Серверные ограничения HTTP/2 и HTTP/3 задаются отдельно от клиентских minStreams и maxStreams. Они не задают внешний вид браузера и не гарантируют работу через любой CDN.\n\nДополнительное заполнение данных требует совпадающих настроек на обеих сторонах; автоматического перехода к варианту без заполнения нет. Browser Dialer не поддерживает это расширение. Секрет заполнения доступен пользователям профиля и CDN, завершающему TLS; он не заменяет авторизацию пользователя."
            },
            "en": {
                "title": "HTTP option compatibility",
                "body": "Check client and server core compatibility before updating. The obsolete xPaddingObfsMode, noGRPCHeader, noSSEHeader and repeat-x method are no longer accepted. Updating only one peer can break the connection. These format changes are independent of optional request adaptation.\n\nPath, service headers, data placement and HTTP method settings must match on both peers. Unsupported or conflicting options are rejected during validation. HTTP/2 and HTTP/3 server limits are configured separately from client minStreams and maxStreams. They do not define a browser fingerprint or ensure compatibility with every CDN.\n\nAdditional data padding requires matching settings on both peers and provides no automatic fallback to unpadded operation. Browser Dialer does not support this extension. The padding token is visible to profile users and a TLS-terminating CDN; it does not replace user authorization."
            },
            "fa": {
                "title": "سازگاری گزینه‌های HTTP",
                "body": "پیش از ارتقا سازگاری هسته کلاینت و سرور را بررسی کنید. گزینه‌های قدیمی xPaddingObfsMode، noGRPCHeader، noSSEHeader و روش repeat-x پذیرفته نمی‌شوند. ارتقای تنها یک طرف ممکن است اتصال را مختل کند. این تغییرات قالب، مستقل از تطبیق اختیاری درخواست‌ها هستند.\n\nمسیر، هدرهای سرویس، محل داده و روش HTTP باید در دو طرف مطابق باشند. گزینه ناسازگار یا پشتیبانی‌نشده هنگام اعتبارسنجی رد می‌شود. محدودیت‌های سرور HTTP/2 و HTTP/3 جدا از minStreams و maxStreams کلاینت هستند. آن‌ها اثرانگشت مرورگر را تعیین نمی‌کنند و سازگاری با هر CDN را تضمین نمی‌کنند.\n\nپدینگ اضافی داده به تنظیمات مطابق دو طرف نیاز دارد و خودکار به حالت بدون پدینگ برنمی‌گردد. Browser Dialer این افزونه را پشتیبانی نمی‌کند. توکن پدینگ برای کاربران پروفایل و CDN خاتمه‌دهنده TLS قابل مشاهده است و جای مجوز کاربر را نمی‌گیرد."
            },
            "zh": {
                "title": "HTTP 参数兼容性",
                "body": "升级前请检查客户端与服务器内核的兼容性。已移除的 xPaddingObfsMode、noGRPCHeader、noSSEHeader 及 repeat-x 方式不再接受。仅升级一端可能导致连接失败。这些格式变化与可选的请求自适应功能相互独立。\n\n双方的路径、服务标头、数据位置及 HTTP 方法须匹配。不支持或冲突的选项会在验证时被拒绝。HTTP/2 和 HTTP/3 服务器限制与客户端 minStreams、maxStreams 分开设置，不决定浏览器指纹，也不保证兼容所有 CDN。\n\n额外数据填充要求双方设置匹配，无法自动回退到无填充模式。Browser Dialer 不支持此扩展。配置用户和终止 TLS 的 CDN 可以看到填充令牌，该令牌不能代替用户授权。"
            }
        },
        {
            "id": "xera-observable-behavior",
            "ru": {
                "title": "Границы маскировки и измерения",
                "body": "Шифрование защищает содержимое, но адрес сервера, длительность соединения, размеры и время передачи пакетов остаются наблюдаемыми. Настройка HTTP-заголовков сама по себе не делает соединение неотличимым от браузера. Выбирайте режим с учётом сети и ограничений CDN; оценивайте работоспособность, задержку и расход трафика в используемом клиенте.\n\nXera не добавляет фоновый просмотр сайтов и не переключает протокол на лету. REALITY может выполнять собственные HTTPS-запросы при неподтверждённом соединении; это не подтверждает успешный VPN-доступ."
            },
            "en": {
                "title": "Camouflage limits and measurement",
                "body": "Encryption protects content, while the server address, connection duration, packet sizes and timing remain observable. Matching HTTP headers alone does not make a connection indistinguishable from a browser. Choose a mode for your network and CDN limits, then check connectivity, latency and traffic use in your actual client.\n\nXera does not add background browsing or switch protocols during a connection. REALITY can make its own HTTPS requests after an unauthenticated connection; those requests do not confirm successful VPN access."
            },
            "fa": {
                "title": "محدودیت استتار و اندازه‌گیری",
                "body": "رمزگذاری محتوا را محافظت می‌کند اما نشانی سرور، طول اتصال، اندازه و زمان‌بندی بسته‌ها قابل مشاهده می‌مانند. هماهنگی سربرگ‌های HTTP به‌تنهایی اتصال را غیرقابل‌تشخیص از مرورگر نمی‌کند. حالت را بر اساس شبکه و محدودیت CDN انتخاب و اتصال، تأخیر و مصرف ترافیک را در کلاینت واقعی بررسی کنید.\n\nXera مرور پس‌زمینه یا تغییر پروتکل حین اتصال اضافه نمی‌کند. REALITY ممکن است پس از اتصال احرازنشده درخواست HTTPS خود را بفرستد؛ این درخواست نشانه دسترسی موفق VPN نیست."
            },
            "zh": {
                "title": "伪装边界与测量",
                "body": "加密保护内容，但服务器地址、连接时长、数据包大小和时间仍可观察。仅匹配 HTTP 请求头不能保证连接与浏览器无法区分。应按网络及 CDN 限制选择模式，并在实际客户端检查连通性、延迟和流量消耗。\n\nXera 不会增加后台网页浏览，也不会在连接中途切换协议。REALITY 在未通过认证的连接后可能发送自己的 HTTPS 请求，这不能证明 VPN 访问成功。"
            }
        },
        {
            "id": "xera-client-h2-profile",
            "ru": {
                "title": "Внешний HTTP/2-профиль клиента",
                "body": "Параметр fingerprint выбирает поддерживаемый TLS-профиль клиента. Для поддерживаемых профилей Chrome Xera согласует с ним часть поведения HTTP/2 и автоматически сформированные User-Agent и Sec-CH-UA. Явно заданные заголовки сохраняются; другие профили используют обычное поведение HTTP/2.\n\nЭто не дополнительное шифрование и не гарантия неотличимости от браузера. CDN, завершающий TLS, видит HTTP-обмен. После смены fingerprint проверьте соединение и совместимость CDN. Некорректный ответ или ошибка заголовков может закрыть соединение; не отключайте проверку сертификата ради подключения."
            },
            "en": {
                "title": "Client HTTP/2 wire profile",
                "body": "The fingerprint setting selects a supported client TLS profile. For supported Chrome profiles, Xera aligns part of its HTTP/2 behavior and generated User-Agent and Sec-CH-UA with that profile. Explicit headers remain unchanged; other profiles use standard HTTP/2 behavior.\n\nThis adds no encryption and does not guarantee browser indistinguishability. A TLS-terminating CDN can see the HTTP exchange. After changing fingerprint, check the connection and CDN compatibility. An invalid response or header error can close the connection; do not disable certificate verification to connect."
            },
            "fa": {
                "title": "پروفایل HTTP/2 کارخواه",
                "body": "گزینه fingerprint پروفایل TLS پشتیبانی‌شده کلاینت را انتخاب می‌کند. در پروفایل‌های Chrome پشتیبانی‌شده، Xera بخشی از رفتار HTTP/2 و User-Agent و Sec-CH-UA خودکار را با آن هماهنگ می‌کند. سربرگ صریح حفظ می‌شود؛ پروفایل‌های دیگر رفتار معمول HTTP/2 دارند.\n\nاین قابلیت رمزگذاری اضافه یا تضمین غیرقابل‌تشخیص بودن از مرورگر نیست. CDN پایان‌دهنده TLS تبادل HTTP را می‌بیند. پس از تغییر fingerprint اتصال و سازگاری CDN را بررسی کنید. پاسخ یا سربرگ نامعتبر می‌تواند اتصال را ببندد؛ برای اتصال اعتبارسنجی گواهی را خاموش نکنید."
            },
            "zh": {
                "title": "客户端 HTTP/2 线缆特征",
                "body": "fingerprint 设置选择受支持的客户端 TLS 特征。对于支持的 Chrome 特征，Xera 会相应调整部分 HTTP/2 行为及自动生成的 User-Agent 和 Sec-CH-UA。显式请求头保持不变；其他特征使用标准 HTTP/2 行为。\n\n这不会增加加密，也不保证与浏览器无法区分。终止 TLS 的 CDN 可以看到 HTTP 交换。更改 fingerprint 后请检查连接及 CDN 兼容性。无效响应或请求头错误可能关闭连接；不要为连接而禁用证书验证。"
            }
        },
        {
            "id": "xera-editor-compatibility",
            "ru": {
                "title": "Проверка настроек в редакторе",
                "body": "Редактор профилей нод и шаблонов Xray проверяет поддерживаемые параметры и допустимые границы. Корректная конфигурация ещё не подтверждает поддержку функций приложением пользователя. Выбранный в панели режим собственного Core не подтверждает версии клиентских ядер.\n\nСерверные параметры h2Params и серверные ограничения ресурсов остаются на ноде и не выдаются в подписку. Общие настройки транспорта, адаптация и отдельный адрес загрузки сохраняются для совместимого клиента. Ручные параметры extra остаются доступны.\n\nДля xmux.hKeepAlivePeriod единица измерения — секунды: 0 выбирает значение по умолчанию, -1 выключает проверки простаивающих соединений, положительное значение не превышает 604800. HTTP-заголовки проверяются перед запуском; Host задаётся отдельным полем.\n\nМинимальная и максимальная версии TLS, если заданы, принимают 1.0, 1.1, 1.2 или 1.3; минимум не может превышать максимум. ECH и HTTP/3 требуют TLS 1.3. Если клиент или сервер не поддерживает выбранный диапазон, соединение отклоняется. Изменение ограничений TLS может изменить ClientHello; проверьте совместимость после правки."
            },
            "en": {
                "title": "Checking options in the editor",
                "body": "The node-profile and Xray-template editors check supported options and bounds. A valid configuration does not establish application support. Selecting custom Core mode in the panel does not verify client core versions.\n\nServer h2Params and server resource limits remain on the node and are omitted from subscriptions. Shared transport options, adaptation and a separate download endpoint are retained for compatible clients. Manual extra settings remain available.\n\nxmux.hKeepAlivePeriod is in seconds: 0 selects the default, -1 disables idle connection probes, and positive values cannot exceed 604800. HTTP headers are checked before startup; set Host through its separate field.\n\nExplicit TLS minimum and maximum versions accept 1.0, 1.1, 1.2 or 1.3; the minimum cannot exceed the maximum. ECH and HTTP/3 require TLS 1.3. If the client or server cannot support the selected range, the connection is rejected. Changing TLS bounds can alter ClientHello; check compatibility after editing."
            },
            "fa": {
                "title": "بررسی گزینه‌ها در ویرایشگر",
                "body": "ویرایشگر پروفایل نود و قالب Xray گزینه‌های پشتیبانی‌شده و حدود آن‌ها را بررسی می‌کند. معتبر بودن تنظیمات، پشتیبانی برنامه کاربر را اثبات نمی‌کند. انتخاب حالت Core سفارشی در پنل نیز نسخه هسته کلاینت را تأیید نمی‌کند.\n\nh2Params سرور و محدودیت منابع سرور روی نود می‌مانند و در اشتراک صادر نمی‌شوند. گزینه‌های مشترک انتقال، تطبیق و مقصد جداگانه دریافت برای کلاینت سازگار حفظ می‌شوند. تنظیم دستی extra همچنان در دسترس است.\n\nواحد xmux.hKeepAlivePeriod ثانیه است: ۰ مقدار پیش‌فرض، ۱- غیرفعال‌کردن بررسی اتصال بیکار و مقدار مثبت حداکثر ۶۰۴۸۰۰ است. هدر HTTP پیش از شروع بررسی می‌شود؛ Host را در فیلد جدا تنظیم کنید.\n\nحداقل و حداکثر نسخه TLS در صورت تعیین، 1.0، 1.1، 1.2 یا 1.3 هستند و حداقل نباید بیشتر از حداکثر باشد. ECH و HTTP/3 به TLS 1.3 نیاز دارند. اگر کلاینت یا سرور بازه را پشتیبانی نکند، اتصال رد می‌شود. تغییر حدود TLS ممکن است ClientHello را تغییر دهد؛ پس از ویرایش سازگاری را بررسی کنید."
            },
            "zh": {
                "title": "在编辑器中检查设置",
                "body": "节点配置和 Xray 模板编辑器会验证支持的选项与取值范围。配置有效并不证明用户应用支持该功能。在面板选择自定义 Core 模式也不能确认客户端内核版本。\n\n服务器 h2Params 和服务器资源限制只保留在节点，不会发到订阅。共享传输选项、自适应设置和独立下载目标会保留给兼容客户端，手动 extra 设置仍可使用。\n\nxmux.hKeepAlivePeriod 的单位为秒：0 使用默认值，-1 禁用空闲连接探测，正数不得超过 604800。启动前会检查 HTTP 标头；Host 使用单独字段设置。\n\n显式 TLS 最低和最高版本可为 1.0、1.1、1.2 或 1.3，最低不得高于最高。ECH 和 HTTP/3 需要 TLS 1.3。若客户端或服务器不支持所选范围，连接会被拒绝。更改 TLS 限制可能改变 ClientHello，请在编辑后检查兼容性。"
            }
        },
        {
            "id": "xera-network-conditions",
            "ru": {
                "title": "Выбор режима для своей сети",
                "body": "Для прямого соединения по TCP используйте корректно настроенный REALITY и stream-auto. Если нужен CDN с завершением TLS, выбирайте TLS и packet-up либо stream-auto: конечные POST работают также при буферизации upload. Поддержку CDN проверяйте передачей данных, а не только успешным подключением. REALITY не проходит через обычное завершение TLS на CDN.\n\nHTTP/3 требует отдельного TLS-профиля с alpn: [\"h3\"] и доступного UDP. При блокировке UDP нужен отдельный доступный профиль HTTP/2 по TCP; открытый поток автоматически между ними не переносится. QUIC Initial не скрывает SNI без реально согласованного ECH. Исследования [Китая](https://gfw.report/publications/usenixsecurity25/en/) и [РФ в марте–апреле 2026](https://www.petsymposium.org/foci/2026/foci-2026-0010.pdf) подтверждают, что HTTP/3 сам по себе не является защитой от фильтрации по имени.\n\nПроверяйте длительную отдачу и загрузку, HTTPS внутри туннеля, простой и повторное подключение. Если блокируется IP либо действует строгий список разрешённых адресов, padding не создаёт доступный маршрут. Дробление HTTP-запросов также не гарантирует обход лимита на весь TCP-сеанс. Успешный тест на одной сети не подтверждает доступность у всех операторов."
            },
            "en": {
                "title": "Selecting a mode for the network",
                "body": "For direct TCP, use correctly configured REALITY and stream-auto. For a CDN terminating TLS, use TLS with packet-up or stream-auto: finite POSTs also work when uploads are buffered. Verify data delivery, not just successful establishment. REALITY cannot pass unchanged through ordinary CDN TLS termination.\n\nHTTP/3 needs a separate TLS profile with alpn: [\"h3\"] and reachable UDP. If UDP is blocked, use a separately reachable TCP HTTP/2 profile; an open stream is not migrated automatically. QUIC Initial does not hide SNI without actual ECH negotiation. Measurements in [China](https://gfw.report/publications/usenixsecurity25/en/) and [Russia in March–April 2026](https://www.petsymposium.org/foci/2026/foci-2026-0010.pdf) establish that HTTP/3 alone does not prevent name-based filtering.\n\nTest sustained upload and download, HTTPS inside the tunnel, idle recovery and reconnection. Padding cannot create a reachable route when an IP is blocked or a strict destination allowlist applies. Splitting HTTP requests also does not guarantee evasion of a whole-connection limit. Success on one network does not establish availability across providers."
            },
            "fa": {
                "title": "انتخاب حالت برای شبکه",
                "body": "برای اتصال مستقیم TCP از REALITY با تنظیمات صحیح و stream-auto استفاده کنید. برای CDN که TLS را خاتمه می‌دهد، TLS و packet-up یا stream-auto را انتخاب کنید؛ POSTهای محدود حتی با بافرشدن ارسال کار می‌کنند. انتقال واقعی داده را بررسی کنید، نه فقط برقراری اتصال. REALITY بدون تغییر از خاتمه معمول TLS در CDN عبور نمی‌کند.\n\nHTTP/3 به پروفایل TLS جدا با alpn: [\"h3\"] و UDP قابل دسترس نیاز دارد. اگر UDP مسدود است، از پروفایل HTTP/2 روی TCP با مسیر قابل دسترس جدا استفاده کنید؛ جریان باز خودکار میان آن‌ها منتقل نمی‌شود. QUIC Initial بدون مذاکره واقعی ECH، نام SNI را پنهان نمی‌کند. اندازه‌گیری‌های [چین](https://gfw.report/publications/usenixsecurity25/en/) و [روسیه در مارس تا آوریل ۲۰۲۶](https://www.petsymposium.org/foci/2026/foci-2026-0010.pdf) نشان می‌دهند HTTP/3 به‌تنهایی مانع فیلتر بر اساس نام نیست.\n\nارسال و دریافت طولانی، HTTPS داخل تونل، بازیابی پس از بیکاری و اتصال مجدد را بررسی کنید. اگر IP مسدود باشد یا فقط مقصدهای مشخص مجاز باشند، padding مسیر قابل دسترس ایجاد نمی‌کند. تقسیم درخواست‌های HTTP نیز عبور از محدودیت کل اتصال را تضمین نمی‌کند. موفقیت در یک شبکه به معنی دسترسی در همه اپراتورها نیست."
            },
            "zh": {
                "title": "根据网络选择模式",
                "body": "直连 TCP 时，使用正确配置的 REALITY 和 stream-auto。使用终止 TLS 的 CDN 时，选择 TLS 配合 packet-up 或 stream-auto；有限长度的 POST 也适用于上传被缓冲的情况。应验证实际数据传输，而不只是连接建立成功。普通 CDN 的 TLS 终止无法原样传递 REALITY。\n\nHTTP/3 需要单独的 TLS 配置、alpn: [\"h3\"] 和可达的 UDP。UDP 被封锁时，需要另一个可达的 TCP HTTP/2 配置；已打开的流不会自动在二者之间迁移。未实际协商 ECH 时，QUIC Initial 不会隐藏 SNI。[中国的测量](https://gfw.report/publications/usenixsecurity25/en/)与[俄罗斯 2026 年 3—4 月的测量](https://www.petsymposium.org/foci/2026/foci-2026-0010.pdf)说明，仅使用 HTTP/3 无法防止基于名称的过滤。\n\n请测试持续上传和下载、隧道内的 HTTPS、空闲恢复及重新连接。IP 被封锁或只允许指定目标时，padding 无法创建可达路径。拆分 HTTP 请求也不能保证绕过整个连接的流量限制。某一网络测试成功不代表所有运营商均可用。"
            }
        },
        {
            "id": "xera-browser-ech-operation",
            "ru": {
                "title": "Browser Dialer и получение ECH",
                "body": "Browser Dialer использует настоящий браузер с открытой страницей помощника. Держите помощник на loopback и открывайте напрямую по настроенному адресу; после обновления Core перезагрузите страницу. Посторонним сайтам запрещены чтение токена и подключение WebSocket. Страница не кэшируется и не открывается в iframe. Эти меры не защищают от процесса, уже имеющего локальный доступ.\n\nBrowser Dialer не следует HTTP-редиректам, не берёт ответы туннеля из кэша и не передаёт ошибочную HTTP-страницу как данные соединения. Cookie другого origin установить из помощника нельзя: cookie-размещения и явный Cookie отклоняются заранее. Для session, sequence и padding используйте path, query или заголовки; для данных — body либо заголовки. GET/HEAD с body и запрещённые Fetch методы отклоняются. Native-клиент сохраняет поддержку cookie; customDownlinkPadding с Browser Dialer несовместим.\n\nECH скрывает внутренний ClientHello только при успешном согласовании; IP, внешний SNI и характеристики обмена остаются видимыми. Получение ECH-конфигурации проверяется отдельно: udp:// раскрывает DNS-запрос, а выбранный DoH должен быть доступен из сети пользователя. Крупные HTTPS/ECH-записи поддерживаются; усечённый UDP-ответ повторяется по TCP у того же резолвера. Ответ DoH ограничен 65535 байтами и проверяется до кэширования. При сбое DoH нет перехода на незашифрованный DNS; ошибка ECH не разрешает отключить ECH или проверку сертификата."
            },
            "en": {
                "title": "Browser Dialer and ECH acquisition",
                "body": "Browser Dialer uses a real browser with an open helper page. Keep the helper on loopback and open its configured address directly; reload the page after updating Core. Foreign websites cannot read its token or join its WebSocket. The page is not cached or allowed in frames. These controls do not protect against a process that already has local access.\n\nBrowser Dialer does not follow HTTP redirects, use cached tunnel responses or forward HTTP error pages as connection data. The helper cannot set another origin’s cookies: cookie placements and explicit Cookie headers fail early. Put session, sequence and padding metadata in paths, queries or headers, and data in bodies or headers. GET/HEAD bodies and Fetch-forbidden methods are rejected. Native clients retain cookie support; customDownlinkPadding is incompatible with Browser Dialer.\n\nECH hides the inner ClientHello only when negotiation succeeds; the IP, outer SNI and traffic characteristics remain observable. Verify ECH configuration acquisition separately: udp:// exposes the DNS query, while the chosen DoH must be reachable from the user’s network. Large HTTPS/ECH records are supported; truncated UDP answers retry over TCP at the same resolver. DoH replies are limited to 65535 bytes and checked before caching. DoH failure does not trigger plaintext DNS fallback; ECH failure does not authorize removing ECH or certificate verification."
            },
            "fa": {
                "title": "Browser Dialer و دریافت تنظیمات ECH",
                "body": "Browser Dialer از مرورگر واقعی و صفحه باز دستیار استفاده می‌کند. دستیار را روی loopback نگه دارید و آدرس تنظیم‌شده را مستقیم باز کنید؛ پس از به‌روزرسانی Core صفحه را دوباره بارگذاری کنید. سایت‌های دیگر اجازه خواندن توکن یا اتصال به WebSocket آن را ندارند. صفحه کش نمی‌شود و در iframe باز نمی‌شود. این کنترل‌ها در برابر فرایندی که از قبل دسترسی محلی دارد محافظت نمی‌کنند.\n\nBrowser Dialer تغییرمسیر HTTP را دنبال نمی‌کند، پاسخ تونل را از کش نمی‌گیرد و صفحه خطای HTTP را به‌عنوان داده اتصال عبور نمی‌دهد. دستیار نمی‌تواند کوکی origin دیگری را تنظیم کند؛ محل‌گذاری کوکی و هدر صریح Cookie زود رد می‌شوند. برای session، sequence و padding از مسیر، query یا هدر و برای داده از body یا هدر استفاده کنید. GET/HEAD دارای body و روش‌های ممنوع Fetch رد می‌شوند. کلاینت native پشتیبانی کوکی را حفظ می‌کند؛ customDownlinkPadding با Browser Dialer سازگار نیست.\n\nECH فقط با مذاکره موفق، ClientHello داخلی را پنهان می‌کند؛ IP، نام SNI بیرونی و ویژگی‌های تبادل قابل مشاهده می‌مانند. دریافت تنظیمات ECH را جدا بررسی کنید: udp:// پرس‌وجوی DNS را آشکار می‌کند و DoH انتخابی باید از شبکه کاربر قابل دسترس باشد. رکوردهای بزرگ HTTPS/ECH پشتیبانی می‌شوند؛ پاسخ ناقص UDP با TCP به همان resolver تکرار می‌شود. پاسخ DoH پیش از کش بررسی و به 65535 بایت محدود می‌شود. خرابی DoH باعث بازگشت به DNS بدون رمز نمی‌شود؛ خطای ECH مجوز حذف ECH یا بررسی گواهی نیست."
            },
            "zh": {
                "title": "Browser Dialer 与 ECH 配置获取",
                "body": "Browser Dialer 使用真实浏览器，并要求助手页面保持打开。请将助手绑定到 loopback，直接访问配置的地址；更新 Core 后重新加载页面。其他网站不能读取其令牌或加入其 WebSocket。页面禁止缓存及 iframe 嵌入。这些措施不能防御已经拥有本地访问权限的进程。\n\nBrowser Dialer 不跟随 HTTP 重定向、不使用缓存的隧道响应，也不将 HTTP 错误页面作为连接数据传递。助手无法设置其他 origin 的 cookie，因此会提前拒绝 cookie 放置方式和显式 Cookie 请求头。session、sequence、padding 元数据请放在路径、query 或请求头中，数据放在 body 或请求头中。拒绝带 body 的 GET/HEAD 及 Fetch 禁止的方法。native 客户端保留 cookie 支持；customDownlinkPadding 与 Browser Dialer 不兼容。\n\n只有协商成功时 ECH 才会隐藏内部 ClientHello；IP、外部 SNI 及流量特征仍可观察。请单独验证 ECH 配置获取：udp:// 会暴露 DNS 查询，所选 DoH 必须能从用户网络访问。支持大型 HTTPS/ECH 记录；截断的 UDP 响应会向同一解析器通过 TCP 重试。DoH 响应最多 65535 字节，并在缓存前验证。DoH 失败不会回退到明文 DNS；ECH 错误不允许关闭 ECH 或证书验证。"
            }
        },
        {
            "id": "xera-ipv6-operation",
            "ru": {
                "title": "IPv6 и смешанные сети",
                "body": "IPv4 и IPv6 проверяйте отдельно. В address IPv6 задаётся литералом, например 2001:db8::1; в URL и паре адрес:порт нужны скобки: [2001:db8::1]:443. Это зарезервированный адрес для примеров. SNI должен соответствовать настройкам TLS/REALITY. Отдельный downloadSettings также может использовать IPv6.\n\nПоддержка IPv6 в Core не создаёт маршрут на хосте или в Docker и не снимает запрет ОС. Нужны доступные IPv6-адрес, маршрут, listener и порт. AAAA-запись сама по себе не подтверждает доступность. В автовыборе выбирайте подходящий режим IPv4/IPv6/все адреса и проверяйте пул из клиентской сети; результат проверки от панели не заменяет проверку с устройства. Семейство IP и страна выхода — разные параметры: наличие IPv6 не подтверждает ни другую страну, ни отсутствие фильтрации."
            },
            "en": {
                "title": "IPv6 and mixed networks",
                "body": "Verify IPv4 and IPv6 separately. The address field accepts an IPv6 literal such as 2001:db8::1; URLs and address:port pairs need brackets: [2001:db8::1]:443. This is a reserved documentation address. SNI must match the TLS/REALITY configuration. A separate downloadSettings endpoint can also use IPv6.\n\nCore IPv6 support does not provision a host or Docker route or override operating-system restrictions. A reachable IPv6 address, route, listener and port are required. An AAAA record alone does not prove reachability. Select the appropriate IPv4/IPv6/all-addresses mode in autoselect and test the pool from the client network; a panel-side check does not replace a device check. IP family and exit country are different parameters: IPv6 neither establishes another country nor implies an absence of filtering."
            },
            "fa": {
                "title": "IPv6 و شبکه‌های ترکیبی",
                "body": "IPv4 و IPv6 را جدا بررسی کنید. فیلد address مقدار مستقیم IPv6 مانند 2001:db8::1 را می‌پذیرد؛ در URL و ترکیب آدرس:پورت براکت لازم است: [2001:db8::1]:443. این آدرس برای مستندات رزرو شده است. SNI باید با تنظیمات TLS/REALITY منطبق باشد. مقصد جداگانه downloadSettings نیز می‌تواند IPv6 داشته باشد.\n\nپشتیبانی IPv6 در Core مسیر میزبان یا Docker را ایجاد نمی‌کند و محدودیت سیستم‌عامل را برنمی‌دارد. آدرس IPv6، مسیر، listener و پورت قابل دسترس لازم‌اند. رکورد AAAA به‌تنهایی دسترسی را ثابت نمی‌کند. حالت مناسب IPv4/IPv6/همه آدرس‌ها را در انتخاب خودکار برگزینید و pool را از شبکه کلاینت بررسی کنید؛ بررسی پنل جای بررسی دستگاه را نمی‌گیرد. خانواده IP و کشور خروجی پارامترهای متفاوت‌اند؛ IPv6 کشور دیگر یا نبود فیلتر را ثابت نمی‌کند."
            },
            "zh": {
                "title": "IPv6 与混合网络",
                "body": "请分别验证 IPv4 和 IPv6。address 字段接受 IPv6 字面量，例如 2001:db8::1；URL 和地址:端口组合需要方括号：[2001:db8::1]:443。这是文档专用保留地址。SNI 必须匹配 TLS/REALITY 配置。单独的 downloadSettings 目标也可以使用 IPv6。\n\nCore 支持 IPv6 并不代表主机或 Docker 已配置路由，也不会解除操作系统限制。必须具备可达的 IPv6 地址、路由、监听器及端口。仅有 AAAA 记录不能证明可达性。自动选择中应选用合适的 IPv4/IPv6/全部地址模式，并从客户端网络测试地址池；面板端检查不能替代设备端检查。IP 地址族与出口国家是不同参数：IPv6 不代表出口国家改变，也不代表没有过滤。"
            }
        },
        {
            "id": "xera-adaptive",
            "ru": {
                "title": "Адаптивный параллелизм Xera HTTP",
                "body": "В редакторе профиля раскройте «Адаптивный Xera HTTP» и выберите существующий транспорт. Нажмите «Включить адаптацию», выберите «Сбалансированный» (balanced), «Низкая задержка» (low-latency) или «Нестабильная сеть» (unstable-network). Это три политики управления перегрузкой по измеренным HTTP-ответам, ходу передачи и ожиданию запросов. Сбалансированный профиль подходит для начальной проверки, низкая задержка чувствительнее к росту задержек, нестабильная сеть осторожнее восстанавливает параллелизм после перегрузки.\n\nПри включённой адаптации блок streamSettings.xeraHttpSettings.adaptive требует явно указать mode, minStreams и maxStreams. Минимум и максимум — целые числа от 1 до 32; минимум не больше максимума. Форма предлагает 4 и 32. Начальный предел 8 ограничивается этим диапазоном. Минимум задаёт нижнюю границу допуска и не создаёт запросов при отсутствии трафика.\n\nГраницы относятся к одновременно активным HTTP-запросам отдельно для каждого направления, назначения и версии настроек транспорта. Они не задают число физических TCP-соединений, пользователей, сессий всех приложений устройства или загрузку CPU. Подстройка влияет на допуск новых запросов: уже начатые не прерываются и не отправляются заново.\n\nНажмите «Применить в JSON», затем отдельно сохраните профиль. Для клиентских параметров inbound обновите подписку в приложении. Открытие формы и выбор значений сами по себе не переписывают ручной JSON. Без adaptive сохраняется прежнее поведение; ручные настройки и extra остаются доступны.\n\nПрофиль адаптации не меняет режим передачи auto/stream-auto, ALPN, padding или правила квот. Для работы настройки нужен Remnacust Core 1.1.22 или новее в использующем её клиенте. Проверьте фактическую версию ядра приложения; обычные клиенты без Xera HTTP несовместимы.\n\nПрофили используют измеренную обратную связь без обучения ИИ. Проверяйте отклик, передачу данных и устойчивость на своей сети. Профиль не гарантирует невидимость для DPI, доступность заблокированных адресов, совместимость с любым CDN или преимущество в сетях России и Китая."
            },
            "en": {
                "title": "Adaptive Xera HTTP concurrency",
                "body": "In the profile editor, expand Adaptive Xera HTTP and select an existing transport. Choose Enable adaptation, then Balanced (balanced), Low latency (low-latency) or Unstable network (unstable-network). These are three congestion policies using measured HTTP responses, transfer progress and request waiting. Balanced is a starting point for testing; Low latency reacts more sensitively to rising delay, while Unstable network restores concurrency more cautiously after congestion.\n\nWhen adaptation is enabled, streamSettings.xeraHttpSettings.adaptive requires explicit mode, minStreams and maxStreams. The minimum and maximum must be integers from 1 to 32, with the minimum no greater than the maximum. The form offers 4 and 32. The initial limit of 8 is clamped into that range. The minimum is an admission floor and creates no requests while idle.\n\nBounds apply to simultaneously active HTTP requests separately for each direction, destination and generation of transport settings. They do not specify physical TCP connection counts, users, sessions across all device apps or CPU load. Adjustment controls admission of new requests; requests already started are neither aborted nor replayed.\n\nChoose Apply to JSON, then save the profile separately. For inbound client settings, refresh the application subscription. Opening the form or choosing values alone does not rewrite manual JSON. Without adaptive, previous behavior is preserved; manual settings and extra remain available.\n\nThe adaptation profile leaves the auto/stream-auto transfer mode, ALPN, padding and quota rules unchanged. Applying it requires Remnacust Core 1.1.22 or later in the client using the setting. Check the actual application core version; standard clients without Xera HTTP are incompatible.\n\nThe profiles use measured feedback without AI training. Check responsiveness, data transfer and stability on your network. They cannot guarantee DPI invisibility, blocked-address reachability, compatibility with every CDN or an advantage on networks in Russia or China."
            },
            "fa": {
                "title": "هم‌زمانی تطبیقی Xera HTTP",
                "body": "در ویرایشگر پروفایل، بخش Xera HTTP تطبیقی را باز و انتقال موجود را انتخاب کنید. فعال‌سازی تطبیق را بزنید و متعادل (balanced)، تأخیر کم (low-latency) یا شبکه ناپایدار (unstable-network) را انتخاب کنید. این‌ها سه سیاست کنترل ازدحام بر اساس پاسخ HTTP اندازه‌گیری‌شده، پیشرفت انتقال و انتظار درخواست هستند. متعادل برای شروع آزمایش مناسب است؛ تأخیر کم به افزایش تأخیر حساس‌تر است و شبکه ناپایدار پس از ازدحام هم‌زمانی را محتاطانه‌تر افزایش می‌دهد.\n\nهنگام فعال بودن تطبیق، بلوک streamSettings.xeraHttpSettings.adaptive به تعیین صریح هر سه فیلد mode، minStreams و maxStreams نیاز دارد. حداقل و حداکثر باید عدد صحیح از ۱ تا ۳۲ باشند و حداقل بیشتر از حداکثر نباشد. فرم ۴ و ۳۲ را پیشنهاد می‌کند. حد آغازین ۸ در این بازه محدود می‌شود. حداقل، کف مجوز هم‌زمانی است و هنگام بیکاری درخواست ایجاد نمی‌کند.\n\nحدود برای درخواست‌های HTTP فعال هم‌زمان، جداگانه در هر جهت، مقصد و نسخه تنظیمات انتقال هستند. آن‌ها تعداد اتصال TCP فیزیکی، کاربران، نشست‌های همه برنامه‌های دستگاه یا بار CPU را تعیین نمی‌کنند. تطبیق فقط پذیرش درخواست جدید را کنترل می‌کند؛ درخواست آغازشده قطع یا دوباره ارسال نمی‌شود.\n\nاعمال در JSON را بزنید و سپس پروفایل را جداگانه ذخیره کنید. برای پارامتر کلاینت inbound، اشتراک برنامه را به‌روز کنید. باز کردن فرم یا انتخاب مقادیر به‌تنهایی JSON دستی را بازنویسی نمی‌کند. بدون adaptive رفتار قبلی حفظ می‌شود و تنظیمات دستی و extra در دسترس می‌مانند.\n\nپروفایل تطبیق، حالت انتقال auto/stream-auto، ALPN، پدینگ یا قواعد سهمیه را تغییر نمی‌دهد. برای اعمال آن، کلاینت استفاده‌کننده باید Remnacust Core 1.1.22 یا جدیدتر داشته باشد. نسخه واقعی هسته برنامه را بررسی کنید؛ کلاینت استاندارد بدون Xera HTTP سازگار نیست.\n\nپروفایل‌ها از بازخورد اندازه‌گیری‌شده بدون آموزش هوش مصنوعی استفاده می‌کنند. پاسخ‌گویی، انتقال داده و پایداری را در شبکه خود بررسی کنید. نامرئی بودن برای DPI، دسترسی به آدرس مسدود، سازگاری با هر CDN یا برتری در شبکه‌های روسیه و چین تضمین نمی‌شود."
            },
            "zh": {
                "title": "Xera HTTP 自适应并发",
                "body": "在配置编辑器展开“自适应 Xera HTTP”，选择已有传输，点击启用自适应，再选择均衡（balanced）、低延迟（low-latency）或不稳定网络（unstable-network）。这是三种拥塞控制策略，依据实际 HTTP 响应、传输进度及请求等待调整。均衡适合作为测试起点；低延迟对延迟增长更敏感；不稳定网络在拥塞后更谨慎地恢复并发。\n\n启用自适应时，streamSettings.xeraHttpSettings.adaptive 必须显式提供 mode、minStreams 和 maxStreams 三个字段。最小值和最大值须为 1–32 的整数，最小值不得大于最大值。表单提供 4 和 32，初始上限 8 会限制在该范围内。最小值是允许并发的下限，空闲时不会因此产生请求。\n\n限制分别适用于每个方向、每个目标及每一代传输设置中同时活动的 HTTP 请求，不表示物理 TCP 连接数、用户数、设备全部应用的会话数或 CPU 负载。调整只影响新请求的准入，已开始的请求不会被中断或重放。\n\n点击“应用到 JSON”，然后另行保存配置。对于 inbound 的客户端参数，还需更新应用订阅。仅打开表单或选择数值不会重写手动 JSON。省略 adaptive 时保留原有行为，手动设置和 extra 仍可使用。\n\n自适应策略不改变 auto/stream-auto 传输模式、ALPN、填充或配额规则。使用该设置的客户端需要 Remnacust Core 1.1.22 或更新版本。请检查应用实际内核版本；不支持 Xera HTTP 的标准客户端无法使用。\n\n这些策略使用实测反馈，无需训练人工智能。请在自己的网络验证响应、数据传输和稳定性，不保证对 DPI 隐形、被封锁地址可达、兼容所有 CDN，或在俄罗斯与中国网络中具有优势。"
            }
        }
    ]
}
