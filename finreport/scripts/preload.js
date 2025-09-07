(function(){
    const API_HOST='seller-services.wildberries.ru';
    function should(url){ try{ const u=new URL(url,location.href); return u.host===API_HOST; }catch(_){ return false; } }
    function getToken(){ return new Promise(r=>{ try{ chrome.storage.local.get(['authorizev3'],v=>r(v&&v.authorizev3||null)); }catch(_){ r(null); } }); }
    function getTemplate(){ return new Promise(r=>{ try{ chrome.storage.local.get(['downloadTemplate'],v=>r(v&&v.downloadTemplate||null)); }catch(_){ r(null); } }); }

    const of=window.fetch; 
    window.fetch=async function(input,init){ 
        const url=typeof input==='string'?input:(input&&input.url)||''; 
        if(!should(url)) return of.apply(this,arguments); 
        const t=await getToken(); 
        const ni=Object.assign({},init); 
        ni.credentials='include'; 
        ni.headers=new Headers(init&&init.headers||undefined); 
        if(t&&!ni.headers.has('AuthorizeV3')) ni.headers.set('AuthorizeV3',t); 

        // Если это скачивание по шаблону из ЛК — восстанавливаем оригинальный путь
        const tpl = await getTemplate();
        if (tpl && typeof input==='string' && /reports-weekly\/(\d+)\//.test(input) && tpl.template) {
            const id = (input.match(/reports-weekly\/(\d+)\//)||[])[1];
            if (id) {
                const real = tpl.template.replace('{id}', id);
                return of.call(this, new Request(real, ni));
            }
        }
        return of.call(this,input,ni); 
    };

    const XHR=window.XMLHttpRequest; 
    window.XMLHttpRequest=function(){ 
        const x=new XHR(); let _url=''; const o=x.open; 
        x.open=function(m,u){ _url=u; return o.apply(x,arguments); }; 
        const s=x.send; x.withCredentials=true; 
        x.send=async function(){ 
            if(should(_url)){ 
                const t=await getToken(); if(t) x.setRequestHeader('AuthorizeV3',t); 
            } 
            return s.apply(x,arguments); 
        }; 
        return x; 
    };
})();


