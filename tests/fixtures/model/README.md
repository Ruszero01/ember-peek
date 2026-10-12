# Model fixture

`saved-base-mesh.blend` is an original synthetic Blender 3.4 scene created for this repository: a red cube translated along X, with an unapplied subdivision modifier. It verifies that preview reads the saved base mesh, material and transform without evaluating modifiers or requiring Blender at runtime. It contains no user assets and follows the repository Apache-2.0 license.

`saved-lines.c4d` is an original synthetic scene saved with Cineware S22: one translated blue spline with separate open and closed segments, no polygon meshes. It verifies that line-only engineering files produce interactive geometry, preserve segmentation, closure, transform and color, and do not fall back to a thumbnail. It contains no user assets or SDK source and follows the repository Apache-2.0 license.
