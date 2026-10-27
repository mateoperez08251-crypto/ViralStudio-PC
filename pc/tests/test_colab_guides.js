const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../../ComfyUI-ViralStudio/studio/guides.js'),'utf8');
function setup(selected='animales',enabled=true){
  const calls=[];
  const guide={profile:'animales',title:'Animales',markdown:'Mantener el pelaje.',sha256:'fixture'};
  const window={fetch:async(input,options={})=>{
    calls.push({input,options});return {ok:true,json:async()=>input==='/viralstudio/api/guides'?{guides:[guide]}:{id:'nuevo'}};
  }};
  const context={window,URL,location:{href:'https://example.test/viralstudio/',origin:'https://example.test'},
    localStorage:{getItem:key=>key==='vs_colab_guide'?selected:enabled?'1':'0'},document:{addEventListener:()=>{}}};
  vm.runInNewContext(code,context);return {window,calls};
}
(async()=>{
  for(const mode of ['topic','script','audio']){
    const {window,calls}=setup();
    await window.fetch('api/projects',{method:'POST',body:JSON.stringify({settings:{input_mode:mode},run:['story']})});
    const body=JSON.parse(calls.at(-1).options.body);
    assert.equal(body.settings.input_mode,mode);
    assert.equal(body.settings.animation_guidance.markdown,'Mantener el pelaje.');
    assert.equal(body.settings.auto_storyboard,true);
    assert.deepEqual(body.run,['story']);
  }
  const missing=setup('desconocida');
  await assert.rejects(()=>missing.window.fetch('api/projects',{method:'POST',body:'{"settings":{}}'}),/Selecciona una guía/);
  assert.equal(missing.calls.length,1);
  const disabled=setup('',false);
  await disabled.window.fetch('api/projects',{method:'POST',body:'{"settings":{}}'});
  assert.equal(disabled.calls.at(-1).options.body,'{"settings":{}}');
  console.log('Guías Colab: 3 modos, selección obligatoria y desactivación comprobados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
