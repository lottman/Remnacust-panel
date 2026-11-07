export declare const REQUEST_TEMPLATE_TYPE: {
    readonly STASH: 'stash';
    readonly SINGBOX: 'singbox';
    readonly MIHOMO: 'mihomo';
    readonly XRAY_JSON: 'json';
    readonly V2RAY_JSON: 'v2ray-json';
    readonly CLASH: 'clash';
};
export type TRequestTemplateType = [keyof typeof REQUEST_TEMPLATE_TYPE][number];
export declare const REQUEST_TEMPLATE_TYPE_VALUES: ("clash" | "json" | "mihomo" | "singbox" | "stash" | "v2ray-json")[];
export type TRequestTemplateTypeKeys = (typeof REQUEST_TEMPLATE_TYPE)[keyof typeof REQUEST_TEMPLATE_TYPE];
//# sourceMappingURL=request-template-type.constant.d.ts.map