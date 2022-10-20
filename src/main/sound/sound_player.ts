import { DemoSound } from "../../parser/base_parser";
import { DemoPlayerUi } from "../ui";

export class DemoSoundPlayer {
	ctx : AudioContext = new AudioContext();
	sound_buffers : (Promise<AudioBuffer|undefined>|undefined)[] = [];

	constructor(public ui : DemoPlayerUi) {
		
	}

	get_sound_buffer(id : number) {
		if(this.sound_buffers[id]) return this.sound_buffers[id];
		let buffer_promise = this.ui.player.get_resource_blob(id).then(async blob => {
			try {
				return await this.ctx.decodeAudioData(await blob.arrayBuffer());
			} catch(e) {
				console.error(e);
				return undefined;
			}
		});
		buffer_promise.catch((e) => {
			if(this.sound_buffers[id] == buffer_promise) this.sound_buffers[id] = undefined;
		});
		this.sound_buffers[id] = buffer_promise;
		return buffer_promise;
	}

	async play(sound : DemoSound) {
		let buffer : AudioBuffer|undefined;
		for(let res of sound.resources) {
			try {
				buffer = await this.get_sound_buffer(res);
			} catch(e) {}
			if(buffer) break;
		}
		if(!buffer) return;
		
		let source = this.ctx.createBufferSource();
		source.buffer = buffer;
		if(sound.frequency != 0) {
			if(sound.frequency >= -100 && sound.frequency <= 100) {
				source.playbackRate.value = sound.frequency;
			} else {
				source.playbackRate.value = sound.frequency / buffer.sampleRate;
			}
		}
		let prev : AudioNode = source;

		let gain = this.ctx.createGain();
		prev.connect(gain);
		prev = gain;
		gain.gain.value = sound.volume / 100;

		if(sound.x || sound.y || sound.z) {
			let pan = this.ctx.createPanner();
			prev.connect(pan);
			prev = pan;
			pan.positionX.value = sound.x;
			pan.positionY.value = sound.y;
			pan.positionZ.value = -sound.z;
			pan.rolloffFactor = sound.falloff;
		}

		prev.connect(this.ctx.destination);

		source.start();
	}

	handle_sounds(sounds : DemoSound[]) : void {
		console.log(sounds);
		for(let sound of sounds) this.play(sound);
	}
}