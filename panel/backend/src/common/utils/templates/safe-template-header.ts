export function safeTemplateHeader(value: string): string {
    // Control bytes are intentionally removed before the value reaches HTTP.
    // eslint-disable-next-line no-control-regex
    const text = value.replace(/[\x00-\x1f\x7f]/g, ' ');
    // Node rejects raw Unicode header values. Use the same UTF-8/base64 convention
    // already supported by subscription titles and announcements.
    return /[^\x20-\xff]/.test(text)
        ? `base64:${Buffer.from(text, 'utf8').toString('base64')}`
        : text;
}
