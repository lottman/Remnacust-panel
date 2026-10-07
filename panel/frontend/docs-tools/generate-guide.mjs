import { explainListInteractions } from './list-guide.mjs'
import fs from 'node:fs'
import path from 'node:path'

import fa from './guide-fa.mjs'
import './additional-guide.mjs'
import './remnawave-guide.mjs'
import { articles as sourceArticles, categories } from './guide-source.mjs'
import zh from './guide-zh.mjs'
import { explainOperatorWorkflows, supportGuide } from './operator-guide.mjs'
import { productionArticles } from './production-guide.mjs'
import { xeraGuide } from './xera-guide.mjs'
import { explainRelease1171 } from './release-1171-guide.mjs'

const articles = productionArticles([...sourceArticles, xeraGuide, supportGuide])
const translations = { fa, zh }
for (const language of ['fa', 'zh']) {
    for (const article of articles) {
        if (article[language]) continue
        const translation = translations[language][article.id]
        if (!translation || translation[1].length !== article.sections.length)
            throw new Error(`Incomplete ${language} guide: ${article.id}`)
        article[language] = translation[0]
        article.sections.forEach((section, index) => {
            const [title, body] = translation[1][index]
            section[language] = { title, body }
        })
    }
}

explainOperatorWorkflows(articles)
explainListInteractions(articles)
explainRelease1171(articles)

const target = path.resolve(import.meta.dirname, '../public/documentation')
fs.mkdirSync(target, { recursive: true })
const registry = {
    categories,
    articles: articles.map(({ sections, ...article }) => ({
        ...article,
        sectionIds: sections.map((section) => section.id)
    }))
}
fs.writeFileSync(path.join(target, 'registry.json'), JSON.stringify(registry))
for (const language of ['ru', 'en', 'fa', 'zh']) {
    const content = articles.map((article) => ({
        id: article.id,
        title: article[language],
        sections: article.sections.map((section) => ({ id: section.id, ...section[language] }))
    }))
    fs.writeFileSync(path.join(target, `guide-${language}.json`), JSON.stringify(content))
    const markdown =
        '# Remnacust\n\n' +
        content
            .map(
                (article) =>
                    `## ${article.title}\n\n${article.sections.map((section) => `### ${section.title}\n\n${section.body}`).join('\n\n')}`
            )
            .join('\n\n') +
        '\n'
    fs.writeFileSync(path.join(target, `guide-${language}.md`), markdown)
}
console.log(
    `${articles.length} articles, ${articles.reduce((sum, article) => sum + article.sections.length, 0)} sections per guide`
)
