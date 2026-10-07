const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('reflect-metadata');
const { Reflector, MetadataScanner } = require('@nestjs/core');
const { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } = require('@nestjs/common/constants');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const generic = new Proxy({}, { get: (_, key) => key === '__esModule' ? true : function Stub() { return () => {}; } });
const aliases = {
    '@common/decorators/roles': 'src/common/decorators/roles/roles.ts',
    '@common/decorators/roles/roles': 'src/common/decorators/roles/roles.ts',
    '@common/decorators/scopes': 'src/common/decorators/scopes/scopes.ts',
    '@common/decorators/base-endpoint': 'src/common/decorators/base-endpoint/base-endpoint.ts',
    '@common/decorators/base-endpoint/base-endpoint': 'src/common/decorators/base-endpoint/base-endpoint.ts',
    '@common/decorators/admin-only-endpoint': 'src/common/decorators/admin-only-endpoint.ts',
    '@common/guards/roles': 'src/common/guards/roles/roles.guard.ts',
    '@common/guards/roles/roles.guard': 'src/common/guards/roles/roles.guard.ts',
    '@common/guards/scopes': 'src/common/guards/scopes/scopes.guard.ts',
    '@common/exception/http-exeception-with-error-code.type': 'src/common/exception/http-exeception-with-error-code.type.ts',
};
function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const ref = { exports: {} }; cache.set(relative, ref.exports);
    const js = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, esModuleInterop: true },
    }).outputText;
    new Function('require', 'module', 'exports', js)(id => {
        if (aliases[id]) return load(aliases[id]);
        if (id === 'zod') return require('zod');
        if (id === './limit-selection') return load('src/modules/hosts/limit-selection.ts');
        if (id.startsWith('@contract/') || id.startsWith('@libs/contracts/'))
            return require(path.join(root, 'libs/contract/build/backend', id.replace(/^@(contract|libs\/contracts)\//, '')));
        if (['@nestjs/common', '@nestjs/core', '@nestjs/swagger'].includes(id) || id.startsWith('@nestjs/common/')) return require(id);
        return generic;
    }, ref, ref.exports);
    cache.set(relative, ref.exports); return ref.exports;
}
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const full = path.join(dir,entry.name); return entry.isDirectory() ? walk(full) : [full];
});
const controllers = walk(path.join(root,'src')).filter(file => /\.controllers?\.ts$/.test(file)).flatMap(file =>
    Object.values(load(path.relative(root,file))).filter(value => typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA,value)));
const wrappers = controllers.map(metatype => ({metatype, instance:Object.create(metatype.prototype)}));
const reflector = new Reflector();
const {ScopeCatalogService} = load('src/modules/api-tokens/scope-catalog.service.ts');
const catalog = new ScopeCatalogService({getControllers:()=>wrappers},new MetadataScanner(),reflector);
catalog.onApplicationBootstrap();
const {RolesGuard} = load('src/common/guards/roles/roles.guard.ts');
const {ScopesGuard} = load('src/common/guards/scopes/scopes.guard.ts');
const rolesGuard = new RolesGuard(reflector), scopesGuard = new ScopesGuard(reflector);
const {ROLE,ROOT} = require('../libs/contract/build/backend');
const methods = ['GET','POST','PUT','DELETE','PATCH','ALL','OPTIONS','HEAD','SEARCH'];
const endpoints = controllers.flatMap(controller => Object.getOwnPropertyNames(controller.prototype).flatMap(name => {
    const handler = controller.prototype[name];
    if(typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA,handler)) return [];
    const url = `${ROOT}/${[Reflect.getMetadata(PATH_METADATA,controller),Reflect.getMetadata(PATH_METADATA,handler)].filter(x=>x&&x!=='/').join('/')}`.replace(/:([\w]+)/g,'{$1}');
    const method = methods[Reflect.getMetadata(METHOD_METADATA,handler)];
    return [{controller,handler,name,url,method}];
}));
function authorize(endpoint, role, scopes=[]) {
    const context = {getHandler:()=>endpoint.handler,getClass:()=>endpoint.controller,switchToHttp:()=>({getRequest:()=>({user:{role,scopes}})})};
    try { return rolesGuard.canActivate(context) && scopesGuard.canActivate(context); }
    catch(error) { if(error.getStatus?.()===403) return false; throw error; }
}
module.exports = {catalog, endpoints, authorize, ROLE, load, reflector, GUARDS_METADATA};
