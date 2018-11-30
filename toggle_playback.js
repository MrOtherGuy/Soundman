(async function(){
	let status = await browser.runtime.sendMessage({message:"isPaused"});
	if(!status){
		return {changed:false}
	}

	let method = status.paused ? "play" : "pause";
	let host = document.location.host.toString();
	let specialCases = ["soundcloud.com","soundclick.com"];
	let service = "SB_default";
	for (let test of specialCases){
		if (host.indexOf(test) != -1){
			service = test;
			break;
		}
	}
	let media;
	let changed = false;
	switch(service){
		case "soundcloud.com":
			if(host == "w.soundcloud.com"){
				window.postMessage(JSON.stringify({"method": method}),"https://"+host);
				changed = true;
			}else{
				media = document.querySelector(".playControls__play" + (status.paused ? ":not(.playing)" : ".playing")) || null;
				if (media){
					media.click();
					changed = true;
				}
			}
			break;
		case "soundclick.com":
			media = document.querySelector(".hap-playback-toggle>.fa-" + method) || null;
			if(media){
				media.click();
				changed = true;
			}
			break;
		case "SB_default":
			media = document.getElementsByTagName("video")[0]
						|| document.getElementsByTagName("audio")[0]
						|| null;
			if(media){
				if(media.paused === status.paused && !media.ended && media.currentTime > 0){
					try{
						changed = !(status.paused ? await media.play() : media.pause());
					}catch(e){
						changed = false;
					}
				}
			}
			break;
		default:
			console.log("unexpected service: " + service);
	}

	return {changed:changed, frameId:status.frameId}
})()