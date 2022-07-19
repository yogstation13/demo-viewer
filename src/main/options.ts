interface OptionsKeys {
	"startup_chat": "true"|"false";
	"startup_chat_transparent": "true"|"false";
	//"scroll_mode": "zoom"|"pan";
}

const default_options : OptionsKeys = {
	"startup_chat": "true",
	"startup_chat_transparent": "true",
	//"scroll_mode": "zoom"
}

type OptionKey = keyof OptionsKeys;
type OptionValue<T extends OptionKey = OptionKey> = OptionsKeys[T];

export namespace PlayerOptions {
	let backup_map = new Map<OptionKey, OptionValue>();
	export function get<T extends OptionKey>(key : T) : OptionValue<T> {
		try {
			return <OptionValue<T>>localStorage.getItem("dvmt-" + key) ?? default_options[key];
		} catch(e) {
			console.error(e);
			return <OptionValue<T>>backup_map.get(key) ?? default_options[key];
		}
	}
	export function set<T extends OptionKey>(key : T, value : OptionValue) {
		backup_map.set(key, value);
		if(window.localStorage) {
			if(value == default_options[key])
				localStorage.removeItem("dvmt-" + key);
			else
				localStorage.setItem("dvmt-" + key, value);
		}
	}
}