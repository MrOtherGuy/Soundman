function saveOptions(e) {
	let opt = {
		menuOptions:{
		"changeTabKey":document.querySelector("#switchSelection").value,
		"pauseKey":document.querySelector("#playbackSelection").value,
		"muteKey":document.querySelector("#muteSelection").value
		},
		automute:document.querySelector("#automuteSelection").checked,
		hotkeys:{
			muteKey: document.querySelector("#Mute_HKSelection").value,
			pauseKey: document.querySelector("#Pause_HKSelection").value
		}
	};
	let valids = [undefined,"Ctrl","Shift"];
	let mods = opt.menuOptions;
	let message = {valid: true, modifiers: "Click modifiers: ", hotkeys: "Hotkeys: "};
	for (let op in mods){
		if (mods[op] === "sb_undefined"){
			mods[op] = undefined;
		}
	}
	let diff = ((mods.changeTabKey != mods.pauseKey)
								&& (mods.changeTabKey != mods.muteKey)
								&& (mods.muteKey != mods.pauseKey));
	if(diff
		&& valids.includes(mods.changeTabKey)
		&& valids.includes(mods.pauseKey)
		&& valids.includes(mods.muteKey)
		&& (opt.automute === true || opt.automute === false)
		){
		
		message.modifiers += "OK";
		//	feedback(false,"OK");
		//	updateHotkeys();
	}else{
		message.valid = false;
		message.modifiers += "Two action have same modifier";
	//	feedback(true,(diff ? "" : "Two action have same modifier"));
	}
	message.valid = updateHotkeys();
	message.hotkeys += (message.valid ? "OK" : "Invalid");
	feedback(message);
	if(message.valid){
		browser.storage.local.set({
			menuOptions:{
				changeTabKey:mods.changeTabKey,
				pauseKey:mods.pauseKey,
				muteKey:mods.muteKey
			},
			automute:opt.automute,
			hotkeys: {
				muteKey: opt.hotkeys.muteKey,
				pauseKey: opt.hotkeys.pauseKey
			}
		});
		notifyBackground(opt);
	}
  e.preventDefault();
}

function feedback(err){
	let elem = document.getElementById("feedback");
	let color = err.valid ? "green":"red";
	let fdb = err.valid ? "OK" : "Error: " + err.modifiers + " " + err.hotkeys ;
	elem.textContent = fdb;
	elem.style.color = color;
	return 0
}

function notifyBackground(output){
	browser.runtime.sendMessage({
		SBOptions: output
	});
}
// Background page doesn't need to be notified about hotkey changes
function updateHotkeys(){
	return (
	updateHotkey("smhk_muteUnmute",document.querySelector("#Mute_HKSelection"))
	&& updateHotkey("smhk_playPause",document.querySelector("#Pause_HKSelection"))
	)
}

function updateHotkey(name,e) {
	if(e.validity.valid){
		browser.commands.update({
			name: name,
			shortcut: e.value
		}).then(()=>(e.nextSibling.textContent = "OK"),(err) => (e.nextSibling.textContent = err));
	}else{
		e.nextSibling.textContent = "Hotkey is invalid"
	}
	return e.validity.valid
}

function resetHotkeys() {
	let defaults = {muteKey: "Ctrl+Shift+O", pauseKey: "MediaPlayPause"};
	browser.commands.getAll().then((hks)=>{
		hks.forEach((hk) => (browser.commands.reset(hk.name)));
	}).then(browser.storage.local.set({
		hotkeys: {
			muteKey: defaults.muteKey,
			pauseKey: defaults.pauseKey
		}
	}));
	document.querySelector("#Pause_HKSelection").value = defaults.pauseKey;
	document.querySelector("#Mute_HKSelection").value = defaults.muteKey
}

function toSelectValue(str){
	let retval = str;
	if (str === undefined){
		retval = "sb_undefined";
	}
	return retval
}

function restoreOptions() {

  let gettingItem = browser.storage.local.get(["menuOptions","automute","hotkeys"]);
  gettingItem.then((res) => {
		let options = res.menuOptions;
		document.querySelector("#playbackSelection").value = toSelectValue(options.pauseKey);

		document.querySelector("#switchSelection").value = toSelectValue(options.changeTabKey);

		document.querySelector("#muteSelection").value = toSelectValue(options.muteKey);

		document.querySelector("#automuteSelection").checked = res.automute;
		
		document.querySelector("#Mute_HKSelection").value = res.hotkeys.muteKey;
		
		document.querySelector("#Pause_HKSelection").value = res.hotkeys.pauseKey;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById("saveButton").addEventListener("click", saveOptions,false);
document.getElementById("hk_reset").addEventListener("click",resetHotkeys,false);