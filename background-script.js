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
	// getTabs is used for hotkey commands
	this.getTabs = () => { return SBtabs.tabs };
	
	// SBtab holds the state of a single tab
	function SBtab(id,props){
		Object.defineProperty(this,"id",{value:id});
		this.audible = props.audible || false;
		this.muted = props.muted || false;
		this.pinned = props.pinned || false;
		this.paused = props.paused || false;
		this.frameId = null;
		return Object.seal(this)
	};
	// SBtab methods
	SBtab.prototype.toggleMute = function(){browser.tabs.update(this.id,{muted:!this.muted})};
	SBtab.prototype.togglePlayback = function(forceAllFrames){
		let file = "toggle_playback.js";
		let newState = !this.paused;
		let details;
		// allFrames is forced when the specified frame doesn't exist anymore
		if(forceAllFrames || newState){
			details = { file: file, allFrames: true };
		}else{
			details = { file: file, frameId: this.frameId };
		}
		browser.tabs.executeScript(this.id, details).then(async (results)=>{
			for(let result of results){
				if (result.changed){
					this.set("paused", newState);
					this.frameId = !newState ? null : results.length === 1 ? 0 : await getFrameId(this.id,result.url);
					break;
				}
			}
		},(e)=>{
			// Handle the case where a frame doesn't exist anymore
		console.log("Frame has been removed, proceed to toggle all frames");
		if(!(forceAllFrames || newState)){
			window.setTimeout(()=>(this.togglePlayback(true)),20);
		}
		});
	};
	SBtab.prototype.set = function(property,value){
		if (this.hasOwnProperty(property) && (value === true || value === false)){
		//	console.log("setting " + property + " to " + value);
			this[property] = value;
		}
	};

	SBtab.prototype.isRemovable = function(){return !(this.paused || this.audible || this.muted || this.pinned)};
	 
	const getFrameId = async function(tabId,url){
		let frames = await browser.webNavigation.getAllFrames({tabId:tabId});
		return frames.filter((frame)=>(url === frame.url))[0].frameId || null;
	};
	
	// Holds options
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
		
		this.create = (id,props) => {
			if (this.get(id) === null){
				/* Mute old tabs */
				options.automute && !props.pinned && browser.tabs.get(id).then(muteOtherTabs);
				this.tabs[id] = new SBtab(id,props);
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
				let SBtab = SBtabs.get(tabId);
				if(!(tabInfo.id === +tabId) && !SBtab.muted && SBtab.audible){
					SBtab.toggleMute();
					if (first){
						SBtabs.autoUnmuteId = +tabId;
						first = false;
					}
				}
			}
		}
	};
	
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
		let SBtab = SBtabs.get(SBtabs.prevTab.fromTab);
		if(!SBtab || SBtab.isRemovable()){
			handleRemoved(SBtabs.prevTab.fromTab,false);
		}
		SBtabs.prevTab.clear();
		browser.tabs.onActivated.removeListener(handleActiveChanged);
	};
	
	// Filter out uninteresting changes
	// This doesn't fire when active tab changes
	const determineAction = (tabId, changeInfo, tabInfo) => {
		if(changeInfo.audible === undefined && changeInfo.mutedInfo === undefined){
				console.log("This should never happen on Firefox 61+")
				return
		}
		else{
			handleUpdated(tabId,changeInfo);
		}
		return 
	};
	
	const isExternallyMuted = (mutedInfo) => (mutedInfo && (mutedInfo.extensionId != browser.runtime.id));
	
	// Handle changes to tabs
	const handleUpdated = (tabId,changeInfo) => {
		
		let SBtab = SBtabs.get(tabId);
		// Ignore cases where a tab was muted by action other than this extension
		if(!SBtab){
			if(isExternallyMuted(changeInfo.mutedInfo)){
				return
			}else{
				SBtab = SBtabs.create(tabId,{audible:true});
			}
		}
		
		/*
		* Event runs twice on muted state changes...
		* First you get changeInfo.muted == false
		* Then immediately afterwards changeInfo.audible == true
		* So need to sync state on muted change otherwise the tab id becomes
		* unregistered because tab is no longer paused or muted or audible
		*/

		SBtab.set("audible",changeInfo.audible);
		if(SBtab.audible && SBtab.paused){
			SBtab.set("paused",false);
		}
		if (changeInfo.mutedInfo){
			SBtab.set("muted",changeInfo.mutedInfo.muted);
			// Also sync audible state now
			SBtab.set("audible",!SBtab.muted)
		}
		// Don't remove the tab yet if it's used by switch-to-tab
		// Will be removed when the active tab changes
		if(SBtab.isRemovable() && SBtabs.prevTab.fromTab != tabId){
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
		}
		removeMenu(tabId);
	};
	
	// Pin tab
	const handlePinned = (tabId,audible,mutedInfo) => {
		let SBtab = SBtabs.get(tabId);
		let shouldBePaused = (!audible && !mutedInfo.muted); 
		if(SBtab && SBtab.pinned){
			unpin(tabId);
		}else{
			if(!SBtab){
				SBtab = SBtabs.create(tabId,{pinned:true,audible:audible,paused:shouldBePaused});
			}
			SBtab.set("pinned",true);
		}
	};
	
	// Unpin tab
	const unpin = (tabId) => {
		let SBtab = SBtabs.get(tabId);
		SBtab.set("pinned",false);
		if(SBtab.isRemovable()){
			handleRemoved(tabId,true);
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
	
	// Select which tabId should switch to
	// newId == id of the tab that registered the menuitem
	// curId == id of currently selected tab
	
	const getSwitchTabId = (newId,curId,curTitle) => {
		let id = (newId != curId) ? newId : null;
		// Store the previous tab info if we changed to a tab using Soundman
		if (id != null){
			SBtabs.prevTab.id = curId;
			SBtabs.prevTab.title = curTitle;
			SBtabs.prevTab.fromTab = newId;
		}
		return id
	}
	
		// Select which action to take on message
	const handleMessage = (request,sender,sendResponse) => {
		if(sender.id != browser.runtime.id){
			return
		}
		switch(sender.envType){
			// From content asking for tab status
			case "content_child":
				(request.message === "isPaused") && sendResponse({paused:SBtabs.get(sender.tab.id).paused});
				break;
			// update options based on message from options document
			case "addon_child":
				setOptions(request.SBOptions);
				break;
			default:
				console.log("unhandled message from:" + sender.envType);
		}
		return
	};
	
	
	// Set options on startup
	browser.storage.local.get(["menuOptions","automute"]).then((options) => {setOptions(options)});
	
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
	
	
	// Register Event Listeners
	
	// Listen to tab changes
	// Firefox 61 supports filtering onUpdated	
	browser.tabs.onUpdated.addListener(determineAction,{properties:["audible","mutedInfo"]});
	
	// Remove the tab from soundman if the tab was closed
	browser.tabs.onRemoved.addListener(handleRemoved);

	// Update menus when shown
	browser.menus.onShown.addListener(selectMenuUpdate);
	// Listen to feedback from content and options
	browser.runtime.onMessage.addListener(handleMessage);
	// Action for different menuitems
	browser.menus.onClicked.addListener((menus, tab) => {
	
		if(menus.menuItemId === "SoundmanDelete"){
			handleRemoved(tab.id,true);
		}else if(menus.menuItemId === "SoundmanPin"){
			handlePinned(tab.id,tab.audible,tab.mutedInfo);
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
					// tabId may be 0 (?) thus the check for null
					if (tabId != null){
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
			if(SBtabs.get(id)[property]){
				selected = +id;
				break;
			}
		}
		if(selected === null){
			for(let id of tabIds){
				let SBtab = SBtabs.get(id);
				if((!selected && SBtab.audible) || (SBtab.pinned && SBtab.audible)){
					selected = +id;
					if(SBtab.pinned){
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