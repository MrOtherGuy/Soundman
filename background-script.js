"use strict;"

browser.runtime.onInstalled.addListener(setDefault);
function setDefault() {

  var gettingItem = browser.storage.local.get(["menuOptions"]);
  gettingItem.then((res) => {
		var options = res.menuOptions;
		var names = options ? Object.getOwnPropertyNames(options) : [];
		if (!(names.includes("changeTabKey")
					&& names.includes("muteKey")
					&& names.inludes("pauseKey"))){
			browser.storage.local.set({
				menuOptions:{
					changeTabKey: undefined,
					pauseKey: "Ctrl",
					muteKey: "Shift"
				}
			});			
		}
  });
}

let soundman = new function(){
	this.getTabs = ()=>{return SBtabs.tabs};
	var options = {undefinedKey:"switch",CtrlKey:"playback",ShiftKey:"mute"};
	var SBtabs = new function(){
		this.tabs = {},
		this.prevTab = new function(){this.clear=()=>{this.title=null,this.id=null,this.fromTab=null};this.title=null,this.id=null,this.fromTab=null};
		//this.isPausing = (id) => {return this.get(id).pausing};
		this.set = (tab,property,value) => { if(value === true || value === false){tab[property] = value} },
		this.get = (id)=>{return this.tabs[id]},
		this.put = (id)=>{this.tabs[id]={muted:false,audible:true,pinned:false,paused:false}; createMenu(id);return this.get(id)},
		this.remove = (id)=>{delete this.tabs[id]}

	};
	
	function setOptions(opt){
		var valids = [undefined,"Ctrl","Shift"];
		var diff = ((opt.changeTabKey != opt.pauseKey)
									&& (opt.changeTabKey != opt.muteKey)
									&& (opt.muteKey != opt.pauseKey));
		
		if(diff
			&& valids.includes(opt.changeTabKey)
			&& valids.includes(opt.pauseKey)
			&& valids.includes(opt.muteKey)){
			/*options.changeTabKey = opt.changeTabKey;
			options.pauseKey = opt.pauseKey;
			options.muteKey = opt.muteKey;*/
			options[opt.changeTabKey+"Key"] = "switch";
			options[opt.pauseKey+"Key"] = "playback";
			options[opt.muteKey+"Key"] = "mute";
			
		}else{
			console.log("invalid key configuration")
		}
	}
	
	
	function handleActiveChanged(tabInfo){
		SBtabs.prevTab.clear();
		browser.tabs.onActivated.removeListener(handleActiveChanged);
	}
	
	function determineAction(tabId,changeInfo, tabInfo){
		if(changeInfo.audible === undefined && changeInfo.mutedInfo === undefined){
				return 0
		}
		else{
			handleUpdated(tabId,changeInfo);
		}
		return 0
	}
	
	function handleUpdated(tabId,changeInfo){
		
		var tab = SBtabs.get(tabId) || SBtabs.put(tabId);
		
		// Event runs twice on muted state changes...
		
		SBtabs.set(tab,"audible",changeInfo.audible);
		if(tab.audible && tab.paused){
			SBtabs.set(tab,"paused",false);
		}
		if (changeInfo.mutedInfo){
			SBtabs.set(tab,"muted",changeInfo.mutedInfo.muted);
			// Also sync audible state now
			SBtabs.set(tab,"audible",!tab.muted);
		}
		if(!tab.muted && !tab.paused && !tab.audible && !tab.pinned){
			//console.log(changeInfo);
			handleRemoved(tabId);
		}
	}
	let createMenu = (id) => {
		browser.menus.create({
		id: "Soundman-" + id,
		title: "Soundman Item",
		contexts: ["page"],
		icons: {"16":"Soundman16.png"}
		});
	}
	let removeMenu = (id) => { browser.menus.remove("Soundman-"+id) }
	
	let handleRemoved = (tabId) => {
		if(SBtabs.get(tabId)){
			SBtabs.remove(tabId);
			removeMenu(tabId);
		}
	}
	
	let handlePinned = (tabId) => {
		var tab = SBtabs.get(tabId);
		if(tab && tab.pinned){
			unpin(tabId);
		}else{
			if(!tab){
				tab = SBtabs.put(tabId);
			}
			SBtabs.set(tab,"pinned",true);
		}
	}
	
	let unpin = (tabId) => {
		var tab = SBtabs.get(tabId);
		SBtabs.set(tab,"pinned",false);
		if(!tab.muted && !tab.paused && !tab.audible){
			//console.log(changeInfo);
			handleRemoved(tabId);
		}
		
	}
	
	let updateMenu = (info,tab) => {
		
		if(info.contexts[0] === "tab"){
			var SBtab = SBtabs.get(tab.id);
			if(SBtab){
				browser.menus.update("SoundmanDelete",{enabled:true});
				SBtab.pinned && browser.menus.update("SoundmanPin",{title:"Unpin from Soundman"});
				browser.menus.refresh();
				browser.menus.update("SoundmanDelete",{enabled:false});
				browser.menus.update("SoundmanPin",{title:"Pin to Soundman"});
			}
		}else{
		
			var promises = [];
			for (var id in SBtabs.tabs){
				promises.push(browser.tabs.get(+id));
			}
			Promise.all(promises).then((tabs) => {
				for(tab of tabs){
					var title = "";
					if(SBtabs.prevTab.fromTab === tab.id){
						title += "🔁 "+SBtabs.prevTab.title;
					}else{
						var mute = ["🔊","🔇"][+SBtabs.get(tab.id).muted];
						var play = ["⏸ ","▶️ "][+SBtabs.get(tab.id).paused];
						var pin = ["","📌"][+SBtabs.get(tab.id).pinned];
						title += (pin + mute + play + tab.title);
					}
					browser.menus.update("Soundman-"+tab.id,{
					title: title,
					enabled: true
					});
				}
				browser.menus.refresh();
			});
		}
	}
	let getMenuAction = (mods) => {
		
		return options[mods[0]+"Key"]
		/*
		var retval = "switch";
		if(mods.includes("Ctrl")){
			retval = "playback";
		}else if(mods.includes("Shift")){
			retval = "mute";
		}
		return retval*/
	}
	
	let playback = (id) => {
		var tab = SBtabs.get(id);
		var state = tab.paused;
		var func = state ? ".play();": ".pause();";
		browser.tabs.executeScript(id,{
			code: "(function(){var state="+!state+";var media=document.getElementsByTagName('video')[0]||document.getElementsByTagName('audio')[0]||null;if(media!=null){media && media"+func+"}else{media=document.getElementsByClassName('playControl')[0]||null;media&&media.tagName==='BUTTON'&&media.click()}browser.runtime.sendMessage({elem:!!media,state:state})})()",
			allFrames:true
		});
		return 0
	}
	let mute = (tab)=>{
		browser.tabs.update(tab,{muted:!(SBtabs.get(tab).muted)})
	}

	let handleMessage = (request,sender,sendResponse) => {
		if(sender.id != "soundman@example.com"){
			return
		}
		if(sender.envType === "content_child"){
		
		var tab = SBtabs.get(sender.tab.id);
		if (tab.paused != request.state){
			SBtabs.set(tab,"paused",!!(request.elem^tab.paused));
		}
		}else{
			setOptions(request.SBOptions);
		}
	}
	browser.storage.local.get(["menuOptions"]).then((options) => {setOptions(options.menuOptions)});
	browser.tabs.onUpdated.addListener(determineAction);
	browser.tabs.onRemoved.addListener(handleRemoved);
	// Create delete menu
	browser.menus.create({
		id: "SoundmanDelete",
		title: "Remove from Soundman",
		contexts: ["tab"],
		icons: {"16":"Soundman16.png"},
		enabled: false,
	});
	// Create pinned menu
	browser.menus.create({
		id: "SoundmanPin",
		title: "Pin to Soundman",
		contexts: ["tab"],
		icons: {"16":"Soundman16.png"},
	});
	let getSwitchTabId = (newId,curId,curTitle) => {
		var retval;
		if (newId != curId){
			retval = newId;
			SBtabs.prevTab.id = curId;
			SBtabs.prevTab.title = curTitle;
			SBtabs.prevTab.fromTab = newId;
		}else{
			retval = null;
		}
		return retval
	}
	browser.menus.onShown.addListener(updateMenu);
	browser.runtime.onMessage.addListener(handleMessage);
	browser.menus.onClicked.addListener((menus, tab) => {
	
		if(menus.menuItemId === "SoundmanDelete"){
			handleRemoved(tab.id);
		}else if(menus.menuItemId === "SoundmanPin"){
			handlePinned(tab.id);
		}else{
			var tabId = +(menus.menuItemId.split("-")[1]); //This shit FIX
			var method = getMenuAction(menus.modifiers);
			switch (method){
				case "playback":
					playback(tabId);
					break;
				case "mute":
					mute(tabId);
					break;
				case "switch":
					tabId = getSwitchTabId(tabId,tab.id,tab.title);
					if (tabId){
						browser.tabs.update(tabId,{active: true });
						browser.tabs.onActivated.addListener(handleActiveChanged);
					}else{
						browser.tabs.update(SBtabs.prevTab.id,{active:true});
					}
					break;
				default:
					console.log("undefined menuaction, should not happen")
			}
		}
		return
	});
};