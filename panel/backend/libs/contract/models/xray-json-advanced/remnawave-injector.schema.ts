import z from 'zod';

const groups = (item: z.ZodType<string>) =>
    z.union([
        z.array(z.array(item).min(1).max(10000)).min(1).max(1000),
        z
            .record(
                z
                    .string()
                    .min(1)
                    .max(128)
                    .refine((key) => !['__proto__', 'constructor', 'prototype'].includes(key)),
                z.array(item).min(1).max(10000),
            )
            .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 1000),
    ]);
const HostSelectorSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('uuids'),
        values: z.array(z.uuid()).min(1).max(10000).optional(),
        groups: groups(z.uuid()).optional(),
        expected: z.int().min(1).max(1000).optional(),
    }),
    z.object({
        type: z.literal('tags'),
        values: z.array(z.string().min(1).max(255)).min(1).max(10000).optional(),
        groups: groups(z.string().min(1).max(255)).optional(),
        expected: z.int().min(1).max(1000).optional(),
    }),
    z.object({
        type: z.literal('remarkRegex'),
        pattern: z.string().min(1),
        expected: z.int().min(1).max(1000).optional(),
        groups: groups(z.uuid()).optional(),
    }),
    z.object({
        type: z.literal('tagRegex'),
        pattern: z.string().min(1),
        expected: z.int().min(1).max(1000).optional(),
        groups: groups(z.uuid()).optional(),
    }),
    z.object({
        type: z.literal('sameTagAsRecipient'),
        expected: z.int().min(1).max(1000).optional(),
        groups: groups(z.uuid()).optional(),
    }),
]);

export const InjectHostsEntrySchema = z
    .object({
        selector: HostSelectorSchema,
        mode: z.enum(['all', 'random', 'group']).optional(),
        selectFrom: z.enum(['ALL', 'HIDDEN', 'NOT_HIDDEN']).optional(),
        tagPrefix: z.string().min(1).optional(),
        useHostRemarkAsTag: z.boolean().optional(),
        useHostTagAsTag: z.boolean().optional(),
    })
    .superRefine((entry, context) => {
        const selector = entry.selector;
        const pooled = selector.type === 'uuids' || selector.type === 'tags';
        if (entry.mode === 'group') {
            if (!selector.groups)
                context.addIssue({
                    code: 'custom',
                    path: ['selector', 'groups'],
                    message: 'Group mode requires host groups (tag groups for a tag selector)',
                });
        } else if (pooled && !selector.values?.length) {
            context.addIssue({
                code: 'custom',
                path: ['selector', 'values'],
                message: 'Select at least one host or tag',
            });
        }
        if (entry.mode === 'random' && !selector.expected)
            context.addIssue({
                code: 'custom',
                path: ['selector', 'expected'],
                message: 'Random mode requires an expected count',
            });
    });

export const RemnawaveInjectorSchema = z.object({
    injectHosts: z.array(InjectHostsEntrySchema).optional(),
    addVirtualHostAsOutbound: z.boolean().optional(),
    assignTo: z
        .object({
            hosts: z.array(z.uuid()).max(10000).optional(),
            tags: z.array(z.string().min(1).max(255)).max(10000).optional(),
        })
        .optional(),
});

export type TRemnawaveInjector = z.infer<typeof RemnawaveInjectorSchema>;
export type TRemnawaveInjectorSelector = z.infer<typeof HostSelectorSchema>;
export type TRemnawaveInjectorSelectFrom = z.infer<typeof InjectHostsEntrySchema>['selectFrom'];
export type TInjectHostsEntry = z.infer<typeof InjectHostsEntrySchema>;
