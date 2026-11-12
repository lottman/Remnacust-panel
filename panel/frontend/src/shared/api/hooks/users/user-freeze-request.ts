import { z } from 'zod'

function serializeDeadline(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    if (
        'frozenUntil' in value &&
        value.frozenUntil instanceof Date &&
        Number.isFinite(value.frozenUntil.getTime())
    )
        return { ...value, frozenUntil: value.frozenUntil.toISOString() }
    return value
}

export function userFreezeRequestSchema<T extends z.ZodType>(schema: T) {
    return z.preprocess((value) => {
        const body = serializeDeadline(value)
        if (!body || typeof body !== 'object' || !('fields' in body)) return body
        const fields = serializeDeadline(body.fields)
        return fields === body.fields ? body : { ...body, fields }
    }, schema)
}
