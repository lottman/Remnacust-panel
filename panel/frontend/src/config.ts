export const app = {
    name: 'Remnacust',
    githubRepo: 'https://github.com/lottman/Remnacust-panel',
    githubStars: 'https://github.com/lottman/Remnacust-panel/stargazers',
    githubIssues: 'https://github.com/lottman/Remnacust-panel/issues',
    githubOrg: 'https://github.com/lottman',
    githubDonation: 'https://t.me/lottman',
    configEditor: {
        wasmUrl: `/assets/main.wasm?v=${__EDITOR_ASSET_VERSIONS__['main.wasm']}`,
        wasmJsUrl: `/assets/wasm_exec.js?v=${__EDITOR_ASSET_VERSIONS__['wasm_exec.js']}`,
        jsonSchemaUrl: `/assets/xray.schema.json?v=${__EDITOR_ASSET_VERSIONS__['xray.schema.json']}`,
        jsonSchemaCnUrl: `/assets/xray.schema.cn.json?v=${__EDITOR_ASSET_VERSIONS__['xray.schema.cn.json']}`
    },
    templateEditor: {
        singboxJsonSchemaUrl: '/assets/singbox.schema.json',
        mihomoYamlSchemaUrl: '/assets/mihomo.schema.json'
    }
}
