"use strict";
const api=window.heavenzBrowser,tabsEl=document.getElementById("tabs"),address=document.getElementById("address"),navForm=document.getElementById("navForm"),notice=document.getElementById("notice"),backBtn=document.getElementById("back"),forwardBtn=document.getElementById("forward");
let state={tabs:[],activeTabId:null},noticeTimer;
function showNotice(message,isError=false){notice.textContent="";notice.className="notice"+(isError?" error":"");const text=document.createElement("span");text.textContent=message;const close=document.createElement("button");close.type="button";close.textContent="Dismiss";close.addEventListener("click",()=>notice.style.display="none");notice.append(text,close);notice.style.display="block";clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.style.display="none";},7000);}
function activeTab(){return state.tabs.find(tab=>tab.id===state.activeTabId);}
function render(){
 for(const node of [...tabsEl.querySelectorAll(".tab")])node.remove();
 const newTabButton=document.getElementById("newTab");
 for(const tab of state.tabs){
  const button=document.createElement("button");button.className="tab"+(tab.active?" active":"");button.type="button";button.setAttribute("role","tab");button.setAttribute("aria-selected",String(Boolean(tab.active)));button.title=tab.url||tab.title;
  const title=document.createElement("span");title.className="tab-title";title.textContent=tab.loading?"◌ "+(tab.title||"Loading…"):(tab.title||"New tab");
  const close=document.createElement("span");close.className="close";close.setAttribute("role","button");close.setAttribute("aria-label","Close tab");close.textContent="×";
  close.addEventListener("click",event=>{event.stopPropagation();api.closeTab(tab.id).catch(err=>showNotice(err.message,true));});
  button.append(title,close);button.addEventListener("click",()=>api.activateTab(tab.id).catch(err=>showNotice(err.message,true)));tabsEl.insertBefore(button,newTabButton);
 }
 const tab=activeTab();if(tab&&document.activeElement!==address)address.value=tab.url||"";backBtn.disabled=!tab||!tab.canGoBack;forwardBtn.disabled=!tab||!tab.canGoForward;
}
navForm.addEventListener("submit",async event=>{event.preventDefault();const tab=activeTab();if(!tab)return;try{await api.navigate(tab.id,address.value);address.blur();}catch(err){showNotice(err.message||"Navigation failed.",true);}});
document.getElementById("newTab").addEventListener("click",()=>api.newTab("https://www.google.com/").catch(err=>showNotice(err.message,true)));
backBtn.addEventListener("click",()=>api.back().catch(err=>showNotice(err.message,true)));
forwardBtn.addEventListener("click",()=>api.forward().catch(err=>showNotice(err.message,true)));
document.getElementById("reload").addEventListener("click",()=>api.reload().catch(err=>showNotice(err.message,true)));
document.getElementById("home").addEventListener("click",()=>api.home().catch(err=>showNotice(err.message,true)));
api.onState(nextState=>{state=nextState;render();});
api.onError(error=>showNotice(error.message||"Browser operation failed.",true));
api.getState().then(nextState=>{state=nextState;render();}).catch(err=>showNotice(err.message||"Could not initialize browser tabs.",true));
document.addEventListener("keydown",event=>{
 const isMac=navigator.platform.toLowerCase().includes("mac"),mod=isMac?event.metaKey:event.ctrlKey;
 if(mod&&event.key.toLowerCase()==="l"){event.preventDefault();address.focus();address.select();}
 else if(mod&&event.key.toLowerCase()==="t"){event.preventDefault();api.newTab("https://www.google.com/").catch(err=>showNotice(err.message,true));}
 else if(mod&&event.key.toLowerCase()==="w"){event.preventDefault();const tab=activeTab();if(tab)api.closeTab(tab.id).catch(err=>showNotice(err.message,true));}
 else if(event.key==="Escape"&&address===document.activeElement){render();address.blur();}
});
