export class TelegramApiError extends Error {
    constructor(
        message: string,
        readonly retryAfter?: number,
    ) {
        super(message);
        this.name = 'TelegramApiError';
    }
}
