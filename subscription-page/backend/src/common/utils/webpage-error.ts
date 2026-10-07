import type { Request, Response } from 'express';

const messages = {
    en: { 403: 'This subscription page is not available.', 404: 'Subscription not found.', 503: 'Unable to load the subscription. Please try again later.', reload: 'Reload' },
    ru: { 403: 'Страница этой подписки недоступна.', 404: 'Подписка не найдена.', 503: 'Не удалось загрузить подписку. Попробуйте немного позже.', reload: 'Обновить' },
    fa: { 403: 'صفحه این اشتراک در دسترس نیست.', 404: 'اشتراک پیدا نشد.', 503: 'بارگیری اشتراک ممکن نشد. لطفاً کمی بعد دوباره تلاش کنید.', reload: 'بارگیری مجدد' },
    zh: { 403: '此订阅页面不可用。', 404: '未找到订阅。', 503: '无法加载订阅，请稍后重试。', reload: '重新加载' },
};

export function sendWebpageError(req: Request, res: Response, status: 403 | 404 | 503): void {
    const preferred = (req.headers['accept-language'] ?? '').split(',')
        .map((item, index) => {
            const [tag, ...params] = item.trim().toLowerCase().split(';');
            const quality = params.find((param) => param.trim().startsWith('q='));
            return { language: tag.split('-')[0], quality: quality ? Number(quality.trim().slice(2)) : 1, index };
        })
        .filter((item) => item.quality > 0 && item.quality <= 1 && Object.hasOwn(messages, item.language))
        .sort((a, b) => b.quality - a.quality || a.index - b.index);
    const language = (preferred[0]?.language ?? 'en') as keyof typeof messages;
    const text = messages[language];
    res.set('Cache-Control', 'private, no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Language', language);
    if (status === 503) res.set('Retry-After', '30');
    // Only fixed translations and the whitelisted language enter this HTML.
    res.status(status).type('html').send(`<!doctype html><html lang="${language}" dir="${language === 'fa' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${text[status]}</title><style>body{margin:0;background:#121316;color:#e5e7eb;font:16px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.25rem;font-weight:600}p{color:#a4a7b0}a{display:inline-block;color:#2dd4bf;border:1px solid #255c55;border-radius:6px;padding:.4rem 1rem;text-decoration:none}a:focus-visible{outline:2px solid #2dd4bf;outline-offset:4px}</style></head><body><main><p>${status}</p><h1>${text[status]}</h1><a href="">${text.reload}</a></main></body></html>`);
}
