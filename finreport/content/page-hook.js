(function(){
	function post(msg){ try{ window.postMessage(Object.assign({src:'wb-reports'}, msg), '*'); } catch(_) {}
	}
	function postAuth(token){ post({ type:'authorizev3', token }); }
	function maybePostTemplate(url){
		try{
			const u = new URL(url, location.href);
			if(u.host!=='seller-services.wildberries.ru') return;
			if(!/reports-weekly/i.test(u.pathname)) return;
			const path = u.pathname + (u.search||'');
			const isXlsx = /xlsx|excel|xls/i.test(path) || /application\/vnd\.openxml/i.test((u.headers||'')+'');
			const isJson = /json/i.test(path);
			if(!isXlsx && !isJson) return;
			const templ = path.replace(/(reports-weekly)\/(\d+)/i, (m,p1,p2)=>`${p1}/{id}`);
			post({ type:'download-template', format: isXlsx?'xlsx':'json', template: templ });
		}catch(_){ }
	}

	const XHR = window.XMLHttpRequest;
	const set = XHR.prototype.setRequestHeader;
	const open = XHR.prototype.open;
	XHR.prototype.setRequestHeader = function(name,value){ try{ if(String(name).toLowerCase()==='authorizev3') postAuth(value);}catch(_){} return set.apply(this,arguments); };
	XHR.prototype.open = function(method, url){ try{ maybePostTemplate(url); }catch(_){} return open.apply(this, arguments); };

	const of = window.fetch;
	window.fetch = function(input, init){ try{
		let h=init&&init.headers, t=null;
		if(h){ if(h instanceof Headers) t=h.get('AuthorizeV3'); else if(typeof h==='object') t=h['AuthorizeV3']||h['authorizev3']; }
		if(!t && input&&typeof input==='object'&&input.headers){ const ih=input.headers; if(ih instanceof Headers) t=ih.get('AuthorizeV3'); else if(typeof ih==='object') t=ih['AuthorizeV3']||ih['authorizev3']; }
		if(t) postAuth(t);
		const url = typeof input==='string'? input : (input && input.url) || '';
		if(url) maybePostTemplate(url);
	}catch(_){}
	return of.apply(this,arguments);
	};
})();


