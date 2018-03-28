"use strict;"

browser.runtime.onInstalled.addListener(setDefault);
// Set default options
function setDefault() {

  var gettingItem = browser.storage.local.get(["menuOptions"]);
  gettingItem.then((res) => {
		var options = res.menuOptions;
		console.log(options);
		var names = options ? Object.getOwnPropertyNames(options) : [];
		console.log(names);
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
}

let soundman = new function(){
	// getTabs is for debug purposes
	this.getTabs = () => { return SBtabs.tabs };
	// Current options
	var options = {undefinedKey:"switch",CtrlKey:"playback",ShiftKey:"mute"};
	// Manager to store tab states
	var SBtabs = new function(){
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
		//this.isPausing = (id) => {return this.get(id).pausing};
		this.set = (tab, property, value) => {
			if(value === true || value === false){
				tab[property] = value
			}
		};
		this.get = (id) => { return this.tabs[id] };
		this.put = (id) => {
			this.tabs[id] = {
				muted:false,
				audible:true,
				pinned:false,
				paused:false
				};
			createMenu(id);
			return this.get(id)
		};
		this.remove = (id) => { delete this.tabs[id] };

	};
	// Validate and map click modifiers
	function setOptions(opt){
		if(!opt){
			//This can happen on first install, but options is initialized to correct values at that time anyway
			return
		}
		var valids = [undefined,"Ctrl","Shift"];
		var diff = ((opt.changeTabKey != opt.pauseKey)
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
	}
	
	// This is only listening when we change tab from within context menu
	// If the user changes a tab himself we want to clear the previous tab store
	function handleActiveChanged(tabInfo){
		SBtabs.prevTab.clear();
		browser.tabs.onActivated.removeListener(handleActiveChanged);
	}
	// Filter out uninteresting changes
	// This doesn't fire when active tab changes
	function determineAction(tabId,changeInfo, tabInfo){
		if(changeInfo.audible === undefined && changeInfo.mutedInfo === undefined){
				return 0
		}
		else{
			handleUpdated(tabId,changeInfo);
		}
		return 0
	}
	// Handle changes to tabs
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
	// Create a menuitem with associated id
	let createMenu = (id) => {
		browser.menus.create({
		id: "Soundman-" + id,
		title: "Soundman Item",
		contexts: ["page"],
		icons: {"16":"Soundman16.png"}
		});
	}
	// Remove menuitem for this tab
	let removeMenu = (id) => { browser.menus.remove("Soundman-"+id) }
	
	// Remove from manager
	let handleRemoved = (tabId) => {
		if(SBtabs.get(tabId)){
			SBtabs.remove(tabId);
			removeMenu(tabId);
		}
	}
	// Pin tab
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
	// Unpin tab
	let unpin = (tabId) => {
		var tab = SBtabs.get(tabId);
		SBtabs.set(tab,"pinned",false);
		if(!tab.muted && !tab.paused && !tab.audible){
			handleRemoved(tabId);
		}
		
	}
	
	let selectMenuUpdate = (info,tab) => {
		// Handle tab context menu here
		if(info.contexts[0] === "tab"){
			if(SBtabs.get(tab.id)){
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
	}
	// Update content context menu
	let updateMenu = () => {
		
		var promises = [];
		for (var id in SBtabs.tabs){
			promises.push(browser.tabs.get(+id));
		}
		if (promises.length === 0){
			return 0
		}
		Promise.all(promises).then((tabs) => {
			for(tab of tabs){
				var title;
				if(SBtabs.prevTab.fromTab === tab.id){
					title = "🔁 " + SBtabs.prevTab.title;
				}else{
					var SBtab = SBtabs.get(tab.id);
					title = ["","📌"][+SBtab.pinned] + ["🔊","🔇"][+SBtab.muted] + ["▶️ ","⏸ "][+SBtab.paused] + tab.title;
				}
				browser.menus.update("Soundman-"+tab.id,{
				title: title,
				enabled: true
				});
			}
			
		}).then(()=>{browser.menus.refresh();});
	}
	// map modifier keys to actions
	let getMenuAction = (mods) => {
		return options[mods[0]+"Key"]
	}
	// Playback control
	let playback = (id) => {
		var tab = SBtabs.get(id);
		var state = tab.paused;
		// Select the function
		var func = state ? ".play();": ".pause();";
		// Construct and send this script to content window
		// Page specific functionality is sadness but necessary
		browser.tabs.executeScript(id,{
			code: "(function(){var state="+!state+";var media=document.getElementsByTagName('video')[0]||document.getElementsByTagName('audio')[0]||null;if(media!=null){media && media"+func+"}else{media=document.getElementsByClassName('playControl')[0]||null;media&&media.tagName==='BUTTON'&&media.click()}browser.runtime.sendMessage({elem:!!media,state:state})})()",
			allFrames:true
		});
		return 0
	}
	// Mute this tab
	let mute = (tab)=>{
		browser.tabs.update(tab,{muted:!(SBtabs.get(tab).muted)})
	}
	// Select which action to take on message
	let handleMessage = (request,sender,sendResponse) => {
		// Don't care about other senders
		if(sender.id != "soundman@example.com"){
			return
		}
		// Feedback from tab content
		if(sender.envType === "content_child"){
		
			var tab = SBtabs.get(sender.tab.id);
			if (tab.paused != request.state){
				SBtabs.set(tab,"paused",!!(request.elem^tab.paused));
			}
		}else{
			// update options based on message from options document
			setOptions(request.SBOptions);
		}
	}
	// Set options on startup
	// On first
	browser.storage.local.get(["menuOptions"]).then((options) => {setOptions(options.menuOptions)});
	// Listen to tab changes
	browser.tabs.onUpdated.addListener(determineAction);
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
	// Update menus when shown
	browser.menus.onShown.addListener(selectMenuUpdate);
	// Listen to feedback from content and options
	browser.runtime.onMessage.addListener(handleMessage);
	// Action for different menuitems
	browser.menus.onClicked.addListener((menus, tab) => {
	
		if(menus.menuItemId === "SoundmanDelete"){
			handleRemoved(tab.id);
		}else if(menus.menuItemId === "SoundmanPin"){
			handlePinned(tab.id);
		}else{
			var tabId = +(menus.menuItemId.split("-")[1]);
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