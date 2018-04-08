"use strict;"
// Set default options
browser.runtime.onInstalled.addListener( () => {
  let gettingItem = browser.storage.local.get(["menuOptions"]);
  gettingItem.then((res) => {
		let options = res.menuOptions;
		let names = options ? Object.getOwnPropertyNames(options) : [];
		if (!(names.includes("changeTabKey")
					&& names.includes("muteKey")
					&& names.includes("pauseKey"))){
			browser.storage.local.set({
				menuOptions:{
					changeTabKey: undefined,
					pauseKey: "Ctrl",
					muteKey: "Shift"
				}
			});			
		}
  });
});

const soundman = new function(){
	// getTabs is for debug purposes
	this.getTabs = () => { return SBtabs.tabs };
	// Current options
	const options = {undefinedKey:"switch",CtrlKey:"playback",ShiftKey:"mute"};
	// Manager to store tab states
	const SBtabs = new function(){
		this.tabs = {};
		this.prevTab = new function(){
			this.clear = () => {
				this.title = null;
				this.id = null;
				this.fromTab = null
			};
			this.title = null;
			this.id = null;
			this.fromTab = null
		};
		
		this.set = (id, property, value) => {
			let tab = this.get(id);
			if(tab && (value === true || value === false)){
				tab[property] = value;
			}
		};
		
		this.get = (id) => { return (this.tabs[id] || null) };
		
		this.create = (id,audible) => {
			if (this.get(id) === null){
				this.tabs[id] = {
					muted:false,
					audible:!!audible,
					pinned:false,
					paused:false
					};
				createMenu(id);
			}
			return this.get(id)
		};
		
		this.remove = (id) => { delete this.tabs[id] };
	};
	
	// Validate and map click modifiers
	const setOptions = (opt) => {
		if(!opt){
			//This can happen on first install, but options is initialized to correct values at that time anyway
			return
		}
		let valids = [undefined,"Ctrl","Shift"];
		let diff = ((opt.changeTabKey != opt.pauseKey)
									&& (opt.changeTabKey != opt.muteKey)
									&& (opt.muteKey != opt.pauseKey));
		
		if(diff
			&& valids.includes(opt.changeTabKey)
			&& valids.includes(opt.pauseKey)
			&& valids.includes(opt.muteKey)){
			options[opt.changeTabKey+"Key"] = "switch";
			options[opt.pauseKey+"Key"] = "playback";
			options[opt.muteKey+"Key"] = "mute";
			
		}else{
			console.log("invalid key configuration")
		}
	};
	
	// This is only listening when we change tab from within context menu
	// If the user changes a tab himself we want to clear the previous tab store
	const handleActiveChanged = (tabInfo) => {
		SBtabs.prevTab.clear();
		browser.tabs.onActivated.removeListener(handleActiveChanged);
	};
	
	// Filter out uninteresting changes
	// This doesn't fire when active tab changes
	const determineAction = (tabId,changeInfo, tabInfo) => {
		if(changeInfo.audible === undefined && changeInfo.mutedInfo === undefined){
				return 0
		}
		else{
			handleUpdated(tabId,changeInfo);
		}
		return 0
	};
	
	// Handle changes to tabs
	const handleUpdated = (tabId,changeInfo) => {
		
		let tab = SBtabs.get(tabId) || SBtabs.create(tabId,true);
		
		/*
		* Event runs twice on muted state changes...
		* First you get changeInfo.muted == false
		* Then immediately afterwards changeInfo.audible == true
		* So need to sync state on muted change otherwise the tab id becomes
		* unregistered because tab is no longer paused or muted or audible
		*/
		SBtabs.set(tabId,"audible",changeInfo.audible);
		if(tab.audible && tab.paused){
			SBtabs.set(tabId,"paused",false);
		}
		if (changeInfo.mutedInfo){
			SBtabs.set(tabId,"muted",changeInfo.mutedInfo.muted);
			// Also sync audible state now
			SBtabs.set(tabId,"audible",!tab.muted);
		}
		if(!tab.muted && !tab.paused && !tab.audible && !tab.pinned){
			handleRemoved(tabId);
		}
	};
	
	// Create a menuitem with associated id
	const createMenu = (id) => {
		browser.menus.create({
		id: "Soundman-" + id,
		title: "Soundman Item",
		contexts: ["page"],
		icons: {"16":"Soundman16.png"}
		});
	};
	
	// Remove menuitem for this tab
	const removeMenu = (id) => { browser.menus.remove("Soundman-"+id) };
	
	// Remove from manager
	const handleRemoved = (tabId) => {
		if(SBtabs.get(tabId)){
			SBtabs.remove(tabId);
			removeMenu(tabId);
		}
	};
	
	// Pin tab
	const handlePinned = (tabId) => {
		let tab = SBtabs.get(tabId);
		if(tab && tab.pinned){
			unpin(tabId);
		}else{
			if(!tab){
				SBtabs.create(tabId);
			}
			SBtabs.set(tabId,"pinned",true);
		}
	};
	
	// Unpin tab
	const unpin = (tabId) => {
		let tab = SBtabs.get(tabId);
		SBtabs.set(tabId,"pinned",false);
		if(!tab.muted && !tab.paused && !tab.audible){
			handleRemoved(tabId);
		}
	};
	
	const selectMenuUpdate = (info,tab) => {
		// Handle tab context menu here
		if(info.contexts[0] === "tab"){
			let SBtab = SBtabs.get(tab.id);
			if(SBtab){
				browser.menus.update("SoundmanDelete",{enabled:true});
				SBtab.pinned && browser.menus.update("SoundmanPin",{title:"Unpin from Soundman"});
				browser.menus.refresh();
				browser.menus.update("SoundmanDelete",{enabled:false});
				browser.menus.update("SoundmanPin",{title:"Pin to Soundman"});
			}
		}else if(info.contexts[0]==="page"){
			updateMenu();
		}
		return 0
	};
	
	// Update content context menu
	const updateMenu = () => {
		// Loop through all id's in SBtabs and get the corresponding tab object
		let promises = [];
		for (let id in SBtabs.tabs){
			promises.push(browser.tabs.get(+id));
		}
		if (promises.length === 0){
			return 0
		}
		Promise.all(promises).then((tabs) => {
			for(let tab of tabs){
				let title;
				if(SBtabs.prevTab.fromTab === tab.id){
					title = "🔁 " + SBtabs.prevTab.title;
				}else{
					let SBtab = SBtabs.get(tab.id);
					title = ["","📌"][+SBtab.pinned] + ["🔊","🔇"][+SBtab.muted] + ["▶️ ","⏸ "][+SBtab.paused] + tab.title;
				}
				browser.menus.update("Soundman-"+tab.id,{
				title: title,
				enabled: true
				});
			}
			
		}).then(() => { browser.menus.refresh(); });
	};
	
	// map modifier keys to actions
	const getMenuAction = (mods) => {
		return options[mods[0]+"Key"]
	};
	
	// Playback control
	const playback = (id) => {
		let tab = SBtabs.get(id);
		if(!tab){
			return 0
		}
		let state = tab.paused;
		// Select the function
		let func = state ? ".play();": ".pause();";
		// Construct and send this script to content window
		// Page specific functionality is sadness but necessary
		browser.tabs.executeScript(id,{
			code: 
				`(function(){
					var state = ${!state};
					var host = document.location.host.toString();
					var specialCases = ["soundcloud.com"];
					var service = "SB_default";
					for (var test of specialCases){
						if (host.indexOf(test) != -1){
							service = test;
							break;
						}
					}
					var media;
					switch(service){
						case "soundcloud.com":
							if(host == "w.soundcloud.com"){
								window.postMessage(JSON.stringify({method:"toggle"}),"https://"+host);
								media = true;
							}else{
								media = document.getElementsByClassName("playControl")[0]
									|| null;
								media && media.tagName === "BUTTON" && media.click();
							}
							break;
						case "SB_default":
							media = document.getElementsByTagName("video")[0]
										|| document.getElementsByTagName("audio")[0]
										|| null;
							media && media${func}
							break;
						default:
							return 0;
					}
					browser.runtime.sendMessage({ elem:!!media,state:state })
				})()`,
			allFrames:true
		});
		return 0
	};
	
	// Mute this tab
	const mute = (tab) => {
		browser.tabs.update(tab,{muted:!(SBtabs.get(tab).muted)})
	};
	
	// Select which action to take on message
	const handleMessage = (request,sender,sendResponse) => {
		// Don't care about other senders
		if(sender.id != "soundman@example.com"){
			return
		}
		// Feedback from tab content
		if(sender.envType === "content_child"){
		
			let tab = SBtabs.get(sender.tab.id);
			if (tab && (tab.paused != request.state)){
				SBtabs.set(sender.tab.id,"paused",!!(request.elem^tab.paused));
			}
		}else{
			// update options based on message from options document
			setOptions(request.SBOptions);
		}
	};
	
	// Set options on startup
	browser.storage.local.get(["menuOptions"]).then((options) => {setOptions(options.menuOptions)});
	// Listen to tab changes
	browser.tabs.onUpdated.addListener(determineAction);
	// Firefox 61 supports filtering onUpdated	//browser.tabs.onUpdated.addListener(determineAction,{properties:["audible","mutedInfo"]});
	
	// Remove the tab from soundman if the tab was closed
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
	// Select which tabId should switch to
	// newId == id of the tab that registered the menuitem
	// curId == id of currently selected tab
	
	const getSwitchTabId = (newId,curId,curTitle) => {
		let retval;
		// Store the previous tab info if we changed to a tab using Soundman
		if (newId != curId){
			retval = newId;
			SBtabs.prevTab.id = curId;
			SBtabs.prevTab.title = curTitle;
			SBtabs.prevTab.fromTab = newId;
		}else{
			// return null in case we are in the tab of this menu already
			retval = null;
		}
		return retval
	}
	// Update menus when shown
	browser.menus.onShown.addListener(selectMenuUpdate);
	// Listen to feedback from content and options
	browser.runtime.onMessage.addListener(handleMessage);
	// Action for different menuitems
	browser.menus.onClicked.addListener((menus, tab) => {
	
		if(menus.menuItemId === "SoundmanDelete"){
			handleRemoved(tab.id);
		}else if(menus.menuItemId === "SoundmanPin"){
			handlePinned(tab.id,tab.audible);
		}else{
			let tabId = +(menus.menuItemId.split("-")[1]);
			let method = getMenuAction(menus.modifiers);
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
						browser.tabs.update(tabId,{ active: true });
						// activate listener if we used menu to change tab
						// it clears prevTab info on changing tab and deactivates itself
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