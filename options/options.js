function saveOptions(e) {
	var opt = {
		"changeTabKey":document.querySelector("#switchSelection").value,
		"pauseKey":document.querySelector("#playbackSelection").value,
		"muteKey":document.querySelector("#muteSelection").value};
		
		
		var valids = [undefined,"Ctrl","Shift"];
		
		for (var op in opt){
			if (opt[op] === "sb_undefined"){
				opt[op] = undefined;
			}
		}
		var diff = ((opt.changeTabKey != opt.pauseKey)
									&& (opt.changeTabKey != opt.muteKey)
									&& (opt.muteKey != opt.pauseKey));
		if(diff
			&& valids.includes(opt.changeTabKey)
			&& valids.includes(opt.pauseKey)
			&& valids.includes(opt.muteKey)){
			
			browser.storage.local.set({
				menuOptions:{
					changeTabKey:opt.changeTabKey,
					pauseKey:opt.pauseKey,
					muteKey:opt.muteKey
				}
			});
			notifyBackground(opt);
			feedback(false,"OK")
		}else{
			feedback(true,(diff ? "" : "Two action have same modifier"));
		}
  e.preventDefault();
}

function feedback(err,str){
	var elem = document.getElementById("feedback");
	var color = err ? "red":"green";
	var fdb = err ? "Invalid key configuration " + str : "OK";
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
	var retval = str;
	if (str === undefined){
		retval = "sb_undefined";
	}
	return retval
}

function restoreOptions() {

  var gettingItem = browser.storage.local.get(["menuOptions"]);
  gettingItem.then((res) => {
		var options = res.menuOptions;
		document.querySelector("#playbackSelection").value = toSelectValue(options.pauseKey);

		document.querySelector("#switchSelection").value = toSelectValue(options.changeTabKey);

		document.querySelector("#muteSelection").value = toSelectValue(options.muteKey);

  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById("saveButton").addEventListener("click", saveOptions,false);