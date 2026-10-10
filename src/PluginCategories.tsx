import { useT } from './i18n';
import { PLUGIN_CATEGORIES, pluginCategory, type CategoryFilter } from './plugin-categories';
export function PluginCategories({ entries, value, onChange }: { entries: readonly {category?: string | null}[]; value: CategoryFilter; onChange: (value: CategoryFilter) => void }) {
 const t=useT();
 return <div className="plugin-categories" role="group" aria-label={t('plugins.categories.label')}>
  {(['all',...PLUGIN_CATEGORIES] as const).map(category=>{const count=category==='all'?entries.length:entries.filter(entry=>pluginCategory(entry)===category).length;
    return <button key={category} type="button" className={value===category?'is-active':undefined} aria-pressed={value===category} onClick={()=>onChange(category)}>{t(`plugins.category.${category}`)}<span>{count}</span></button>;
  })}
 </div>;
}
