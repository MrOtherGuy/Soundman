"use strict;"
// Set default options
browser.runtime.onInstalled.addListener( () => {
  let gettingItem = browser.storage.local.get(["menuOptions","automute","hotkeys"]);
  gettingItem.then((res) => {
		let names = res.menuOptions ? Object.getOwnPropertyNames(res.menuOptions) : [];
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
		if(!((res.automute === true )||(res.automute === false))){
			browser.storage.local.set({	
				automute: false
			});			
		}
		if(!(res.hotkeys)){
			browser.storage.local.set({	
				hotkeys:{
					pauseKey: "MediaPlayPause",
					muteKey: "Ctrl+Shift+O"
				}
			});			
		}
  });
});

const soundman = new function(){
	
	// new sbtab initializer
	function SBtab(id,audible){
		this.id = id;
		this.status = {
			audible: audible,
			muted: false,
			pinned: false,
			paused: false
		};
		return Object.freeze(this)
	};
	// SBtab methods
	SBtab.prototype.toggleMute = function(){browser.tabs.update(this.id,{muted:!this.status.muted})};
	SBtab.prototype.togglePlayback = function(){
		let state = this.status.paused || (this.status.pinned && !this.status.audible) ;
		// Select the function
		let func = state ? ".play();": ".pause();";
		// Construct and send this script to content window
		// Page specific functionality is sadness but necessary
		browser.tabs.executeScript(this.id,{
			code: 
				`(function(){
					var state = ${!state};
					var host = document.location.host.toString();
					var specialCases = ["soundcloud.com","soundclick.com"];
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
								media = document.getElementsByClassName("playControl")[0] || null;
								media && media.tagName === "BUTTON" && media.click();
							}
							break;
						case "soundclick.com":
							media = document.querySelector(".hap-playback-toggle") || null;
							media && media.click();
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
	};
	SBtab.prototype.set = function(property,value){
		if (this.status.hasOwnProperty(property) && (value === true || value === false)){
			this.status[property] = value;
		}
	};
	SBtab.prototype.isMuted = function(){return this.status.muted};
	SBtab.prototype.isPinned = function(){return this.status.pinned};
	SBtab.prototype.isAudible = function(){return this.status.audible};
	SBtab.prototype.isPaused = function(){return this.status.paused};
	SBtab.prototype.isRemovable = function(){return !(this.status.paused || this.status.audible || this.status.muted || this.status.pinned)};
	// getTabs is used for hotkey commands
	this.getTabs = () => { return SBtabs.tabs };
	// Current options
	const options = {
		undefinedKey:"switch",
		CtrlKey:"playback",
		ShiftKey:"mute",
		automute:false
		};
	
	// Manager to store tab states
	const SBtabs = new function(){
		this.tabs = {};
		this.autoUnmuteId = null;
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
		
		this.get = (id) => { return (this.tabs[id] || null) };
		
		this.create = (id,audible) => {
			if (this.get(id) === null){
				/* Mute old tabs */
				options.automute && browser.tabs.get(id).then(muteOtherTabs);				
				this.tabs[id] = new SBtab(id,!!audible);
				createMenu(id);
			}
			return this.get(id)
		};
		
		this.remove = (id,fromSelf) => { 
			if(!fromSelf && this.autoUnmuteId){
				SBtabs.get(this.autoUnmuteId).toggleMute();
				this.autoUnmuteId = null;
			}
			delete this.tabs[id];
			return
		};
	};
	
	const muteOtherTabs = (tabInfo) => {
		if(tabInfo.active){
			let tabNames = Object.getOwnPropertyNames(SBtabs.tabs);
			let first = true;
			for (let tabId of tabNames){
				let aTab = SBtabs.get(tabId);
				if(!(tabInfo.id === +tabId) && !aTab.isMuted()){
					aTab.toggleMute();
					if (first){
						SBtabs.autoUnmuteId = +tabId;
						first = false;
					}
				}
			}
		}
	}
	
	// Validate and map click modifiers
	const setOptions = (opt) => {
		if(!opt){
			//This can happen on first install, but options is initialized to correct values at that time anyway
			return
		}
		let mods = opt.menuOptions;
		let valids = [undefined,"Ctrl","Shift"];
		let diff = ((mods.changeTabKey != mods.pauseKey)
									&& (mods.changeTabKey != mods.muteKey)
									&& (mods.muteKey != mods.pauseKey));
		
		if(diff
			&& valids.includes(mods.changeTabKey)
			&& valids.includes(mods.pauseKey)
			&& valids.includes(mods.muteKey)){
			options[mods.changeTabKey+"Key"] = "switch";
			options[mods.pauseKey+"Key"] = "playback";
			options[mods.muteKey+"Key"] = "mute";
			
		}else{
			console.log("invalid key configuration")
		}
		if(opt.automute === true || opt.automute === false){
			options.automute = opt.automute;
		}else{
			console.log("invalid automute state: " + opt.automute);
			options.automute = false;
		}
	};
	
	// This is only listening when we change tab from within context menu
	// If the user changes a tab himself we want to clear the previous tab store
	const handleActiveChanged = (tabInfo) => {
		if(SBtabs.get(SBtabs.prevTab.fromTab).isRemovable()){
			handleRemoved(SBtabs.prevTab.fromTab,false);
		}
		SBtabs.prevTab.clear();
		browser.tabs.onActivated.removeListener(handleActiveChanged);
	};
	
	// Filter out uninteresting changes
	// This doesn't fire when active tab changes
	const determineAction = (tabId, changeInfo, tabInfo) => {
		if(changeInfo.audible === undefined && changeInfo.mutedInfo === undefined){
				return 0
		}
		else{
			handleUpdated(tabId,changeInfo);
		}
		return 0
	};
	
	const isExternallyMuted = (mutedInfo) => (mutedInfo && (mutedInfo.extensionId != browser.runtime.id));
	
	// Handle changes to tabs
	const handleUpdated = (tabId,changeInfo) => {
		
		let tab = SBtabs.get(tabId);
		//console.log(changeInfo);
		// Ignore cases where a tab was muted by action other than this extension
		if(!tab){
			if(isExternallyMuted(changeInfo.mutedInfo)){
				return
			}else{
				tab = SBtabs.create(tabId,true);
			}
		}
		
		/*
		* Event runs twice on muted state changes...
		* First you get changeInfo.muted == false
		* Then immediately afterwards changeInfo.audible == true
		* So need to sync state on muted change otherwise the tab id becomes
		* unregistered because tab is no longer paused or muted or audible
		*/

		tab.set("audible",changeInfo.audible);
		if(tab.isAudible() && tab.isPaused()){
			tab.set("paused",false);
		}
		if (changeInfo.mutedInfo){
			tab.set("muted",changeInfo.mutedInfo.muted);
			// Also sync audible state now
			tab.set("audible",!tab.isMuted())
		}
		if(tab.isRemovable() && SBtabs.prevTab.fromTab != tabId/*!tab.isMuted() && !tab.isPaused() && !tab.isAudible() && !tab.isPinned()*/){
			handleRemoved(tabId,false);
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
	const handleRemoved = (tabId,fromSelf) => {
		// Prevent toggling muted state of already removed tab
		if(tabId === SBtabs.autoUnmuteId){
			fromSelf = false;
		}
		if(SBtabs.get(tabId)){
			SBtabs.remove(tabId,fromSelf);
			removeMenu(tabId);
		}
	};
	
	// Pin tab
	const handlePinned = (tabId) => {
		let tab = SBtabs.get(tabId);
		if(tab && tab.isPinned()){
			unpin(tabId);
		}else{
			if(!tab){
			tab = SBtabs.create(tabId);
			}
			tab.set("pinned",true);
		}
	};
	
	// Unpin tab
	const unpin = (tabId) => {
		let tab = SBtabs.get(tabId);
		tab.set("pinned",false);
		if(!tab.isMuted() && !tab.isPaused() && !tab.isAudible()){
			handleRemoved(tabId,true);
		}
	};
	
	const selectMenuUpdate = (info,tab) => {
		// Handle tab context menu here
		if(info.contexts[0] === "tab"){
			let SBtab = SBtabs.get(tab.id);
			if(SBtab){
				browser.menus.update("SoundmanDelete",{enabled:true});
				SBtab.isPinned() && browser.menus.update("SoundmanPin",{title:"Unpin from Soundman"});
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
					title = ["","📌"][+SBtab.isPinned()] + ["🔊","🔇"][+SBtab.isMuted()] + ["▶️ ","⏸ "][+SBtab.isPaused()] + tab.title;
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

	// Select which action to take on message
	const handleMessage = (request,sender,sendResponse) => {
		// Don't care about other senders
		if(sender.id != "soundman@example.com"){
			return
		}
		// Feedback from tab content
		if(sender.envType === "content_child"){
		
			let tab = SBtabs.get(sender.tab.id);
			if (tab && (tab.isPaused() != request.state)){
				tab.set("paused",!!(request.elem ^ tab.isPaused()));
			}
		}else{
			// update options based on message from options document
			setOptions(request.SBOptions);
		}
	};
	
	// Set options on startup
	browser.storage.local.get(["menuOptions","automute"]).then((options) => {setOptions(options)});
	// Listen to tab changes
	// Firefox 61 supports filtering onUpdated	
	browser.tabs.onUpdated.addListener(determineAction,{properties:["audible","mutedInfo"]});
	
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
			handleRemoved(tab.id,true);
		}else if(menus.menuItemId === "SoundmanPin"){
			handlePinned(tab.id,tab.audible);
		}else{
			let tabId = +(menus.menuItemId.split("-")[1]);
			let method = getMenuAction(menus.modifiers);
			switch (method){
				case "playback":
					SBtabs.get(tabId).togglePlayback();
					break;
				case "mute":
					SBtabs.get(tabId).toggleMute();
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
	// Hotkey handling
	const getHotkeyTarget = (property) => {
		let tabIds = Object.keys(soundman.getTabs());
		let selected = null;
	// If a site is muted then it won't be paused by hotkey
		for(let id of tabIds){
			if(SBtabs.get(id).status[property]){
				selected = +id;
				break;
			}
		}
		if(selected === null){
			for(let id of tabIds){
				let aTab = SBtabs.get(id);
				if((!selected && aTab.isAudible()) || (aTab.isPinned() && aTab.isAudible())){
					selected = +id;
					if(aTab.isPinned()){
						break;
					}
				}
			}
		}
		return selected
	}
	
	browser.commands.onCommand.addListener(function(command) {
		let tabId = null;

		switch(command){
			case "smhk_playPause":
				tabId = getHotkeyTarget("paused");
				tabId != null && SBtabs.get(tabId).togglePlayback()
				break;
			case "smhk_muteUnmute":
				tabId = getHotkeyTarget("muted");
				tabId != null && SBtabs.get(tabId).toggleMute();
				break;
			default:
				console.log("this shouldn't happen...")
		}
	});
};