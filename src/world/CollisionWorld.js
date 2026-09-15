import * as THREE from 'three';
export class CollisionWorld {
  constructor(){this.circles=[];this._push=new THREE.Vector2();}
  addCircle(x,z,radius){const circle={x,z,radius,active:true};this.circles.push(circle);return circle;}
  resolve(position,radius){
    for(const obstacle of this.circles){
      if(!obstacle.active)continue;
      this._push.set(position.x-obstacle.x,position.z-obstacle.z);
      const minimum=radius+obstacle.radius,distance=this._push.length();
      if(distance>=minimum)continue;
      if(distance<.001)this._push.set(1,0);else this._push.normalize();
      position.x=obstacle.x+this._push.x*minimum;position.z=obstacle.z+this._push.y*minimum;
    }
    return position;
  }
}
