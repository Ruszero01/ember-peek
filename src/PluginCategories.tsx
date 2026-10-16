import { useEffect } from 'react';
import { useT } from './i18n';
import { PLUGIN_CATEGORIES, pluginCategory, type CategoryFilter } from './plugin-categories';
export function PluginCategories({ entries, value, onChange }: { entries: readonly {category?: string | null}[]; value: CategoryFilter; onChange: (value: CategoryFilter) => void }) {
 const t=useT();
 const counts = PLUGIN_CATEGORIES.map(category => ({ category, count: entries.filter(entry => pluginCategory(entry) === category).length })).filter(item => item.count > 0);
 const active = value === 'all' || counts.some(item => item.category === value) ? value : 'all';
 useEffect(() => {
  if (active !== value) onChange(active);
 }, [active, value, onChange]);
 return <div className="plugin-categories" role="group" aria-label={t('plugins.categories.label')}>
  {[{ category: 'all' as const, count: entries.length }, ...counts].map(({category, count})=>{
    return <button key={category} type="button" className={active===category?'is-active':undefined} aria-pressed={active===category} onClick={()=>onChange(category)}>{t(`plugins.category.${category}`)}<span>{count}</span></button>;
  })}
 </div>;
}
