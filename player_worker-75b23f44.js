if(!self.define){let t,e={};const i=(i,a)=>(i=new URL(i+".js",a).href,e[i]||new Promise((e=>{if("document"in self){const t=document.createElement("script");t.src=i,t.onload=e,document.head.appendChild(t)}else t=i,importScripts(i),e()})).then((()=>{let t=e[i];if(!t)throw new Error(`Module ${i} didn’t register its module`);return t})));self.define=(a,s)=>{const n=t||("document"in self?document.currentScript.src:"")||location.href;if(e[n])return;let r={};const l=t=>i(t,n),o={module:{uri:n},exports:r,require:l};e[n]=Promise.all(a.map((t=>o[t]||l(t)))).then((t=>(s(...t),r)))}}define(["./comlink-9648aa2d","./appearance-ebb02b93","./promise_despammer-c45d8fa6"],(function(t,e,i){"use strict";class a{constructor(t){this.id=t,this.is_loading=!1,this.icon_load_callbacks=[]}update(){if(this.data&&this._load_abort){this._load_abort.abort("Data found elsewhere");for(let t of this.icon_load_callbacks)t()}}async blob_promise(){return this.data?Promise.resolve(this.data):this.is_loading?await new Promise(((t,e)=>{let i=()=>{let a=this.icon_load_callbacks.indexOf(i);a>=0&&this.icon_load_callbacks.splice(a,1),this.data?t(this.data):e()};this.icon_load_callbacks.push(i)})):(await this.load(),this.data?this.data:Promise.reject())}async load(){if(this.is_loading)return;if(this.data||!this.load_url)return;let t=this.load_url;this.load_url=void 0;let e=this._load_abort=new AbortController;try{this.is_loading=!0;let i=await fetch(t,{signal:e.signal});if(!i.ok)throw new Error("Fetch returned ("+i.status+") "+i.statusText);let a=await i.blob();if(e==this._load_abort&&(this._load_abort=void 0),!this.data){this.data=a;for(let t of this.icon_load_callbacks)t()}}finally{e&&(e.abort("An error occured"),e==this._load_abort&&(this._load_abort=void 0)),this.is_loading=!1}}load_icon(t){if(this.loading_icon||void 0!==this.icon||!this.data)return;let e=this.data;this.loading_icon=e,(async()=>{try{let i=await t.load_icon(e);if(e==this.data){this.icon=i;for(let t of this.icon_load_callbacks)t()}}finally{this.loading_icon==e&&(this.loading_icon=void 0),this.icon||(this.icon=null)}})()}}function s(t,e){if(1==t.frames.length)return t.frames[0];let i=e%t.total_delay,a=0;for(let e=0;e<t.frames.length;e++){let s=t.frames[e];if(a+=s.delay,a>=i)return s}return t.frames[0]}class n extends class{constructor(t){this.root=new r(this,void 0,0,0,t),this.size_index=t}get size(){return 1<<this.size_index}alloc(t,e){let i=this.root;if(i)return i.alloc(t,e)}expand(){console.log("Resizing atlas to ",this.size<<1),this.size_index++;let t=this.root,e=new r(this,void 0,0,0,this.size_index);t&&(t.reserved||null!=t.children)&&e.make_children(t),this.root=e}}{constructor(t,e,i){super(t),this.hash_to_node=new Map,this.anim_dirs=[],this.static_copy_dirty=!1,this.size_limit=e,this.tex_index=i;let a=this.size;this.expand_command={cmd:"resizeatlas",index:this.tex_index,width:a,height:a}}alloc(t,e){if(t<1||e<1)return;let i=super.alloc(t,e);if(!i)for(;!i&&this.size_index<this.size_limit;)this.expand(),i=super.alloc(t,e);return i}expand(){super.expand();let t=this.size;this.expand_command={cmd:"resizeatlas",index:this.tex_index,width:t,height:t}}add_anim_dir(t){this.anim_dirs.push(t)}update_anim_dirs(t,e){var i;for(let a of this.anim_dirs){if((null===(i=a.atlas_node)||void 0===i?void 0:i.use_index)!=e)continue;let n=s(a,t);if(n==a.current_frame)continue;let r=n.atlas_node,l=a.atlas_node;r&&l&&(this.copy_within_command||(this.copy_within_command={cmd:"atlastexcopywithin",index:this.tex_index,parts:[]}),a.current_frame=n,this.copy_within_command.parts.push({x1:r.x,y1:r.y,x2:l.x,y2:l.y,width:r.width,height:r.height}))}}allocate_icon_state(t){let e=new Map,i=0;for(let a of t.dirs){a.frames.length>1&&i++;for(let t of a.frames)this.hash_to_node.has(t.sprite_hash)||e.set(t.sprite_hash,t.sprite_data)}let a=e.size+i,s=[];for(let e=0;e<a;e++){let e=this.alloc(t.width,t.height);if(!e)break;s.push(e)}if(a!=s.length){for(let t of s)t.free();return!1}let n=s.slice();this.tex_data_command||(this.tex_data_command={cmd:"atlastexdata",index:this.tex_index,parts:[]});for(let[t,i]of e){let e=n.pop();if(!e)break;this.hash_to_node.set(t,e),this.tex_data_command.parts.push(Object.assign({x:e.x,y:e.y},i))}for(let e of t.dirs){for(let t of e.frames){let i=this.hash_to_node.get(t.sprite_hash);t.atlas_node=i,1==e.frames.length&&(e.atlas_node=i,e.current_frame=t)}e.frames.length>1&&(this.add_anim_dir(e),e.atlas_node=n.pop())}return t.atlas=this,!0}add_maptext(t,e){this.tex_maptext_command||(this.tex_maptext_command={cmd:"atlastexmaptext",index:this.tex_index,parts:[]}),this.tex_maptext_command.parts.push({maptext:t,x:e.x,y:e.y,width:e.width,height:e.height})}add_icon_commands(t){if(this.expand_command&&(t.push(this.expand_command),this.expand_command=void 0),this.tex_data_command){let e=0;for(let t of this.tex_data_command.parts)e+=t.data.length;let i=new Uint8Array(e),a=0;for(let t of this.tex_data_command.parts){let e=i.subarray(a,a+t.data.length);e.set(t.data),t.data=e,a+=t.data.length}this.tex_data_command.transferables=[i.buffer],t.push(this.tex_data_command),this.tex_data_command=void 0}this.copy_within_command&&(t.push(this.copy_within_command),this.copy_within_command=void 0),this.tex_maptext_command&&(t.push(this.tex_maptext_command),this.tex_maptext_command=void 0)}}class r{constructor(t,e,i,a,s){this.width=0,this.height=0,this.reserved=!1,this.use_index=0,this.atlas=t,this.parent=e,this.x=i,this.y=a,this.size_index=s,this.largest_avail=s}get full_size(){return 1<<this.size_index}make_children(t){if(this.reserved)throw new Error("Trying to put children on a reserved node");if(this.children)return;let e=this.full_size>>1;this.children=[t||new r(this.atlas,this,this.x,this.y,this.size_index-1),new r(this.atlas,this,this.x+e,this.y,this.size_index-1),new r(this.atlas,this,this.x,this.y+e,this.size_index-1),new r(this.atlas,this,this.x+e,this.y+e,this.size_index-1)],this.update_largest_avail()}alloc(t,e){if(this.reserved)return;if(this.largest_avail<0)return;let i=1<<this.largest_avail,a=this.full_size>>1;if(t>i||e>i)return;if(t>a||e>a){if(this.children)return;return this.reserved=!0,this.width=t,this.height=e,this.update_largest_avail(),this}this.make_children(void 0);let s=this.children;if(s)for(let i=0;i<s.length;i++){let a=s[i];if(a.largest_avail<0)continue;let n=1<<a.largest_avail;if(t<=n&&e<=n){let i=a.alloc(t,e);if(i)return this.update_largest_avail(),i}}}free(){if(!this.reserved)throw new Error("Freeing a non-reserved atlas node");this.reserved=!1,this.unwind()}unwind(){if(this.reserved)return;let t=this.parent;if(t){let e=t.children;if(e){let i=!0;for(let t=0;t<e.length;t++){let a=e[t];if(a.reserved||a.children){i=!1;break}}i&&(t.children=void 0,t.update_largest_avail(),t.unwind())}}}update_largest_avail(){let t=this.children;if(t){this.largest_avail=-1;for(let e=0;e<t.length;e++){let i=t[e];i.largest_avail>this.largest_avail&&(this.largest_avail=i.largest_avail)}}else this.reserved?this.largest_avail=-1:this.largest_avail=this.size_index;let e=this.parent;for(;e;)e.largest_avail=Math.max(e.largest_avail,this.largest_avail),e=e.parent}}class l{constructor(){this.uses_color_matrices=!1,this.blend_mode=1,this.plane=-4,this.float_attribs=new Float32Array(1024*this.get_stride())}write_appearance(t,i,a,s,n){var r,l,o,h,_,c,d,p;void 0===a&&(a=0),void 0===s&&(s=0),void 0===n&&(n=null===(r=i.icon_state_dir)||void 0===r?void 0:r.atlas_node);let f=t*this.get_stride(),m=this.float_attribs;m[f+0]=1,m[f+1]=0,m[f+2]=0,m[f+3]=0,m[f+4]=1,m[f+5]=0;let u=m.subarray(f,f+6),g=null!==(l=null==n?void 0:n.width)&&void 0!==l?l:32,x=null!==(o=null==n?void 0:n.height)&&void 0!==o?o:32;e.matrix_translate(u,-g/2,-x/2),i.transform&&e.matrix_multiply(u,i.transform),e.matrix_translate(u,g/2,x/2),e.matrix_translate(u,a+(null!==(h=null==i?void 0:i.pixel_x)&&void 0!==h?h:0)+(null!==(_=null==i?void 0:i.pixel_w)&&void 0!==_?_:0),s+(null!==(c=null==i?void 0:i.pixel_y)&&void 0!==c?c:0)+(null!==(d=null==i?void 0:i.pixel_z)&&void 0!==d?d:0)),n?(m[f+6]=n.x,m[f+7]=n.y,m[f+8]=n.x+n.width,m[f+9]=n.y+n.height):(m[f+6]=0,m[f+7]=0,m[f+8]=32,m[f+9]=32),m[f+10]=1-Math.max(Math.min(i.layer/e.MAX_LAYER,1),0);let v=null!==(p=i.color_alpha)&&void 0!==p?p:-1;this.uses_color_matrices?i.color_matrix?m.set(i.color_matrix,f+11):(m[f+11]=(255&v)/255,m[f+12]=0,m[f+13]=0,m[f+14]=0,m[f+15]=0,m[f+16]=(v>>8&255)/255,m[f+17]=0,m[f+18]=0,m[f+19]=0,m[f+20]=0,m[f+21]=(v>>16&255)/255,m[f+22]=0,m[f+23]=0,m[f+24]=0,m[f+25]=0,m[f+26]=(v>>24&255)/255,m[f+27]=0,m[f+28]=0,m[f+29]=0,m[f+30]=0):(m[f+11]=(255&v)/255,m[f+12]=(v>>8&255)/255,m[f+13]=(v>>16&255)/255,m[f+14]=(v>>24&255)/255)}get_stride(){return this.uses_color_matrices?31:15}get_size(){return Math.floor(this.float_attribs.length/this.get_stride())}expand(){let t=new Float32Array(2*this.get_size()*this.get_stride());t.set(this.float_attribs),this.float_attribs=t}add_draw(t,e,i){var a,s;if(e>=i)return;let n=this.get_stride(),r=this.float_attribs.slice(e*n,i*n);t.push({cmd:"batchdraw",atlas_index:null!==(s=null===(a=this.atlas)||void 0===a?void 0:a.tex_index)&&void 0!==s?s:0,blend_mode:this.blend_mode,plane:this.plane,use_color_matrix:this.uses_color_matrices,data:r,transferables:[r.buffer],num_elements:i-e})}}const o=[-1,0,1,-1,1,-1,0,1],h=[-1,-1,-1,0,0,1,1,1],_=[0,-1,1,0],c=[-1,0,0,1];function d(t,e,i){let a=Object.assign(Object.assign({},e),{derived_from:e,animate_time:i});return a.sorted_appearances&&(a.sorted_appearances=void 0),a.floating_appearances&&(a.floating_appearances=void 0),p(t,a,i),!a.icon_state_dir||e.dir===a.dir&&e.icon==a.icon&&e.icon_state==e.icon_state||(a.icon_state_dir=void 0),a}function p(t,i,a){t.chain_parent&&t.parallel?p(t.chain_parent,i,a):t.chain_parent&&!t.end_now&&(t.base_appearance=d(t.chain_parent,t.base_appearance,t.start_time),t.end_now=!0);let s=a-t.start_time;if(s<0||s>t.end_time)return;let n=Math.floor(s/t.duration);if(t.loop>0&&n>=t.loop)return;s-=n*t.duration;let r=n>=1?t.end_appearance:t.base_appearance,l=t.end_appearance;for(let a of t.frames){if(s<a.time){let t=a.appearance,n=s/a.time;if(l.dir!=t.dir&&(i.dir=t.dir),l.icon!=t.icon&&(i.icon=t.icon),l.icon_state!=t.icon_state&&(i.icon_state=t.icon_state),l.invisibility!=t.invisibility&&(i.invisibility=t.invisibility),l.maptext&&!t.maptext?i.maptext=null:!l.maptext&&t.maptext&&(i.maptext=t.maptext),t.maptext&&r.maptext&&l.maptext&&i.maptext&&JSON.stringify(t.maptext)!=JSON.stringify(r.maptext)&&(i.maptext={maptext:t.maptext.maptext,x:f(r.maptext.x,t.maptext.x,l.maptext.x,i.maptext.x,n),y:f(r.maptext.y,t.maptext.y,l.maptext.y,i.maptext.y,n),width:f(r.maptext.width,t.maptext.width,l.maptext.width,i.maptext.width,n),height:f(r.maptext.height,t.maptext.height,l.maptext.height,i.maptext.height,n)}),i.pixel_x=f(r.pixel_x,t.pixel_x,l.pixel_x,i.pixel_x,n),i.pixel_y=f(r.pixel_y,t.pixel_y,l.pixel_y,i.pixel_y,n),i.pixel_z=f(r.pixel_z,t.pixel_z,l.pixel_z,i.pixel_z,n),i.pixel_w=f(r.pixel_w,t.pixel_w,l.pixel_w,i.pixel_w,n),i.layer=f(r.layer,t.layer,l.layer,i.layer,n),l.color_alpha!=t.color_alpha||l.color_alpha!=r.color_alpha){let e=i.color_alpha;i.color_alpha=0;for(let a=0;a<32;a+=8){let s=f(r.color_alpha>>a&255,t.color_alpha>>a&255,l.color_alpha>>a&255,e>>a&255,n);i.color_alpha|=(255&Math.round(Math.max(0,Math.min(255,s))))<<a}}if(!e.matrix_equals(l.transform,t.transform)||!e.matrix_equals(l.transform,r.transform)){let s=e.matrix_invert([...l.transform]);if(s){let l=[...i.transform];e.matrix_premultiply(l,s),i.transform=e.matrix_interpolate(r.transform,t.transform,n,a.linear_transform),e.matrix_multiply(i.transform,l)}else i.transform=e.matrix_interpolate(r.transform,t.transform,n,a.linear_transform)}break}r=a.appearance,s-=a.time}}function f(t,e,i,a,s){return t*(1-s)+e*s+a-i}const m=[];class u{get_offset(t){return[0,0]}get_click_target(){return null}is_screen_obj(){return!1}get_floating_overlays(t,i){var a,s;let n=this.get_appearance(t,i);if(n&&e.Appearance.get_appearance_parts(n),!(null===(a=null==n?void 0:n.floating_appearances)||void 0===a?void 0:a.length))return this.floating_overlays=void 0,m;if(n!=(null===(s=this.floating_overlays)||void 0===s?void 0:s.appearance_from)){for(this.floating_overlays||(this.floating_overlays=[]);n.floating_appearances.length>this.floating_overlays.length;)this.floating_overlays.push(new b(this));this.floating_overlays.length=n.floating_appearances.length,this.floating_overlays.appearance_from=n;for(let t=0;t<this.floating_overlays.length;t++)this.floating_overlays[t].appearance=n.floating_appearances[t]}return this.floating_overlays}}class g extends u{constructor(t){super(),this.ref=t,this.appearance=null,this.animation=null,this._loc=null,this.contents=[],this.image_objects=[],this.vis_contents=m,this.anim_appearance=null,this.combined_appearance=null}set loc(t){if(t!=this._loc){if(this._loc){let t=this._get_loc_contents(this._loc).indexOf(this);t>=0&&this._get_loc_contents(this._loc).splice(t,1)}this._loc=t,t&&this._get_loc_contents(t).push(this)}}get loc(){return this._loc}_get_loc_contents(t){return t.contents}get_offset(t){return this._loc instanceof M?this._loc.get_offset(t):[0,0]}get_click_target(){return this}get_appearance(t,e=101,i=100){var a;if(i<=0&&(console.warn(`Deep (possibly looping) vis_contents/images detected at [0x${this.ref.toString(16)}]. Pruning.`),this.vis_contents=m),!this.appearance)return this.combined_appearance=null,null;let s=this.appearance;if(this.animation&&t.time>=this.animation.start_time&&t.time<this.animation.chain_end_time?this.anim_appearance&&this.anim_appearance.animate_time==t.time&&this.anim_appearance.derived_from==s?s=this.anim_appearance:this.anim_appearance=s=d(this.animation,s,t.time):this.anim_appearance=null,this.vis_contents.length||this.image_objects.length){let n=[],r=!1;for(let s of this.image_objects){if(!(null===(a=t.current_images)||void 0===a?void 0:a.has(s.ref)))continue;let l=s.get_appearance(t,i-1,e);l&&(l.override&&(r=!0),n.push(l))}if(s.invisibility<=e)for(let a of this.vis_contents){let s=a.get_appearance(t,i-1);s&&s.invisibility<=e&&n.push(s)}if(!n.length)return this.combined_appearance=null,s;let l=!0;if(this.combined_appearance&&this.combined_appearance.derived_from==s&&n.length==this.combined_appearance.vis_contents_appearances.length){for(let t=0;t<n.length;t++)if(n[t]!=this.combined_appearance.vis_contents_appearances[t]){l=!1;break}}else l=!1;return l&&this.combined_appearance||(this.combined_appearance=Object.assign(Object.assign({},s),{overlays:[...s.overlays,...n],derived_from:s,vis_contents_appearances:n}),(s.invisibility>e||r)&&(this.combined_appearance.invisibility=0,this.combined_appearance.overlays=n,this.combined_appearance.underlays=m,this.combined_appearance.icon=null,this.combined_appearance.icon_state="",this.combined_appearance.icon_state_dir=void 0),this.combined_appearance.floating_appearances&&(this.combined_appearance.floating_appearances=void 0),this.combined_appearance.sorted_appearances&&(this.combined_appearance.sorted_appearances=void 0)),this.combined_appearance}return this.combined_appearance=null,s}}class x extends g{constructor(){super(...arguments),this.last_loc=null,this.loc_change_time=0}get_offset(t){let[i,a]=super.get_offset(t),s=this.loc;if(!(this.appearance&&this.appearance.animate_movement&&this.last_loc instanceof M&&s instanceof M&&s!=this.last_loc&&s.z==this.last_loc.z&&!(t.time<this.loc_change_time)))return[i,a];let n,[r,l]=this.last_loc.get_offset(t),o=r-i,h=l-a;if(Math.abs(o)>32||Math.abs(h)>32)return this.last_loc=null,[i,a];if(n=this.appearance.appearance_flags&e.LONG_GLIDE?Math.max(Math.abs(o),Math.abs(h)):Math.sqrt(o*o+h*h),0==n)return[i,a];let _=n/this.appearance.glide_size*.5,c=Math.max(0,1-(t.time-this.loc_change_time)/_);return[i+o*c,a+h*c]}}class v extends x{constructor(){super(...arguments),this.sight=0,this.see_invisible=0}}class y extends g{_get_loc_contents(t){return t.combined_appearance=null,t.image_objects}}class b extends u{constructor(t){super(),this.parent=t,this.appearance=null}get_offset(t){return this.parent.get_offset(t)}get_appearance(t,e=101){return this.appearance}is_screen_obj(){return this.parent.is_screen_obj()}}class w extends u{constructor(t,e,i){super(),this.parent=t,this.screen_x=e,this.screen_y=i,this.appearance=null}get_offset(t){return[this.screen_x,this.screen_y]}get_appearance(t,e){var i;let a=this.parent.get_appearance(t,e);if(!a||0==a.pixel_x&&0==a.pixel_y&&0==a.pixel_w&&0==a.pixel_z)return this.appearance=null,a;if(a==(null===(i=this.appearance)||void 0===i?void 0:i.derived_from))return this.appearance;let s=Object.assign(Object.assign({},a),{derived_from:a});return s.sorted_appearances&&(s.sorted_appearances=void 0),s.floating_appearances&&(s.floating_appearances=void 0),s.pixel_x=0,s.pixel_y=0,s.pixel_z=0,s.pixel_w=0,this.appearance=s,s}is_screen_obj(){return!0}}class M extends g{constructor(t,e,i,a){super(t),this.x=e,this.y=i,this.z=a}get_offset(t){return[32*this.x,32*this.y]}}class z{constructor(t,e,i,a,s){this.x=t,this.y=e,this.width=i,this.height=a,this.vertical=s,this.line_thickness=0,this.line_length=0}allocate(t,e){if(!(t>this.width||e>this.height)){if(this.vertical){if(this.width-this.line_thickness<t&&this.height-this.line_length<e)return;if(this.height-this.line_length>=e){let i=this.line_length+this.y;return this.line_length+=e,this.line_thickness=Math.max(this.line_thickness,t),{x:this.x,y:i,width:t,height:e}}return this.x+=this.line_thickness,this.line_length=e,this.line_thickness=t,{x:this.x,y:this.y,width:t,height:e}}if(!(this.width-this.line_length<t&&this.height-this.line_thickness<e)){if(this.width-this.line_length>=t){let i=this.line_length+this.x;return this.line_length+=t,this.line_thickness=Math.max(this.line_thickness,e),{x:i,y:this.y,width:t,height:e}}return this.y+=this.line_thickness,this.line_length=t,this.line_thickness=e,{x:this.x,y:this.y,width:t,height:e}}}}}t.expose(class{constructor(e,i){this.frames=[],this.appearance_cache=[],this.resort_set=new Set,this.atoms=[],this.maxx=0,this.maxy=0,this.maxz=0,this.time=0,this.frame_index=-1,this.clients=new Set,this.client_mobs=new Map,this.client_screens=new Map,this.client_images=new Map,this.current_images=void 0,this.resources=[],this.z_level=2,this.use_index=0,this.see_invisible=60,this.change_counter=0,this.last_state_str="",this.last_objects=[],this.current_turfs=new Set,this.current_obscured_turfs=new Set,this.draw_buffer=new l,this.icon_atlases=[new n(8,12,0)],this.maptext_nodes=new Map,this.used_maptext_nodes=new Set,this.frame_listeners=new Set,this.inspect_listeners=new Map,this.show_darkness=!0,self.demo_player=this,this.parser_interface=t.wrap(e),this.icon_loader=t.wrap(i),this.parser_interface.consume_data(t.proxy((async t=>{var e,i,a;try{this.rev_data||(this.rev_data=await this.parser_interface.rev_data);for(let e of t.appearances){let t=e;for(let e=0;e<t.overlays.length;e++){let i=t.overlays[e];"number"==typeof i&&(t.overlays[e]=this.appearance_cache[i])}for(let e=0;e<t.underlays.length;e++){let i=t.underlays[e];"number"==typeof i&&(t.underlays[e]=this.appearance_cache[i])}t.sorted_appearances=void 0,t.icon_state_dir=void 0,t.derived_from=t,this.appearance_cache.push(t)}for(let e of t.frames){let t=e;this.dereference_frame_direction(e.forward),this.dereference_frame_direction(e.backward),this.frames.push(t)}for(let s of t.resource_loads){let t=this.get_resource(s.id);if(s.blob&&(t.data=s.blob,t.load_url=void 0),s.path&&(t.path=s.path,!t.data)){let n="data/paintings/public/";s.path.startsWith(n)&&"yogstation13/Yogstation"==(null===(e=this.rev_data)||void 0===e?void 0:e.repo)?t.load_url="https://cdn.yogstation.net/paintings/"+s.path.substring(n.length):t.load_url=`https://cdn.jsdelivr.net/gh/${(null===(i=this.rev_data)||void 0===i?void 0:i.repo)||"yogstation13/Yogstation"}@${(null===(a=this.rev_data)||void 0===a?void 0:a.commit)||"master"}/${s.path}`}t.update()}this.ui&&this.ui.update_duration(this.get_demo_duration()),this.advance_time()}catch(t){console.error(t)}}))),this.chat_css=this.parser_interface.chat_css}dereference_frame_direction(t){if(t.set_appearance)for(let[e,i]of t.set_appearance)"number"==typeof i&&t.set_appearance.set(e,this.appearance_cache[i]);if(t.set_animation)for(let e of t.set_animation.values())for(;e&&"number"==typeof e.base_appearance;){"number"==typeof e.base_appearance&&(e.base_appearance=this.appearance_cache[e.base_appearance]),"number"==typeof e.end_appearance&&(e.end_appearance=this.appearance_cache[e.end_appearance]);for(let t of e.frames)"number"==typeof t.appearance&&(t.appearance=this.appearance_cache[t.appearance]);e=e.chain_parent}}adjust_z(t){var e;this.z_level+=t,this.z_level<1&&(this.z_level=1),this.z_level>this.maxz&&(this.z_level=this.maxz),null===(e=this.ui)||void 0===e||e.update_hash(this.z_level)}run_frame(i,a,s,n){var r,l,d,p;let f,m;this.follow_ckey="string"==typeof(null===(r=s.follow)||void 0===r?void 0:r.ref)?s.follow.ref:void 0,0!=a&&this.advance_time_relative(i/100*a,a>0),this.current_images=void 0;let u,g,x=0,y=0;if(s.follow){let t=new Set,i=s.follow.ref,a="string"==typeof i?this.client_mobs.get(i):i?this.get_atom(i):null;for("string"==typeof i&&(this.current_images=this.client_images.get(i)),"string"==typeof i&&a instanceof v&&(m=a);a&&!(a.loc instanceof M);)t.has(a)?a=null:(t.add(a),a=a.loc);if(a&&a.loc instanceof M){let[t,s]=a.get_offset(this),n=a.get_appearance(this);if(n&&"string"!=typeof i){for(let t of e.Appearance.get_appearance_parts(n))t.icon_state_dir||(t.icon_state_dir=this.get_appearance_dir(t));let i=e.Appearance.get_display_boundary(n);t+=i.x+i.width/2,s+=i.y+i.height/2}else t+=16,s+=16;"string"==typeof i&&(x=9.5,y=7.5,f=a.loc),u={ref:i,x:t/32,y:s/32},this.z_level=a.loc.z}else u={ref:i,x:0,y:0};let n=u.x-(null!==(l=s.follow.x)&&void 0!==l?l:(s.right+s.left)/2),r=u.y-(null!==(d=s.follow.y)&&void 0!==d?d:(s.top+s.bottom)/2);s.left+=n,s.right+=n,s.bottom+=r,s.top+=r,x&&y&&(g={x:u.x-x,y:u.y-y,width:2*x,height:2*y})}let b={left:Math.max(1,Math.floor(s.left-2)),right:Math.min(this.maxx+1,Math.ceil(s.right+2)),bottom:Math.max(1,Math.floor(s.bottom-2)),top:Math.min(this.maxy+1,Math.ceil(s.top+2))},k=.95*s.pixel_scale;k=k>1?Math.ceil(k):2**Math.ceil(Math.log2(k));let A=2*Math.min(1,1/k),S={left:s.left-A,right:s.right+A,bottom:s.bottom-A,top:s.top+A},j=Math.min(8,32*k);S.left=Math.floor(S.left*j)/j,S.right=Math.ceil(S.right*j)/j,S.bottom=Math.floor(S.bottom*j)/j,S.top=Math.ceil(S.top*j)/j;let E=JSON.stringify([b,S,k,this.change_counter,this.time,this.z_level,n,null===(p=s.follow)||void 0===p?void 0:p.ref]);if(E==this.last_state_str)return[];if(this.last_state_str=E,this.use_index++,!f||m&&m.sight&e.SEE_THRU){for(let t of this.current_turfs)(t.z!=this.z_level||t.x<b.left||t.y<b.bottom||t.x>=b.right||t.y>=b.top)&&this.current_turfs.delete(t);for(let t=b.bottom;t<b.top;t++)for(let e=b.left;e<b.right;e++){let i=this.get_turf(e,t,this.z_level);i&&this.current_turfs.add(i)}this.current_obscured_turfs.clear()}else{let t=function(t,e,i,a,s,n,r=!0,l=1e30){var d,p;let f=e.z,m=e.x,u=e.y;i=Math.floor(i),a=Math.floor(a),s=Math.ceil(s),n=Math.ceil(n);let g=Math.min(i,e.x),x=Math.min(a,e.y),v=Math.max(s,e.x),y=Math.max(n,e.y),b=v-g+1,w=y-x+1;function M(t,e){return t<g||t>v||e<x||e>y?-1:(e-x)*b+(t-g)}let z=[],k=[],A=new Uint16Array(b*w),S=new Uint16Array(b*w),j=new Uint8Array(b*w);for(let e=g;e<=v;e++)for(let i=x;i<=y;i++){let a=Math.abs(e-m),s=Math.abs(i-u),n=t.get_turf(e,i,f),r=M(e,i);if(!n){j[r]=1;continue}(null===(d=n.appearance)||void 0===d?void 0:d.opacity)&&(j[r]|=1),j[r]|=2;for(let t of n.contents)(null===(p=t.appearance)||void 0===p?void 0:p.opacity)&&(j[r]|=1);let l=Math.max(a,s),o=a+s,h=z[l];null==h?z[l]=[n]:h.push(n);let _=k[o];null==_?k[o]=[n]:_.push(n)}for(let t=0;t<z.length-1;t++){let e=z[t+1];if(!e)break;for(let i of e){let e=M(i.x,i.y),a=!1;for(let e=0;e<8;e++){let s=M(o[e]+i.x,h[e]+i.y);if(s>=0&&A[s]==t){a=!0;break}}a&&(1&j[e]?A[e]=65535:A[e]=t+1)}}for(let t=0;t<k.length-1;t++){let e=k[t+1];if(!e)break;for(let i of e){let e=M(i.x,i.y),a=!1;for(let e=0;e<4;e++){let s=M(_[e]+i.x,c[e]+i.y);if(s>=0&&S[s]==t){a=!0;break}}a&&A[e]&&(1&j[e]?S[e]=65535:S[e]=t+1)}}let E=k[0];if(r&&E)for(let t of E){let e=M(t.x,t.y);e>=0&&(S[e]=65535)}let O=Object.assign([],{obscured:[]});for(let t=0;t<z.length;t++){let r=z[t];if(null!=r)for(let o of r){let r=o.x,h=o.y,_=M(r,h);if(!(r<i||h<a||r>s||h>n))if(t<=l||2&j[_])if(S[_])O.push(o);else if(1&j[_]){let t=Math.sign(e.x-r),i=Math.sign(e.y-h);if(t&&i){let e=M(o.x+t,o.y+i),a=M(o.x+t,o.y),s=M(o.x,o.y+i);if(!(1&j[e])&&1&j[a]&&1&j[s]&&S[e]&&S[a]&&S[s]){O.push(o);continue}}let a=M(o.x,o.y+1),s=M(o.x,o.y-1),n=M(o.x+1,o.y),l=M(o.x-1,o.y);S[a]&&S[s]||S[l]&&S[n]?O.push(o):O.obscured.push(o)}else O.obscured.push(o);else O.obscured.push(o)}}return O}(this,f,b.left,b.bottom,b.right,b.top,!0),e=new Set(t);for(let t of this.current_turfs)e.has(t)||this.current_turfs.delete(t);for(let t of e)this.current_turfs.add(t);this.current_obscured_turfs=new Set(t.obscured)}let O=[],T=32*(S.right-S.left),L=32*(S.top-S.bottom),F=Math.max(T,L);for(;F*k>4096;)k>2?k--:k/=2;let U,C=[];for(let t of this.current_turfs){t.appearance&&C.push(t);for(let e of t.contents)e.appearance&&C.push(e)}if(m&&m.sight&(e.SEE_MOBS|e.SEE_OBJS|e.SEE_TURFS)){let t=m.sight&e.SEE_MOBS,i=m.sight&e.SEE_OBJS,a=m.sight&e.SEE_TURFS;for(let e of this.current_obscured_turfs){e.appearance&&a&&C.push(e);for(let a of e.contents)a.appearance&&(a instanceof v?t&&C.push(a):i&&C.push(a))}}if("string"==typeof(null==u?void 0:u.ref)){let t=this.client_screens.get(u.ref);if(t)for(let i of t)i.appearance&&i.appearance.screen_loc&&C.push(...e.Appearance.parse_screen_loc(i.appearance.screen_loc,null==g?void 0:g.width,null==g?void 0:g.height).map((([t,e])=>new w(i,32*t,32*e))))}O.push(U={cmd:"viewport",x:0,y:0,width:Math.ceil(T*k),height:Math.ceil(L*k),world_location:{x:S.left,y:S.bottom,width:S.right-S.left,height:S.top-S.bottom}}),this.draw_object_list(O,C,this.see_invisible,g),O.push({cmd:"copytoviewport",follow_data:u,followview_window:g}),this.last_objects=C;let P=[new z(U.width,0,4096-U.width,U.height,!0),new z(0,U.y,4096,U.height,!1)];for(let t=0;t<n.length;t++){let i=n[t],a=this.get_atom(i.ref),s=a.get_offset(this),r=a.get_appearance(this);if(r)for(let t of e.Appearance.get_appearance_parts(r))t.icon_state_dir||(t.icon_state_dir=this.get_appearance_dir(t));let l=r?e.Appearance.get_display_boundary(r):{x:0,y:0,width:32,height:32};l.x+=s[0],l.y+=s[1],l.width=Math.max(1,l.width),l.height=Math.max(1,l.height);let o=Math.min(i.width/l.width,i.height/l.height);if(o*=.95,o=o>1?Math.ceil(o):2**Math.ceil(Math.log2(o)),l.width/l.height>i.width/i.height){let t=i.height/i.width*l.width-l.height;l.y-=t/2,l.height+=t}else{let t=i.width/i.height*l.height-l.width;l.x-=t/2,l.width+=t}for(;Math.max(l.width,l.height)*o>512;)o>2?o--:o/=2;let h,_=Math.round(o*l.width),c=Math.round(o*l.height);l.width=_/o,l.height=c/o;for(let t of P)if(h=t.allocate(_,c),h)break;h||(O.push({cmd:"flush"}),P=[new z(0,0,4096,4096,!1)],h=P[0].allocate(_,c)),h&&(O.push(Object.assign(Object.assign({cmd:"viewport"},h),{world_location:{x:l.x/32,y:l.y/32,width:l.width/32,height:l.height/32}})),this.draw_object_list(O,[a],101),O.push({cmd:"copytocanvas",canvas_index:t}))}O.push({cmd:"flush"});let $=[];for(let t of this.icon_atlases)t.update_anim_dirs(this.time,this.use_index),t.add_icon_commands($);$.push(...O);let R=[];this.cleanup_maptext();for(let t of $)t.transferables&&R.push(...t.transferables);return t.transfer($,R)}draw_object_list(t,i,a=60,s){var n,r,l;for(let t=0;t<i.length;t++){let e=i[t].get_floating_overlays(this,a);i.push(...e)}let o=this.draw_buffer,h=0;i.sort(((t,i)=>{var s,n,r,l;let o=t.get_appearance(this,a),h=i.get_appearance(this,a),_=e.Appearance.resolve_plane(null!==(s=null==o?void 0:o.plane)&&void 0!==s?s:0),c=e.Appearance.resolve_plane(null!==(n=null==h?void 0:h.plane)&&void 0!==n?n:0);return _!=c?_-c:(null!==(r=null==o?void 0:o.layer)&&void 0!==r?r:0)-(null!==(l=null==h?void 0:h.layer)&&void 0!==l?l:0)}));for(let _ of i){let[i,c]=_.get_offset(this);if(_.is_screen_obj()){if(!s)continue;i+=32*s.x,c+=32*s.y}let d=_.get_appearance(this,a);if(d&&!(d.invisibility>a)&&(!e.Appearance.is_lighting_plane(d.plane)||this.show_darkness))for(let a of e.Appearance.get_appearance_parts(d)){if(!a.icon_state_dir){let t=this.get_appearance_dir(a,o.atlas);t&&(a.icon_state_dir=t)}if((null===(n=a.icon_state_dir)||void 0===n?void 0:n.atlas_node)&&(o.atlas==(null===(r=a.icon_state_dir.atlas_node)||void 0===r?void 0:r.atlas)&&e.Appearance.is_lighting_plane(o.plane)==e.Appearance.is_lighting_plane(a.plane)&&o.uses_color_matrices==!!a.color_matrix||(h&&(o.add_draw(t,0,h),h=0),o.atlas=null===(l=a.icon_state_dir.atlas_node)||void 0===l?void 0:l.atlas,o.blend_mode=a.blend_mode,o.plane=a.plane,o.uses_color_matrices=!!a.color_matrix),a.icon_state_dir.atlas_node.use_index=this.use_index,h>=o.get_size()&&o.expand(),o.write_appearance(h++,a,i,c)),a.maptext&&a.maptext.maptext){let s=this.get_maptext(a.maptext);o.atlas==s.atlas&&e.Appearance.is_lighting_plane(o.plane)==e.Appearance.is_lighting_plane(a.plane)&&o.uses_color_matrices==!!a.color_matrix||(h&&(o.add_draw(t,0,h),h=0),o.atlas=s.atlas,o.blend_mode=a.blend_mode,o.plane=a.plane,o.uses_color_matrices=!!a.color_matrix),s.use_index=this.use_index,h>=o.get_size()&&o.expand(),o.write_appearance(h++,{layer:a.layer,color_alpha:a.color_alpha,color_matrix:a.color_matrix,pixel_w:a.pixel_w,pixel_x:a.pixel_x,pixel_y:a.pixel_y,pixel_z:a.pixel_z,transform:e.matrix_multiply([1,0,a.maptext.x,0,1,a.maptext.y],a.transform)},i,c,s)}}}h&&(o.add_draw(t,0,h),h=0)}get_appearance_dir(t,e){var i;if(null==t.icon)return;let a=this.get_resource(t.icon);if(!a.data)return void a.load();if(!a.icon)return void a.load_icon(this.icon_loader);let s,n=a.icon;if(t.icon_state&&(s=n.icon_states.get(t.icon_state)),s||(s=n.icon_states.get("")),s||(s=n.icon_states.get(" ")),!s)return;s.atlas||this.allocate_icon_state(s,e);let r=t.dir;s.dirs.length<=4&&(5!=r&&6!=r||(r=4),9!=r&&10!=r||(r=8));let l=null!==(i=[0,1,0,0,2,6,4,2,3,7,5,3,2,1,0,0][r])&&void 0!==i?i:0;return s.dirs[l&s.dirs.length-1]}allocate_icon_state(t,e){if(e&&e.allocate_icon_state(t))return;for(let i of this.icon_atlases)if(i!=e&&i.allocate_icon_state(t))return;console.log("Creating new atlas #"+this.icon_atlases.length);let i=new n(8,12,this.icon_atlases.length);if(this.icon_atlases.push(i),!i.allocate_icon_state(t))throw this.icon_atlases.pop(),t.atlas=null!=e?e:this.icon_atlases[0],new Error("FAILED TO ALLOCATE ICON STATE ("+t.width+", "+t.height+") ATLAS SIZE: "+i.size_index)}allocate_surface(t,e,i){if(i){let a=i.alloc(t,e);if(a)return a}for(let a of this.icon_atlases)if(a!=i){let i=a.alloc(t,e);if(i)return i}console.log("Creating new atlas #"+this.icon_atlases.length);let a=new n(8,12,this.icon_atlases.length);this.icon_atlases.push(a);let s=a.alloc(t,e);if(s)return s;throw this.icon_atlases.pop(),new Error("FAILED TO ALLOCATE SURFACE ("+t+", "+e+") ATLAS SIZE: "+a.size_index)}get_maptext(t,e){let i=`${t.width}x${t.height} ${t.maptext}`,a=this.maptext_nodes.get(i);if(!a){a=this.allocate_surface(t.width,t.height,e),a.atlas.add_maptext(t.maptext,a),this.maptext_nodes.set(i,a)}return this.used_maptext_nodes.add(a),a}cleanup_maptext(){for(let[t,e]of this.maptext_nodes)this.used_maptext_nodes.has(e)||(e.free(),this.maptext_nodes.delete(t));this.used_maptext_nodes.clear()}get_demo_duration(){return this.frames.length?this.frames[this.frames.length-1].time:0}initialize_ui(){this.ui&&(this.ui.update_time(this.time),this.ui.update_duration(this.get_demo_duration()))}advance_time_relative(t,e=!1){let i=this.time,a=this.get_demo_duration();if(t<0)i=Math.min(i+t,a);else{if(t>0&&i>=a)return;i=Math.max(Math.min(i+t,a),i)}this.advance_time(i,e)}advance_time(t=this.time,e=!1){t<0&&(t=0);let i=this.frame_index;if(t<this.time)for(;this.frames[this.frame_index]&&t<this.frames[this.frame_index].time;)this.undo_frame(this.frames[this.frame_index]),this.time=Math.min(this.time,this.frames[this.frame_index].time),this.frame_index--;else for(;this.frames[this.frame_index+1]&&t>=this.frames[this.frame_index+1].time;)this.frame_index++,this.apply_frame(this.frames[this.frame_index],e),this.time=this.frames[this.frame_index].time,this.frames[this.frame_index].time<=0&&(this.frames.splice(this.frame_index,1),this.frame_index--);if(i!=this.frame_index)for(let t of this.frame_listeners)t(this.frame_index);this.time!=t&&this.ui&&this.ui.update_time(t),this.time=t}apply_frame(t,e=!1){if(this.apply_frame_direction(t,t.forward,!0),e&&this.ui&&t.sounds){let e=t.sounds.filter((t=>t.recipients.includes("world")||t.recipients.includes(this.follow_ckey)));e.length&&this.ui.handle_sounds(e)}this.change_counter++}undo_frame(t){this.apply_frame_direction(t,t.backward,!1),this.change_counter++}apply_frame_direction(t,e,i=!0){if(e.resize&&([this.maxx,this.maxy,this.maxz]=e.resize,this.adjust_z(0)),e.set_appearance)for(let[t,i]of e.set_appearance){let e=this.get_atom(t);e.appearance=i,this.trigger_inspect_listeners(e),this.resort_set.add(e)}if(e.set_loc)for(let[a,s]of e.set_loc){let e=this.get_atom(a),n=e.loc;i&&e instanceof x&&(e.last_loc=e.loc,e.loc_change_time=t.time),e.loc=s?this.get_atom(s):null,this.trigger_inspect_listeners(n),this.trigger_inspect_listeners(e.loc),this.trigger_inspect_listeners(e),this.resort_set.add(e)}if(e.set_last_loc)for(let[t,i]of e.set_last_loc){let e=this.get_atom(t);e instanceof x&&(e.last_loc=i?this.get_atom(i):null)}if(e.set_loc_change_time)for(let[t,i]of e.set_loc_change_time){let e=this.get_atom(t);e instanceof x&&(e.loc_change_time=i)}if(e.set_vis_contents)for(let[t,i]of e.set_vis_contents){this.get_atom(t).vis_contents=i.length?i.filter(Boolean).map((t=>this.get_atom(t))):m}if(e.set_mobextras)for(let[t,i]of e.set_mobextras){let e=this.get_atom(t);e instanceof v&&(e.sight=i.sight,e.see_invisible=i.see_invisible)}if(e.set_animation)for(let[t,i]of e.set_animation){this.get_atom(t).animation=i}if(e.set_client_status)for(let[t,i]of e.set_client_status)i?this.clients.add(t):this.clients.delete(t),this.trigger_inspect_listeners(this.client_mobs.get(t));if(e.set_mob)for(let[t,i]of e.set_mob){let e=this.client_mobs.get(t);i?(this.client_mobs.set(t,this.get_atom(i)),this.trigger_inspect_listeners(this.get_atom(i))):this.client_mobs.delete(t),this.trigger_inspect_listeners(e)}if(e.set_client_screen)for(let[t,i]of e.set_client_screen){let e=this.client_screens.get(t);e||(e=[],this.client_screens.set(t,e)),e.length=0;for(let t of i)t&&e.push(this.get_atom(t))}if(e.client_del_images)for(let[t,i]of e.client_del_images){let e=this.client_images.get(t);e||(e=new Set);for(let t of i)e.delete(t);this.client_images.set(t,e)}if(e.client_add_images)for(let[t,i]of e.client_add_images){let e=this.client_images.get(t);e||(e=new Set);for(let t of i)e.add(t);this.client_images.set(t,e)}}get_chat_messages(t,e=0,i=this.frames.length){e=Math.max(0,e),i=Math.min(i,this.frames.length);let a=[];for(let s=e;s<i;s++){let e=this.frames[s];if(e.chat)for(let i of e.chat)(i.clients.includes(t)||i.clients.includes("world"))&&a.push({message:i.message,frame_index:s,time:e.time})}return a}add_frame_listener(e){let a=i.despam_promise(e);return this.frame_listeners.add(a),a(this.frame_index),t.proxy((()=>{this.frame_listeners.delete(a),e[t.releaseProxy]()}))}add_inspect_listener(e,a){let s=this.get_atom(e),n=i.despam_promise((async()=>{var t,i,n,r;let l={name:null!==(i=null===(t=s.appearance)||void 0===t?void 0:t.name)&&void 0!==i?i:"null",ref:e,clients:this.get_object_clients(s),loc:s.loc?{name:null!==(r=null===(n=s.loc.appearance)||void 0===n?void 0:n.name)&&void 0!==r?r:"null",ref:s.loc.ref}:null,contents:s.contents.map((t=>{var e,i;return{name:null!==(i=null===(e=t.appearance)||void 0===e?void 0:e.name)&&void 0!==i?i:"null",ref:t.ref}}))};try{await a(l)}catch(t){console.error(t)}}));n();let r=this.inspect_listeners.get(s);return r||this.inspect_listeners.set(s,r=[]),r.push(n),t.proxy((()=>{var e;let i=null!==(e=null==r?void 0:r.indexOf(n))&&void 0!==e?e:-1;i>=0&&(null==r||r.splice(i,1)),(null==r?void 0:r.length)||this.inspect_listeners.get(s)!=r||this.inspect_listeners.delete(s),a[t.releaseProxy]()}))}trigger_inspect_listeners(t){if(!t)return;let e=this.inspect_listeners.get(t);if(e)for(let t of e)t()}get_object_clients(t){if(t.ref>>24!=3)return[];let e=[];for(let[i,a]of this.client_mobs)a==t&&this.clients.has(i)&&e.push(i);return e}get_objects_through_point(t,i){var a,s,n,r;let l=[],o=new Set,h=this.get_turf(Math.floor(t),Math.floor(i),this.z_level);h&&(o.add(h),l.push({name:null!==(s=null===(a=h.appearance)||void 0===a?void 0:a.name)&&void 0!==s?s:"null",ref:h.ref,clients:[]}));for(let a of this.last_objects){let s=a.get_click_target();if(!s||o.has(s))continue;let[h,_]=a.get_offset(this),c=a.get_appearance(this);c&&e.Appearance.check_appearance_click(c,32*t-h,32*i-_,!0)&&(o.add(s),l.push({name:null!==(r=null===(n=s.appearance)||void 0===n?void 0:n.name)&&void 0!==r?r:"null",ref:s.ref,clients:this.get_object_clients(s)}))}return l.reverse(),l}get_clicked_object_ref(t,i){let a=this.last_objects;for(let s=a.length-1;s>=0;s--){let n=a[s],r=n.get_click_target();if(!r)continue;let[l,o]=n.get_offset(this),h=n.get_appearance(this);if(h&&e.Appearance.check_appearance_click(h,32*t-l,32*i-o,!1))return r.ref}}get_clients_mobs(){var t,e,i;let a=[];for(let s of[...this.clients].sort()){let n=this.client_mobs.get(s);a.push({name:null!==(e=null===(t=null==n?void 0:n.appearance)||void 0===t?void 0:t.name)&&void 0!==e?e:"null",ref:null!==(i=null==n?void 0:n.ref)&&void 0!==i?i:0,ckey:s})}return a}get_atom(t){let e=(4278190080&t)>>>24,i=16777215&t,a=this.atoms[e];a||(a=this.atoms[e]=[]);let s=a[i];if(!s){if(1==e){let e=i%this.maxx+1,a=Math.floor(i/this.maxx),n=a%this.maxy+1,r=Math.floor(a/this.maxy)+1;s=new M(t,e,n,r)}else s=3==e?new v(t):2==e?new x(t):13==e?new y(t):new g(t);a[i]=s}return s}get_turf(t,e,i){if(t<1||t>this.maxx)return;if(e<1||e>this.maxy)return;if(i<1||i>this.maxz)return;let a=t-1+16777216+(e-1+(i-1)*this.maxy)*this.maxx;return this.get_atom(a)}get_resource(t){let e=this.resources[t];return e||(e=new a(t),e.icon_load_callbacks.push((()=>{this.change_counter++})),this.resources[t]=e),e}get_resource_blob(t){return this.get_resource(t).blob_promise()}toggle_darkness(){this.show_darkness=!this.show_darkness,this.change_counter++}set_see_invisible(t=60){this.see_invisible=t,this.change_counter++}dump_textures(){var t;null===(t=this.ui)||void 0===t||t.dump_textures(),this.change_counter++}})}));
