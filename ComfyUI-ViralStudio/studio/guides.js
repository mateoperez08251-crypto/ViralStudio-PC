/* Guías del proyecto en Colab: se aplica la misma copia en todos los modos. */
(() => {
  'use strict';
  const fetchOriginal=window.fetch.bind(window), $=id=>document.getElementById(id);
  let guides=[], selected=localStorage.getItem('vs_colab_guide')||'';
  let enabled=localStorage.getItem('vs_colab_guides_enabled')!=='0';
  let loadError='';
  window.VSActiveGuide=()=>enabled?(guides.find(g=>g.profile===selected)||{missing:true,selected}):null;
  async function api(body) {
    const response=await fetchOriginal('/viralstudio/api/guides', body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'No se pudo guardar la guía.');
    return result;
  }
  const ready=api().then(data=>{guides=data.guides;}).catch(e=>{loadError=e.message;});
  window.fetch=async function(input,options={}) {
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin===location.origin && url.pathname==='/viralstudio/api/projects' && (options.method||'GET').toUpperCase()==='POST' && enabled) {
      await ready;
      if(loadError)throw Error('No se pudo cargar la biblioteca Markdown. Abre Guías y pulsa Actualizar. '+loadError);
      const guide=guides.find(g=>g.profile===selected);
      if(!guide)throw Error('Selecciona una guía .md antes de crear el video, o desactiva «Aplicar guía».');
      const body=JSON.parse(options.body), cfg=body.settings||body;
      cfg.animation_guidance=JSON.parse(JSON.stringify(guide));
      cfg.auto_storyboard=true;cfg.manual_storyboard=false;cfg.storyboard_mode='auto';
      options={...options,body:JSON.stringify(body)};
    }
    return fetchOriginal(input,options);
  };
  document.addEventListener('DOMContentLoaded',async()=>{
    const box=document.createElement('details');box.className='card';box.style.margin='12px 16px';box.open=true;
    box.innerHTML=`<summary><b>Guías .md · activas en Colab</b></summary>
      <p><label><input type="checkbox" id="cgEnabled"> Aplicar guía al crear videos de tema, guion o audio</label></p>
      <label class="f" for="cgSelect">Guía del nuevo proyecto</label><select id="cgSelect"></select>
      <div class="actions"><button class="btn" id="cgRefresh">Actualizar</button><button class="btn" id="cgEdit">Editar seleccionada</button><button class="btn" id="cgDownload">Descargar .md</button></div>
      <details><summary>Importar o escribir una guía</summary>
      <label class="f" for="cgFiles">Archivos Markdown (puedes elegir varios)</label><input class="inp" type="file" id="cgFiles" accept=".md,text/markdown" multiple>
      <div class="row"><div><label class="f" for="cgId">Identificador del estilo</label><input class="inp" id="cgId" maxlength="64" placeholder="documental_animales"></div>
      <div><label class="f" for="cgTitle">Nombre de la guía</label><input class="inp" id="cgTitle" maxlength="100" placeholder="Documental de animales"></div></div>
      <label class="f" for="cgText">Reglas, técnicas y ejemplos · máximo 24 KiB en total</label><textarea id="cgText" rows="8"></textarea>
      <button class="btn pri" id="cgSave">Guardar y seleccionar guía</button></details>
      <p class="hint">La guía se guarda junto a los proyectos de Colab. Con GUARDAR_EN_DRIVE activado se conserva en Drive. Cada proyecto recibe su propia copia; editar la guía no cambia videos anteriores. La selección de estilos es manual por ahora.</p>
      <p id="cgStatus" role="status"></p>`;
    document.querySelector('header').after(box);
    const status=(text,bad=false)=>{$('cgStatus').textContent=text;$('cgStatus').style.color=bad?'#ff8c8c':'#9fdbb0';};
    const select=()=>{
      $('cgSelect').replaceChildren(new Option('Selecciona una guía',''),...guides.map(g=>new Option(g.title,g.profile)));
      if(!selected && guides.length===1)selected=guides[0].profile;
      if(!guides.some(g=>g.profile===selected))selected='';
      $('cgSelect').value=selected;localStorage.setItem('vs_colab_guide',selected);
    };
    const act=fn=>async()=>{try{await fn();}catch(e){status(e.message,true);}};
    $('cgEnabled').checked=enabled;
    $('cgEnabled').onchange=()=>{enabled=$('cgEnabled').checked;localStorage.setItem('vs_colab_guides_enabled',enabled?'1':'0');status(enabled?'La guía seleccionada se aplicará a los nuevos proyectos.':'Guías desactivadas para nuevos proyectos.');};
    $('cgSelect').onchange=()=>{selected=$('cgSelect').value;localStorage.setItem('vs_colab_guide',selected);};
    $('cgRefresh').onclick=act(async()=>{const result=await api();guides=result.guides;loadError='';select();status('Biblioteca actualizada.');});
    $('cgFiles').onchange=act(async()=>{
      const files=[...$('cgFiles').files];if(!files.length)return;
      if(files.some(f=>!f.name.toLowerCase().endsWith('.md')))throw Error('Selecciona archivos .md.');
      if(files.reduce((n,f)=>n+f.size,0)>24*1024)throw Error('Las guías superan 24 KiB; divide las instrucciones en perfiles.');
      const text=(await Promise.all(files.map(async f=>'# '+f.name+'\n\n'+await f.text()))).join('\n\n');
      if(new TextEncoder().encode(text).length>24*1024)throw Error('El texto combinado supera 24 KiB.');
      $('cgText').value=text;
      if(!$('cgTitle').value)$('cgTitle').value=files[0].name.replace(/\.md$/i,'').slice(0,100);
      if(!$('cgId').value)$('cgId').value=$('cgTitle').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64)||'mi_estilo';
      status('Documentos cargados. Pulsa Guardar y seleccionar guía.');
    });
    $('cgSave').onclick=act(async()=>{
      const guide=await api({profile:$('cgId').value.trim(),title:$('cgTitle').value.trim(),markdown:$('cgText').value});
      guides=guides.filter(g=>g.profile!==guide.profile).concat(guide);selected=guide.profile;loadError='';enabled=true;
      localStorage.setItem('vs_colab_guides_enabled','1');$('cgEnabled').checked=true;select();
      status('Guía guardada y activada para tema, guion y audio.');
    });
    $('cgEdit').onclick=()=>{const guide=guides.find(g=>g.profile===selected);if(!guide)return status('Selecciona una guía.',true);$('cgId').value=guide.profile;$('cgTitle').value=guide.title;$('cgText').value=guide.markdown;$('cgFiles').closest('details').open=true;};
    $('cgDownload').onclick=()=>{const guide=guides.find(g=>g.profile===selected);if(!guide)return status('Selecciona una guía.',true);const url=URL.createObjectURL(new Blob([guide.markdown],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=guide.profile+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    await ready;select();if(loadError)status(loadError,true);else status(guides.length?'Selecciona la guía que debe seguir el modelo.':'Importa tus .md para empezar; la función está activada.');
  });
})();
