import { selectedXrayMode } from './shared/api/hooks/xray-mode'

export function configEditorAssetUrls(mode: 'custom' | 'default') {
    const asset = (name: string) => `/assets/${name}?v=${__EDITOR_ASSET_VERSIONS__[name]}`
    return {
        wasmUrl: asset(mode === 'default' ? 'default.wasm' : 'main.wasm'),
        wasmJsUrl: asset('wasm_exec.js'),
        jsonSchemaUrl: asset(mode === 'default' ? 'xray.default.schema.json' : 'xray.schema.json'),
        jsonSchemaCnUrl: asset(
            mode === 'default' ? 'xray.default.schema.cn.json' : 'xray.schema.cn.json'
        )
    }
}

export const app = {
    name: 'Remnacust',
    githubRepo: 'https://github.com/lottman/Remnacust-panel',
    githubStars: 'https://github.com/lottman/Remnacust-panel/stargazers',
    githubIssues: 'https://github.com/lottman/Remnacust-panel/issues',
    githubOrg: 'https://github.com/lottman',
    githubDonation: 'https://t.me/lottman',
    configEditor: {
        get wasmUrl() {
            return configEditorAssetUrls(selectedXrayMode()).wasmUrl
        },
        wasmJsUrl: configEditorAssetUrls('custom').wasmJsUrl,
        get jsonSchemaUrl() {
            return configEditorAssetUrls(selectedXrayMode()).jsonSchemaUrl
        },
        get jsonSchemaCnUrl() {
            return configEditorAssetUrls(selectedXrayMode()).jsonSchemaCnUrl
        }
    },
    templateEditor: {
        singboxJsonSchemaUrl: '/assets/singbox.schema.json',
        mihomoYamlSchemaUrl: '/assets/mihomo.schema.json'
    }
}
