(async function(){
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
	var changed = false;
	switch(service){
		case "soundcloud.com":
			if(host == "w.soundcloud.com"){
				window.postMessage(JSON.stringify({method:"toggle"}),"https://"+host);
				changed = true;
			}else{
				media = document.getElementsByClassName("playControl")[0] || null;
				media && media.tagName === "BUTTON" && media.click();
					changed = true;
			}
			break;
		case "soundclick.com":
			media = document.querySelector(".hap-playback-toggle") || null;
			media && media.click();
			changed = true;
			break;
		case "SB_default":
			media = document.getElementsByTagName("video")[0]
						|| document.getElementsByTagName("audio")[0]
						|| null;
			if(media){
				try{
					changed = !(media.paused ? await media.play() : await media.pause());
				}catch(e){
					changed = false;
				}
			}
			break;
		default:
			console.log(service);
	}
	return {changed:changed}
})()