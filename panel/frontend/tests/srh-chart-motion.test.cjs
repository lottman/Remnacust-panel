const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

test('SRH reduced motion controls initial columns, updates and tooltip animation', () => {
    for (const reduced of [true, false]) {
        let options
        const component = ({children}) => React.createElement('div', null, children)
        const mocks = {
            '@mantine/core': new Proxy({}, {get: () => component}),
            '@highcharts/react': {Chart: props => {options = props.options; return null}},
            '@shared/api/hooks': {useGetSubscriptionRequestHistoryStats: () => ({data: {hourlyRequestStats: [{dateTime:'2026-10-31T12:00:00Z',requestCount:12}]},isLoading:false})},
            '@shared/ui/appearance/appearance': {usePanelReducedMotion: () => reduced},
            '@shared/ui/leaderboard-item-card': {TopLeaderboardCardShared: () => null},
            '@shared/utils/misc': {formatInt: String},
            'react-i18next': {useTranslation: () => ({t: key => key.endsWith('.requests') ? 'Запросы' : key})}
        }
        const filename = path.join(__dirname,'../src/widgets/dashboard/srh-inspector/srh-inspector-metrics/srh-inspector-metrics.widget.tsx')
        const code = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
        const module = {exports:{}}
        new Function('require','module','exports',code)(name => mocks[name] ?? require(name),module,module.exports)
        renderToStaticMarkup(React.createElement(module.exports.SrhInspectorMetrics))
        assert.equal(options.chart.animation,!reduced)
        assert.equal(options.plotOptions.series.animation,!reduced)
        assert.equal(options.tooltip.animation,!reduced)
        assert.match(options.tooltip.pointFormatter.call({x:0,y:12}),/Запросы: <b>12<\/b>/)
    }
})
