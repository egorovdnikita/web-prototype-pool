import fs from 'node:fs';
/* Пути считаем от самого скрипта, а не от машины: с абсолютными
   проверка ломалась от переименования папки проекта. */
const ROOT=new URL('../', import.meta.url);
const P=await import(new URL('src/legacy/prototype.js', ROOT).href);
const {AXES,DEF,V,S,U,M,MODALS}=P;
const freshUi=()=>({seg:{},sort:{},page:{},per:{},sel:new Set(),osel:new Set(),ochk:new Set(),
  phide:new Set(),nch:{},oval:false,arch:false,wfilter:'all',q:'',scdirty:false,scgrp:[],saved:[]});
const PUB=new URL('public', ROOT).pathname;
let n=0,bad=[];
const run=(label,fn)=>{try{const h=fn()||'';n++;
  for(const m of h.matchAll(/src="([^"]+)"/g))
    if(!/^https?:|^data:/.test(m[1])&&!fs.existsSync(PUB+m[1]))bad.push(label+' :: нет файла '+m[1]);
  for(const m of h.matchAll(/url\('([^']+)'\)/g))
    if(!/^https?:|^data:/.test(m[1])&&!fs.existsSync(PUB+m[1]))bad.push(label+' :: нет файла '+m[1]);
}catch(e){bad.push(label+' :: '+e.message)}};
for(const a of Object.keys(AXES)){
  for(const [v] of AXES[a].opts){
    for(const k of Object.keys(DEF))S[k]=DEF[k];
    S[a]=v;Object.assign(U,freshUi());
    const m=M();
    for(const name of Object.keys(V))run(name+' '+a+'='+v,()=>V[name](m));
    for(const name of Object.keys(MODALS))run('modal:'+name+' '+a+'='+v,()=>{const x=MODALS[name];return typeof x==='function'?x(m):(x&&x.body?x.body(m):'')});
  }
}
console.log('рендеров:',n);
console.log(bad.length?'ПРОБЛЕМЫ:\n'+[...new Set(bad)].join('\n'):'ошибок нет');
