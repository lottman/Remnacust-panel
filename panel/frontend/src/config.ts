import { selectedXrayMode } from './shared/api/hooks/xray-mode'

const editorAsset = (name: string) => `/assets/${name}?v=${__EDITOR_ASSET_VERSIONS__[name]}`

export function configEditorAssetUrls(mode: 'custom' | 'default') {
    return {
        wasmUrl: editorAsset(mode === 'default' ? 'default.wasm' : 'main.wasm'),
        wasmJsUrl: editorAsset('wasm_exec.js'),
        jsonSchemaUrl: editorAsset(
            mode === 'default' ? 'xray.default.schema.json' : 'xray.schema.json'
        ),
        jsonSchemaCnUrl: editorAsset(
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
        singboxJsonSchemaUrl: editorAsset('singbox.schema.json'),
        mihomoYamlSchemaUrl: editorAsset('mihomo.schema.json')
    }
}
