function saveOptions(e) {
	let opt = {
		menuOptions:{
		"changeTabKey":document.querySelector("#switchSelection").value,
		"pauseKey":document.querySelector("#playbackSelection").value,
		"muteKey":document.querySelector("#muteSelection").value
		},
		automute:document.querySelector("#automuteSelection").checked
	};
		
		let valids = [undefined,"Ctrl","Shift"];
		let mods = opt.menuOptions;
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
			&& (opt.automute === true || opt.automute === false)){
			browser.storage.local.set({
				menuOptions:{
					changeTabKey:mods.changeTabKey,
					pauseKey:mods.pauseKey,
					muteKey:mods.muteKey
				},
				automute:opt.automute
			});
			notifyBackground(opt);
			feedback(false,"OK");
		}else{
			feedback(true,(diff ? "" : "Two action have same modifier"));
		}
  e.preventDefault();
}

function feedback(err,str){
	let elem = document.getElementById("feedback");
	let color = err ? "red":"green";
	let fdb = err ? "Invalid key configuration " + str : "OK";
	elem.textContent = fdb;
	elem.style.color = color;
	return 0
}

function notifyBackground(output){
	browser.runtime.sendMessage({
		SBOptions: output
	});
}


function toSelectValue(str){
	let retval = str;
	if (str === undefined){
		retval = "sb_undefined";
	}
	return retval
}

function restoreOptions() {

  let gettingItem = browser.storage.local.get(["menuOptions","automute"]);
  gettingItem.then((res) => {
		let options = res.menuOptions;
		document.querySelector("#playbackSelection").value = toSelectValue(options.pauseKey);

		document.querySelector("#switchSelection").value = toSelectValue(options.changeTabKey);

		document.querySelector("#muteSelection").value = toSelectValue(options.muteKey);

		document.querySelector("#automuteSelection").checked = res.automute;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById("saveButton").addEventListener("click", saveOptions,false);