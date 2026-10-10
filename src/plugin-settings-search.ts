import { pinyin } from 'pinyin-pro';
import type { Plugin } from './types';

type SearchText = { text: string; full: string; initials: string };
const indexes = new Map<string, SearchText>();
const MAX_INDEXES = 512;
const normalize = (value: string) => value.normalize('NFKC').toLowerCase();

/** Cache by metadata content so runtime polling does not repeat transliteration. */
function searchText(value: string): SearchText {
 const text=normalize(value);
 const cached=indexes.get(text);
 if(cached)return cached;
 const chinese=/\p{Script=Han}/u.test(text);
 const index={text,
  full:chinese?pinyin(text,{toneType:'none',type:'array'}).join('').replace(/[ \t]/g,''):text,
  initials:chinese?pinyin(text,{toneType:'none',pattern:'first',type:'array'}).join('').replace(/[ \t]/g,''):text,
 };
 if(indexes.size>=MAX_INDEXES)indexes.delete(indexes.keys().next().value!);
 indexes.set(text,index);
 return index;
}

/** Search display metadata only; persisted values and hidden settings never enter the index. */
export function searchPluginSettings(plugins: readonly Plugin[], query: string) {
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 const rows=plugins.map((plugin,index)=>({plugin,index}));
 if(!words.length)return rows;
 return rows.filter(({plugin})=>{
  const fields=[plugin.name,plugin.id,...plugin.settings.filter(setting=>!setting.hidden).flatMap(setting=>[setting.label,setting.help??'',...('options' in setting && Array.isArray(setting.options)?setting.options.map(option=>option.label):[])])];
  const index=searchText(fields.join('\n'));
  return words.every(word=>index.text.includes(word)||index.full.includes(word)||index.initials.includes(word));
 });
}
