export const PLUGIN_CATEGORIES = ['media', 'office', 'design', 'text', 'tools', 'other'] as const;
export type PluginCategory = typeof PLUGIN_CATEGORIES[number];
export type CategoryFilter = PluginCategory | 'all';
type Categorized = { category?: string | null };
/** Classification is declared by the package, never inferred from its identity or file types. */
export function pluginCategory(plugin: Categorized): PluginCategory {
  return PLUGIN_CATEGORIES.includes(plugin.category as PluginCategory) ? plugin.category as PluginCategory : 'other';
}
export function groupPlugins<T extends Categorized>(plugins: readonly T[]) {
  return PLUGIN_CATEGORIES.map(category => ({ category, entries: plugins.filter(plugin => pluginCategory(plugin) === category) })).filter(group => group.entries.length > 0);
}
export function matchesCategory(plugin: Categorized, category: CategoryFilter) { return category === 'all' || pluginCategory(plugin) === category; }
