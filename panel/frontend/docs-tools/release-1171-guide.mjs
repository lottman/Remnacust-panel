const languages = ['ru', 'en', 'fa', 'zh']
const saved = [
    '«Сохранить» сначала проверяет JSON. Отсутствующий protocol, опечатка в нём или ошибка структуры возвращает понятное сообщение, не меняя профиль и историю. Если встроенный Xray нашёл другую ошибку, панель показывает её и спрашивает подтверждение сохранения. Подтверждение не отключает проверку структуры на сервере. Сохранённый ошибочный профиль можно открыть и исправить.',
    'Save validates JSON first. A missing protocol, a typo in it or a structural error produces an explanation without changing the profile or its history. If the built-in Xray validator reports another error, the panel displays it and asks you to confirm saving. Confirmation does not bypass server-side structural checks. A saved invalid profile can be reopened and corrected.',
    '«ذخیره» ابتدا JSON را بررسی می‌کند. نبودن protocol، اشتباه در نام آن یا خطای ساختار، پیام روشن نشان می‌دهد و پروفایل و تاریخچه را تغییر نمی‌دهد. اگر اعتبارسنج Xray داخلی خطای دیگری پیدا کند، پنل آن را نمایش می‌دهد و برای ذخیره تأیید می‌گیرد. تأیید، بررسی ساختار در سرور را غیرفعال نمی‌کند. پروفایل نامعتبر ذخیره‌شده را می‌توان دوباره باز و اصلاح کرد.',
    '“保存”首先验证 JSON。缺少 protocol、字段拼写错误或结构错误时会显示原因，配置与历史保持不变。内置 Xray 验证器发现其他错误时，面板会显示错误并要求确认保存。确认不会跳过服务器的结构检查。已保存的无效配置可以重新打开并修正。'
]
const apply = [
    'Запись в базу и применение на нодах выполняются отдельно. Сообщение о постановке в очередь означает, что задача отправлена; проверьте результат в состоянии и журнале ноды. Если постановка в очередь не удалась, профиль уже сохранён — панель показывает предупреждение. Новые правки, сделанные во время сохранения, остаются в редакторе. Для отдельного варианта сначала клонируйте профиль.',
    'Database persistence and node application are separate steps. A queued message means a job was submitted; check node status and logs for its outcome. If queuing fails, the profile has still been saved and the panel shows a warning. Edits made while saving remain in the editor. Clone a profile first when preparing a separate variant.',
    'ذخیره در پایگاه داده و اعمال روی نودها جدا انجام می‌شوند. پیام صف یعنی کار ارسال شده است؛ نتیجه را در وضعیت و گزارش نود بررسی کنید. اگر ارسال به صف شکست بخورد، پروفایل همچنان ذخیره شده و پنل هشدار می‌دهد. تغییرات جدید هنگام ذخیره در ویرایشگر می‌مانند. برای نسخه جدا ابتدا پروفایل را کپی کنید.',
    '数据库保存与节点应用是两个步骤。进入队列的提示只表示任务已提交，请在节点状态和日志中检查结果。入队失败时配置仍已保存，面板会显示警告。保存期间的新修改保留在编辑器中。制作独立版本前先克隆配置。'
]
const postStart = [
    ['После запуска ядра', 'В JSON плагина раздел postStart запускает включённые действия после старта или перезапуска Xray. Чтобы отправлять уведомление, включите postStart.enabled и postStart.webhook.enabled и укажите webhook.url. Нода отправит POST с событием service.core_started, временем и своими метаданными. Запрос выполняется в фоне с таймаутом 5 секунд; ошибка доставки записывается в журнал и не останавливает работающий Xray. Проверяйте адрес получателя перед включением.'],
    ['After core startup', 'The postStart section in plugin JSON runs enabled actions after Xray starts or restarts. To send a notification, enable postStart.enabled and postStart.webhook.enabled and set webhook.url. The node sends a POST containing service.core_started, a timestamp and its metadata. Delivery runs in the background with a five-second timeout; failures are logged without stopping Xray. Verify the destination before enabling it.'],
    ['پس از شروع هسته', 'بخش postStart در JSON افزونه، کارهای فعال را پس از شروع یا راه‌اندازی دوباره Xray اجرا می‌کند. برای اعلان، postStart.enabled و postStart.webhook.enabled را روشن و webhook.url را تنظیم کنید. نود درخواست POST با رویداد service.core_started، زمان و اطلاعات خود می‌فرستد. ارسال در پس‌زمینه با مهلت ۵ ثانیه است؛ خطای تحویل ثبت می‌شود و Xray را متوقف نمی‌کند. پیش از فعال‌سازی، آدرس مقصد را بررسی کنید.'],
    ['内核启动后', '插件 JSON 的 postStart 在 Xray 启动或重启后执行已启用操作。要发送通知，启用 postStart.enabled 和 postStart.webhook.enabled，并填写 webhook.url。节点发送包含 service.core_started、时间和节点元数据的 POST。请求在后台执行，超时为 5 秒；发送失败只记录日志，不停止 Xray。启用前核对接收地址。']
]
export function explainRelease1171(articles) {
    const editor = articles.find(article => article.id === 'xray-editor')
    for (const [index, language] of languages.entries()) {
        editor.sections.find(section => section.id === 'xray-editor-3')[language].body = saved[index]
        editor.sections.find(section => section.id === 'xray-editor-4')[language].body = apply[index]
    }
    const plugins = articles.find(article => article.id === 'node-plugins')
    plugins.sections.push({
        id: 'node-plugins-post-start',
        ...Object.fromEntries(languages.map((language, index) => [language, { title: postStart[index][0], body: postStart[index][1] }]))
    })
}
