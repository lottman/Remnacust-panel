import { COUNTRY_FLAG_CODES } from './country-flag-codes'

const searchLanguages = ['en', 'ru', 'fa', 'zh'] as const

export function normalizeCountrySearch(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\u200c-\u200f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

const searchNames = searchLanguages.map(
    (language) => new Intl.DisplayNames([language, 'en'], { type: 'region' })
)

export function countrySearchIndex(specialName: (language: string) => string): Map<string, string> {
    return new Map(
        COUNTRY_FLAG_CODES.map((code) => [
            code,
            normalizeCountrySearch(
                [
                    code,
                    ...searchNames.map((names, index) =>
                        code === 'CQ'
                            ? specialName(searchLanguages[index])
                            : (names.of(code) ?? code)
                    )
                ].join(' ')
            )
        ])
    )
}
