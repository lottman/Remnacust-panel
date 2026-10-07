import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

const render = (content, plugins = [rehypeRaw, rehypeSanitize]) =>
    renderToStaticMarkup(createElement(ReactMarkdown, { rehypePlugins: plugins, remarkPlugins: [remarkGfm], children: content }))

test('raw HTML articles cannot embed active frames, scripts, forms or event handlers', () => {
    const hostile = '<iframe srcdoc="<script>parent.document.body.innerHTML=1</script>"></iframe>\n\n<form action="https://invalid.example"><input name="secret"></form>\n\n<img src="x" onerror="alert(1)"><script>alert(2)</script>'
    assert.match(render(hostile, [rehypeRaw]), /<iframe/, 'Regression fixture must reach the raw HTML renderer')
    const html = render(hostile)
    assert.doesNotMatch(html, /iframe|srcdoc|<script|<form|onerror/i)
    // GFM retains a disabled checkbox; it cannot submit or accept credentials.
    assert.doesNotMatch(html, /<input(?! disabled=)/i)
})

test('headings, ordinary links, code blocks and tables remain readable', () => {
    const html = render('# Help\n\n[Panel](/dashboard)\n\n```json\n{"tag":"test"}\n```\n\n| Field | Meaning |\n| --- | --- |\n| tag | Unique tag |')
    assert.match(html, /<h1>Help<\/h1>/)
    assert.match(html, /href="\/dashboard"/)
    assert.match(html, /<table>/)
    assert.match(html, /language-json/)
})
