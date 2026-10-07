import { RegisterCommand } from '@remnawave/backend-contract'

export const REGISTRATION_PASSWORD_LENGTH = 32
export type RegistrationValues = { username: string; password: string; confirmPassword: string }
export type RegistrationMessage =
    | 'register-form.feature.username-required'
    | 'register-form.feature.username-too-long'
    | 'register-form.feature.password-requirements'
    | 'register-form.feature.password-too-long'
    | 'register-form.feature.passwords-do-not-match'

export function registrationErrors(values: RegistrationValues) {
    const errors: Partial<Record<keyof RegistrationValues, RegistrationMessage>> = {}
    const result = RegisterCommand.RequestBodySchema.safeParse(values)
    if (!result.success) {
        for (const issue of result.error.issues) {
            if (issue.path[0] === 'username') {
                errors.username =
                    issue.code === 'too_big'
                        ? 'register-form.feature.username-too-long'
                        : 'register-form.feature.username-required'
            } else if (issue.path[0] === 'password') {
                errors.password =
                    issue.code === 'too_big'
                        ? 'register-form.feature.password-too-long'
                        : 'register-form.feature.password-requirements'
            }
        }
    }
    if (values.password !== values.confirmPassword) {
        errors.confirmPassword = 'register-form.feature.passwords-do-not-match'
    }
    return errors
}

export function generateRegistrationPassword(random: Pick<Crypto, 'getRandomValues'> = crypto) {
    const lower = 'abcdefghijklmnopqrstuvwxyz'
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const digits = '0123456789'
    const alphabet = lower + upper + digits
    const index = (size: number) => {
        const limit = 256 - (256 % size)
        let value: number
        do {
            value = random.getRandomValues(new Uint8Array(1))[0]
        } while (value >= limit)
        return value % size
    }
    const characters = [
        lower[index(lower.length)],
        upper[index(upper.length)],
        digits[index(digits.length)]
    ]
    while (characters.length < REGISTRATION_PASSWORD_LENGTH)
        characters.push(alphabet[index(alphabet.length)])
    for (let i = characters.length - 1; i > 0; i--) {
        const j = index(i + 1)
        ;[characters[i], characters[j]] = [characters[j], characters[i]]
    }
    return characters.join('')
}
