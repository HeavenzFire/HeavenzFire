"use strict";
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("heavenzBrowser",Object.freeze({
 getState:()=>ipcRenderer.invoke("browser:get-state"),
 newTab:url=>ipcRenderer.invoke("browser:new-tab",url),
 activateTab:id=>ipcRenderer.invoke("browser:activate-tab",id),
 closeTab:id=>ipcRenderer.invoke("browser:close-tab",id),
 navigate:(id,url)=>ipcRenderer.invoke("browser:navigate",id,url),
 back:()=>ipcRenderer.invoke("browser:back"),
 forward:()=>ipcRenderer.invoke("browser:forward"),
 reload:()=>ipcRenderer.invoke("browser:reload"),
 stop:()=>ipcRenderer.invoke("browser:stop"),
 home:()=>ipcRenderer.invoke("browser:home"),
 onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on("browser:state",listener);return()=>ipcRenderer.removeListener("browser:state",listener);},
 onError:callback=>{const listener=(_event,error)=>callback(error);ipcRenderer.on("browser:error",listener);return()=>ipcRenderer.removeListener("browser:error",listener);}
}));
