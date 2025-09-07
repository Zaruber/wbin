(function(){
	function inject(){
		try{
			const s=document.createElement('script');
			s.src=chrome.runtime.getURL('finreport/content/page-hook.js');
			s.async=false;
			(document.head||document.documentElement).appendChild(s);
			s.remove();
		}catch(_){}
	}
	window.addEventListener('message',e=>{
		try{
			const d=e.data; if(!d||d.src!=='wb-reports')return;
			if(d.type==='authorizev3' && d.token){ chrome.storage.local.set({authorizev3:d.token}); }
			if(d.type==='download-template' && d.template){ chrome.storage.local.set({downloadTemplate:d}); }
		}catch(_){}}
	);
	inject();
})();


