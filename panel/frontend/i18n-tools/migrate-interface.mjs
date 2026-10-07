// AST-based migration of display text only. Protocol values, URLs and user data stay intact.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ts from 'typescript'

const root = path.resolve('src')
const audit = path.resolve('../audit-20260926')
const catalogPath = path.join(audit, 'r26-interface-catalog.json')
const translations = Object.fromEntries(['en', 'ru', 'fa', 'zh'].map(l => [l, JSON.parse(fs.readFileSync(`public/locales/${l}/remnawave.json`, 'utf8'))]))
const flatten = (o, prefix = '') => Object.fromEntries(Object.entries(o).flatMap(([k,v]) => typeof v === 'object' ? Object.entries(flatten(v, prefix+k+'.')) : [[prefix+k, v]]))
const flat = Object.fromEntries(Object.entries(translations).map(([k,v])=>[k,flatten(v)]))
const byEnglish = new Map()
for (const [k,v] of Object.entries(flat.en)) if (!byEnglish.has(v)) byEnglish.set(v,k)
const technical = new Set(['Telegram','GitHub','PocketID','Yandex','Keycloak','OAuth2','Generic OAuth2','API','ID','UUID','HWID','SSH','Xray','olcRTC','WB Stream','Телемост','REMNA','WAVE','RAM','CPU','RSS','P99','PID:','AS','rtt','v','x','Σ','ㅤ','RW <3','iOS','Android','Linux','macOS','Windows','Android TV','Apple TV','X25519','ML-DSA65','ML-KEM768','MLDSA65','JSON','YAML','SVG','Xray JSON','Xray Base64','Mihomo','Stash','Singbox','Clash','ChatGPT','YouTube','Discord','English','Русский','فارسی','简体中文','Postman','Insomnia','Hoppscotch','HTTPie','MUX','Mux','SockOpt','Final Mask','Scalar','Swagger','Remnawave','RW Prime','Telegram:','NL','IPs','OK','true','false','h2','chrome','docker stats','ext:','blocked_ips','EXAMPLE_TAG_1','ENV:PROD','SUB_PUBLIC_DOMAIN','Vless/Hysteria2 UUID','Powered by GeoCheck','tabler.io/icons.','MyIconName','word1 word2 word3...','-----BEGIN OPENSSH PRIVATE KEY-----','IamSuperAdmin','soy_t5Px5`Gm4j0@Hf&Dd7iU','123456:ABC-DEF...','h2','/ws','eth0'])
const properties = new Set(['title','subtitle','message','description','label','placeholder','aria-label','nothingFound','nothingFoundMessage','emptyStateMessage','loadingText'])
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath,'utf8')) : {}
const newEdits = []
function text(node) {
  if (ts.isStringLiteralLike(node)) return {value:node.text, expressions:[]}
  if (ts.isTemplateExpression(node)) return {value:node.head.text+node.templateSpans.map((s,i)=>`{{value${i+1}}}`+s.literal.text).join(''),expressions:node.templateSpans.map(s=>s.expression.getText())}
  return null
}
function keyFor(en,ru) {
  const key = (en.toLowerCase().replace(/\{\{.*?\}\}/g,'value').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,62)||'message')+'-'+crypto.createHash('sha256').update(en).digest('hex').slice(0,7)
  if (!catalog[key]) {
    const original=byEnglish.get(en)
    catalog[key]={en,ru:ru??flat.ru[original]??'',fa:flat.fa[original]??'',zh:flat.zh[original]??'',files:[]}
  }
  if(ru && !catalog[key].ru)catalog[key].ru=ru
  return key
}
function isTechnical(value) {
  return !/[\p{L}]/u.test(value) || technical.has(value) || /(?:https?:|socks5:|app:|[\w*]+\.(?:com|ru|rw|invalid)|\.json$|\.yml$|<svg>)/.test(value)
}
function isRu(condition) {
  return /^(?:ru|isRu)$/.test(condition.getText()) || /\.language\.startsWith\(['"]ru['"]\)/.test(condition.getText())
}
function functionName(n) {
  if(n.name && ts.isIdentifier(n.name))return n.name.text
  if(ts.isVariableDeclaration(n.parent))return n.parent.name.getText()
  return ''
}
function component(node) {
  for(let p=node.parent;p;p=p.parent)if(ts.isFunctionLike(p)&&p.body&&/^(?:[A-Z]|use[A-Z])/.test(functionName(p)))return p
  return null
}
function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.tsx?$/.test(e.name)?[path.join(dir,e.name)]:[])}
for(const filename of files(root)) {
  if(filename.endsWith(path.join('constants','countries.ts'))||filename.endsWith('interface-text.ts'))continue
  const source=fs.readFileSync(filename,'utf8'), file=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true)
  const pairFunctions=new Set()
  function findPairs(n){if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isArrowFunction(n.initializer)&&n.initializer.parameters.length===2){let body=n.initializer.body;while(ts.isParenthesizedExpression(body))body=body.expression;if(ts.isConditionalExpression(body)&&isRu(body.condition))pairFunctions.add(n.name.getText())}ts.forEachChild(n,findPairs)}
  findPairs(file)
  const edits=[], components=new Set();let global=false
  function replace(node, en,ru, expressions=[],kind='expression') {
    const k=keyFor(en,ru), relative=path.relative(root,filename).replaceAll('\\','/')
    if(!catalog[k].files.includes(relative))catalog[k].files.push(relative)
    const owner=component(node);if(owner)components.add(owner);else global=true
    const options=expressions.length?', { '+expressions.map((e,i)=>`value${i+1}: ${e}`).join(', ')+' }':''
    let replacement=`uiText('${k}'${options})`
    if(kind==='jsx'||kind==='attribute')replacement='{'+replacement+'}'
    // Top-level options stay lazy so switching languages does not freeze labels at import time.
    if(kind==='property'&&!owner) {
      const parent=node.parent
      replacement=`get ${parent.name.getText()}() { return ${replacement} }`
      edits.push({start:parent.getStart(file),end:parent.end,text:replacement});return
    }
    edits.push({start:node.getStart(file),end:node.end,text:replacement})
  }
  function pair(n,a,b){const r=text(a),e=text(b);if(!r||!e||r.expressions.join('|')!==e.expressions.join('|'))return false;replace(n,e.value,r.value,e.expressions);return true}
  function visit(n) {
    if(ts.isConditionalExpression(n)&&isRu(n.condition)&&pair(n,n.whenTrue,n.whenFalse))return
    if(ts.isCallExpression(n)&&pairFunctions.has(n.expression.getText())&&n.arguments.length===2&&pair(n,...n.arguments))return
    if(ts.isJsxText(n)) {
      const value=n.text.replace(/\s+/g,' ').trim()
      if(!isTechnical(value)) {replace(n,value,undefined,[],'jsx');return}
    }
    if(ts.isJsxAttribute(n)&&properties.has(n.name.getText())&&n.initializer&&ts.isStringLiteral(n.initializer)&&!isTechnical(n.initializer.text)) {replace(n.initializer,n.initializer.text,undefined,[],'attribute');return}
    if(ts.isPropertyAssignment(n)&&properties.has(n.name.getText().replace(/['"]/g,''))&&ts.isStringLiteralLike(n.initializer)&&!isTechnical(n.initializer.text)) {replace(n.initializer,n.initializer.text,undefined,[],'property');return}
    ts.forEachChild(n,visit)
  }
  visit(file)
  if(edits.length) {
    for(const c of components) {
      if(ts.isBlock(c.body))edits.push({start:c.body.getStart(file)+1,end:c.body.getStart(file)+1,text:'\n    const uiText = useUiText()\n'})
      else {edits.push({start:c.body.getStart(file),end:c.body.getStart(file),text:'{ const uiText = useUiText(); return ('});edits.push({start:c.body.end,end:c.body.end,text:'); }'})}
    }
    const imports=[...(components.size?['useUiText']:[]),...(global?['translateUiText as uiText']:[])]
    edits.push({start:0,end:0,text:`import { ${imports.join(', ')} } from '@shared/i18n/interface-text'\n`})
    newEdits.push({filename,source,edits})
  }
}
fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n')
console.log(`${Object.keys(catalog).length} messages; ${newEdits.length} files`)
if(process.argv.includes('--apply')) {
  for(const [k,v] of Object.entries(catalog))for(const l of ['en','ru','fa','zh'])if(!v[l])throw Error(`Missing ${l}: ${k}`)
  for(const {filename,source,edits} of newEdits) {
    let result=source, end=Infinity
    for(const e of edits.sort((a,b)=>b.start-a.start||b.end-a.end)){if(e.end>end)throw Error('Overlapping edits: '+filename);result=result.slice(0,e.start)+e.text+result.slice(e.end);end=e.start}
    fs.writeFileSync(filename,result)
  }
  for(const l of ['en','ru','fa','zh']) {
    translations[l].interface??={}
    for(const [k,v] of Object.entries(catalog))translations[l].interface[k]=v[l]
    fs.writeFileSync(`public/locales/${l}/remnawave.json`,JSON.stringify(translations[l],null,4)+'\n')
  }
  fs.writeFileSync(path.join(audit,'r26-migrated-files.json'),JSON.stringify(newEdits.map(e=>path.relative(process.cwd(),e.filename)),null,2))
}
