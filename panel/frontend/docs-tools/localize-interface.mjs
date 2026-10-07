import fs from 'node:fs'
import path from 'node:path'
const translations = {
    title: ['Documentation', 'Документация', 'مستندات', '文档'],
    guide: ['Panel guide', 'Руководство по панели', 'راهنمای پنل', '面板指南'],
    api: ['API reference', 'Справочник API', 'مرجع API', 'API 参考'],
    intro: [
        'Workflows, settings and the exact contract of this build.',
        'Функции, настройки и точный контракт этой сборки.',
        'عملکردها، تنظیمات و قرارداد دقیق این نسخه.',
        '本版本的工作流程、设置和准确接口定义。'
    ],
    search: [
        'Search functions, fields and explanations',
        'Поиск функций, полей и объяснений',
        'جستجوی عملکردها، فیلدها و توضیحات',
        '搜索功能、字段和说明'
    ],
    apiSearch: [
        'Search path, operation or permission',
        'Поиск пути, операции или права',
        'جستجوی مسیر، عملیات یا مجوز',
        '搜索路径、操作或权限'
    ],
    contents: ['Contents', 'Содержание', 'فهرست', '目录'],
    onPage: ['On this page', 'На этой странице', 'در این صفحه', '本页内容'],
    language: ['Reading language', 'Язык руководства', 'زبان راهنما', '阅读语言'],
    readingNote: [
        'The complete guide is available in Russian and English. Choose the reading language above.',
        'Полное руководство доступно на русском и английском. Язык чтения можно выбрать выше.',
        'راهنمای کامل به زبان روسی و انگلیسی موجود است. زبان مطالعه را در بالا انتخاب کنید.',
        '完整指南提供俄语和英语版本。可在上方选择阅读语言。'
    ],
    fields: ['Fields and controls', 'Поля и элементы управления', 'فیلدها و کنترل‌ها', '字段与控件'],
    fieldNote: [
        'Names and help text come from the current forms. API schemas specify exact types and nested fields.',
        'Названия и подсказки взяты из текущих форм. Точные типы и вложенные поля описаны в схемах API.',
        'نام‌ها و راهنماها از فرم‌های فعلی گرفته شده‌اند. انواع دقیق و فیلدهای تو‌در‌تو در طرح API آمده‌اند.',
        '名称和说明来自当前表单。准确类型和嵌套字段请参阅 API 架构。'
    ],
    relatedApi: [
        'Related API operations',
        'Связанные методы API',
        'عملیات مرتبط API',
        '相关 API 操作'
    ],
    openPage: ['Open this section', 'Открыть раздел панели', 'باز کردن این بخش', '打开面板页面'],
    permalink: ['Copy a link', 'Скопировать ссылку', 'کپی پیوند', '复制链接'],
    copied: ['Link copied', 'Ссылка скопирована', 'پیوند کپی شد', '链接已复制'],
    copyFailed: [
        'Could not copy. Copy the address from the browser.',
        'Не удалось скопировать. Скопируйте адрес браузера.',
        'کپی انجام نشد. آدرس مرورگر را کپی کنید.',
        '复制失败，请复制浏览器地址。'
    ],
    download: ['Download guide', 'Скачать руководство', 'دانلود راهنما', '下载指南'],
    downloadSpec: ['Download OpenAPI', 'Скачать OpenAPI', 'دانلود OpenAPI', '下载 OpenAPI'],
    searchEmpty: [
        'No matches. Try a function name, field or API path.',
        'Ничего не найдено. Попробуйте название функции, поле или путь API.',
        'نتیجه‌ای پیدا نشد. نام عملکرد، فیلد یا مسیر API را امتحان کنید.',
        '没有结果，请尝试功能名称、字段或 API 路径。'
    ],
    error: [
        'Documentation could not be loaded.',
        'Не удалось загрузить документацию.',
        'بارگذاری مستندات انجام نشد.',
        '文档加载失败。'
    ],
    retry: ['Retry', 'Повторить', 'تلاش دوباره', '重试'],
    loading: ['Loading documentation', 'Загрузка документации', 'بارگذاری مستندات', '正在加载文档'],
    articles: ['{{count}} articles', 'Статей: {{count}}', '{{count}} مقاله', '{{count}} 篇文章'],
    operations: [
        '{{count}} operations',
        'Методов: {{count}}',
        '{{count}} عملیات',
        '{{count}} 个操作'
    ],
    operation: ['Operation', 'Операция', 'عملیات', '操作'],
    schemas: ['Schemas and events', 'Схемы и события', 'طرح‌ها و رویدادها', '架构与事件'],
    schema: ['Schema', 'Схема', 'طرح', '架构'],
    access: ['Access', 'Доступ', 'دسترسی', '访问权限'],
    token: ['API token', 'API-токен', 'توکن API', 'API 令牌'],
    admin: ['Administrator session', 'Сессия администратора', 'نشست مدیر', '管理员会话'],
    public: [
        'Public / endpoint-specific checks',
        'Публичный / проверки метода',
        'عمومی / بررسی‌های اختصاصی مسیر',
        '公开 / 端点专用验证'
    ],
    special: [
        'Special authentication',
        'Специальная авторизация',
        'احراز هویت اختصاصی',
        '专用身份验证'
    ],
    authNote: [
        'Public endpoints may still require a subscription secret, login credentials or a one-time challenge. Read their schema.',
        'Публичный метод может требовать секрет подписки, данные входа или одноразовый challenge. Проверяйте его схему.',
        'مسیر عمومی ممکن است به رمز اشتراک، اطلاعات ورود یا چالش یک‌بارمصرف نیاز داشته باشد. طرح آن را بررسی کنید.',
        '公开端点仍可能要求订阅密钥、登录凭据或一次性验证，请查看其架构。'
    ],
    scope: ['Required permission', 'Требуемое право', 'مجوز لازم', '所需权限'],
    alternatives: ['Also accepted: ', 'Также подходят: ', 'همچنین قابل قبول: ', '也接受：'],
    params: [
        'Path and query parameters',
        'Параметры пути и запроса',
        'پارامترهای مسیر و پرس‌وجو',
        '路径与查询参数'
    ],
    request: ['Request body', 'Тело запроса', 'بدنه درخواست', '请求体'],
    response: ['Responses', 'Ответы', 'پاسخ‌ها', '响应'],
    example: ['cURL example', 'Пример cURL', 'نمونه cURL', 'cURL 示例'],
    exampleNote: [
        'Replace placeholders and check recipient access. Examples never execute requests and contain no real credentials.',
        'Замените заглушки и проверьте доступ получателей. Примеры не выполняют запросы и не содержат настоящих реквизитов.',
        'مقادیر نمونه را جایگزین و دسترسی گیرندگان را بررسی کنید. نمونه‌ها هیچ درخواستی اجرا نمی‌کنند و اطلاعات ورود واقعی ندارند.',
        '请替换占位值并检查接收者权限。示例不会执行请求，也不含真实凭据。'
    ],
    noSchema: [
        'No schema published for this payload. Review the operation contract before sending it.',
        'Для этих данных схема не опубликована. Перед отправкой проверьте контракт операции.',
        'برای این داده‌ها طرحی منتشر نشده است. پیش از ارسال، قرارداد عملیات را بررسی کنید.',
        '该数据未发布架构，发送前请检查操作定义。'
    ],
    none: ['Not applicable', 'Не требуется', 'لازم نیست', '不适用'],
    required: ['Required', 'Обязательно', 'الزامی', '必填'],
    optional: ['Optional', 'Необязательно', 'اختیاری', '可选'],
    default: ['Default', 'По умолчанию', 'پیش‌فرض', '默认值'],
    constraints: ['Constraints', 'Ограничения', 'محدودیت‌ها', '约束'],
    enum: ['Allowed values', 'Допустимые значения', 'مقادیر مجاز', '允许值'],
    unresolved: ['Reference', 'Ссылка на схему', 'ارجاع به طرح', '架构引用'],
    contractNote: [
        'Technical descriptions are retained from the server OpenAPI contract. Business validation can impose additional checks.',
        'Технические описания сохранены из OpenAPI сервера. Сервер дополнительно проверяет связи и бизнес-правила.',
        'توضیحات فنی از قرارداد OpenAPI سرور حفظ شده‌اند. سرور ممکن است بررسی‌های تجاری بیشتری انجام دهد.',
        '技术说明保留自服务器 OpenAPI 定义。服务器还可能执行额外业务验证。'
    ],
    variables: [
        'Supported {{…}} variables',
        'Поддерживаемые переменные {{…}}',
        'متغیرهای پشتیبانی‌شده {{…}}',
        '支持的 {{…}} 变量'
    ],
    noUnits: [
        'Numeric value, without unit',
        'Число без единицы',
        'عدد بدون واحد',
        '数值，不含单位'
    ],
    referenceVersion: ['Build reference', 'Справочник сборки', 'مرجع نسخه', '构建参考'],
    invalidLink: [
        'This article or operation was not found. Choose an entry from the contents.',
        'Статья или метод по этой ссылке не найдены. Выберите запись в содержании.',
        'مقاله یا عملیات این پیوند پیدا نشد. موردی را از فهرست انتخاب کنید.',
        '找不到该文章或操作，请从目录选择。'
    ],
    clear: ['Clear search', 'Очистить поиск', 'پاک کردن جستجو', '清除搜索']
}
const languages = ['en', 'ru', 'fa', 'zh']
for (let index = 0; index < languages.length; index++) {
    const file = path.resolve(
        import.meta.dirname,
        `../public/locales/${languages[index]}/remnawave.json`
    )
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    data.documentation = Object.fromEntries(
        Object.entries(translations).map(([key, values]) => [key, values[index]])
    )
    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n')
}
