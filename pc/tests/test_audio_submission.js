const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const code=fs.readFileSync(path.join(__dirname,'../../ComfyUI-ViralStudio/studio/audio.js'),'utf8');
function fresh(){
  const window={};
  vm.runInNewContext(code,{window,crypto,AbortController,setTimeout,clearTimeout});
  return window;
}
(async()=>{
  const file={name:'voz.wav'},settings={input_mode:'audio'};
  {
    const ui=fresh();let creates=0,uploads=0,analyzes=0,fail=true;const statuses=[];
    const request=async(p,o)=>{
      if(p==='projects'){creates++;return {id:'p1'};}
      if(p==='projects/p1')return {live:{running:false}};
      if(p.endsWith('/analyze')){analyzes++;return {ok:true};}
      throw Error(p);
    };
    const send=async()=>{uploads++;if(fail)throw Error('Error de red al subir');return {ok:true};};
    const options={request,send,report:s=>statuses.push(s)};
    await assert.rejects(()=>ui.VSAudio.submitAudio(file,settings,options),/Error de red/);
    fail=false;
    const result=await ui.VSAudio.submitAudio(file,settings,options);
    assert.equal(result.id,'p1');assert.equal(creates,1);assert.equal(uploads,2);assert.equal(analyzes,1);
    assert.ok(statuses.some(s=>s.includes('transcripción')));
  }
  {
    const ui=fresh();let calls=0,uploads=0;const keys=[];
    const request=async(p,o)=>{
      if(p==='projects'){keys.push(o.headers['Idempotency-Key']);if(++calls===1)return new Promise(()=>{});return {id:'p2'};}
      return {ok:true};
    };
    const options={request,send:async()=>{uploads++;return {ok:true};},timeoutMs:10};
    await assert.rejects(()=>ui.VSAudio.submitAudio(file,settings,options),/no respondió a tiempo/);
    await ui.VSAudio.submitAudio(file,settings,options);
    assert.equal(keys[0],keys[1]);assert.equal(uploads,1);
  }
  {
    const ui=fresh();let analyzes=0,uploads=0;
    const request=async p=>{if(p==='projects')return {id:'p3'};if(p==='projects/p3')return {live:{running:true}};analyzes++;return {};};
    const send=async()=>{uploads++;return {queued:true};};
    const first=await ui.VSAudio.submitAudio(file,settings,{request,send});
    assert.equal(first.queued,true);assert.equal(analyzes,0);
    await ui.VSAudio.submitAudio(file,settings,{request,send});
    assert.equal(uploads,1);assert.equal(analyzes,0);
  }
  {
    const ui=fresh();ui.VSActiveGuide=()=>({profile:'uno',sha256:'v1'});let creates=0;
    const request=async p=>{if(p==='projects')return {id:'p'+(++creates)};return {ok:true};};
    await ui.VSAudio.submitAudio(file,settings,{request,send:async()=>({ok:true})});
    ui.VSActiveGuide=()=>({profile:'uno',sha256:'v2'});
    await ui.VSAudio.submitAudio(file,settings,{request,send:async()=>({ok:true})});
    assert.equal(creates,2);
  }
  {
    const ui=fresh();let called=false;
    await assert.rejects(()=>ui.VSAudio.submitAudio(null,settings,{request:async()=>{called=true;}}),/Elige primero/);
    assert.equal(called,false);
  }
  console.log('Audio: reintento de subida, tiempo límite, idempotencia, cola, proyecto activo y cambio de guía comprobados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
