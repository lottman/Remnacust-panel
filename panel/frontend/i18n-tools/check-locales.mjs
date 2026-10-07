import { readFile } from 'node:fs/promises'

const languages = ['en', 'ru', 'fa', 'zh']
const translations = {}

function flatten(value, prefix = '') {
    return Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => {
            const path = prefix ? `${prefix}.${key}` : key
            return item && typeof item === 'object'
                ? Object.entries(flatten(item, path))
                : [[path, item]]
        })
    )
}

function placeholders(value) {
    return [...String(value).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
        .map((match) => match[1])
        .sort()
        .join(',')
}

for (const language of languages) {
    const url = new URL(`../public/locales/${language}/remnawave.json`, import.meta.url)
    translations[language] = flatten(JSON.parse(await readFile(url, 'utf8')))
}

const reference = translations.en
let errors = 0
const untranslated = {}
for (const language of languages.slice(1)) {
    const current = translations[language]
    untranslated[language] = []
    for (const key of Object.keys(reference)) {
        if (!(key in current)) {
            console.error(`${language}: missing ${key}`)
            errors++
        } else if (placeholders(reference[key]) !== placeholders(current[key])) {
            console.error(`${language}: placeholders differ at ${key}`)
            errors++
        } else if (
            typeof reference[key] === 'string' &&
            reference[key] === current[key] &&
            /[A-Za-z]{4}/.test(reference[key])
        ) {
            untranslated[language].push(key)
        }
    }
    for (const key of Object.keys(current)) {
        if (!(key in reference)) {
            console.error(`${language}: extra ${key}`)
            errors++
        }
    }
}

if (errors) process.exitCode = 1
else console.log(`All ${Object.keys(reference).length} keys match in ${languages.join(', ')}.`)
if (process.argv.includes('--audit')) {
    for (const language of languages.slice(1)) {
        console.log(`${language}: ${untranslated[language].length} values equal English`)
        if (process.argv.includes('--details')) {
            for (const key of untranslated[language]) console.log(`  ${key}`)
        }
    }
}
