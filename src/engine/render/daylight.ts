import { Color, type DirectionalLight, type Fog, type HemisphereLight } from 'three';

const night = new Color(0x263453), day = new Color(0xa8d4ee);
const dawn = new Color(0xffbc96), dusk = new Color(0xd890ad);
const moon = new Color(0xb8ccff), noon = new Color(0xffedcd), gold = new Color(0xffb472);
const nightBounce = new Color(0x505e8e), dayBounce = new Color(0xc4e9ff);
const waterTint = new Color(0x378e93), deepTint = new Color(0x18465f);
const smooth = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };

/** Paint the existing sky, fog and two lights. No extra draw or postprocessing pass. */
export function lightCycle(time: number, sky: Color, fog: Color, sun: DirectionalLight, ambient: HemisphereLight) {
  const altitude = -Math.cos(time * Math.PI * 2);
  const daylight = smooth((altitude + .19) / .9);
  const twilight = smooth(1 - Math.abs(altitude) / .44);
  const horizon = time < .5 ? dawn : dusk;
  sky.copy(night).lerp(day, daylight).lerp(horizon, twilight * .66);
  fog.copy(sky).lerp(horizon, twilight * .55);
  ambient.color.copy(nightBounce).lerp(dayBounce, daylight).lerp(horizon, twilight * .28);
  ambient.intensity = .55 + daylight * 1.15;
  sun.color.copy(moon).lerp(noon, daylight).lerp(gold, twilight);
  sun.intensity = .36 + daylight * 1.84 + twilight * .65;
  return Math.max(0, altitude);
}

/** Apply after daylight resets the lights. A narrow waterline softens bobbing at the surface. */
export function waterAtmosphere(depth: number, range: number, sky: Color, fog: Fog, sun: DirectionalLight, ambient: HemisphereLight) {
  fog.far = range;
  fog.near = Math.max(15, range * .5);
  if (depth <= 0) return;
  const wet = smooth(depth / .18), deep = smooth(depth / 8);
  const daylight = ambient.intensity / 1.7;
  fog.color.lerp(waterTint, wet).lerp(deepTint, deep).multiplyScalar(1 - wet * (1 - daylight));
  sky.lerp(fog.color, wet);
  fog.near += (.5 - fog.near) * wet;
  fog.far += (21 - 12 * deep - fog.far) * wet;
  sun.color.lerp(waterTint, wet * (.25 + .45 * deep));
  sun.intensity *= 1 - wet * (.24 + .55 * deep);
  ambient.color.lerp(waterTint, wet * .35);
  ambient.intensity *= 1 - wet * (.12 + .38 * deep);
}
