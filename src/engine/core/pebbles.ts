/** Centres and dimensions in cell-local coordinates. Shapes are shared by meshing,
 * DDA fine picking and selection outlines (no GPU or world state). */
const shapes = [1,-1].map(flip => [
  [-.16,.09,.32,.17,.24], [.17,-.13,.22,.11,.26], [.22,.17,.15,.08,.12],
].map(([x,z,w,h,d]) => ({ x:x*flip, y:-.5+h/2, z, w,h,d })));

export const pebbleShapes = (x:number,z:number) => shapes[(x ^ z) & 1];
