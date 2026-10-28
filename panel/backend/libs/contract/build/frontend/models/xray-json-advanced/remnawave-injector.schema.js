"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemnawaveInjectorSchema = exports.InjectHostsEntrySchema = void 0;
exports.injectedTagMatches = injectedTagMatches;
exports.injectedPrefixesCollide = injectedPrefixesCollide;
const zod_1 = __importDefault(require("zod"));
// The first outbound uses the prefix itself; later ones use prefix-2, prefix-3, ….
function injectedTagMatches(prefix, tag) {
    return tag === prefix || (tag.startsWith(prefix + '-') && /^(?:[2-9]|[1-9]\d+)$/.test(tag.slice(prefix.length + 1)));
}
function injectedPrefixesCollide(left, right) {
    return injectedTagMatches(left, right) || injectedTagMatches(right, left);
}
const groups = (item) => zod_1.default.union([
    zod_1.default.array(zod_1.default.array(item).min(1).max(10000)).min(1).max(1000),
    zod_1.default
        .record(zod_1.default
        .string()
        .min(1)
        .max(128)
        .refine((key) => !['__proto__', 'constructor', 'prototype'].includes(key)), zod_1.default.array(item).min(1).max(10000))
        .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 1000),
]);
const HostSelectorSchema = zod_1.default.discriminatedUnion('type', [
    zod_1.default.object({
        type: zod_1.default.literal('uuids'),
        values: zod_1.default.array(zod_1.default.uuid()).min(1).max(10000).optional(),
        groups: groups(zod_1.default.uuid()).optional(),
        expected: zod_1.default.int().min(1).max(1000).optional(),
    }),
    zod_1.default.object({
        type: zod_1.default.literal('tags'),
        values: zod_1.default.array(zod_1.default.string().min(1).max(255)).min(1).max(10000).optional(),
        groups: groups(zod_1.default.string().min(1).max(255)).optional(),
        expected: zod_1.default.int().min(1).max(1000).optional(),
    }),
    zod_1.default.object({
        type: zod_1.default.literal('remarkRegex'),
        pattern: zod_1.default.string().min(1),
        expected: zod_1.default.int().min(1).max(1000).optional(),
        groups: groups(zod_1.default.uuid()).optional(),
    }),
    zod_1.default.object({
        type: zod_1.default.literal('tagRegex'),
        pattern: zod_1.default.string().min(1),
        expected: zod_1.default.int().min(1).max(1000).optional(),
        groups: groups(zod_1.default.uuid()).optional(),
    }),
    zod_1.default.object({
        type: zod_1.default.literal('sameTagAsRecipient'),
        expected: zod_1.default.int().min(1).max(1000).optional(),
        groups: groups(zod_1.default.uuid()).optional(),
    }),
]);
exports.InjectHostsEntrySchema = zod_1.default
    .object({
    selector: HostSelectorSchema,
    mode: zod_1.default.enum(['all', 'random', 'group']).optional(),
    selectFrom: zod_1.default.enum(['ALL', 'HIDDEN', 'NOT_HIDDEN']).optional(),
    tagPrefix: zod_1.default.string().min(1).optional(),
    useHostRemarkAsTag: zod_1.default.boolean().optional(),
    useHostTagAsTag: zod_1.default.boolean().optional(),
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
    }
    else if (pooled && !selector.values?.length) {
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
const AssignmentSchema = zod_1.default.object({
    hosts: zod_1.default.array(zod_1.default.uuid()).max(10000).optional(),
    tags: zod_1.default.array(zod_1.default.string().min(1).max(255)).max(10000).optional(),
    balancerTag: zod_1.default.string().min(1).max(255).optional(),
});
exports.RemnawaveInjectorSchema = zod_1.default.object({
    injectHosts: zod_1.default.array(exports.InjectHostsEntrySchema).optional(),
    addVirtualHostAsOutbound: zod_1.default.boolean().optional(),
    assignTo: AssignmentSchema.optional(),
    assignments: zod_1.default.array(AssignmentSchema.extend({ balancerTag: zod_1.default.string().min(1).max(255) })).max(1000).optional(),
});
