import { clamp, fbm, hash } from './noise';

type Node = { i:number; j:number; x:number; z:number; potential:number };
type Reach = { ax:number; az:number; dx:number; dz:number; inv:number; width:number; lake:boolean };
const neighbors = [[-1,0],[0,-1],[1,0],[0,1]] as const;

/** All caches are disposable accelerators. An outlet is chosen from world coordinates
 * and strictly decreases in potential; reach admission looks only a bounded distance upstream. */
export class Drainage {
  readonly spacing:number;
  private nodes = new Map<string, Node>();
  private outlets = new Map<Node, Node | null>();
  private regions = new Map<string, Reach[]>();
  private lastI = Infinity;
  private lastJ = Infinity;
  private last: Reach[] = [];
  readonly seed:number;
  readonly radius:number|null;
  readonly density:number;
  constructor(seed:number, radius:number|null, density:number) {
    this.seed=seed; this.radius=radius; this.density=density;
    this.spacing = radius === null ? 64 : clamp(Math.round(radius / 3), 16, 64);
  }
  continent(x:number,z:number) {
    if (this.radius === null) return fbm(this.seed+2011,x/320,z/320,3);
    // On a pocket world choose an actual island-scale coastline, with a dry interior.
    return .78 - .53 * Math.hypot(x,z)/this.radius + .22 * (fbm(this.seed+2011,x/this.radius,z/this.radius,2)-.5);
  }
  private node(i:number,j:number) {
    const key = `${i},${j}`;
    let n = this.nodes.get(key);
    if (!n) {
      const s=this.spacing, x=(i+.22+.56*hash(this.seed,i,j,31))*s, z=(j+.22+.56*hash(this.seed,i,j,32))*s;
      n = {i,j,x,z,potential:this.continent(x,z)+.13*hash(this.seed,i,j,33)};
      this.nodes.set(key,n);
    }
    return n;
  }
  private outlet(n:Node) {
    const known=this.outlets.get(n);
    if (known!==undefined) return known;
    let best:Node|null=null, grade=0;
    for(const [di,dj] of neighbors) {
      const next=this.node(n.i+di,n.j+dj);
      const drop=(n.potential-next.potential)/Math.hypot(n.x-next.x,n.z-next.z);
      if(drop>grade) { best=next; grade=drop; }
    }
    this.outlets.set(n,best); return best;
  }
  private upstream(n:Node, depth:number):number {
    if (!depth) return 0;
    let count=0;
    for(const [di,dj] of neighbors) {
      const p=this.node(n.i+di,n.j+dj);
      if(this.outlet(p)===n) count = Math.max(count, 1+this.upstream(p,depth-1));
    }
    return count;
  }
  private plan(i:number,j:number) {
    const key=`${i},${j}`, cached=this.regions.get(key);
    if(cached) return cached;
    if(this.regions.size>=128) this.regions.delete(this.regions.keys().next().value!);
    if(this.nodes.size>4096) { this.nodes.clear(); this.outlets.clear(); }
    const list:Reach[]=[], s=this.spacing;
    function add(ax:number,az:number,bx:number,bz:number,width:number,lake=false) {
      const dx=bx-ax,dz=bz-az; list.push({ax,az,dx,dz,inv:1/(dx*dx+dz*dz||1),width,lake});
    }
    // Cardinal edges extend at most one grid cell; the extra ring covers the bank profile.
    const reach=1+Math.ceil(26/s);
    for(let ix=i-reach;ix<=i+reach;ix++) for(let iz=j-reach;iz<=j+reach;iz++) {
      const n=this.node(ix,iz), next=this.outlet(n), order=this.upstream(n,3);
      // Longest upstream path cannot shorten downstream, so filtering springs
      // by order never cuts a retained channel off before its outlet.
      const threshold=this.density<.8 ? 3 : this.density<1.35 ? 2 : 1;
      if(order<threshold) continue;
      const width=clamp((1.9+order*.85)*s/64,1.35,6);
      if(!next) { add(n.x,n.z,n.x,n.z,width*1.8,true); continue; }
      const bend=(hash(this.seed,ix,iz,37)-.5)*.3;
      const mx=(n.x+next.x)/2-(next.z-n.z)*bend, mz=(n.z+next.z)/2+(next.x-n.x)*bend;
      add(n.x,n.z,mx,mz,width); add(mx,mz,next.x,next.z,width);
    }
    this.regions.set(key,list);return list;
  }
  sample(x:number,z:number) {
    if(this.density<=0) return {bank:Infinity,lake:false};
    const i=Math.floor(x/this.spacing), j=Math.floor(z/this.spacing);
    if(i!==this.lastI||j!==this.lastJ) { this.last=this.plan(i,j);this.lastI=i;this.lastJ=j; }
    let bank=26, lake=false;
    for(const r of this.last) {
      const px=x-r.ax,pz=z-r.az;
      const t=clamp((px*r.dx+pz*r.dz)*r.inv);
      const d=Math.sqrt((px-t*r.dx)**2+(pz-t*r.dz)**2)-r.width;
      if(d<bank) {bank=d;lake=r.lake;}
    }
    return {bank,lake};
  }
}
