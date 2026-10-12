export function modelAppearance(values, current = {}, touched = new Set()) {
  return Object.fromEntries(['ground', 'axes', 'wire'].map(key =>
    [key, touched.has(key) ? current[key] === true : values[key] === true]));
}
