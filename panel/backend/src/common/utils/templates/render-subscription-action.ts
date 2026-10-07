import { SubscriptionActionSchema } from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

import { TemplateEngine } from './replace-templates-values';
import { TemplateResolvers } from './template-variables';

export function renderSubscriptionAction(action: unknown, resolvers: TemplateResolvers) {
    const parsed = SubscriptionActionSchema.safeParse(action);
    if (!parsed.success) return null;
    // Variables inside a URL are data, not URL separators, credentials or a new scheme.
    const encoded = Object.fromEntries(
        Object.entries(resolvers).map(([key, resolve]) => [
            key,
            (args: Record<string, string>) => encodeURIComponent(String(resolve(args))),
        ]),
    ) as TemplateResolvers;
    const url = TemplateEngine.replace(parsed.data.url, encoded);
    const rendered = SubscriptionActionSchema.safeParse({
        text: TemplateEngine.replace(parsed.data.text, resolvers).slice(0, 500),
        buttonText: TemplateEngine.replace(parsed.data.buttonText, resolvers).slice(0, 60),
        url,
    });
    return rendered.success ? rendered.data : null;
}
