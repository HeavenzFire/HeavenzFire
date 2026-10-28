"use strict";
const { app, BrowserWindow, WebContentsView, ipcMain, session } = require("electron");
const path = require("node:path");
let mainWindow;
let nextTabId = 1;
let activeTabId = null;
const tabs = new Map();
const TOOLBAR_HEIGHT = 106;
const MIN_VIEW_HEIGHT = 160;

const { normalizeWebUrl } = require("./navigation-policy.cjs");
function safeSend(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send(channel, payload);
}
function publicTab(tab) {
  const wc = tab.view.webContents;
  return { id:tab.id, title:tab.title || wc.getTitle() || "New tab", url:tab.url || wc.getURL() || "",
    loading:wc.isLoading(), canGoBack:wc.canGoBack(), canGoForward:wc.canGoForward(), active:tab.id===activeTabId };
}
function publishState() { safeSend("browser:state", {tabs:[...tabs.values()].map(publicTab),activeTabId}); }
function layoutViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [width,height] = mainWindow.getContentSize();
  for (const tab of tabs.values()) {
    tab.view.setBounds({x:0,y:TOOLBAR_HEIGHT,width:Math.max(320,width),height:Math.max(MIN_VIEW_HEIGHT,height-TOOLBAR_HEIGHT)});
    tab.view.setVisible(tab.id===activeTabId);
  }
}
function activateTab(id) { if (!tabs.has(id)) return; activeTabId=id; layoutViews(); publishState(); }
function createTab(initialUrl="https://www.google.com/") {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const id=nextTabId++;
  const view=new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
  const tab={id,view,title:"New tab",url:""};
  tabs.set(id,tab); mainWindow.contentView.addChildView(view);
  const wc=view.webContents;
  wc.setWindowOpenHandler(({url}) => {
    try { createTab(normalizeWebUrl(url)); } catch(error) { safeSend("browser:error",{message:error.message}); }
    return {action:"deny"};
  });
  const blockNonWebNavigation = (event, url) => {
    try { normalizeWebUrl(url); } catch { event.preventDefault(); }
  };
  wc.on("will-navigate", blockNonWebNavigation);
  wc.on("will-redirect", blockNonWebNavigation);
  wc.on("page-title-updated",(_event,title)=>{tab.title=title||"Untitled";publishState();});
  wc.on("did-navigate",(_event,url)=>{tab.url=url;publishState();});
  wc.on("did-navigate-in-page",(_event,url)=>{tab.url=url;publishState();});
  wc.on("did-start-loading",publishState);
  wc.on("did-stop-loading",publishState);
  wc.on("render-process-gone",(_event,details)=>safeSend("browser:error",{message:"A page process stopped ("+details.reason+"). Reload the tab to retry."}));
  activateTab(id);
  try { wc.loadURL(normalizeWebUrl(initialUrl)).catch(error=>safeSend("browser:error",{message:"Navigation failed: "+error.message})); }
  catch(error) { safeSend("browser:error",{message:error.message}); }
  return id;
}
function closeTab(id) {
  const tab=tabs.get(id); if(!tab)return;
  mainWindow.contentView.removeChildView(tab.view);
  tab.view.webContents.close(); tabs.delete(id);
  if(activeTabId===id) activeTabId=tabs.size?[...tabs.keys()].at(-1):null;
  if(!tabs.size) createTab();
  layoutViews(); publishState();
}
function assertUiSender(event) { if(!mainWindow || event.sender!==mainWindow.webContents) throw new Error("Rejected IPC request from an untrusted renderer."); }
function activeTab() { return tabs.get(activeTabId); }

app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  mainWindow=new BrowserWindow({width:1440,height:940,minWidth:760,minHeight:540,title:"HeavenzFire Desktop Browser",backgroundColor:"#0b1020",
    webPreferences:{preload:path.join(__dirname,"preload.cjs"),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  mainWindow.loadFile(path.join(__dirname,"renderer","index.html"));
  mainWindow.on("resize",layoutViews);
  mainWindow.on("closed",()=>{for(const tab of tabs.values())tab.view.webContents.close();tabs.clear();mainWindow=null;});
  ipcMain.handle("browser:get-state",event=>{assertUiSender(event);return{tabs:[...tabs.values()].map(publicTab),activeTabId};});
  ipcMain.handle("browser:new-tab",(event,url)=>{assertUiSender(event);return createTab(url||"https://www.google.com/");});
  ipcMain.handle("browser:activate-tab",(event,id)=>{assertUiSender(event);activateTab(Number(id));});
  ipcMain.handle("browser:close-tab",(event,id)=>{assertUiSender(event);closeTab(Number(id));});
  ipcMain.handle("browser:navigate",async(event,id,rawUrl)=>{assertUiSender(event);const tab=tabs.get(Number(id));if(!tab)throw new Error("Tab no longer exists.");const url=normalizeWebUrl(rawUrl);await tab.view.webContents.loadURL(url);return url;});
  ipcMain.handle("browser:back",event=>{assertUiSender(event);const tab=activeTab();if(tab&&tab.view.webContents.canGoBack())tab.view.webContents.goBack();});
  ipcMain.handle("browser:forward",event=>{assertUiSender(event);const tab=activeTab();if(tab&&tab.view.webContents.canGoForward())tab.view.webContents.goForward();});
  ipcMain.handle("browser:reload",event=>{assertUiSender(event);const tab=activeTab();if(tab)tab.view.webContents.reload();});
  ipcMain.handle("browser:stop",event=>{assertUiSender(event);const tab=activeTab();if(tab)tab.view.webContents.stop();});
  ipcMain.handle("browser:home",event=>{assertUiSender(event);const tab=activeTab();if(tab)tab.view.webContents.loadURL("https://www.google.com/");});
  createTab("https://www.google.com/"); layoutViews();
});
app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0) app.whenReady().then(()=>{mainWindow=null;});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
