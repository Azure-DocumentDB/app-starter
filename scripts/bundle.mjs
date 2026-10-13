import { mkdir, cp, mkdtemp } from 'node:fs/promises'; import { resolve } from 'node:path'; import { execFileSync } from 'node:child_process';
await mkdir('artifacts',{recursive:true});const stage=await mkdtemp(resolve('artifacts','bundle-'));
for(const path of ['dist','public','package.json','package-lock.json','LICENSE'])await cp(path,resolve(stage,path),{recursive:true});
execFileSync('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage,stdio:'inherit'});
// No native dependencies: this production-only bundle is portable to Linux Node 24.
const output=resolve('artifacts','app-starter.zip');
// -FS syncs the ZIP against the current explicit staging tree, preventing stale files.
execFileSync('zip',['-q','-r','-FS',output,'.'],{cwd:stage,stdio:'inherit'});
console.log('ZIP-ready bundle: artifacts/app-starter.zip (production dependencies included; no .env, tests or credentials).');
