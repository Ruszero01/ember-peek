import * as T from './vendor/model.js';

export function createGuides(root) {
  const bounds = new T.Box3().setFromObject(root);
  const center = bounds.getCenter(new T.Vector3());
  const group = new T.Group();
  const ground = new T.GridHelper(4, 20, 0x8290a2, 0x8290a2);
  ground.position.set(center.x, bounds.min.y - 0.002, center.z);
  ground.material.transparent = true;
  ground.material.opacity = 0.3;
  ground.material.depthWrite = false;
  ground.visible = false;
  const axes = new T.AxesHelper(1.25);
  axes.position.copy(ground.position);
  axes.visible = false;
  group.add(ground, axes);
  return {group, ground, axes};
}
