"use strict";(()=>{var ua=1;var fa=3,bn=0,cr=1,ii=2;var da=1;var pa=100;var ma=204,ga=205;var xs=0,ys=1,vs=2,Gi=3,Ss=4,Ms=5,bs=6,Ts=7,Bs=0,_a=1,xa=2;var Os=1,zs=2,Vs=3,ks=4,Gs=5,Hs=6,Ws=7;var Xs=300,ya=301,qs=302;var va=306,ws=1e3,Kn=1001,As=1002;var Sa=1006;var Ma=1008;var ba=1009;var Ta=1015;var wa=1023;var jn=2300,Hi=2301,zi=2302,Es=2303,Cs=2400,Rs=2401,Is=2402;var Ys="",ie="srgb",Ps="srgb-linear",Ls="linear",Vi="srgb";var ki=7680;var Aa=519;var Ea=35044;var Qn=2e3,Ns=2001;function gl(p){for(let t=p.length-1;t>=0;--t)if(p[t]>=65535)return!0;return!1}function _l(p){return ArrayBuffer.isView(p)&&!(p instanceof DataView)}function Ds(p){return document.createElementNS("http://www.w3.org/1999/xhtml",p)}var Yo={},Wi=null;function Ca(p){let t=p[0];if(typeof t=="string"&&t.startsWith("TSL:")){let e=p[1];e&&e.isStackTrace?p[0]+=" "+e.getLocation():p[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return p}function Ut(...p){p=Ca(p);let t="THREE."+p.shift();if(Wi)Wi("warn",t,...p);else{let e=p[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...p)}}function Ct(...p){p=Ca(p);let t="THREE."+p.shift();if(Wi)Wi("error",t,...p);else{let e=p[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...p)}}function xn(...p){let t=p.join(" ");t in Yo||(Yo[t]=!0,Ut(...p))}var xl={[xs]:ys,[vs]:bs,[Ss]:Ts,[Gi]:Ms,[ys]:xs,[bs]:vs,[Ts]:Ss,[Ms]:Gi},Le=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let i=n[t];if(i!==void 0){let r=i.indexOf(e);r!==-1&&i.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let i=n.slice(0);for(let r=0,a=i.length;r<a;r++)i[r].call(this,t);t.target=null}}},Ot=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var Nd=Math.PI/180,yl=180/Math.PI;function ri(){let p=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Ot[p&255]+Ot[p>>8&255]+Ot[p>>16&255]+Ot[p>>24&255]+"-"+Ot[t&255]+Ot[t>>8&255]+"-"+Ot[t>>16&15|64]+Ot[t>>24&255]+"-"+Ot[e&63|128]+Ot[e>>8&255]+"-"+Ot[e>>16&255]+Ot[e>>24&255]+Ot[n&255]+Ot[n>>8&255]+Ot[n>>16&255]+Ot[n>>24&255]).toLowerCase()}function Z(p,t,e){return Math.max(t,Math.min(e,p))}function vl(p,t){return(p%t+t)%t}function $r(p,t,e){return(1-e)*p+e*t}function qn(p,t){switch(t.constructor){case Float32Array:return p;case Uint32Array:return p/4294967295;case Uint16Array:return p/65535;case Uint8Array:case Uint8ClampedArray:return p/255;case Int32Array:return Math.max(p/2147483647,-1);case Int16Array:return Math.max(p/32767,-1);case Int8Array:return Math.max(p/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function Wt(p,t){switch(t.constructor){case Float32Array:return p;case Uint32Array:return Math.round(p*4294967295);case Uint16Array:return Math.round(p*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(p*255);case Int32Array:return Math.round(p*2147483647);case Int16Array:return Math.round(p*32767);case Int8Array:return Math.round(p*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var tt=class p{static{p.prototype.isVector2=!0}constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Z(this.x,t.x,e.x),this.y=Z(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=Z(this.x,t,e),this.y=Z(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Z(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Z(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),i=Math.sin(e),r=this.x-t.x,a=this.y-t.y;return this.x=r*n-a*i+t.x,this.y=r*i+a*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},be=class{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,r,a,c){let l=n[i+0],f=n[i+1],u=n[i+2],d=n[i+3],m=r[a+0],g=r[a+1],x=r[a+2],S=r[a+3];if(d!==S||l!==m||f!==g||u!==x){let b=l*m+f*g+u*x+d*S;b<0&&(m=-m,g=-g,x=-x,S=-S,b=-b);let E=1-c;if(b<.9995){let T=Math.acos(b),h=Math.sin(T);E=Math.sin(E*T)/h,c=Math.sin(c*T)/h,l=l*E+m*c,f=f*E+g*c,u=u*E+x*c,d=d*E+S*c}else{l=l*E+m*c,f=f*E+g*c,u=u*E+x*c,d=d*E+S*c;let T=1/Math.sqrt(l*l+f*f+u*u+d*d);l*=T,f*=T,u*=T,d*=T}}t[e]=l,t[e+1]=f,t[e+2]=u,t[e+3]=d}static multiplyQuaternionsFlat(t,e,n,i,r,a){let c=n[i],l=n[i+1],f=n[i+2],u=n[i+3],d=r[a],m=r[a+1],g=r[a+2],x=r[a+3];return t[e]=c*x+u*d+l*g-f*m,t[e+1]=l*x+u*m+f*d-c*g,t[e+2]=f*x+u*g+c*m-l*d,t[e+3]=u*x-c*d-l*m-f*g,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,i=t._y,r=t._z,a=t._order,c=Math.cos,l=Math.sin,f=c(n/2),u=c(i/2),d=c(r/2),m=l(n/2),g=l(i/2),x=l(r/2);switch(a){case"XYZ":this._x=m*u*d+f*g*x,this._y=f*g*d-m*u*x,this._z=f*u*x+m*g*d,this._w=f*u*d-m*g*x;break;case"YXZ":this._x=m*u*d+f*g*x,this._y=f*g*d-m*u*x,this._z=f*u*x-m*g*d,this._w=f*u*d+m*g*x;break;case"ZXY":this._x=m*u*d-f*g*x,this._y=f*g*d+m*u*x,this._z=f*u*x+m*g*d,this._w=f*u*d-m*g*x;break;case"ZYX":this._x=m*u*d-f*g*x,this._y=f*g*d+m*u*x,this._z=f*u*x-m*g*d,this._w=f*u*d+m*g*x;break;case"YZX":this._x=m*u*d+f*g*x,this._y=f*g*d+m*u*x,this._z=f*u*x-m*g*d,this._w=f*u*d-m*g*x;break;case"XZY":this._x=m*u*d-f*g*x,this._y=f*g*d-m*u*x,this._z=f*u*x+m*g*d,this._w=f*u*d+m*g*x;break;default:Ut("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],i=e[4],r=e[8],a=e[1],c=e[5],l=e[9],f=e[2],u=e[6],d=e[10],m=n+c+d;if(m>0){let g=.5/Math.sqrt(m+1);this._w=.25/g,this._x=(u-l)*g,this._y=(r-f)*g,this._z=(a-i)*g}else if(n>c&&n>d){let g=2*Math.sqrt(1+n-c-d);this._w=(u-l)/g,this._x=.25*g,this._y=(i+a)/g,this._z=(r+f)/g}else if(c>d){let g=2*Math.sqrt(1+c-n-d);this._w=(r-f)/g,this._x=(i+a)/g,this._y=.25*g,this._z=(l+u)/g}else{let g=2*Math.sqrt(1+d-n-c);this._w=(a-i)/g,this._x=(r+f)/g,this._y=(l+u)/g,this._z=.25*g}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Z(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,i=t._y,r=t._z,a=t._w,c=e._x,l=e._y,f=e._z,u=e._w;return this._x=n*u+a*c+i*f-r*l,this._y=i*u+a*l+r*c-n*f,this._z=r*u+a*f+n*l-i*c,this._w=a*u-n*c-i*l-r*f,this._onChangeCallback(),this}slerp(t,e){let n=t._x,i=t._y,r=t._z,a=t._w,c=this.dot(t);c<0&&(n=-n,i=-i,r=-r,a=-a,c=-c);let l=1-e;if(c<.9995){let f=Math.acos(c),u=Math.sin(f);l=Math.sin(l*f)/u,e=Math.sin(e*f)/u,this._x=this._x*l+n*e,this._y=this._y*l+i*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+i*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(t),i*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},I=class p{static{p.prototype.isVector3=!0}constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Zo.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Zo.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*i,this.y=r[1]*e+r[4]*n+r[7]*i,this.z=r[2]*e+r[5]*n+r[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=t.elements,a=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*a,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*a,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*a,this}applyQuaternion(t){let e=this.x,n=this.y,i=this.z,r=t.x,a=t.y,c=t.z,l=t.w,f=2*(a*i-c*n),u=2*(c*e-r*i),d=2*(r*n-a*e);return this.x=e+l*f+a*d-c*u,this.y=n+l*u+c*f-r*d,this.z=i+l*d+r*u-a*f,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Z(this.x,t.x,e.x),this.y=Z(this.y,t.y,e.y),this.z=Z(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=Z(this.x,t,e),this.y=Z(this.y,t,e),this.z=Z(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Z(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,i=t.y,r=t.z,a=e.x,c=e.y,l=e.z;return this.x=i*l-r*c,this.y=r*a-n*l,this.z=n*c-i*a,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Kr.copy(this).projectOnVector(t),this.sub(Kr)}reflect(t){return this.sub(Kr.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Z(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Kr=new I,Zo=new be,W=class p{static{p.prototype.isMatrix3=!0}constructor(t,e,n,i,r,a,c,l,f){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,a,c,l,f)}set(t,e,n,i,r,a,c,l,f){let u=this.elements;return u[0]=t,u[1]=i,u[2]=c,u[3]=e,u[4]=r,u[5]=l,u[6]=n,u[7]=a,u[8]=f,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,a=n[0],c=n[3],l=n[6],f=n[1],u=n[4],d=n[7],m=n[2],g=n[5],x=n[8],S=i[0],b=i[3],E=i[6],T=i[1],h=i[4],o=i[7],_=i[2],s=i[5],R=i[8];return r[0]=a*S+c*T+l*_,r[3]=a*b+c*h+l*s,r[6]=a*E+c*o+l*R,r[1]=f*S+u*T+d*_,r[4]=f*b+u*h+d*s,r[7]=f*E+u*o+d*R,r[2]=m*S+g*T+x*_,r[5]=m*b+g*h+x*s,r[8]=m*E+g*o+x*R,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],c=t[5],l=t[6],f=t[7],u=t[8];return e*a*u-e*c*f-n*r*u+n*c*l+i*r*f-i*a*l}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],c=t[5],l=t[6],f=t[7],u=t[8],d=u*a-c*f,m=c*l-u*r,g=f*r-a*l,x=e*d+n*m+i*g;if(x===0)return this.set(0,0,0,0,0,0,0,0,0);let S=1/x;return t[0]=d*S,t[1]=(i*f-u*n)*S,t[2]=(c*n-i*a)*S,t[3]=m*S,t[4]=(u*e-i*l)*S,t[5]=(i*r-c*e)*S,t[6]=g*S,t[7]=(n*l-f*e)*S,t[8]=(a*e-n*r)*S,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,r,a,c){let l=Math.cos(r),f=Math.sin(r);return this.set(n*l,n*f,-n*(l*a+f*c)+a+t,-i*f,i*l,-i*(-f*a+l*c)+c+e,0,0,1),this}scale(t,e){return xn("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Qr.makeScale(t,e)),this}rotate(t){return xn("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Qr.makeRotation(-t)),this}translate(t,e){return xn("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Qr.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}},Qr=new W,Jo=new W().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),$o=new W().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Sl(){let p={enabled:!0,workingColorSpace:Ps,spaces:{},convert:function(i,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===Vi&&(i.r=Me(i.r),i.g=Me(i.g),i.b=Me(i.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(i.applyMatrix3(this.spaces[r].toXYZ),i.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===Vi&&(i.r=yn(i.r),i.g=yn(i.g),i.b=yn(i.b))),i},workingToColorSpace:function(i,r){return this.convert(i,this.workingColorSpace,r)},colorSpaceToWorking:function(i,r){return this.convert(i,r,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===Ys?Ls:this.spaces[i].transfer},getToneMappingMode:function(i){return this.spaces[i].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(i,r=this.workingColorSpace){return i.fromArray(this.spaces[r].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,r,a){return i.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(i,r){return xn("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),p.workingToColorSpace(i,r)},toWorkingColorSpace:function(i,r){return xn("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),p.colorSpaceToWorking(i,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return p.define({[Ps]:{primaries:t,whitePoint:n,transfer:Ls,toXYZ:Jo,fromXYZ:$o,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:ie},outputColorSpaceConfig:{drawingBufferColorSpace:ie}},[ie]:{primaries:t,whitePoint:n,transfer:Vi,toXYZ:Jo,fromXYZ:$o,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:ie}}}),p}var ne=Sl();function Me(p){return p<.04045?p*.0773993808:Math.pow(p*.9478672986+.0521327014,2.4)}function yn(p){return p<.0031308?p*12.92:1.055*Math.pow(p,.41666)-.055}var sn,Xi=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{sn===void 0&&(sn=Ds("canvas")),sn.width=t.width,sn.height=t.height;let i=sn.getContext("2d");t instanceof ImageData?i.putImageData(t,0,0):i.drawImage(t,0,0,t.width,t.height),n=sn}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=Ds("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let i=n.getImageData(0,0,t.width,t.height),r=i.data;for(let a=0;a<r.length;a++)r[a]=Me(r[a]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(Me(e[n]/255)*255):e[n]=Me(e[n]);return{data:e,width:t.width,height:t.height}}else return Ut("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},Ml=0,qi=class{constructor(t=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Ml++}),this.uuid=ri(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let a=0,c=i.length;a<c;a++)i[a].isDataTexture?r.push(jr(i[a].image)):r.push(jr(i[a]))}else r=jr(i);n.url=r}return e||(t.images[this.uuid]=n),n}};function jr(p){return typeof HTMLImageElement<"u"&&p instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&p instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&p instanceof ImageBitmap?Xi.getDataURL(p):p.data?{data:Array.from(p.data),width:p.width,height:p.height,type:p.data.constructor.name}:(Ut("Texture: Unable to serialize Texture."),{})}var bl=0,ts=new I,vn=class p extends Le{constructor(t=p.DEFAULT_IMAGE,e=p.DEFAULT_MAPPING,n=Kn,i=Kn,r=Sa,a=Ma,c=wa,l=ba,f=p.DEFAULT_ANISOTROPY,u=Ys){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:bl++}),this.uuid=ri(),this.name="",this.source=new qi(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=a,this.anisotropy=f,this.format=c,this.internalFormat=null,this.type=l,this.offset=new tt(0,0),this.repeat=new tt(1,1),this.center=new tt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new W,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(ts).x}get height(){return this.source.getSize(ts).y}get depth(){return this.source.getSize(ts).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){Ut(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let i=this[e];if(i===void 0){Ut(`Texture.setValues(): property '${e}' does not exist.`);continue}i&&n&&i.isVector2&&n.isVector2||i&&n&&i.isVector3&&n.isVector3||i&&n&&i.isMatrix3&&n.isMatrix3?i.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Xs)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case ws:t.x=t.x-Math.floor(t.x);break;case Kn:t.x=t.x<0?0:1;break;case As:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case ws:t.y=t.y-Math.floor(t.y);break;case Kn:t.y=t.y<0?0:1;break;case As:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};vn.DEFAULT_IMAGE=null;vn.DEFAULT_MAPPING=Xs;vn.DEFAULT_ANISOTROPY=1;var Jt=class p{static{p.prototype.isVector4=!0}constructor(t=0,e=0,n=0,i=1){this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=this.w,a=t.elements;return this.x=a[0]*e+a[4]*n+a[8]*i+a[12]*r,this.y=a[1]*e+a[5]*n+a[9]*i+a[13]*r,this.z=a[2]*e+a[6]*n+a[10]*i+a[14]*r,this.w=a[3]*e+a[7]*n+a[11]*i+a[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,r,l=t.elements,f=l[0],u=l[4],d=l[8],m=l[1],g=l[5],x=l[9],S=l[2],b=l[6],E=l[10];if(Math.abs(u-m)<.01&&Math.abs(d-S)<.01&&Math.abs(x-b)<.01){if(Math.abs(u+m)<.1&&Math.abs(d+S)<.1&&Math.abs(x+b)<.1&&Math.abs(f+g+E-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let h=(f+1)/2,o=(g+1)/2,_=(E+1)/2,s=(u+m)/4,R=(d+S)/4,w=(x+b)/4;return h>o&&h>_?h<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(h),i=s/n,r=R/n):o>_?o<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(o),n=s/i,r=w/i):_<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(_),n=R/r,i=w/r),this.set(n,i,r,e),this}let T=Math.sqrt((b-x)*(b-x)+(d-S)*(d-S)+(m-u)*(m-u));return Math.abs(T)<.001&&(T=1),this.x=(b-x)/T,this.y=(d-S)/T,this.z=(m-u)/T,this.w=Math.acos((f+g+E-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Z(this.x,t.x,e.x),this.y=Z(this.y,t.y,e.y),this.z=Z(this.z,t.z,e.z),this.w=Z(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=Z(this.x,t,e),this.y=Z(this.y,t,e),this.z=Z(this.z,t,e),this.w=Z(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Z(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};var Q=class p{static{p.prototype.isMatrix4=!0}constructor(t,e,n,i,r,a,c,l,f,u,d,m,g,x,S,b){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,a,c,l,f,u,d,m,g,x,S,b)}set(t,e,n,i,r,a,c,l,f,u,d,m,g,x,S,b){let E=this.elements;return E[0]=t,E[4]=e,E[8]=n,E[12]=i,E[1]=r,E[5]=a,E[9]=c,E[13]=l,E[2]=f,E[6]=u,E[10]=d,E[14]=m,E[3]=g,E[7]=x,E[11]=S,E[15]=b,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new p().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let e=this.elements,n=t.elements,i=1/on.setFromMatrixColumn(t,0).length(),r=1/on.setFromMatrixColumn(t,1).length(),a=1/on.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*a,e[9]=n[9]*a,e[10]=n[10]*a,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,i=t.y,r=t.z,a=Math.cos(n),c=Math.sin(n),l=Math.cos(i),f=Math.sin(i),u=Math.cos(r),d=Math.sin(r);if(t.order==="XYZ"){let m=a*u,g=a*d,x=c*u,S=c*d;e[0]=l*u,e[4]=-l*d,e[8]=f,e[1]=g+x*f,e[5]=m-S*f,e[9]=-c*l,e[2]=S-m*f,e[6]=x+g*f,e[10]=a*l}else if(t.order==="YXZ"){let m=l*u,g=l*d,x=f*u,S=f*d;e[0]=m+S*c,e[4]=x*c-g,e[8]=a*f,e[1]=a*d,e[5]=a*u,e[9]=-c,e[2]=g*c-x,e[6]=S+m*c,e[10]=a*l}else if(t.order==="ZXY"){let m=l*u,g=l*d,x=f*u,S=f*d;e[0]=m-S*c,e[4]=-a*d,e[8]=x+g*c,e[1]=g+x*c,e[5]=a*u,e[9]=S-m*c,e[2]=-a*f,e[6]=c,e[10]=a*l}else if(t.order==="ZYX"){let m=a*u,g=a*d,x=c*u,S=c*d;e[0]=l*u,e[4]=x*f-g,e[8]=m*f+S,e[1]=l*d,e[5]=S*f+m,e[9]=g*f-x,e[2]=-f,e[6]=c*l,e[10]=a*l}else if(t.order==="YZX"){let m=a*l,g=a*f,x=c*l,S=c*f;e[0]=l*u,e[4]=S-m*d,e[8]=x*d+g,e[1]=d,e[5]=a*u,e[9]=-c*u,e[2]=-f*u,e[6]=g*d+x,e[10]=m-S*d}else if(t.order==="XZY"){let m=a*l,g=a*f,x=c*l,S=c*f;e[0]=l*u,e[4]=-d,e[8]=f*u,e[1]=m*d+S,e[5]=a*u,e[9]=g*d-x,e[2]=x*d-g,e[6]=c*u,e[10]=S*d+m}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Tl,t,wl)}lookAt(t,e,n){let i=this.elements;return Yt.subVectors(t,e),Yt.lengthSq()===0&&(Yt.z=1),Yt.normalize(),Ce.crossVectors(n,Yt),Ce.lengthSq()===0&&(Math.abs(n.z)===1?Yt.x+=1e-4:Yt.z+=1e-4,Yt.normalize(),Ce.crossVectors(n,Yt)),Ce.normalize(),Mi.crossVectors(Yt,Ce),i[0]=Ce.x,i[4]=Mi.x,i[8]=Yt.x,i[1]=Ce.y,i[5]=Mi.y,i[9]=Yt.y,i[2]=Ce.z,i[6]=Mi.z,i[10]=Yt.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,a=n[0],c=n[4],l=n[8],f=n[12],u=n[1],d=n[5],m=n[9],g=n[13],x=n[2],S=n[6],b=n[10],E=n[14],T=n[3],h=n[7],o=n[11],_=n[15],s=i[0],R=i[4],w=i[8],v=i[12],y=i[1],A=i[5],M=i[9],C=i[13],P=i[2],L=i[6],N=i[10],D=i[14],U=i[3],F=i[7],q=i[11],O=i[15];return r[0]=a*s+c*y+l*P+f*U,r[4]=a*R+c*A+l*L+f*F,r[8]=a*w+c*M+l*N+f*q,r[12]=a*v+c*C+l*D+f*O,r[1]=u*s+d*y+m*P+g*U,r[5]=u*R+d*A+m*L+g*F,r[9]=u*w+d*M+m*N+g*q,r[13]=u*v+d*C+m*D+g*O,r[2]=x*s+S*y+b*P+E*U,r[6]=x*R+S*A+b*L+E*F,r[10]=x*w+S*M+b*N+E*q,r[14]=x*v+S*C+b*D+E*O,r[3]=T*s+h*y+o*P+_*U,r[7]=T*R+h*A+o*L+_*F,r[11]=T*w+h*M+o*N+_*q,r[15]=T*v+h*C+o*D+_*O,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],i=t[8],r=t[12],a=t[1],c=t[5],l=t[9],f=t[13],u=t[2],d=t[6],m=t[10],g=t[14],x=t[3],S=t[7],b=t[11],E=t[15],T=l*g-f*m,h=c*g-f*d,o=c*m-l*d,_=a*g-f*u,s=a*m-l*u,R=a*d-c*u;return e*(S*T-b*h+E*o)-n*(x*T-b*_+E*s)+i*(x*h-S*_+E*R)-r*(x*o-S*s+b*R)}determinantAffine(){let t=this.elements,e=t[0],n=t[4],i=t[8],r=t[1],a=t[5],c=t[9],l=t[2],f=t[6],u=t[10];return e*(a*u-c*f)-n*(r*u-c*l)+i*(r*f-a*l)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],c=t[5],l=t[6],f=t[7],u=t[8],d=t[9],m=t[10],g=t[11],x=t[12],S=t[13],b=t[14],E=t[15],T=e*c-n*a,h=e*l-i*a,o=e*f-r*a,_=n*l-i*c,s=n*f-r*c,R=i*f-r*l,w=u*S-d*x,v=u*b-m*x,y=u*E-g*x,A=d*b-m*S,M=d*E-g*S,C=m*E-g*b,P=T*C-h*M+o*A+_*y-s*v+R*w;if(P===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let L=1/P;return t[0]=(c*C-l*M+f*A)*L,t[1]=(i*M-n*C-r*A)*L,t[2]=(S*R-b*s+E*_)*L,t[3]=(m*s-d*R-g*_)*L,t[4]=(l*y-a*C-f*v)*L,t[5]=(e*C-i*y+r*v)*L,t[6]=(b*o-x*R-E*h)*L,t[7]=(u*R-m*o+g*h)*L,t[8]=(a*M-c*y+f*w)*L,t[9]=(n*y-e*M-r*w)*L,t[10]=(x*s-S*o+E*T)*L,t[11]=(d*o-u*s-g*T)*L,t[12]=(c*v-a*A-l*w)*L,t[13]=(e*A-n*v+i*w)*L,t[14]=(S*h-x*_-b*T)*L,t[15]=(u*_-d*h+m*T)*L,this}scale(t){let e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),i=Math.sin(e),r=1-n,a=t.x,c=t.y,l=t.z,f=r*a,u=r*c;return this.set(f*a+n,f*c-i*l,f*l+i*c,0,f*c+i*l,u*c+n,u*l-i*a,0,f*l-i*c,u*l+i*a,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,r,a){return this.set(1,n,r,0,t,1,a,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){let i=this.elements,r=e._x,a=e._y,c=e._z,l=e._w,f=r+r,u=a+a,d=c+c,m=r*f,g=r*u,x=r*d,S=a*u,b=a*d,E=c*d,T=l*f,h=l*u,o=l*d,_=n.x,s=n.y,R=n.z;return i[0]=(1-(S+E))*_,i[1]=(g+o)*_,i[2]=(x-h)*_,i[3]=0,i[4]=(g-o)*s,i[5]=(1-(m+E))*s,i[6]=(b+T)*s,i[7]=0,i[8]=(x+h)*R,i[9]=(b-T)*R,i[10]=(1-(m+S))*R,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){let i=this.elements;t.x=i[12],t.y=i[13],t.z=i[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let a=on.set(i[0],i[1],i[2]).length(),c=on.set(i[4],i[5],i[6]).length(),l=on.set(i[8],i[9],i[10]).length();r<0&&(a=-a),ae.copy(this);let f=1/a,u=1/c,d=1/l;return ae.elements[0]*=f,ae.elements[1]*=f,ae.elements[2]*=f,ae.elements[4]*=u,ae.elements[5]*=u,ae.elements[6]*=u,ae.elements[8]*=d,ae.elements[9]*=d,ae.elements[10]*=d,e.setFromRotationMatrix(ae),n.x=a,n.y=c,n.z=l,this}makePerspective(t,e,n,i,r,a,c=Qn,l=!1){let f=this.elements,u=2*r/(e-t),d=2*r/(n-i),m=(e+t)/(e-t),g=(n+i)/(n-i),x,S;if(l)x=r/(a-r),S=a*r/(a-r);else if(c===Qn)x=-(a+r)/(a-r),S=-2*a*r/(a-r);else if(c===Ns)x=-a/(a-r),S=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+c);return f[0]=u,f[4]=0,f[8]=m,f[12]=0,f[1]=0,f[5]=d,f[9]=g,f[13]=0,f[2]=0,f[6]=0,f[10]=x,f[14]=S,f[3]=0,f[7]=0,f[11]=-1,f[15]=0,this}makeOrthographic(t,e,n,i,r,a,c=Qn,l=!1){let f=this.elements,u=2/(e-t),d=2/(n-i),m=-(e+t)/(e-t),g=-(n+i)/(n-i),x,S;if(l)x=1/(a-r),S=a/(a-r);else if(c===Qn)x=-2/(a-r),S=-(a+r)/(a-r);else if(c===Ns)x=-1/(a-r),S=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+c);return f[0]=u,f[4]=0,f[8]=0,f[12]=m,f[1]=0,f[5]=d,f[9]=0,f[13]=g,f[2]=0,f[6]=0,f[10]=x,f[14]=S,f[3]=0,f[7]=0,f[11]=0,f[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}},on=new I,ae=new Q,Tl=new I(0,0,0),wl=new I(1,1,1),Ce=new I,Mi=new I,Yt=new I,Ko=new Q,Qo=new be,Sn=class p{constructor(t=0,e=0,n=0,i=p.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let i=t.elements,r=i[0],a=i[4],c=i[8],l=i[1],f=i[5],u=i[9],d=i[2],m=i[6],g=i[10];switch(e){case"XYZ":this._y=Math.asin(Z(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-u,g),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(m,f),this._z=0);break;case"YXZ":this._x=Math.asin(-Z(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(c,g),this._z=Math.atan2(l,f)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(Z(m,-1,1)),Math.abs(m)<.9999999?(this._y=Math.atan2(-d,g),this._z=Math.atan2(-a,f)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Z(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(m,g),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,f));break;case"YZX":this._z=Math.asin(Z(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,f),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(c,g));break;case"XZY":this._z=Math.asin(-Z(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(m,f),this._y=Math.atan2(c,r)):(this._x=Math.atan2(-u,g),this._y=0);break;default:Ut("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Ko.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Ko,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Qo.setFromEuler(this),this.setFromQuaternion(Qo,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Sn.DEFAULT_ORDER="XYZ";var Yi=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},Al=0,jo=new I,an=new be,_e=new Q,bi=new I,Yn=new I,El=new I,Cl=new be,ta=new I(1,0,0),ea=new I(0,1,0),na=new I(0,0,1),ia={type:"added"},Rl={type:"removed"},cn={type:"childadded",child:null},es={type:"childremoved",child:null},Ne=class p extends Le{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Al++}),this.uuid=ri(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=p.DEFAULT_UP.clone();let t=new I,e=new Sn,n=new be,i=new I(1,1,1);function r(){n.setFromEuler(e,!1)}function a(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Q},normalMatrix:{value:new W}}),this.matrix=new Q,this.matrixWorld=new Q,this.matrixAutoUpdate=p.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=p.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Yi,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return an.setFromAxisAngle(t,e),this.quaternion.multiply(an),this}rotateOnWorldAxis(t,e){return an.setFromAxisAngle(t,e),this.quaternion.premultiply(an),this}rotateX(t){return this.rotateOnAxis(ta,t)}rotateY(t){return this.rotateOnAxis(ea,t)}rotateZ(t){return this.rotateOnAxis(na,t)}translateOnAxis(t,e){return jo.copy(t).applyQuaternion(this.quaternion),this.position.add(jo.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(ta,t)}translateY(t){return this.translateOnAxis(ea,t)}translateZ(t){return this.translateOnAxis(na,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(_e.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?bi.copy(t):bi.set(t,e,n);let i=this.parent;this.updateWorldMatrix(!0,!1),Yn.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?_e.lookAt(Yn,bi,this.up):_e.lookAt(bi,Yn,this.up),this.quaternion.setFromRotationMatrix(_e),i&&(_e.extractRotation(i.matrixWorld),an.setFromRotationMatrix(_e),this.quaternion.premultiply(an.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(Ct("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(ia),cn.child=t,this.dispatchEvent(cn),cn.child=null):Ct("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(Rl),es.child=t,this.dispatchEvent(es),es.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),_e.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),_e.multiply(t.parent.matrixWorld)),t.applyMatrix4(_e),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(ia),cn.child=t,this.dispatchEvent(cn),cn.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){let a=this.children[n].getObjectByProperty(t,e);if(a!==void 0)return a}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Yn,t,El),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Yn,Cl,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(t){t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let e=t.x,n=t.y,i=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*i,r[13]+=n-r[1]*e-r[5]*n-r[9]*i,r[14]+=i-r[2]*e-r[6]*n-r[10]*i}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){let i=this.parent;if(t===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){let r=this.children;for(let a=0,c=r.length;a<c;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,i.name=this.name,i.castShadow=this.castShadow,i.receiveShadow=this.receiveShadow,i.visible=this.visible,i.frustumCulled=this.frustumCulled,i.renderOrder=this.renderOrder,i.static=this.static,i.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.pivot!==null&&(i.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(i.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(i.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map(c=>({...c,boundingBox:c.boundingBox?c.boundingBox.toJSON():void 0,boundingSphere:c.boundingSphere?c.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map(c=>({...c})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(t),i.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(i.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(i.boundingBox=this.boundingBox.toJSON()));function r(c,l){return c[l.uuid]===void 0&&(c[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(t.geometries,this.geometry);let c=this.geometry.parameters;if(c!==void 0&&c.shapes!==void 0){let l=c.shapes;if(Array.isArray(l))for(let f=0,u=l.length;f<u;f++){let d=l[f];r(t.shapes,d)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let c=[];for(let l=0,f=this.material.length;l<f;l++)c.push(r(t.materials,this.material[l]));i.material=c}else i.material=r(t.materials,this.material);if(this.children.length>0){i.children=[];for(let c=0;c<this.children.length;c++)i.children.push(this.children[c].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let c=0;c<this.animations.length;c++){let l=this.animations[c];i.animations.push(r(t.animations,l))}}if(e){let c=a(t.geometries),l=a(t.materials),f=a(t.textures),u=a(t.images),d=a(t.shapes),m=a(t.skeletons),g=a(t.animations),x=a(t.nodes);c.length>0&&(n.geometries=c),l.length>0&&(n.materials=l),f.length>0&&(n.textures=f),u.length>0&&(n.images=u),d.length>0&&(n.shapes=d),m.length>0&&(n.skeletons=m),g.length>0&&(n.animations=g),x.length>0&&(n.nodes=x)}return n.object=i,n;function a(c){let l=[];for(let f in c){let u=c[f];delete u.metadata,l.push(u)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let i=t.children[n];this.add(i.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}};Ne.DEFAULT_UP=new I(0,1,0);Ne.DEFAULT_MATRIX_AUTO_UPDATE=!0;Ne.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Ra={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Re={h:0,s:0,l:0},Ti={h:0,s:0,l:0};function ns(p,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?p+(t-p)*6*e:e<1/2?t:e<2/3?p+(t-p)*6*(2/3-e):p}var Pt=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=ie){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,ne.colorSpaceToWorking(this,e),this}setRGB(t,e,n,i=ne.workingColorSpace){return this.r=t,this.g=e,this.b=n,ne.colorSpaceToWorking(this,i),this}setHSL(t,e,n,i=ne.workingColorSpace){if(t=vl(t,1),e=Z(e,0,1),n=Z(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,a=2*n-r;this.r=ns(a,r,t+1/3),this.g=ns(a,r,t),this.b=ns(a,r,t-1/3)}return ne.colorSpaceToWorking(this,i),this}setStyle(t,e=ie){function n(r){r!==void 0&&parseFloat(r)<1&&Ut("Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,a=i[1],c=i[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(c))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(c))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(c))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:Ut("Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=i[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(a===6)return this.setHex(parseInt(r,16),e);Ut("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=ie){let n=Ra[t.toLowerCase()];return n!==void 0?this.setHex(n,e):Ut("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=Me(t.r),this.g=Me(t.g),this.b=Me(t.b),this}copyLinearToSRGB(t){return this.r=yn(t.r),this.g=yn(t.g),this.b=yn(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=ie){return ne.workingToColorSpace(zt.copy(this),t),Math.round(Z(zt.r*255,0,255))*65536+Math.round(Z(zt.g*255,0,255))*256+Math.round(Z(zt.b*255,0,255))}getHexString(t=ie){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=ne.workingColorSpace){ne.workingToColorSpace(zt.copy(this),e);let n=zt.r,i=zt.g,r=zt.b,a=Math.max(n,i,r),c=Math.min(n,i,r),l,f,u=(c+a)/2;if(c===a)l=0,f=0;else{let d=a-c;switch(f=u<=.5?d/(a+c):d/(2-a-c),a){case n:l=(i-r)/d+(i<r?6:0);break;case i:l=(r-n)/d+2;break;case r:l=(n-i)/d+4;break}l/=6}return t.h=l,t.s=f,t.l=u,t}getRGB(t,e=ne.workingColorSpace){return ne.workingToColorSpace(zt.copy(this),e),t.r=zt.r,t.g=zt.g,t.b=zt.b,t}getStyle(t=ie){ne.workingToColorSpace(zt.copy(this),t);let e=zt.r,n=zt.g,i=zt.b;return t!==ie?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(Re),this.setHSL(Re.h+t,Re.s+e,Re.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(Re),t.getHSL(Ti);let n=$r(Re.h,Ti.h,e),i=$r(Re.s,Ti.s,e),r=$r(Re.l,Ti.l,e);return this.setHSL(n,i,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,i=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*i,this.g=r[1]*e+r[4]*n+r[7]*i,this.b=r[2]*e+r[5]*n+r[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},zt=new Pt;Pt.NAMES=Ra;var ce=new I,xe=new I,is=new I,ye=new I,ln=new I,hn=new I,ra=new I,rs=new I,ss=new I,os=new I,as=new Jt,cs=new Jt,ls=new Jt,ft=class p{constructor(t=new I,e=new I,n=new I){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),ce.subVectors(t,e),i.cross(ce);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(t,e,n,i,r){ce.subVectors(i,e),xe.subVectors(n,e),is.subVectors(t,e);let a=ce.dot(ce),c=ce.dot(xe),l=ce.dot(is),f=xe.dot(xe),u=xe.dot(is),d=a*f-c*c;if(d===0)return r.set(0,0,0),null;let m=1/d,g=(f*l-c*u)*m,x=(a*u-c*l)*m;return r.set(1-g-x,x,g)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,ye)===null?!1:ye.x>=0&&ye.y>=0&&ye.x+ye.y<=1}static getInterpolation(t,e,n,i,r,a,c,l){return this.getBarycoord(t,e,n,i,ye)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,ye.x),l.addScaledVector(a,ye.y),l.addScaledVector(c,ye.z),l)}static getInterpolatedAttribute(t,e,n,i,r,a){return as.setScalar(0),cs.setScalar(0),ls.setScalar(0),as.fromBufferAttribute(t,e),cs.fromBufferAttribute(t,n),ls.fromBufferAttribute(t,i),a.setScalar(0),a.addScaledVector(as,r.x),a.addScaledVector(cs,r.y),a.addScaledVector(ls,r.z),a}static isFrontFacing(t,e,n,i){return ce.subVectors(n,e),xe.subVectors(t,e),ce.cross(xe).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return ce.subVectors(this.c,this.b),xe.subVectors(this.a,this.b),ce.cross(xe).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return p.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return p.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,i,r){return p.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}containsPoint(t){return p.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return p.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,i=this.b,r=this.c,a,c;ln.subVectors(i,n),hn.subVectors(r,n),rs.subVectors(t,n);let l=ln.dot(rs),f=hn.dot(rs);if(l<=0&&f<=0)return e.copy(n);ss.subVectors(t,i);let u=ln.dot(ss),d=hn.dot(ss);if(u>=0&&d<=u)return e.copy(i);let m=l*d-u*f;if(m<=0&&l>=0&&u<=0)return a=l/(l-u),e.copy(n).addScaledVector(ln,a);os.subVectors(t,r);let g=ln.dot(os),x=hn.dot(os);if(x>=0&&g<=x)return e.copy(r);let S=g*f-l*x;if(S<=0&&f>=0&&x<=0)return c=f/(f-x),e.copy(n).addScaledVector(hn,c);let b=u*x-g*d;if(b<=0&&d-u>=0&&g-x>=0)return ra.subVectors(r,i),c=(d-u)/(d-u+(g-x)),e.copy(i).addScaledVector(ra,c);let E=1/(b+S+m);return a=S*E,c=m*E,e.copy(n).addScaledVector(ln,a).addScaledVector(hn,c)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Et=class{constructor(t=new I(1/0,1/0,1/0),e=new I(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(le.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(le.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=le.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let a=0,c=r.count;a<c;a++)t.isMesh===!0?t.getVertexPosition(a,le):le.fromBufferAttribute(r,a),le.applyMatrix4(t.matrixWorld),this.expandByPoint(le);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),wi.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),wi.copy(n.boundingBox)),wi.applyMatrix4(t.matrixWorld),this.union(wi)}let i=t.children;for(let r=0,a=i.length;r<a;r++)this.expandByObject(i[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,le),le.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(Zn),Ai.subVectors(this.max,Zn),un.subVectors(t.a,Zn),fn.subVectors(t.b,Zn),dn.subVectors(t.c,Zn),Ie.subVectors(fn,un),Pe.subVectors(dn,fn),qe.subVectors(un,dn);let e=[0,-Ie.z,Ie.y,0,-Pe.z,Pe.y,0,-qe.z,qe.y,Ie.z,0,-Ie.x,Pe.z,0,-Pe.x,qe.z,0,-qe.x,-Ie.y,Ie.x,0,-Pe.y,Pe.x,0,-qe.y,qe.x,0];return!hs(e,un,fn,dn,Ai)||(e=[1,0,0,0,1,0,0,0,1],!hs(e,un,fn,dn,Ai))?!1:(Ei.crossVectors(Ie,Pe),e=[Ei.x,Ei.y,Ei.z],hs(e,un,fn,dn,Ai))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,le).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(le).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(ve[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),ve[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),ve[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),ve[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),ve[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),ve[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),ve[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),ve[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(ve),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},ve=[new I,new I,new I,new I,new I,new I,new I,new I],le=new I,wi=new Et,un=new I,fn=new I,dn=new I,Ie=new I,Pe=new I,qe=new I,Zn=new I,Ai=new I,Ei=new I,Ye=new I;function hs(p,t,e,n,i){for(let r=0,a=p.length-3;r<=a;r+=3){Ye.fromArray(p,r);let c=i.x*Math.abs(Ye.x)+i.y*Math.abs(Ye.y)+i.z*Math.abs(Ye.z),l=t.dot(Ye),f=e.dot(Ye),u=n.dot(Ye);if(Math.max(-Math.max(l,f,u),Math.min(l,f,u))>c)return!1}return!0}var Dt=new I,Ci=new tt,Il=0,Vt=class extends Le{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Il++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Ea,this.updateRanges=[],this.gpuType=Ta,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Ci.fromBufferAttribute(this,e),Ci.applyMatrix3(t),this.setXY(e,Ci.x,Ci.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)Dt.fromBufferAttribute(this,e),Dt.applyMatrix3(t),this.setXYZ(e,Dt.x,Dt.y,Dt.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)Dt.fromBufferAttribute(this,e),Dt.applyMatrix4(t),this.setXYZ(e,Dt.x,Dt.y,Dt.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)Dt.fromBufferAttribute(this,e),Dt.applyNormalMatrix(t),this.setXYZ(e,Dt.x,Dt.y,Dt.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)Dt.fromBufferAttribute(this,e),Dt.transformDirection(t),this.setXYZ(e,Dt.x,Dt.y,Dt.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=qn(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=Wt(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=qn(e,this.array)),e}setX(t,e){return this.normalized&&(e=Wt(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=qn(e,this.array)),e}setY(t,e){return this.normalized&&(e=Wt(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=qn(e,this.array)),e}setZ(t,e){return this.normalized&&(e=Wt(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=qn(e,this.array)),e}setW(t,e){return this.normalized&&(e=Wt(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=Wt(e,this.array),n=Wt(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=Wt(e,this.array),n=Wt(n,this.array),i=Wt(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=Wt(e,this.array),n=Wt(n,this.array),i=Wt(i,this.array),r=Wt(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return t.name=this.name,t.usage=this.usage,t.gpuType=this.gpuType,t}dispose(){this.dispatchEvent({type:"dispose"})}};var Zi=class extends Vt{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var Ji=class extends Vt{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var Je=class extends Vt{constructor(t,e,n){super(new Float32Array(t),e,n)}},Pl=new Et,Jn=new I,us=new I,ti=class{constructor(t=new I,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):Pl.setFromPoints(t).getCenter(n);let i=0;for(let r=0,a=t.length;r<a;r++)i=Math.max(i,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Jn.subVectors(t,this.center);let e=Jn.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(Jn,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(us.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Jn.copy(t.center).add(us)),this.expandByPoint(Jn.copy(t.center).sub(us))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},Ll=0,ee=new Q,fs=new Ne,pn=new I,Zt=new Et,$n=new Et,Bt=new I,Mn=class p extends Le{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Ll++}),this.uuid=ri(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(gl(t)?Ji:Zi)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new W().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return ee.makeRotationFromQuaternion(t),this.applyMatrix4(ee),this}rotateX(t){return ee.makeRotationX(t),this.applyMatrix4(ee),this}rotateY(t){return ee.makeRotationY(t),this.applyMatrix4(ee),this}rotateZ(t){return ee.makeRotationZ(t),this.applyMatrix4(ee),this}translate(t,e,n){return ee.makeTranslation(t,e,n),this.applyMatrix4(ee),this}scale(t,e,n){return ee.makeScale(t,e,n),this.applyMatrix4(ee),this}lookAt(t){return fs.lookAt(t),fs.updateMatrix(),this.applyMatrix4(fs.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(pn).negate(),this.translate(pn.x,pn.y,pn.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let i=0,r=t.length;i<r;i++){let a=t[i];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Je(n,3))}else{let n=Math.min(t.length,e.count);for(let i=0;i<n;i++){let r=t[i];e.setXYZ(i,r.x,r.y,r.z||0)}t.length>e.count&&Ut("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Et);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ct("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new I(-1/0,-1/0,-1/0),new I(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){let r=e[n];Zt.setFromBufferAttribute(r),this.morphTargetsRelative?(Bt.addVectors(this.boundingBox.min,Zt.min),this.boundingBox.expandByPoint(Bt),Bt.addVectors(this.boundingBox.max,Zt.max),this.boundingBox.expandByPoint(Bt)):(this.boundingBox.expandByPoint(Zt.min),this.boundingBox.expandByPoint(Zt.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ct('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ti);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ct("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new I,1/0);return}if(t){let n=this.boundingSphere.center;if(Zt.setFromBufferAttribute(t),e)for(let r=0,a=e.length;r<a;r++){let c=e[r];$n.setFromBufferAttribute(c),this.morphTargetsRelative?(Bt.addVectors(Zt.min,$n.min),Zt.expandByPoint(Bt),Bt.addVectors(Zt.max,$n.max),Zt.expandByPoint(Bt)):(Zt.expandByPoint($n.min),Zt.expandByPoint($n.max))}Zt.getCenter(n);let i=0;for(let r=0,a=t.count;r<a;r++)Bt.fromBufferAttribute(t,r),i=Math.max(i,n.distanceToSquared(Bt));if(e)for(let r=0,a=e.length;r<a;r++){let c=e[r],l=this.morphTargetsRelative;for(let f=0,u=c.count;f<u;f++)Bt.fromBufferAttribute(c,f),l&&(pn.fromBufferAttribute(t,f),Bt.add(pn)),i=Math.max(i,n.distanceToSquared(Bt))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&Ct('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){Ct("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,i=e.normal,r=e.uv,a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new Vt(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));let c=[],l=[];for(let w=0;w<n.count;w++)c[w]=new I,l[w]=new I;let f=new I,u=new I,d=new I,m=new tt,g=new tt,x=new tt,S=new I,b=new I;function E(w,v,y){f.fromBufferAttribute(n,w),u.fromBufferAttribute(n,v),d.fromBufferAttribute(n,y),m.fromBufferAttribute(r,w),g.fromBufferAttribute(r,v),x.fromBufferAttribute(r,y),u.sub(f),d.sub(f),g.sub(m),x.sub(m);let A=1/(g.x*x.y-x.x*g.y);isFinite(A)&&(S.copy(u).multiplyScalar(x.y).addScaledVector(d,-g.y).multiplyScalar(A),b.copy(d).multiplyScalar(g.x).addScaledVector(u,-x.x).multiplyScalar(A),c[w].add(S),c[v].add(S),c[y].add(S),l[w].add(b),l[v].add(b),l[y].add(b))}let T=this.groups;T.length===0&&(T=[{start:0,count:t.count}]);for(let w=0,v=T.length;w<v;++w){let y=T[w],A=y.start,M=y.count;for(let C=A,P=A+M;C<P;C+=3)E(t.getX(C+0),t.getX(C+1),t.getX(C+2))}let h=new I,o=new I,_=new I,s=new I;function R(w){_.fromBufferAttribute(i,w),s.copy(_);let v=c[w];h.copy(v),h.sub(_.multiplyScalar(_.dot(v))).normalize(),o.crossVectors(s,v);let A=o.dot(l[w])<0?-1:1;a.setXYZW(w,h.x,h.y,h.z,A)}for(let w=0,v=T.length;w<v;++w){let y=T[w],A=y.start,M=y.count;for(let C=A,P=A+M;C<P;C+=3)R(t.getX(C+0)),R(t.getX(C+1)),R(t.getX(C+2))}this._transformed=!0}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new Vt(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let m=0,g=n.count;m<g;m++)n.setXYZ(m,0,0,0);let i=new I,r=new I,a=new I,c=new I,l=new I,f=new I,u=new I,d=new I;if(t)for(let m=0,g=t.count;m<g;m+=3){let x=t.getX(m+0),S=t.getX(m+1),b=t.getX(m+2);i.fromBufferAttribute(e,x),r.fromBufferAttribute(e,S),a.fromBufferAttribute(e,b),u.subVectors(a,r),d.subVectors(i,r),u.cross(d),c.fromBufferAttribute(n,x),l.fromBufferAttribute(n,S),f.fromBufferAttribute(n,b),c.add(u),l.add(u),f.add(u),n.setXYZ(x,c.x,c.y,c.z),n.setXYZ(S,l.x,l.y,l.z),n.setXYZ(b,f.x,f.y,f.z)}else for(let m=0,g=e.count;m<g;m+=3)i.fromBufferAttribute(e,m+0),r.fromBufferAttribute(e,m+1),a.fromBufferAttribute(e,m+2),u.subVectors(a,r),d.subVectors(i,r),u.cross(d),n.setXYZ(m+0,u.x,u.y,u.z),n.setXYZ(m+1,u.x,u.y,u.z),n.setXYZ(m+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Bt.fromBufferAttribute(t,e),Bt.normalize(),t.setXYZ(e,Bt.x,Bt.y,Bt.z)}toNonIndexed(){function t(c,l){let f=c.array,u=c.itemSize,d=c.normalized,m=new f.constructor(l.length*u),g=0,x=0;for(let S=0,b=l.length;S<b;S++){c.isInterleavedBufferAttribute?g=l[S]*c.data.stride+c.offset:g=l[S]*u;for(let E=0;E<u;E++)m[x++]=f[g++]}return new Vt(m,u,d)}if(this.index===null)return Ut("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new p,n=this.index.array,i=this.attributes;for(let c in i){let l=i[c],f=t(l,n);e.setAttribute(c,f)}let r=this.morphAttributes;for(let c in r){let l=[],f=r[c];for(let u=0,d=f.length;u<d;u++){let m=f[u],g=t(m,n);l.push(g)}e.morphAttributes[c]=l}e.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let c=0,l=a.length;c<l;c++){let f=a[c];e.addGroup(f.start,f.count,f.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,t.name=this.name,Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let f in l)l[f]!==void 0&&(t[f]=l[f]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let f=n[l];t.data.attributes[l]=f.toJSON(t.data)}let i={},r=!1;for(let l in this.morphAttributes){let f=this.morphAttributes[l],u=[];for(let d=0,m=f.length;d<m;d++){let g=f[d];u.push(g.toJSON(t.data))}u.length>0&&(i[l]=u,r=!0)}r&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(t.data.groups=JSON.parse(JSON.stringify(a)));let c=this.boundingSphere;return c!==null&&(t.data.boundingSphere=c.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let i=t.attributes;for(let f in i){let u=i[f];this.setAttribute(f,u.clone(e))}let r=t.morphAttributes;for(let f in r){let u=[],d=r[f];for(let m=0,g=d.length;m<g;m++)u.push(d[m].clone(e));this.morphAttributes[f]=u}this.morphTargetsRelative=t.morphTargetsRelative;let a=t.groups;for(let f=0,u=a.length;f<u;f++){let d=a[f];this.addGroup(d.start,d.count,d.materialIndex)}let c=t.boundingBox;c!==null&&(this.boundingBox=c.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var ds=new I,Nl=new I,Dl=new W,re=class{constructor(t=new I(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let i=ds.subVectors(n,e).cross(Nl.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){let i=t.delta(ds),r=this.normal.dot(i);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let a=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:e.copy(t.start).addScaledVector(i,a)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||Dl.getNormalMatrix(t),i=this.coplanarPoint(ds).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(t){return this.normal.fromArray(t.normal),this.constant=t.constant,this}},Ul=0,$i=class extends Le{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Ul++}),this.uuid=ri(),this.name="",this.type="Material",this.blending=da,this.side=bn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=ma,this.blendDst=ga,this.blendEquation=pa,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Pt(0,0,0),this.blendAlpha=0,this.depthFunc=Gi,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Aa,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ki,this.stencilZFail=ki,this.stencilZPass=ki,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){Ut(`Material: parameter '${e}' has value of undefined.`);continue}let i=this[e];if(i===void 0){Ut(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector2&&n&&n.isVector2||i&&i.isEuler&&n&&n.isEuler||i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(r=>r.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){let a=[];for(let c in r){let l=r[c];delete l.metadata,a.push(l)}return a}if(e){let r=i(t.textures),a=i(t.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new Pt().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.retroreflectivity!==void 0&&(this.retroreflectivity=t.retroreflectivity),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.clippingPlanes!==void 0&&(this.clippingPlanes=t.clippingPlanes.map(n=>new re().fromJSON(n))),t.clipIntersection!==void 0&&(this.clipIntersection=t.clipIntersection),t.clipShadows!==void 0&&(this.clipShadows=t.clipShadows),t.depthPacking!==void 0&&(this.depthPacking=t.depthPacking),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.linecap!==void 0&&(this.linecap=t.linecap),t.linejoin!==void 0&&(this.linejoin=t.linejoin),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new tt().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new tt().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let i=e.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}};var Se=new I,ps=new I,Ri=new I,Ii=new I,me=class{constructor(t=new I,e=new I(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Se)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=Se.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(Se.copy(this.origin).addScaledVector(this.direction,e),Se.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){ps.copy(t).add(e).multiplyScalar(.5),Ri.copy(e).sub(t).normalize(),Ii.copy(this.origin).sub(ps);let r=t.distanceTo(e)*.5,a=-this.direction.dot(Ri),c=Ii.dot(this.direction),l=-Ii.dot(Ri),f=Ii.lengthSq(),u=Math.abs(1-a*a),d,m,g,x;if(u>0)if(d=a*l-c,m=a*c-l,x=r*u,d>=0)if(m>=-x)if(m<=x){let S=1/u;d*=S,m*=S,g=d*(d+a*m+2*c)+m*(a*d+m+2*l)+f}else m=r,d=Math.max(0,-(a*m+c)),g=-d*d+m*(m+2*l)+f;else m=-r,d=Math.max(0,-(a*m+c)),g=-d*d+m*(m+2*l)+f;else m<=-x?(d=Math.max(0,-(-a*r+c)),m=d>0?-r:Math.min(Math.max(-r,-l),r),g=-d*d+m*(m+2*l)+f):m<=x?(d=0,m=Math.min(Math.max(-r,-l),r),g=m*(m+2*l)+f):(d=Math.max(0,-(a*r+c)),m=d>0?r:Math.min(Math.max(-r,-l),r),g=-d*d+m*(m+2*l)+f);else m=a>0?-r:r,d=Math.max(0,-(a*m+c)),g=-d*d+m*(m+2*l)+f;return n&&n.copy(this.origin).addScaledVector(this.direction,d),i&&i.copy(ps).addScaledVector(Ri,m),g}intersectSphere(t,e){if(t.radius<0)return null;Se.subVectors(t.center,this.origin);let n=Se.dot(this.direction),i=Se.dot(Se)-n*n,r=t.radius*t.radius;if(i>r)return null;let a=Math.sqrt(r-i),c=n-a,l=n+a;return l<0?null:c<0?this.at(l,e):this.at(c,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,r,a,c,l,f=1/this.direction.x,u=1/this.direction.y,d=1/this.direction.z,m=this.origin;return f>=0?(n=(t.min.x-m.x)*f,i=(t.max.x-m.x)*f):(n=(t.max.x-m.x)*f,i=(t.min.x-m.x)*f),u>=0?(r=(t.min.y-m.y)*u,a=(t.max.y-m.y)*u):(r=(t.max.y-m.y)*u,a=(t.min.y-m.y)*u),n>a||r>i||((r>n||isNaN(n))&&(n=r),(a<i||isNaN(i))&&(i=a),d>=0?(c=(t.min.z-m.z)*d,l=(t.max.z-m.z)*d):(c=(t.max.z-m.z)*d,l=(t.min.z-m.z)*d),n>l||c>i)||((c>n||n!==n)&&(n=c),(l<i||i!==i)&&(i=l),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,Se)!==null}intersectTriangle(t,e,n,i,r){let a=this.origin,c=this.direction,l=c.x,f=c.y,u=c.z,d=t.x-a.x,m=t.y-a.y,g=t.z-a.z,x=e.x-a.x,S=e.y-a.y,b=e.z-a.z,E=n.x-a.x,T=n.y-a.y,h=n.z-a.z,o=Math.abs(l),_=Math.abs(f),s=Math.abs(u),R,w,v,y,A,M,C,P,L,N,D,U;if(o>=_&&o>=s?(v=l,M=d,L=x,U=E,l>=0?(R=f,w=u,y=m,A=g,C=S,P=b,N=T,D=h):(R=u,w=f,y=g,A=m,C=b,P=S,N=h,D=T)):_>=s?(v=f,M=m,L=S,U=T,f>=0?(R=u,w=l,y=g,A=d,C=b,P=x,N=h,D=E):(R=l,w=u,y=d,A=g,C=x,P=b,N=E,D=h)):(v=u,M=g,L=b,U=h,u>=0?(R=l,w=f,y=d,A=m,C=x,P=S,N=E,D=T):(R=f,w=l,y=m,A=d,C=S,P=x,N=T,D=E)),v===0)return null;let F=R/v,q=w/v,O=1/v,z=y-F*M,H=A-q*M,V=C-F*L,k=P-q*L,ot=N-F*U,J=D-q*U,Y=ot*k-J*V,G=z*J-H*ot,X=V*H-k*z;if(i){if(Y<0||G<0||X<0)return null}else if((Y<0||G<0||X<0)&&(Y>0||G>0||X>0))return null;let $=Y+G+X;if($===0)return null;let Nt=O*(Y*M+G*L+X*U);return($>0?Nt<0:Nt>0)?null:this.at(Nt/$,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Ki=class extends $i{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Pt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Sn,this.combine=Bs,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},sa=new Q,Ze=new me,Pi=new ti,oa=new I,Li=new I,Ni=new I,Di=new I,ms=new I,Ui=new I,aa=new I,Fi=new I,ei=class extends Ne{constructor(t=new Mn,e=new Ki){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let c=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[c]=r}}}}getVertexPosition(t,e){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;e.fromBufferAttribute(i,t);let c=this.morphTargetInfluences;if(r&&c){Ui.set(0,0,0);for(let l=0,f=r.length;l<f;l++){let u=c[l],d=r[l];u!==0&&(ms.fromBufferAttribute(d,t),a?Ui.addScaledVector(ms,u):Ui.addScaledVector(ms.sub(e),u))}e.add(Ui)}return e}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){let n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Pi.copy(n.boundingSphere),Pi.applyMatrix4(r),Ze.copy(t.ray).recast(t.near),!(Pi.containsPoint(Ze.origin)===!1&&(Ze.intersectSphere(Pi,oa)===null||Ze.origin.distanceToSquared(oa)>(t.far-t.near)**2))&&(sa.copy(r).invert(),Ze.copy(t.ray).applyMatrix4(sa),!(n.boundingBox!==null&&Ze.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Ze)))}_computeIntersections(t,e,n){let i,r=this.geometry,a=this.material,c=r.index,l=r.attributes.position,f=r.attributes.uv,u=r.attributes.uv1,d=r.attributes.normal,m=r.groups,g=r.drawRange;if(c!==null)if(Array.isArray(a))for(let x=0,S=m.length;x<S;x++){let b=m[x],E=a[b.materialIndex],T=Math.max(b.start,g.start),h=Math.min(c.count,Math.min(b.start+b.count,g.start+g.count));for(let o=T,_=h;o<_;o+=3){let s=c.getX(o),R=c.getX(o+1),w=c.getX(o+2);i=Bi(this,E,t,n,f,u,d,s,R,w),i&&(i.faceIndex=Math.floor(o/3),i.face.materialIndex=b.materialIndex,e.push(i))}}else{let x=Math.max(0,g.start),S=Math.min(c.count,g.start+g.count);for(let b=x,E=S;b<E;b+=3){let T=c.getX(b),h=c.getX(b+1),o=c.getX(b+2);i=Bi(this,a,t,n,f,u,d,T,h,o),i&&(i.faceIndex=Math.floor(b/3),e.push(i))}}else if(l!==void 0)if(Array.isArray(a))for(let x=0,S=m.length;x<S;x++){let b=m[x],E=a[b.materialIndex],T=Math.max(b.start,g.start),h=Math.min(l.count,Math.min(b.start+b.count,g.start+g.count));for(let o=T,_=h;o<_;o+=3){let s=o,R=o+1,w=o+2;i=Bi(this,E,t,n,f,u,d,s,R,w),i&&(i.faceIndex=Math.floor(o/3),i.face.materialIndex=b.materialIndex,e.push(i))}}else{let x=Math.max(0,g.start),S=Math.min(l.count,g.start+g.count);for(let b=x,E=S;b<E;b+=3){let T=b,h=b+1,o=b+2;i=Bi(this,a,t,n,f,u,d,T,h,o),i&&(i.faceIndex=Math.floor(b/3),e.push(i))}}}};function Fl(p,t,e,n,i,r,a,c){let l;if(t.side===cr?l=n.intersectTriangle(a,r,i,!0,c):l=n.intersectTriangle(i,r,a,t.side===bn,c),l===null)return null;Fi.copy(c),Fi.applyMatrix4(p.matrixWorld);let f=e.ray.origin.distanceTo(Fi);return f<e.near||f>e.far?null:{distance:f,point:Fi.clone(),object:p}}function Bi(p,t,e,n,i,r,a,c,l,f){p.getVertexPosition(c,Li),p.getVertexPosition(l,Ni),p.getVertexPosition(f,Di);let u=Fl(p,t,e,n,Li,Ni,Di,aa);if(u){let d=new I;ft.getBarycoord(aa,Li,Ni,Di,d),i&&(u.uv=ft.getInterpolatedAttribute(i,c,l,f,d,new tt)),r&&(u.uv1=ft.getInterpolatedAttribute(r,c,l,f,d,new tt)),a&&(u.normal=ft.getInterpolatedAttribute(a,c,l,f,d,new I),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));let m={a:c,b:l,c:f,normal:new I,materialIndex:0};ft.getNormal(Li,Ni,Di,m.normal),u.face=m,u.barycoord=d}return u}function Ia(p){let t={};for(let e in p){t[e]={};for(let n in p[e]){let i=p[e][n];if(ca(i))i.isRenderTargetTexture?(Ut("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone();else if(Array.isArray(i))if(ca(i[0])){let r=[];for(let a=0,c=i.length;a<c;a++)r[a]=i[a].clone();t[e][n]=r}else t[e][n]=i.slice();else t[e][n]=i}}return t}function Gt(p){let t={};for(let e=0;e<p.length;e++){let n=Ia(p[e]);for(let i in n)t[i]=n[i]}return t}function ca(p){return p&&(p.isColor||p.isMatrix3||p.isMatrix4||p.isVector2||p.isVector3||p.isVector4||p.isTexture||p.isQuaternion)}function mn(p,t){return!p||p.constructor===t?p:typeof t.BYTES_PER_ELEMENT=="number"?new t(p):Array.prototype.slice.call(p)}function gs(p){return p!==void 0&&p.inTangents!==void 0&&p.outTangents!==void 0}var De=class{constructor(t,e,n,i){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,i=e[n],r=e[n-1];n:{t:{let a;e:{i:if(!(t<i)){for(let c=n+2;;){if(i===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===c)break;if(r=i,i=e[++n],t<i)break t}a=e.length;break e}if(!(t>=r)){let c=e[1];t<c&&(n=2,r=c);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=r,r=e[--n-1],t>=r)break t}a=n,n=0;break e}break n}for(;n<a;){let c=n+a>>>1;t<e[c]?a=c:n=c+1}if(i=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,t,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i;for(let a=0;a!==i;++a)e[a]=n[r+a];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},Qi=class extends De{constructor(t,e,n,i){super(t,e,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Cs,endingEnd:Cs}}intervalChanged_(t,e,n){let i=this.parameterPositions,r=t-2,a=t+1,c=i[r],l=i[a];if(c===void 0)switch(this.getSettings_().endingStart){case Rs:r=t,c=2*e-n;break;case Is:r=i.length-2,c=e+i[r]-i[r+1];break;default:r=t,c=n}if(l===void 0)switch(this.getSettings_().endingEnd){case Rs:a=t,l=2*n-e;break;case Is:a=1,l=n+i[1]-i[0];break;default:a=t-1,l=e}let f=(n-e)*.5,u=this.valueSize;this._weightPrev=f/(e-c),this._weightNext=f/(l-n),this._offsetPrev=r*u,this._offsetNext=a*u}interpolate_(t,e,n,i){let r=this.resultBuffer,a=this.sampleValues,c=this.valueSize,l=t*c,f=l-c,u=this._offsetPrev,d=this._offsetNext,m=this._weightPrev,g=this._weightNext,x=(n-e)/(i-e),S=x*x,b=S*x,E=-m*b+2*m*S-m*x,T=(1+m)*b+(-1.5-2*m)*S+(-.5+m)*x+1,h=(-1-g)*b+(1.5+g)*S+.5*x,o=g*b-g*S;for(let _=0;_!==c;++_)r[_]=E*a[u+_]+T*a[f+_]+h*a[l+_]+o*a[d+_];return r}},ji=class extends De{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,a=this.sampleValues,c=this.valueSize,l=t*c,f=l-c,u=(n-e)/(i-e),d=1-u;for(let m=0;m!==c;++m)r[m]=a[f+m]*d+a[l+m]*u;return r}},tr=class extends De{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t){return this.copySampleValue_(t-1)}},er=class extends De{interpolate_(t,e,n,i){let r=this.resultBuffer,a=this.sampleValues,c=this.valueSize,l=t*c,f=l-c,u=this.inTangents,d=this.outTangents;if(!u||!d){let x=(n-e)/(i-e),S=1-x;for(let b=0;b!==c;++b)r[b]=a[f+b]*S+a[l+b]*x;return r}let m=c*2,g=t-1;for(let x=0;x!==c;++x){let S=a[f+x],b=a[l+x],E=g*m+x*2,T=d[E],h=d[E+1],o=t*m+x*2,_=u[o],s=u[o+1],R=Ol(n,e,T,_,i);r[x]=Pa(R,S,h,s,b)}return r}};function Pa(p,t,e,n,i){let r=1-p;return r*r*r*t+3*r*r*p*e+3*r*p*p*n+p*p*p*i}function Bl(p,t,e,n,i){let r=1-p;return 3*r*r*(e-t)+6*r*p*(n-e)+3*p*p*(i-n)}function Ol(p,t,e,n,i){let r=(p-t)/(i-t);for(let a=0;a<8;a++){let c=Pa(r,t,e,n,i)-p;if(Math.abs(c)<1e-10)break;let l=Bl(r,t,e,n,i);if(Math.abs(l)<1e-10)break;r=Math.max(0,Math.min(1,r-c/l))}return r}var $t=class{constructor(t,e,n,i){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=mn(e,this.TimeBufferType),this.values=mn(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:mn(t.times,Array),values:mn(t.values,Array)};let i=t.getInterpolation();i!==t.DefaultInterpolation&&(n.interpolation=i),gs(t.settings)&&(n.settings={inTangents:mn(t.settings.inTangents,Array),outTangents:mn(t.settings.outTangents,Array)})}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new tr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new ji(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new Qi(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let e=new er(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case jn:e=this.InterpolantFactoryMethodDiscrete;break;case Hi:e=this.InterpolantFactoryMethodLinear;break;case zi:e=this.InterpolantFactoryMethodSmooth;break;case Es:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return Ut("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return jn;case this.InterpolantFactoryMethodLinear:return Hi;case this.InterpolantFactoryMethodSmooth:return zi;case this.InterpolantFactoryMethodBezier:return Es}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]*=t;gs(this.settings)&&(la(this.settings.inTangents,t),la(this.settings.outTangents,t))}return this}trim(t,e){let n=this.times,i=n.length,r=0,a=i-1;for(;r!==i&&n[r]<t;)++r;for(;a!==-1&&n[a]>e;)--a;if(++a,r!==0||a!==i){r>=a&&(a=Math.max(a,1),r=a-1);let c=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*c,a*c)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(Ct("KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,i=this.values,r=n.length;r===0&&(Ct("KeyframeTrack: Track is empty.",this),t=!1);let a=null;for(let c=0;c!==r;c++){let l=n[c];if(typeof l=="number"&&isNaN(l)){Ct("KeyframeTrack: Time is not a valid number.",this,c,l),t=!1;break}if(a!==null&&a>l){Ct("KeyframeTrack: Out of order keys.",this,c,l,a),t=!1;break}a=l}if(i!==void 0&&_l(i))for(let c=0,l=i.length;c!==l;++c){let f=i[c];if(isNaN(f)){Ct("KeyframeTrack: Value is not a valid number.",this,c,f),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===zi,r=t.length-1,a=1;for(let c=1;c<r;++c){let l=!1,f=t[c],u=t[c+1];if(f!==u&&(c!==1||f!==t[0]))if(i)l=!0;else{let d=c*n,m=d-n,g=d+n;for(let x=0;x!==n;++x){let S=e[d+x];if(S!==e[m+x]||S!==e[g+x]){l=!0;break}}}if(l){if(c!==a){t[a]=t[c];let d=c*n,m=a*n;for(let g=0;g!==n;++g)e[m+g]=e[d+g]}++a}}if(r>0){t[a]=t[r];for(let c=r*n,l=a*n,f=0;f!==n;++f)e[l+f]=e[c+f];++a}return a!==t.length?(this.times=t.slice(0,a),this.values=e.slice(0,a*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,i=new n(this.name,t,e);return i.createInterpolant=this.createInterpolant,gs(this.settings)&&(i.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),i}};function la(p,t){for(let e=0,n=p.length;e!==n;e+=2)p[e]*=t}$t.prototype.ValueTypeName="";$t.prototype.TimeBufferType=Float32Array;$t.prototype.ValueBufferType=Float32Array;$t.prototype.DefaultInterpolation=Hi;var Ue=class extends $t{constructor(t,e,n){super(t,e,n)}};Ue.prototype.ValueTypeName="bool";Ue.prototype.ValueBufferType=Array;Ue.prototype.DefaultInterpolation=jn;Ue.prototype.InterpolantFactoryMethodLinear=void 0;Ue.prototype.InterpolantFactoryMethodSmooth=void 0;var nr=class extends $t{constructor(t,e,n,i){super(t,e,n,i)}};nr.prototype.ValueTypeName="color";var ir=class extends $t{constructor(t,e,n,i){super(t,e,n,i)}};ir.prototype.ValueTypeName="number";var rr=class extends De{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,a=this.sampleValues,c=this.valueSize,l=(n-e)/(i-e),f=t*c;for(let u=f+c;f!==u;f+=4)be.slerpFlat(r,0,a,f-c,a,f,l);return r}},ni=class extends $t{constructor(t,e,n,i){super(t,e,n,i)}InterpolantFactoryMethodLinear(t){return new rr(this.times,this.values,this.getValueSize(),t)}};ni.prototype.ValueTypeName="quaternion";ni.prototype.InterpolantFactoryMethodSmooth=void 0;var Fe=class extends $t{constructor(t,e,n){super(t,e,n)}};Fe.prototype.ValueTypeName="string";Fe.prototype.ValueBufferType=Array;Fe.prototype.DefaultInterpolation=jn;Fe.prototype.InterpolantFactoryMethodLinear=void 0;Fe.prototype.InterpolantFactoryMethodSmooth=void 0;var sr=class extends $t{constructor(t,e,n,i){super(t,e,n,i)}};sr.prototype.ValueTypeName="vector";var or=class{constructor(t,e,n){let i=this,r=!1,a=0,c=0,l,f=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(u){c++,r===!1&&i.onStart!==void 0&&i.onStart(u,a,c),r=!0},this.itemEnd=function(u){a++,i.onProgress!==void 0&&i.onProgress(u,a,c),a===c&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(u){i.onError!==void 0&&i.onError(u)},this.resolveURL=function(u){return u=u.normalize("NFC"),l?l(u):u},this.setURLModifier=function(u){return l=u,this},this.addHandler=function(u,d){return f.push(u,d),this},this.removeHandler=function(u){let d=f.indexOf(u);return d!==-1&&f.splice(d,2),this},this.getHandler=function(u){for(let d=0,m=f.length;d<m;d+=2){let g=f[d],x=f[d+1];if(g.global&&(g.lastIndex=0),g.test(u))return x}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},La=new or,ar=class{constructor(t){this.manager=t!==void 0?t:La,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){let n=this;return new Promise(function(i,r){n.load(t,i,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}};ar.DEFAULT_MATERIAL_NAME="__DEFAULT";var Zs="\\[\\]\\.:\\/",zl=new RegExp("["+Zs+"]","g"),Js="[^"+Zs+"]",Vl="[^"+Zs.replace("\\.","")+"]",kl=/((?:WC+[\/:])*)/.source.replace("WC",Js),Gl=/(WCOD+)?/.source.replace("WCOD",Vl),Hl=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Js),Wl=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Js),Xl=new RegExp("^"+kl+Gl+Hl+Wl+"$"),ql=["material","materials","bones","map"],Us=class{constructor(t,e,n){let i=n||xt.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,i)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},xt=class p{constructor(t,e,n){this.path=e,this.parsedPath=n||p.parseTrackName(e),this.node=p.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new p.Composite(t,e,n):new p(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(zl,"")}static parseTrackName(t){let e=Xl.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);ql.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let a=0;a<r.length;a++){let c=r[a];if(c.name===e||c.uuid===e)return c;let l=n(c.children);if(l)return l}return null},i=n(t.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)t[e++]=n[i]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,i=e.propertyName,r=e.propertyIndex;if(t||(t=p.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){Ut("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let f=e.objectIndex;switch(n){case"materials":if(!t.material){Ct("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){Ct("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){Ct("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let u=0;u<t.length;u++)if(t[u].name===f){f=u;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){Ct("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){Ct("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){Ct("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(f!==void 0){if(t[f]===void 0){Ct("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[f]}}let a=t[i];if(a===void 0){let f=e.nodeName;Ct("PropertyBinding: Trying to update property for track: "+f+"."+i+" but it wasn't found.",t);return}let c=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?c=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(c=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!t.geometry){Ct("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){Ct("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][c]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};xt.Composite=Us;xt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};xt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};xt.prototype.GetterByBindingType=[xt.prototype._getValue_direct,xt.prototype._getValue_array,xt.prototype._getValue_arrayElement,xt.prototype._getValue_toArray];xt.prototype.SetterByBindingTypeAndVersioning=[[xt.prototype._setValue_direct,xt.prototype._setValue_direct_setNeedsUpdate,xt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[xt.prototype._setValue_array,xt.prototype._setValue_array_setNeedsUpdate,xt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[xt.prototype._setValue_arrayElement,xt.prototype._setValue_arrayElement_setNeedsUpdate,xt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[xt.prototype._setValue_fromArray,xt.prototype._setValue_fromArray_setNeedsUpdate,xt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Dd=new Float32Array(1);var Fs=class p{static{p.prototype.isMatrix2=!0}constructor(t,e,n,i){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,i)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,i){let r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=i,this}};var ha=new I,Oi=new I,gn=new I,_n=new I,_s=new I,Yl=new I,Zl=new I,ht=class{constructor(t=new I,e=new I){this.start=t,this.end=e}set(t,e){return this.start.copy(t),this.end.copy(e),this}copy(t){return this.start.copy(t.start),this.end.copy(t.end),this}getCenter(t){return t.addVectors(this.start,this.end).multiplyScalar(.5)}delta(t){return t.subVectors(this.end,this.start)}distanceSq(){return this.start.distanceToSquared(this.end)}distance(){return this.start.distanceTo(this.end)}at(t,e){return this.delta(e).multiplyScalar(t).add(this.start)}closestPointToPointParameter(t,e){ha.subVectors(t,this.start),Oi.subVectors(this.end,this.start);let n=Oi.dot(Oi);if(n===0)return 0;let r=Oi.dot(ha)/n;return e&&(r=Z(r,0,1)),r}closestPointToPoint(t,e,n){let i=this.closestPointToPointParameter(t,e);return this.delta(n).multiplyScalar(i).add(this.start)}distanceSqToLine3(t,e=Yl,n=Zl){let i=10000000000000001e-32,r,a,c=this.start,l=t.start,f=this.end,u=t.end;gn.subVectors(f,c),_n.subVectors(u,l),_s.subVectors(c,l);let d=gn.dot(gn),m=_n.dot(_n),g=_n.dot(_s);if(d<=i&&m<=i)return e.copy(c),n.copy(l),e.sub(n),e.dot(e);if(d<=i)r=0,a=g/m,a=Z(a,0,1);else{let x=gn.dot(_s);if(m<=i)a=0,r=Z(-x/d,0,1);else{let S=gn.dot(_n),b=d*m-S*S;b!==0?r=Z((S*g-x*m)/b,0,1):r=0,a=(S*r+g)/m,a<0?(a=0,r=Z(-x/d,0,1)):a>1&&(a=1,r=Z((S-x)/d,0,1))}}return e.copy(c).addScaledVector(gn,r),n.copy(l).addScaledVector(_n,a),e.distanceToSquared(n)}applyMatrix4(t){return this.start.applyMatrix4(t),this.end.applyMatrix4(t),this}equals(t){return t.start.equals(this.start)&&t.end.equals(this.end)}clone(){return new this.constructor().copy(this)}};typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"186"}}));typeof window<"u"&&(window.__THREE__?Ut("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="186");var Jl=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,$l=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Kl=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Ql=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,jl=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,th=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,eh=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,nh=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,ih=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,rh=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,sh=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,oh=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,ah=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,ch=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,lh=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,hh=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,uh=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,fh=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,dh=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,ph=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,mh=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,gh=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,_h=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,xh=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,yh=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,vh=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,Sh=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Mh=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,bh=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Th=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,wh="gl_FragColor = linearToOutputTexel( gl_FragColor );",Ah=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Eh=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,Ch=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Rh=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Ih=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Ph=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Lh=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Nh=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Dh=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Uh=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Fh=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Bh=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Oh=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,zh=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Vh=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,kh=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,Gh=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Hh=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Wh=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Xh=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,qh=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Yh=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Zh=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Jh=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,$h=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Kh=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,Qh=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,jh=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,tu=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,eu=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,nu=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,iu=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,ru=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,su=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,ou=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,au=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,cu=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,lu=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,hu=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,uu=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,fu=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,du=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,pu=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,mu=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,gu=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,_u=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,xu=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,yu=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,vu=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Su=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Mu=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,bu=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Tu=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,wu=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Au=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Eu=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Cu=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Ru=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Iu=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Pu=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,Lu=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Nu=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Du=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Uu=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Fu=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Bu=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Ou=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,zu=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Vu=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,ku=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Gu=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,Hu=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,Wu=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,Xu=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,qu=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Yu=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,Zu=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,Ju=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,$u=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Ku=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Qu=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ju=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,tf=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ef=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,nf=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,rf=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,sf=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,of=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,af=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cf=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,lf=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,hf=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,uf=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,ff=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,df=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,pf=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,mf=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,gf=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,_f=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,xf=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,yf=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,vf=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Sf=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Mf=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,bf=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Tf=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,wf=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Af=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ef=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Cf=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Rf=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,K={alphahash_fragment:Jl,alphahash_pars_fragment:$l,alphamap_fragment:Kl,alphamap_pars_fragment:Ql,alphatest_fragment:jl,alphatest_pars_fragment:th,aomap_fragment:eh,aomap_pars_fragment:nh,batching_pars_vertex:ih,batching_vertex:rh,begin_vertex:sh,beginnormal_vertex:oh,bsdfs:ah,iridescence_fragment:ch,bumpmap_pars_fragment:lh,clipping_planes_fragment:hh,clipping_planes_pars_fragment:uh,clipping_planes_pars_vertex:fh,clipping_planes_vertex:dh,color_fragment:ph,color_pars_fragment:mh,color_pars_vertex:gh,color_vertex:_h,common:xh,cube_uv_reflection_fragment:yh,defaultnormal_vertex:vh,displacementmap_pars_vertex:Sh,displacementmap_vertex:Mh,emissivemap_fragment:bh,emissivemap_pars_fragment:Th,colorspace_fragment:wh,colorspace_pars_fragment:Ah,envmap_fragment:Eh,envmap_common_pars_fragment:Ch,envmap_pars_fragment:Rh,envmap_pars_vertex:Ih,envmap_physical_pars_fragment:kh,envmap_vertex:Ph,fog_vertex:Lh,fog_pars_vertex:Nh,fog_fragment:Dh,fog_pars_fragment:Uh,gradientmap_pars_fragment:Fh,lightmap_pars_fragment:Bh,lights_lambert_fragment:Oh,lights_lambert_pars_fragment:zh,lights_pars_begin:Vh,lights_toon_fragment:Gh,lights_toon_pars_fragment:Hh,lights_phong_fragment:Wh,lights_phong_pars_fragment:Xh,lights_physical_fragment:qh,lights_physical_pars_fragment:Yh,lights_fragment_begin:Zh,lights_fragment_maps:Jh,lights_fragment_end:$h,lightprobes_pars_fragment:Kh,logdepthbuf_fragment:Qh,logdepthbuf_pars_fragment:jh,logdepthbuf_pars_vertex:tu,logdepthbuf_vertex:eu,map_fragment:nu,map_pars_fragment:iu,map_particle_fragment:ru,map_particle_pars_fragment:su,metalnessmap_fragment:ou,metalnessmap_pars_fragment:au,morphinstance_vertex:cu,morphcolor_vertex:lu,morphnormal_vertex:hu,morphtarget_pars_vertex:uu,morphtarget_vertex:fu,normal_fragment_begin:du,normal_fragment_maps:pu,normal_pars_fragment:mu,normal_pars_vertex:gu,normal_vertex:_u,normalmap_pars_fragment:xu,clearcoat_normal_fragment_begin:yu,clearcoat_normal_fragment_maps:vu,clearcoat_pars_fragment:Su,iridescence_pars_fragment:Mu,opaque_fragment:bu,packing:Tu,premultiplied_alpha_fragment:wu,project_vertex:Au,dithering_fragment:Eu,dithering_pars_fragment:Cu,roughnessmap_fragment:Ru,roughnessmap_pars_fragment:Iu,shadowmap_pars_fragment:Pu,shadowmap_pars_vertex:Lu,shadowmap_vertex:Nu,shadowmask_pars_fragment:Du,skinbase_vertex:Uu,skinning_pars_vertex:Fu,skinning_vertex:Bu,skinnormal_vertex:Ou,specularmap_fragment:zu,specularmap_pars_fragment:Vu,tonemapping_fragment:ku,tonemapping_pars_fragment:Gu,transmission_fragment:Hu,transmission_pars_fragment:Wu,uv_pars_fragment:Xu,uv_pars_vertex:qu,uv_vertex:Yu,worldpos_vertex:Zu,background_vert:Ju,background_frag:$u,backgroundCube_vert:Ku,backgroundCube_frag:Qu,cube_vert:ju,cube_frag:tf,depth_vert:ef,depth_frag:nf,distance_vert:rf,distance_frag:sf,equirect_vert:of,equirect_frag:af,linedashed_vert:cf,linedashed_frag:lf,meshbasic_vert:hf,meshbasic_frag:uf,meshlambert_vert:ff,meshlambert_frag:df,meshmatcap_vert:pf,meshmatcap_frag:mf,meshnormal_vert:gf,meshnormal_frag:_f,meshphong_vert:xf,meshphong_frag:yf,meshphysical_vert:vf,meshphysical_frag:Sf,meshtoon_vert:Mf,meshtoon_frag:bf,points_vert:Tf,points_frag:wf,shadow_vert:Af,shadow_frag:Ef,sprite_vert:Cf,sprite_frag:Rf},B={common:{diffuse:{value:new Pt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new W},alphaMap:{value:null},alphaMapTransform:{value:new W},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new W}},envmap:{envMap:{value:null},envMapRotation:{value:new W},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new W}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new W}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new W},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new W},normalScale:{value:new tt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new W},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new W}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new W}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new W}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Pt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new I},probesMax:{value:new I},probesResolution:{value:new I}},points:{diffuse:{value:new Pt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new W},alphaTest:{value:0},uvTransform:{value:new W}},sprite:{diffuse:{value:new Pt(16777215)},opacity:{value:1},center:{value:new tt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new W},alphaMap:{value:null},alphaMapTransform:{value:new W},alphaTest:{value:0}}},Na={basic:{uniforms:Gt([B.common,B.specularmap,B.envmap,B.aomap,B.lightmap,B.fog]),vertexShader:K.meshbasic_vert,fragmentShader:K.meshbasic_frag},lambert:{uniforms:Gt([B.common,B.specularmap,B.envmap,B.aomap,B.lightmap,B.emissivemap,B.bumpmap,B.normalmap,B.displacementmap,B.fog,B.lights,{emissive:{value:new Pt(0)},envMapIntensity:{value:1}}]),vertexShader:K.meshlambert_vert,fragmentShader:K.meshlambert_frag},phong:{uniforms:Gt([B.common,B.specularmap,B.envmap,B.aomap,B.lightmap,B.emissivemap,B.bumpmap,B.normalmap,B.displacementmap,B.fog,B.lights,{emissive:{value:new Pt(0)},specular:{value:new Pt(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:K.meshphong_vert,fragmentShader:K.meshphong_frag},standard:{uniforms:Gt([B.common,B.envmap,B.aomap,B.lightmap,B.emissivemap,B.bumpmap,B.normalmap,B.displacementmap,B.roughnessmap,B.metalnessmap,B.fog,B.lights,{emissive:{value:new Pt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:K.meshphysical_vert,fragmentShader:K.meshphysical_frag},toon:{uniforms:Gt([B.common,B.aomap,B.lightmap,B.emissivemap,B.bumpmap,B.normalmap,B.displacementmap,B.gradientmap,B.fog,B.lights,{emissive:{value:new Pt(0)}}]),vertexShader:K.meshtoon_vert,fragmentShader:K.meshtoon_frag},matcap:{uniforms:Gt([B.common,B.bumpmap,B.normalmap,B.displacementmap,B.fog,{matcap:{value:null}}]),vertexShader:K.meshmatcap_vert,fragmentShader:K.meshmatcap_frag},points:{uniforms:Gt([B.points,B.fog]),vertexShader:K.points_vert,fragmentShader:K.points_frag},dashed:{uniforms:Gt([B.common,B.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:K.linedashed_vert,fragmentShader:K.linedashed_frag},depth:{uniforms:Gt([B.common,B.displacementmap]),vertexShader:K.depth_vert,fragmentShader:K.depth_frag},normal:{uniforms:Gt([B.common,B.bumpmap,B.normalmap,B.displacementmap,{opacity:{value:1}}]),vertexShader:K.meshnormal_vert,fragmentShader:K.meshnormal_frag},sprite:{uniforms:Gt([B.sprite,B.fog]),vertexShader:K.sprite_vert,fragmentShader:K.sprite_frag},background:{uniforms:{uvTransform:{value:new W},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:K.background_vert,fragmentShader:K.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new W}},vertexShader:K.backgroundCube_vert,fragmentShader:K.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:K.cube_vert,fragmentShader:K.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:K.equirect_vert,fragmentShader:K.equirect_frag},distance:{uniforms:Gt([B.common,B.displacementmap,{referencePosition:{value:new I},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:K.distance_vert,fragmentShader:K.distance_frag},shadow:{uniforms:Gt([B.lights,B.fog,{color:{value:new Pt(0)},opacity:{value:1}}]),vertexShader:K.shadow_vert,fragmentShader:K.shadow_frag}};Na.physical={uniforms:Gt([Na.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new W},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new W},clearcoatNormalScale:{value:new tt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new W},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new W},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new W},sheen:{value:0},sheenColor:{value:new Pt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new W},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new W},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new W},transmissionSamplerSize:{value:new tt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new W},attenuationDistance:{value:0},attenuationColor:{value:new Pt(0)},specularColor:{value:new Pt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new W},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new W},anisotropyVector:{value:new tt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new W}}]),vertexShader:K.meshphysical_vert,fragmentShader:K.meshphysical_frag};var If=new W;If.set(-1,0,0,0,1,0,0,0,1);var qx={[Os]:"LINEAR_TONE_MAPPING",[zs]:"REINHARD_TONE_MAPPING",[Vs]:"CINEON_TONE_MAPPING",[ks]:"ACES_FILMIC_TONE_MAPPING",[Hs]:"AGX_TONE_MAPPING",[Ws]:"NEUTRAL_TONE_MAPPING",[Gs]:"CUSTOM_TONE_MAPPING"};var Yx=new Float32Array(16),Zx=new Float32Array(9),Jx=new Float32Array(4);var $x={[Os]:"Linear",[zs]:"Reinhard",[Vs]:"Cineon",[ks]:"ACESFilmic",[Hs]:"AgX",[Ws]:"Neutral",[Gs]:"Custom"};var Kx={[ua]:"SHADOWMAP_TYPE_PCF",[fa]:"SHADOWMAP_TYPE_VSM"};var Qx={[ya]:"ENVMAP_TYPE_CUBE",[qs]:"ENVMAP_TYPE_CUBE",[va]:"ENVMAP_TYPE_CUBE_UV"};var jx={[qs]:"ENVMAP_MODE_REFRACTION"};var ty={[Bs]:"ENVMAP_BLENDING_MULTIPLY",[_a]:"ENVMAP_BLENDING_MIX",[xa]:"ENVMAP_BLENDING_ADD"};var Pf=new W;Pf.set(-1,0,0,0,1,0,0,0,1);var ey=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);var Tn=Math.pow(2,-24),si=Symbol("SKIP_GENERATION"),lr={strategy:0,maxDepth:40,maxLeafSize:10,useSharedArrayBuffer:!1,setBoundingBox:!0,onProgress:null,indirect:!1,verbose:!0,range:null,[si]:!1};function dt(p,t,e){return e.min.x=t[p],e.min.y=t[p+1],e.min.z=t[p+2],e.max.x=t[p+3],e.max.y=t[p+4],e.max.z=t[p+5],e}function Ks(p){let t=-1,e=-1/0;for(let n=0;n<3;n++){let i=p[n+3]-p[n];i>e&&(e=i,t=n)}return t}function Qs(p,t){t.set(p)}function js(p,t,e){let n,i;for(let r=0;r<3;r++){let a=r+3;n=p[r],i=t[r],e[r]=n<i?n:i,n=p[a],i=t[a],e[a]=n>i?n:i}}function oi(p,t,e){for(let n=0;n<3;n++){let i=t[p+2*n],r=t[p+2*n+1],a=i-r,c=i+r;a<e[n]&&(e[n]=a),c>e[n+3]&&(e[n+3]=c)}}function wn(p){let t=p[3]-p[0],e=p[4]-p[1],n=p[5]-p[2];return 2*(t*e+e*n+n*t)}function st(p,t){return t[p+15]===65535}function pt(p,t){return t[p+6]}function _t(p,t){return t[p+14]}function ct(p){return p+8}function lt(p,t){let e=t[p+6];return p+e*8}function An(p,t){return t[p+7]}function hr(p,t,e,n,i){let r=1/0,a=1/0,c=1/0,l=-1/0,f=-1/0,u=-1/0,d=1/0,m=1/0,g=1/0,x=-1/0,S=-1/0,b=-1/0,E=p.offset||0;for(let T=(t-E)*6,h=(t+e-E)*6;T<h;T+=6){let o=p[T+0],_=p[T+1],s=o-_,R=o+_;s<r&&(r=s),R>l&&(l=R),o<d&&(d=o),o>x&&(x=o);let w=p[T+2],v=p[T+3],y=w-v,A=w+v;y<a&&(a=y),A>f&&(f=A),w<m&&(m=w),w>S&&(S=w);let M=p[T+4],C=p[T+5],P=M-C,L=M+C;P<c&&(c=P),L>u&&(u=L),M<g&&(g=M),M>b&&(b=M)}n[0]=r,n[1]=a,n[2]=c,n[3]=l,n[4]=f,n[5]=u,i[0]=d,i[1]=m,i[2]=g,i[3]=x,i[4]=S,i[5]=b}var Te=32,Df=(p,t)=>p.candidate-t.candidate,Be=new Array(Te).fill().map(()=>({count:0,bounds:new Float32Array(6),rightCacheBounds:new Float32Array(6),leftCacheBounds:new Float32Array(6),candidate:0})),ur=new Float32Array(6);function Ua(p,t,e,n,i,r){let a=-1,c=0;if(r===0)a=Ks(t),a!==-1&&(c=(t[a]+t[a+3])/2);else if(r===1)a=Ks(p),a!==-1&&(c=Uf(e,n,i,a));else if(r===2){let l=wn(p),f=1.25*i,u=e.offset||0,d=(n-u)*6,m=(n+i-u)*6;for(let g=0;g<3;g++){let x=t[g],E=(t[g+3]-x)/Te;if(i<Te/4){let T=[...Be];T.length=i;let h=0;for(let _=d;_<m;_+=6,h++){let s=T[h];s.candidate=e[_+2*g],s.count=0;let{bounds:R,leftCacheBounds:w,rightCacheBounds:v}=s;for(let y=0;y<3;y++)v[y]=1/0,v[y+3]=-1/0,w[y]=1/0,w[y+3]=-1/0,R[y]=1/0,R[y+3]=-1/0;oi(_,e,R)}T.sort(Df);let o=i;for(let _=0;_<o;_++){let s=T[_];for(;_+1<o&&T[_+1].candidate===s.candidate;)T.splice(_+1,1),o--}for(let _=d;_<m;_+=6){let s=e[_+2*g];for(let R=0;R<o;R++){let w=T[R];s>=w.candidate?oi(_,e,w.rightCacheBounds):(oi(_,e,w.leftCacheBounds),w.count++)}}for(let _=0;_<o;_++){let s=T[_],R=s.count,w=i-s.count,v=s.leftCacheBounds,y=s.rightCacheBounds,A=0;R!==0&&(A=wn(v)/l);let M=0;w!==0&&(M=wn(y)/l);let C=1+1.25*(A*R+M*w);C<f&&(a=g,f=C,c=s.candidate)}}else{for(let o=0;o<Te;o++){let _=Be[o];_.count=0,_.candidate=x+E+o*E;let s=_.bounds;for(let R=0;R<3;R++)s[R]=1/0,s[R+3]=-1/0}for(let o=d;o<m;o+=6){let R=~~((e[o+2*g]-x)/E);R>=Te&&(R=Te-1);let w=Be[R];w.count++,oi(o,e,w.bounds)}let T=Be[Te-1];Qs(T.bounds,T.rightCacheBounds);for(let o=Te-2;o>=0;o--){let _=Be[o],s=Be[o+1];js(_.bounds,s.rightCacheBounds,_.rightCacheBounds)}let h=0;for(let o=0;o<Te-1;o++){let _=Be[o],s=_.count,R=_.bounds,v=Be[o+1].rightCacheBounds;s!==0&&(h===0?Qs(R,ur):js(R,ur,ur)),h+=s;let y=0,A=0;h!==0&&(y=wn(ur)/l);let M=i-h;M!==0&&(A=wn(v)/l);let C=1+1.25*(y*h+A*M);C<f&&(a=g,f=C,c=_.candidate)}}}}else console.warn(`BVH: Invalid build strategy value ${r} used.`);return{axis:a,pos:c}}function Uf(p,t,e,n){let i=0,r=p.offset;for(let a=t,c=t+e;a<c;a++)i+=p[(a-r)*6+n*2];return i/e}var En=class{constructor(){this.boundingData=new Float32Array(6)}};function Fa(p,t,e,n,i,r){let a=n,c=n+i-1,l=r.pos,f=r.axis*2,u=e.offset||0;for(;;){for(;a<=c&&e[(a-u)*6+f]<l;)a++;for(;a<=c&&e[(c-u)*6+f]>=l;)c--;if(a<c){for(let d=0;d<t;d++){let m=p[a*t+d];p[a*t+d]=p[c*t+d],p[c*t+d]=m}for(let d=0;d<6;d++){let m=a-u,g=c-u,x=e[m*6+d];e[m*6+d]=e[g*6+d],e[g*6+d]=x}a++,c--}else return a}}var Ba,fr,to,Oa,Ff=Math.pow(2,32);function dr(p){return"count"in p?1:1+dr(p.left)+dr(p.right)}function za(p,t,e){return Ba=new Float32Array(e),fr=new Uint32Array(e),to=new Uint16Array(e),Oa=new Uint8Array(e),eo(p,t)}function eo(p,t){let e=p/4,n=p/2,i="count"in t,r=t.boundingData;for(let a=0;a<6;a++)Ba[e+a]=r[a];if(i)return t.buffer?(Oa.set(new Uint8Array(t.buffer),p),p+t.buffer.byteLength):(fr[e+6]=t.offset,to[n+14]=t.count,to[n+15]=65535,p+32);{let{left:a,right:c,splitAxis:l}=t,f=p+32,u=eo(f,a),d=p/32,g=u/32-d;if(g>Ff)throw new Error("MeshBVH: Cannot store relative child node offset greater than 32 bits.");return fr[e+6]=g,fr[e+7]=l,eo(u,c)}}function Bf(p,t,e,n,i){let{maxDepth:r,verbose:a,maxLeafSize:c,strategy:l,onProgress:f}=i,u=p.primitiveBuffer,d=p.primitiveBufferStride,m=new Float32Array(6),g=!1,x=new En;return hr(t,e,n,x.boundingData,m),b(x,e,n,m),x;function S(E){f&&f(E/n)}function b(E,T,h,o=null,_=0){if(!g&&_>=r&&(g=!0,a&&console.warn(`BVH: Max depth of ${r} reached when generating BVH. Consider increasing maxDepth.`)),h<=c||_>=r)return S(T+h),E.offset=T,E.count=h,E;let s=Ua(E.boundingData,o,t,T,h,l);if(s.axis===-1)return S(T+h),E.offset=T,E.count=h,E;let R=Fa(u,d,t,T,h,s);if(R===T||R===T+h)S(T+h),E.offset=T,E.count=h;else{E.splitAxis=s.axis;let w=new En,v=T,y=R-T;E.left=w,hr(t,v,y,w.boundingData,m),b(w,v,y,m,_+1);let A=new En,M=R,C=h-y;E.right=A,hr(t,M,C,A.boundingData,m),b(A,M,C,m,_+1)}return E}}function Va(p,t){let e=t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,n=p.getRootRanges(t.range),i=n[0],r=n[n.length-1],a={offset:i.offset,count:r.offset+r.count-i.offset},c=new Float32Array(6*a.count);c.offset=a.offset,p.computePrimitiveBounds(a.offset,a.count,c),p._roots=n.map(l=>{let f=Bf(p,c,l.offset,l.count,t),u=dr(f),d=new e(32*u);return za(0,f,d),d})}var Oe=class{constructor(t){this._getNewPrimitive=t,this._primitives=[]}getPrimitive(){let t=this._primitives;return t.length===0?this._getNewPrimitive():t.pop()}releasePrimitive(t){this._primitives.push(t)}};var no=class{constructor(){this.float32Array=null,this.uint16Array=null,this.uint32Array=null;let t=[],e=null;this.setBuffer=n=>{e&&t.push(e),e=n,this.float32Array=new Float32Array(n),this.uint16Array=new Uint16Array(n),this.uint32Array=new Uint32Array(n)},this.clearBuffer=()=>{e=null,this.float32Array=null,this.uint16Array=null,this.uint32Array=null,t.length!==0&&this.setBuffer(t.pop())}}},j=new no;var ze,Rn,Cn=[],pr=new Oe(()=>new Et);function ka(p,t,e,n,i,r){ze=pr.getPrimitive(),Rn=pr.getPrimitive(),Cn.push(ze,Rn),j.setBuffer(p._roots[t]);let a=io(0,p.geometry,e,n,i,r);j.clearBuffer(),pr.releasePrimitive(ze),pr.releasePrimitive(Rn),Cn.pop(),Cn.pop();let c=Cn.length;return c>0&&(Rn=Cn[c-1],ze=Cn[c-2]),a}function io(p,t,e,n,i=null,r=0,a=0){let{float32Array:c,uint16Array:l,uint32Array:f}=j,u=p*2;if(st(u,l)){let m=pt(p,f),g=_t(u,l);return dt(p,c,ze),n(m,g,!1,a,r+p/8,ze)}else{let y=function(M){let{uint16Array:C,uint32Array:P}=j,L=M*2;for(;!st(L,C);)M=ct(M),L=M*2;return pt(M,P)},A=function(M){let{uint16Array:C,uint32Array:P}=j,L=M*2;for(;!st(L,C);)M=lt(M,P),L=M*2;return pt(M,P)+_t(L,C)},m=ct(p),g=lt(p,f),x=m,S=g,b,E,T,h;if(i&&(T=ze,h=Rn,dt(x,c,T),dt(S,c,h),b=i(T),E=i(h),E<b)){x=g,S=m;let M=b;b=E,E=M,T=h}T||(T=ze,dt(x,c,T));let o=st(x*2,l),_=e(T,o,b,a+1,r+x/8),s;if(_===2){let M=y(x),P=A(x)-M;s=n(M,P,!0,a+1,r+x/8,T)}else s=_&&io(x,t,e,n,i,r,a+1);if(s)return!0;h=Rn,dt(S,c,h);let R=st(S*2,l),w=e(h,R,E,a+1,r+S/8),v;if(w===2){let M=y(S),P=A(S)-M;v=n(M,P,!0,a+1,r+S/8,h)}else v=w&&io(S,t,e,n,i,r,a+1);return!!v}}var ai=new j.constructor,mr=new j.constructor,Ve=new Oe(()=>new Et),In=new Et,Pn=new Et,so=new Et,oo=new Et,ao=!1;function Ga(p,t,e,n){if(ao)throw new Error("MeshBVH: Recursive calls to bvhcast not supported.");ao=!0;let i=p._roots,r=t._roots,a,c=0,l=0,f=new Q().copy(e).invert();for(let u=0,d=i.length;u<d;u++){ai.setBuffer(i[u]),l=0;let m=Ve.getPrimitive();dt(0,ai.float32Array,m),m.applyMatrix4(f);for(let g=0,x=r.length;g<x&&(mr.setBuffer(r[g]),a=he(0,0,e,f,n,c,l,0,0,m),mr.clearBuffer(),l+=r[g].byteLength/32,!a);g++);if(Ve.releasePrimitive(m),ai.clearBuffer(),c+=i[u].byteLength/32,a)break}return ao=!1,a}function he(p,t,e,n,i,r=0,a=0,c=0,l=0,f=null,u=!1){let d,m;u?(d=mr,m=ai):(d=ai,m=mr);let g=d.float32Array,x=d.uint32Array,S=d.uint16Array,b=m.float32Array,E=m.uint32Array,T=m.uint16Array,h=p*2,o=t*2,_=st(h,S),s=st(o,T),R=!1;if(s&&_)u?R=i(pt(t,E),_t(t*2,T),pt(p,x),_t(p*2,S),l,a+t/8,c,r+p/8):R=i(pt(p,x),_t(p*2,S),pt(t,E),_t(t*2,T),c,r+p/8,l,a+t/8);else if(s){let w=Ve.getPrimitive();dt(t,b,w),w.applyMatrix4(e);let v=ct(p),y=lt(p,x);dt(v,g,In),dt(y,g,Pn);let A=w.intersectsBox(In),M=w.intersectsBox(Pn);R=A&&he(t,v,n,e,i,a,r,l,c+1,w,!u)||M&&he(t,y,n,e,i,a,r,l,c+1,w,!u),Ve.releasePrimitive(w)}else{let w=ct(t),v=lt(t,E);dt(w,b,so),dt(v,b,oo);let y=f.intersectsBox(so),A=f.intersectsBox(oo);if(y&&A)R=he(p,w,e,n,i,r,a,c,l+1,f,u)||he(p,v,e,n,i,r,a,c,l+1,f,u);else if(y)if(_)R=he(p,w,e,n,i,r,a,c,l+1,f,u);else{let M=Ve.getPrimitive();M.copy(so).applyMatrix4(e);let C=ct(p),P=lt(p,x);dt(C,g,In),dt(P,g,Pn);let L=M.intersectsBox(In),N=M.intersectsBox(Pn);R=L&&he(w,C,n,e,i,a,r,l,c+1,M,!u)||N&&he(w,P,n,e,i,a,r,l,c+1,M,!u),Ve.releasePrimitive(M)}else if(A)if(_)R=he(p,v,e,n,i,r,a,c,l+1,f,u);else{let M=Ve.getPrimitive();M.copy(oo).applyMatrix4(e);let C=ct(p),P=lt(p,x);dt(C,g,In),dt(P,g,Pn);let L=M.intersectsBox(In),N=M.intersectsBox(Pn);R=L&&he(v,C,n,e,i,a,r,l,c+1,M,!u)||N&&he(v,P,n,e,i,a,r,l,c+1,M,!u),Ve.releasePrimitive(M)}}return R}var Ha=new Et,Ln=new Float32Array(6),gr=class{constructor(){this._roots=null,this.primitiveBuffer=null,this.primitiveBufferStride=null}init(t){t={...lr,...t},Va(this,t)}getRootRanges(){throw new Error("BVH: getRootRanges() not implemented")}writePrimitiveBounds(){throw new Error("BVH: writePrimitiveBounds() not implemented")}writePrimitiveRangeBounds(t,e,n,i){let r=1/0,a=1/0,c=1/0,l=-1/0,f=-1/0,u=-1/0;for(let d=t,m=t+e;d<m;d++){this.writePrimitiveBounds(d,Ln,0);let[g,x,S,b,E,T]=Ln;g<r&&(r=g),b>l&&(l=b),x<a&&(a=x),E>f&&(f=E),S<c&&(c=S),T>u&&(u=T)}return n[i+0]=r,n[i+1]=a,n[i+2]=c,n[i+3]=l,n[i+4]=f,n[i+5]=u,n}computePrimitiveBounds(t,e,n){let i=n.offset||0;for(let r=t,a=t+e;r<a;r++){this.writePrimitiveBounds(r,Ln,0);let[c,l,f,u,d,m]=Ln,g=(c+u)/2,x=(l+d)/2,S=(f+m)/2,b=(u-c)/2,E=(d-l)/2,T=(m-f)/2,h=(r-i)*6;n[h+0]=g,n[h+1]=b+(Math.abs(g)+b)*Tn,n[h+2]=x,n[h+3]=E+(Math.abs(x)+E)*Tn,n[h+4]=S,n[h+5]=T+(Math.abs(S)+T)*Tn}return n}shiftPrimitiveOffsets(t){let e=this._indirectBuffer;if(e)for(let n=0,i=e.length;n<i;n++)e[n]+=t;else{let n=this._roots;for(let i=0;i<n.length;i++){let r=n[i],a=new Uint32Array(r),c=new Uint16Array(r),l=r.byteLength/32;for(let f=0;f<l;f++){let u=8*f,d=2*u;st(d,c)&&(a[u+6]+=t)}}}}traverse(t,e=0){let n=this._roots[e],i=new Uint32Array(n),r=new Uint16Array(n);a(0);function a(c,l=0){let f=c*2,u=st(f,r);if(u){let d=i[c+6],m=r[f+14];t(l,u,new Float32Array(n,c*4,6),d,m)}else{let d=ct(c),m=lt(c,i),g=An(c,i);t(l,u,new Float32Array(n,c*4,6),g)||(a(d,l+1),a(m,l+1))}}}refit(){let t=this._roots;for(let e=0,n=t.length;e<n;e++){let i=t[e],r=new Uint32Array(i),a=new Uint16Array(i),c=new Float32Array(i),l=i.byteLength/32;for(let f=l-1;f>=0;f--){let u=f*8,d=u*2;if(st(d,a)){let g=pt(u,r),x=_t(d,a);this.writePrimitiveRangeBounds(g,x,Ln,0),c.set(Ln,u)}else{let g=ct(u),x=lt(u,r);for(let S=0;S<3;S++){let b=c[g+S],E=c[g+S+3],T=c[x+S],h=c[x+S+3];c[u+S]=b<T?b:T,c[u+S+3]=E>h?E:h}}}}}getBoundingBox(t){return t.makeEmpty(),this._roots.forEach(n=>{dt(0,new Float32Array(n),Ha),t.union(Ha)}),t}shapecast(t){let{boundsTraverseOrder:e,intersectsBounds:n,intersectsRange:i,intersectsPrimitive:r,scratchPrimitive:a,iterate:c}=t;if(i&&r){let d=i;i=(m,g,x,S,b)=>d(m,g,x,S,b)?!0:c(m,g,this,r,x,S,a)}else i||(r?i=(d,m,g,x)=>c(d,m,this,r,g,x,a):i=(d,m,g)=>g);let l=!1,f=0,u=this._roots;for(let d=0,m=u.length;d<m;d++){let g=u[d];if(l=ka(this,d,n,i,e,f),l)break;f+=g.byteLength/32}return l}bvhcast(t,e,n){let{intersectsRanges:i}=n;return Ga(this,t,e,i)}};function Wa(){return typeof SharedArrayBuffer<"u"}function co(p){return p.index?p.index.count:p.attributes.position.count}function ke(p){return co(p)/3}function zf(p,t=ArrayBuffer){return p>65535?new Uint32Array(new t(4*p)):new Uint16Array(new t(2*p))}function Xa(p,t){if(!p.index){let e=p.attributes.position.count,n=t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,i=zf(e,n);p.setIndex(new Vt(i,1));for(let r=0;r<e;r++)i[r]=r}}function Vf(p,t,e){let n=co(p)/e,i=t||p.drawRange,r=i.start/e,a=(i.start+i.count)/e,c=Math.max(0,r),l=Math.min(n,a)-c;return{offset:Math.floor(c),count:Math.floor(l)}}function kf(p,t){return p.groups.map(e=>({offset:e.start/t,count:e.count/t}))}function lo(p,t,e){let n=Vf(p,t,e),i=kf(p,e);if(!i.length)return[n];let r=[],a=n.offset,c=n.offset+n.count,l=co(p)/e,f=[];for(let m of i){let{offset:g,count:x}=m,S=g,b=isFinite(x)?x:l-g,E=g+b;S<c&&E>a&&(f.push({pos:Math.max(a,S),isStart:!0}),f.push({pos:Math.min(c,E),isStart:!1}))}f.sort((m,g)=>m.pos!==g.pos?m.pos-g.pos:m.type==="end"?-1:1);let u=0,d=null;for(let m of f){let g=m.pos;u!==0&&g!==d&&r.push({offset:d,count:g-d}),u+=m.isStart?1:-1,d=g}return r}function Gf(p,t){let e=p[p.length-1],n=e.offset+e.count>2**16,i=p.reduce((f,u)=>f+u.count,0),r=n?4:2,a=t?new SharedArrayBuffer(i*r):new ArrayBuffer(i*r),c=n?new Uint32Array(a):new Uint16Array(a),l=0;for(let f=0;f<p.length;f++){let{offset:u,count:d}=p[f];for(let m=0;m<d;m++)c[l+m]=u+m;l+=d}return c}var _r=class extends gr{get indirect(){return!!this._indirectBuffer}get primitiveStride(){return null}get primitiveBufferStride(){return this.indirect?1:this.primitiveStride}set primitiveBufferStride(t){}get primitiveBuffer(){return this.indirect?this._indirectBuffer:this.geometry.index.array}set primitiveBuffer(t){}constructor(t,e={}){if(t.isBufferGeometry){if(t.index&&t.index.isInterleavedBufferAttribute)throw new Error("BVH: InterleavedBufferAttribute is not supported for the index attribute.")}else throw new Error("BVH: Only BufferGeometries are supported.");if(e.useSharedArrayBuffer&&!Wa())throw new Error("BVH: SharedArrayBuffer is not available.");super(),this.geometry=t,this.resolvePrimitiveIndex=e.indirect?n=>this._indirectBuffer[n]:n=>n,this.primitiveBuffer=null,this.primitiveBufferStride=null,this._indirectBuffer=null,e={...lr,...e},e[si]||this.init(e)}init(t){let{geometry:e,primitiveStride:n}=this;if(t.indirect){let i=lo(e,t.range,n),r=Gf(i,t.useSharedArrayBuffer);this._indirectBuffer=r}else Xa(e,t);super.init(t),!e.boundingBox&&t.setBoundingBox&&(e.boundingBox=this.getBoundingBox(new Et))}getRootRanges(t){return this.indirect?[{offset:0,count:this._indirectBuffer.length}]:lo(this.geometry,t,this.primitiveStride)}raycastObject3D(){throw new Error("BVH: raycastObject3D() not implemented")}};var Kt=class{constructor(){this.min=1/0,this.max=-1/0}setFromPointsField(t,e){let n=1/0,i=-1/0;for(let r=0,a=t.length;r<a;r++){let l=t[r][e];n=l<n?l:n,i=l>i?l:i}this.min=n,this.max=i}setFromPoints(t,e){let n=1/0,i=-1/0;for(let r=0,a=e.length;r<a;r++){let c=e[r],l=t.dot(c);n=l<n?l:n,i=l>i?l:i}this.min=n,this.max=i}isSeparated(t){return this.min>t.max||t.min>this.max}};Kt.prototype.setFromBox=(function(){let p=new I;return function(e,n){let i=n.min,r=n.max,a=1/0,c=-1/0;for(let l=0;l<=1;l++)for(let f=0;f<=1;f++)for(let u=0;u<=1;u++){p.x=i.x*l+r.x*(1-l),p.y=i.y*f+r.y*(1-f),p.z=i.z*u+r.z*(1-u);let d=e.dot(p);a=Math.min(d,a),c=Math.max(d,c)}this.min=a,this.max=c}})();var Hf=(function(){let p=new I,t=new I,e=new I;return function(i,r,a){let c=i.start,l=p,f=r.start,u=t;e.subVectors(c,f),p.subVectors(i.end,i.start),t.subVectors(r.end,r.start);let d=e.dot(u),m=u.dot(l),g=u.dot(u),x=e.dot(l),b=l.dot(l)*g-m*m,E,T;b!==0?E=(d*m-x*g)/b:E=0,T=(d+E*m)/g,a.x=E,a.y=T}})(),ci=(function(){let p=new tt,t=new I,e=new I;return function(i,r,a,c){Hf(i,r,p);let l=p.x,f=p.y;if(l>=0&&l<=1&&f>=0&&f<=1){i.at(l,a),r.at(f,c);return}else if(l>=0&&l<=1){f<0?r.at(0,c):r.at(1,c),i.closestPointToPoint(c,!0,a);return}else if(f>=0&&f<=1){l<0?i.at(0,a):i.at(1,a),r.closestPointToPoint(a,!0,c);return}else{let u;l<0?u=i.start:u=i.end;let d;f<0?d=r.start:d=r.end;let m=t,g=e;if(i.closestPointToPoint(d,!0,t),r.closestPointToPoint(u,!0,e),m.distanceToSquared(d)<=g.distanceToSquared(u)){a.copy(m),c.copy(d);return}else{a.copy(u),c.copy(g);return}}}})(),qa=(function(){let p=new I,t=new I,e=new re,n=new ht;return function(r,a){let{radius:c,center:l}=r,{a:f,b:u,c:d}=a;if(n.start=f,n.end=u,n.closestPointToPoint(l,!0,p).distanceTo(l)<=c||(n.start=f,n.end=d,n.closestPointToPoint(l,!0,p).distanceTo(l)<=c)||(n.start=u,n.end=d,n.closestPointToPoint(l,!0,p).distanceTo(l)<=c))return!0;let S=a.getPlane(e);if(Math.abs(S.distanceToPoint(l))<=c){let E=S.projectPoint(l,t);if(a.containsPoint(E))return!0}return!1}})();var Wf=["x","y","z"],we=1e-15,Ya=we*we;function se(p){return Math.abs(p)<we}var Rt=class extends ft{constructor(...t){super(...t),this.isExtendedTriangle=!0,this.satAxes=new Array(4).fill().map(()=>new I),this.satBounds=new Array(4).fill().map(()=>new Kt),this.points=[this.a,this.b,this.c],this.plane=new re,this.isDegenerateIntoSegment=!1,this.isDegenerateIntoPoint=!1,this.degenerateSegment=new ht,this.needsUpdate=!0}intersectsSphere(t){return qa(t,this)}update(){let t=this.a,e=this.b,n=this.c,i=this.points,r=this.satAxes,a=this.satBounds,c=r[0],l=a[0];this.getNormal(c),l.setFromPoints(c,i);let f=r[1],u=a[1];f.subVectors(t,e),u.setFromPoints(f,i);let d=r[2],m=a[2];d.subVectors(e,n),m.setFromPoints(d,i);let g=r[3],x=a[3];g.subVectors(n,t),x.setFromPoints(g,i);let S=f.length(),b=d.length(),E=g.length();this.isDegenerateIntoPoint=!1,this.isDegenerateIntoSegment=!1,S<we?b<we||E<we?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(t),this.degenerateSegment.end.copy(n)):b<we?E<we?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(e),this.degenerateSegment.end.copy(t)):E<we&&(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(n),this.degenerateSegment.end.copy(e)),this.plane.setFromNormalAndCoplanarPoint(c,t),this.needsUpdate=!1}};Rt.prototype.closestPointToSegment=(function(){let p=new I,t=new I,e=new ht;return function(i,r=null,a=null){let{start:c,end:l}=i,f=this.points,u,d=1/0;for(let m=0;m<3;m++){let g=(m+1)%3;e.start.copy(f[m]),e.end.copy(f[g]),ci(e,i,p,t),u=p.distanceToSquared(t),u<d&&(d=u,r&&r.copy(p),a&&a.copy(t))}return this.closestPointToPoint(c,p),u=c.distanceToSquared(p),u<d&&(d=u,r&&r.copy(p),a&&a.copy(c)),this.closestPointToPoint(l,p),u=l.distanceToSquared(p),u<d&&(d=u,r&&r.copy(p),a&&a.copy(l)),Math.sqrt(d)}})();Rt.prototype.intersectsTriangle=(function(){let p=new Rt,t=new Kt,e=new Kt,n=new I,i=new I,r=new I,a=new I,c=new ht,l=new ht,f=new I,u=new tt,d=new tt;function m(h,o,_,s){let R=n;!h.isDegenerateIntoPoint&&!h.isDegenerateIntoSegment?R.copy(h.plane.normal):R.copy(o.plane.normal);let w=h.satBounds,v=h.satAxes;for(let M=1;M<4;M++){let C=w[M],P=v[M];if(t.setFromPoints(P,o.points),C.isSeparated(t)||(a.copy(R).cross(P),t.setFromPoints(a,h.points),e.setFromPoints(a,o.points),t.isSeparated(e)))return!1}let y=o.satBounds,A=o.satAxes;for(let M=1;M<4;M++){let C=y[M],P=A[M];if(t.setFromPoints(P,h.points),C.isSeparated(t)||(a.crossVectors(R,P),t.setFromPoints(a,h.points),e.setFromPoints(a,o.points),t.isSeparated(e)))return!1}return _&&(s||console.warn("ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0."),_.start.set(0,0,0),_.end.set(0,0,0)),!0}function g(h,o,_,s,R,w,v,y,A,M,C){let P=v/(v-y);M.x=s+(R-s)*P,C.start.subVectors(o,h).multiplyScalar(P).add(h),P=v/(v-A),M.y=s+(w-s)*P,C.end.subVectors(_,h).multiplyScalar(P).add(h)}function x(h,o,_,s,R,w,v,y,A,M,C){if(R>0)g(h.c,h.a,h.b,s,o,_,A,v,y,M,C);else if(w>0)g(h.b,h.a,h.c,_,o,s,y,v,A,M,C);else if(y*A>0||v!=0)g(h.a,h.b,h.c,o,_,s,v,y,A,M,C);else if(y!=0)g(h.b,h.a,h.c,_,o,s,y,v,A,M,C);else if(A!=0)g(h.c,h.a,h.b,s,o,_,A,v,y,M,C);else return!0;return!1}function S(h,o,_,s){let R=o.degenerateSegment,w=h.plane.distanceToPoint(R.start),v=h.plane.distanceToPoint(R.end);return se(w)?se(v)?m(h,o,_,s):(_&&(_.start.copy(R.start),_.end.copy(R.start)),h.containsPoint(R.start)):se(v)?(_&&(_.start.copy(R.end),_.end.copy(R.end)),h.containsPoint(R.end)):h.plane.intersectLine(R,n)!=null?(_&&(_.start.copy(n),_.end.copy(n)),h.containsPoint(n)):!1}function b(h,o,_){let s=o.a;return se(h.plane.distanceToPoint(s))&&h.containsPoint(s)?(_&&(_.start.copy(s),_.end.copy(s)),!0):!1}function E(h,o,_){let s=h.degenerateSegment,R=o.a;return s.closestPointToPoint(R,!0,n),R.distanceToSquared(n)<Ya?(_&&(_.start.copy(R),_.end.copy(R)),!0):!1}function T(h,o,_,s){if(h.isDegenerateIntoSegment)if(o.isDegenerateIntoSegment){let R=h.degenerateSegment,w=o.degenerateSegment,v=i,y=r;R.delta(v),w.delta(y);let A=n.subVectors(w.start,R.start),M=v.x*y.y-v.y*y.x;if(se(M))return!1;let C=(A.x*y.y-A.y*y.x)/M,P=-(v.x*A.y-v.y*A.x)/M;if(C<0||C>1||P<0||P>1)return!1;let L=R.start.z+v.z*C,N=w.start.z+y.z*P;return se(L-N)?(_&&(_.start.copy(R.start).addScaledVector(v,C),_.end.copy(R.start).addScaledVector(v,C)),!0):!1}else return o.isDegenerateIntoPoint?E(h,o,_):S(o,h,_,s);else{if(h.isDegenerateIntoPoint)return o.isDegenerateIntoPoint?o.a.distanceToSquared(h.a)<Ya?(_&&(_.start.copy(h.a),_.end.copy(h.a)),!0):!1:o.isDegenerateIntoSegment?E(o,h,_):b(o,h,_);if(o.isDegenerateIntoPoint)return b(h,o,_);if(o.isDegenerateIntoSegment)return S(h,o,_,s)}}return function(o,_=null,s=!1){this.needsUpdate&&this.update(),o.isExtendedTriangle?o.needsUpdate&&o.update():(p.copy(o),p.update(),o=p);let R=T(this,o,_,s);if(R!==void 0)return R;let w=this.plane,v=o.plane,y=v.distanceToPoint(this.a),A=v.distanceToPoint(this.b),M=v.distanceToPoint(this.c);se(y)&&(y=0),se(A)&&(A=0),se(M)&&(M=0);let C=y*A,P=y*M;if(C>0&&P>0)return!1;let L=w.distanceToPoint(o.a),N=w.distanceToPoint(o.b),D=w.distanceToPoint(o.c);se(L)&&(L=0),se(N)&&(N=0),se(D)&&(D=0);let U=L*N,F=L*D;if(U>0&&F>0)return!1;i.copy(w.normal),r.copy(v.normal);let q=i.cross(r),O=0,z=Math.abs(q.x),H=Math.abs(q.y);H>z&&(z=H,O=1),Math.abs(q.z)>z&&(O=2);let k=Wf[O],ot=this.a[k],J=this.b[k],Y=this.c[k],G=o.a[k],X=o.b[k],$=o.c[k];if(x(this,ot,J,Y,C,P,y,A,M,u,c))return m(this,o,_,s);if(x(o,G,X,$,U,F,L,N,D,d,l))return m(this,o,_,s);if(u.y<u.x){let Nt=u.y;u.y=u.x,u.x=Nt,f.copy(c.start),c.start.copy(c.end),c.end.copy(f)}if(d.y<d.x){let Nt=d.y;d.y=d.x,d.x=Nt,f.copy(l.start),l.start.copy(l.end),l.end.copy(f)}return u.y<d.x||d.y<u.x?!1:(_&&(d.x>u.x?_.start.copy(l.start):_.start.copy(c.start),d.y<u.y?_.end.copy(l.end):_.end.copy(c.end)),!0)}})();Rt.prototype.distanceToPoint=(function(){let p=new I;return function(e){return this.closestPointToPoint(e,p),e.distanceTo(p)}})();Rt.prototype.distanceToTriangle=(function(){let p=new I,t=new I,e=["a","b","c"],n=new ht,i=new ht;return function(a,c=null,l=null){let f=c||l?n:null;if(this.intersectsTriangle(a,f))return(c||l)&&(c&&f.getCenter(c),l&&f.getCenter(l)),0;let u=1/0;for(let d=0;d<3;d++){let m,g=e[d],x=a[g];this.closestPointToPoint(x,p),m=x.distanceToSquared(p),m<u&&(u=m,c&&c.copy(p),l&&l.copy(x));let S=this[g];a.closestPointToPoint(S,p),m=S.distanceToSquared(p),m<u&&(u=m,c&&c.copy(S),l&&l.copy(p))}for(let d=0;d<3;d++){let m=e[d],g=e[(d+1)%3];n.set(this[m],this[g]);for(let x=0;x<3;x++){let S=e[x],b=e[(x+1)%3];i.set(a[S],a[b]),ci(n,i,p,t);let E=p.distanceToSquared(t);E<u&&(u=E,c&&c.copy(p),l&&l.copy(t))}}return Math.sqrt(u)}})();var It=class{constructor(t,e,n){this.isOrientedBox=!0,this.min=new I,this.max=new I,this.matrix=new Q,this.invMatrix=new Q,this.points=new Array(8).fill().map(()=>new I),this.satAxes=new Array(3).fill().map(()=>new I),this.satBounds=new Array(3).fill().map(()=>new Kt),this.alignedSatBounds=new Array(3).fill().map(()=>new Kt),this.needsUpdate=!1,t&&this.min.copy(t),e&&this.max.copy(e),n&&this.matrix.copy(n)}set(t,e,n){this.min.copy(t),this.max.copy(e),this.matrix.copy(n),this.needsUpdate=!0}copy(t){this.min.copy(t.min),this.max.copy(t.max),this.matrix.copy(t.matrix),this.needsUpdate=!0}};It.prototype.update=(function(){return function(){let t=this.matrix,e=this.min,n=this.max,i=this.points;for(let f=0;f<=1;f++)for(let u=0;u<=1;u++)for(let d=0;d<=1;d++){let m=1*f|2*u|4*d,g=i[m];g.x=f?n.x:e.x,g.y=u?n.y:e.y,g.z=d?n.z:e.z,g.applyMatrix4(t)}let r=this.satBounds,a=this.satAxes,c=i[0];for(let f=0;f<3;f++){let u=a[f],d=r[f],m=1<<f,g=i[m];u.subVectors(c,g),d.setFromPoints(u,i)}let l=this.alignedSatBounds;l[0].setFromPointsField(i,"x"),l[1].setFromPointsField(i,"y"),l[2].setFromPointsField(i,"z"),this.invMatrix.copy(this.matrix).invert(),this.needsUpdate=!1}})();It.prototype.intersectsBox=(function(){let p=new Kt;return function(e){this.needsUpdate&&this.update();let n=e.min,i=e.max,r=this.satBounds,a=this.satAxes,c=this.alignedSatBounds;if(p.min=n.x,p.max=i.x,c[0].isSeparated(p)||(p.min=n.y,p.max=i.y,c[1].isSeparated(p))||(p.min=n.z,p.max=i.z,c[2].isSeparated(p)))return!1;for(let l=0;l<3;l++){let f=a[l],u=r[l];if(p.setFromBox(f,e),u.isSeparated(p))return!1}return!0}})();It.prototype.intersectsTriangle=(function(){let p=new Rt,t=new Array(3),e=new Kt,n=new Kt,i=new I;return function(a){this.needsUpdate&&this.update(),a.isExtendedTriangle?a.needsUpdate&&a.update():(p.copy(a),p.update(),a=p);let c=this.satBounds,l=this.satAxes;t[0]=a.a,t[1]=a.b,t[2]=a.c;for(let m=0;m<3;m++){let g=c[m],x=l[m];if(e.setFromPoints(x,t),g.isSeparated(e))return!1}let f=a.satBounds,u=a.satAxes,d=this.points;for(let m=0;m<3;m++){let g=f[m],x=u[m];if(e.setFromPoints(x,d),g.isSeparated(e))return!1}for(let m=0;m<3;m++){let g=l[m];for(let x=0;x<4;x++){let S=u[x];if(i.crossVectors(g,S),e.setFromPoints(i,t),n.setFromPoints(i,d),e.isSeparated(n))return!1}}return!0}})();It.prototype.closestPointToPoint=(function(){return function(t,e){return this.needsUpdate&&this.update(),e.copy(t).applyMatrix4(this.invMatrix).clamp(this.min,this.max).applyMatrix4(this.matrix),e}})();It.prototype.distanceToPoint=(function(){let p=new I;return function(e){return this.closestPointToPoint(e,p),e.distanceTo(p)}})();It.prototype.distanceToBox=(function(){let p=["x","y","z"],t=new Array(12).fill().map(()=>new ht),e=new Array(12).fill().map(()=>new ht),n=new I,i=new I;return function(a,c=0,l=null,f=null){if(this.needsUpdate&&this.update(),this.intersectsBox(a))return(l||f)&&(a.getCenter(i),this.closestPointToPoint(i,n),a.closestPointToPoint(n,i),l&&l.copy(n),f&&f.copy(i)),0;let u=c*c,d=a.min,m=a.max,g=this.points,x=1/0;for(let b=0;b<8;b++){let E=g[b];i.copy(E).clamp(d,m);let T=E.distanceToSquared(i);if(T<x&&(x=T,l&&l.copy(E),f&&f.copy(i),T<u))return Math.sqrt(T)}let S=0;for(let b=0;b<3;b++)for(let E=0;E<=1;E++)for(let T=0;T<=1;T++){let h=(b+1)%3,o=(b+2)%3,_=E<<h|T<<o,s=1<<b|E<<h|T<<o,R=g[_],w=g[s];t[S].set(R,w);let y=p[b],A=p[h],M=p[o],C=e[S],P=C.start,L=C.end;P[y]=d[y],P[A]=E?d[A]:m[A],P[M]=T?d[M]:m[A],L[y]=m[y],L[A]=E?d[A]:m[A],L[M]=T?d[M]:m[A],S++}for(let b=0;b<=1;b++)for(let E=0;E<=1;E++)for(let T=0;T<=1;T++){i.x=b?m.x:d.x,i.y=E?m.y:d.y,i.z=T?m.z:d.z,this.closestPointToPoint(i,n);let h=i.distanceToSquared(n);if(h<x&&(x=h,l&&l.copy(n),f&&f.copy(i),h<u))return Math.sqrt(h)}for(let b=0;b<12;b++){let E=t[b];for(let T=0;T<12;T++){let h=e[T];ci(E,h,n,i);let o=n.distanceToSquared(i);if(o<x&&(x=o,l&&l.copy(n),f&&f.copy(i),o<u))return Math.sqrt(o)}}return Math.sqrt(x)}})();var ho=class extends Oe{constructor(){super(()=>new Rt)}},Ht=new ho;var li=new I,uo=new I;function Za(p,t,e={},n=0,i=1/0){let r=n*n,a=i*i,c=1/0,l=null;if(p.shapecast({boundsTraverseOrder:u=>(li.copy(t).clamp(u.min,u.max),li.distanceToSquared(t)),intersectsBounds:(u,d,m)=>m<c&&m<a,intersectsTriangle:(u,d)=>{u.closestPointToPoint(t,li);let m=t.distanceToSquared(li);return m<c&&(uo.copy(li),c=m,l=d),m<r}}),c===1/0)return null;let f=Math.sqrt(c);return e.point?e.point.copy(uo):e.point=uo.clone(),e.distance=f,e.faceIndex=l,e}var xr=parseInt("186")>=169,Xf=parseInt("186")<=161,$e=new I,Ke=new I,Qe=new I,yr=new tt,vr=new tt,Sr=new tt,Ja=new I,$a=new I,Ka=new I,hi=new I;function qf(p,t,e,n,i,r,a,c){let l;if(r===cr?l=p.intersectTriangle(n,e,t,!0,i):l=p.intersectTriangle(t,e,n,r!==ii,i),l===null)return null;let f=p.origin.distanceTo(i);return f<a||f>c?null:{distance:f,point:i.clone()}}function Qa(p,t,e,n,i,r,a,c,l,f,u){$e.fromBufferAttribute(t,r),Ke.fromBufferAttribute(t,a),Qe.fromBufferAttribute(t,c);let d=qf(p,$e,Ke,Qe,hi,l,f,u);if(d){if(n){yr.fromBufferAttribute(n,r),vr.fromBufferAttribute(n,a),Sr.fromBufferAttribute(n,c),d.uv=new tt;let g=ft.getInterpolation(hi,$e,Ke,Qe,yr,vr,Sr,d.uv);xr||(d.uv=g)}if(i){yr.fromBufferAttribute(i,r),vr.fromBufferAttribute(i,a),Sr.fromBufferAttribute(i,c),d.uv1=new tt;let g=ft.getInterpolation(hi,$e,Ke,Qe,yr,vr,Sr,d.uv1);xr||(d.uv1=g),Xf&&(d.uv2=d.uv1)}if(e){Ja.fromBufferAttribute(e,r),$a.fromBufferAttribute(e,a),Ka.fromBufferAttribute(e,c),d.normal=new I;let g=ft.getInterpolation(hi,$e,Ke,Qe,Ja,$a,Ka,d.normal);d.normal.dot(p.direction)>0&&d.normal.multiplyScalar(-1),xr||(d.normal=g)}let m={a:r,b:a,c,normal:new I,materialIndex:0};if(ft.getNormal($e,Ke,Qe,m.normal),d.face=m,d.faceIndex=r,xr){let g=new I;ft.getBarycoord(hi,$e,Ke,Qe,g),d.barycoord=g}}return d}function ja(p){return p&&p.isMaterial?p.side:p}function Nn(p,t,e,n,i,r,a){let c=n*3,l=c+0,f=c+1,u=c+2,{index:d,groups:m}=p;p.index&&(l=d.getX(l),f=d.getX(f),u=d.getX(u));let{position:g,normal:x,uv:S,uv1:b}=p.attributes;if(Array.isArray(t)){let E=n*3;for(let T=0,h=m.length;T<h;T++){let{start:o,count:_,materialIndex:s}=m[T];if(E>=o&&E<o+_){let R=ja(t[s]),w=Qa(e,g,x,S,b,l,f,u,R,r,a);if(w)if(w.faceIndex=n,w.face.materialIndex=s,i)i.push(w);else return w}}}else{let E=ja(t),T=Qa(e,g,x,S,b,l,f,u,E,r,a);if(T)if(T.faceIndex=n,T.face.materialIndex=0,i)i.push(T);else return T}return null}function mt(p,t,e,n){let i=p.a,r=p.b,a=p.c,c=t,l=t+1,f=t+2;e&&(c=e.getX(c),l=e.getX(l),f=e.getX(f)),i.x=n.getX(c),i.y=n.getY(c),i.z=n.getZ(c),r.x=n.getX(l),r.y=n.getY(l),r.z=n.getZ(l),a.x=n.getX(f),a.y=n.getY(f),a.z=n.getZ(f)}function tc(p,t,e,n,i,r,a,c){let{geometry:l,_indirectBuffer:f}=p;for(let u=n,d=n+i;u<d;u++)Nn(l,t,e,u,r,a,c)}function ec(p,t,e,n,i,r,a){let{geometry:c,_indirectBuffer:l}=p,f=1/0,u=null;for(let d=n,m=n+i;d<m;d++){let g;g=Nn(c,t,e,d,null,r,a),g&&g.distance<f&&(u=g,f=g.distance)}return u}function nc(p,t,e,n,i,r,a){let{geometry:c}=e,{index:l}=c,f=c.attributes.position;for(let u=p,d=t+p;u<d;u++){let m;if(m=u,mt(a,m*3,l,f),a.needsUpdate=!0,n(a,m,i,r))return!0}return!1}function ic(p,t=null){t&&Array.isArray(t)&&(t=new Set(t));let e=p.geometry,n=e.index?e.index.array:null,i=e.attributes.position,r,a,c,l,f=0,u=p._roots;for(let m=0,g=u.length;m<g;m++)r=u[m],a=new Uint32Array(r),c=new Uint16Array(r),l=new Float32Array(r),d(0,f),f+=r.byteLength;function d(m,g,x=!1){let S=m*2;if(st(S,c)){let b=pt(m,a),E=_t(S,c),T=1/0,h=1/0,o=1/0,_=-1/0,s=-1/0,R=-1/0;for(let w=3*b,v=3*(b+E);w<v;w++){let y=n[w],A=i.getX(y),M=i.getY(y),C=i.getZ(y);A<T&&(T=A),A>_&&(_=A),M<h&&(h=M),M>s&&(s=M),C<o&&(o=C),C>R&&(R=C)}return l[m+0]!==T||l[m+1]!==h||l[m+2]!==o||l[m+3]!==_||l[m+4]!==s||l[m+5]!==R?(l[m+0]=T,l[m+1]=h,l[m+2]=o,l[m+3]=_,l[m+4]=s,l[m+5]=R,!0):!1}else{let b=ct(m),E=lt(m,a),T=x,h=!1,o=!1;if(t){if(!T){let y=b/8+g/32,A=E/8+g/32;h=t.has(y),o=t.has(A),T=!h&&!o}}else h=!0,o=!0;let _=T||h,s=T||o,R=!1;_&&(R=d(b,g,T));let w=!1;s&&(w=d(E,g,T));let v=R||w;if(v)for(let y=0;y<3;y++){let A=b+y,M=E+y,C=l[A],P=l[A+3],L=l[M],N=l[M+3];l[m+y]=C<L?C:L,l[m+y+3]=P>N?P:N}return v}}}function oe(p,t,e,n,i){let r,a,c,l,f,u,d=1/e.direction.x,m=1/e.direction.y,g=1/e.direction.z,x=e.origin.x,S=e.origin.y,b=e.origin.z,E=t[p],T=t[p+3],h=t[p+1],o=t[p+3+1],_=t[p+2],s=t[p+3+2];return d>=0?(r=(E-x)*d,a=(T-x)*d):(r=(T-x)*d,a=(E-x)*d),m>=0?(c=(h-S)*m,l=(o-S)*m):(c=(o-S)*m,l=(h-S)*m),r>l||c>a||((c>r||isNaN(r))&&(r=c),(l<a||isNaN(a))&&(a=l),g>=0?(f=(_-b)*g,u=(s-b)*g):(f=(s-b)*g,u=(_-b)*g),r>u||f>a)?!1:((f>r||r!==r)&&(r=f),(u<a||a!==a)&&(a=u),r<=i&&a>=n)}function rc(p,t,e,n,i,r,a,c){let{geometry:l,_indirectBuffer:f}=p;for(let u=n,d=n+i;u<d;u++){let m=f?f[u]:u;Nn(l,t,e,m,r,a,c)}}function sc(p,t,e,n,i,r,a){let{geometry:c,_indirectBuffer:l}=p,f=1/0,u=null;for(let d=n,m=n+i;d<m;d++){let g;g=Nn(c,t,e,l?l[d]:d,null,r,a),g&&g.distance<f&&(u=g,f=g.distance)}return u}function oc(p,t,e,n,i,r,a){let{geometry:c}=e,{index:l}=c,f=c.attributes.position;for(let u=p,d=t+p;u<d;u++){let m;if(m=e.resolveTriangleIndex(u),mt(a,m*3,l,f),a.needsUpdate=!0,n(a,m,i,r))return!0}return!1}function ac(p,t,e,n,i,r,a){j.setBuffer(p._roots[t]),fo(0,p,e,n,i,r,a),j.clearBuffer()}function fo(p,t,e,n,i,r,a){let{float32Array:c,uint16Array:l,uint32Array:f}=j,u=p*2;if(st(u,l)){let m=pt(p,f),g=_t(u,l);tc(t,e,n,m,g,i,r,a)}else{let m=ct(p);oe(m,c,n,r,a)&&fo(m,t,e,n,i,r,a);let g=lt(p,f);oe(g,c,n,r,a)&&fo(g,t,e,n,i,r,a)}}var Yf=["x","y","z"];function cc(p,t,e,n,i,r){j.setBuffer(p._roots[t]);let a=po(0,p,e,n,i,r);return j.clearBuffer(),a}function po(p,t,e,n,i,r){let{float32Array:a,uint16Array:c,uint32Array:l}=j,f=p*2;if(st(f,c)){let d=pt(p,l),m=_t(f,c);return ec(t,e,n,d,m,i,r)}else{let d=An(p,l),m=Yf[d],x=n.direction[m]>=0,S,b;x?(S=ct(p),b=lt(p,l)):(S=lt(p,l),b=ct(p));let T=oe(S,a,n,i,r)?po(S,t,e,n,i,r):null;if(T){let _=T.point[m];if(x?_<=a[b+d]:_>=a[b+d+3])return T}let o=oe(b,a,n,i,r)?po(b,t,e,n,i,r):null;return T&&o?T.distance<=o.distance?T:o:T||o||null}}var Mr=new Et,Dn=new Rt,Un=new Rt,ui=new Q,lc=new It,br=new It;function hc(p,t,e,n){j.setBuffer(p._roots[t]);let i=mo(0,p,e,n);return j.clearBuffer(),i}function mo(p,t,e,n,i=null){let{float32Array:r,uint16Array:a,uint32Array:c}=j,l=p*2;if(i===null&&(e.boundingBox||e.computeBoundingBox(),lc.set(e.boundingBox.min,e.boundingBox.max,n),i=lc),st(l,a)){let u=t.geometry,d=u.index,m=u.attributes.position,g=e.index,x=e.attributes.position,S=pt(p,c),b=_t(l,a);if(ui.copy(n).invert(),e.boundsTree)return dt(p,r,br),br.matrix.copy(ui),br.needsUpdate=!0,e.boundsTree.shapecast({intersectsBounds:T=>br.intersectsBox(T),intersectsTriangle:T=>{T.a.applyMatrix4(n),T.b.applyMatrix4(n),T.c.applyMatrix4(n),T.needsUpdate=!0;for(let h=S*3,o=(b+S)*3;h<o;h+=3)if(mt(Un,h,d,m),Un.needsUpdate=!0,T.intersectsTriangle(Un))return!0;return!1}});{let E=ke(e);for(let T=S*3,h=(b+S)*3;T<h;T+=3){mt(Dn,T,d,m),Dn.a.applyMatrix4(ui),Dn.b.applyMatrix4(ui),Dn.c.applyMatrix4(ui),Dn.needsUpdate=!0;for(let o=0,_=E*3;o<_;o+=3)if(mt(Un,o,g,x),Un.needsUpdate=!0,Dn.intersectsTriangle(Un))return!0}}}else{let u=ct(p),d=lt(p,c);return dt(u,r,Mr),!!(i.intersectsBox(Mr)&&mo(u,t,e,n,i)||(dt(d,r,Mr),i.intersectsBox(Mr)&&mo(d,t,e,n,i)))}}var Tr=new Q,go=new It,fi=new It,Zf=new I,Jf=new I,$f=new I,Kf=new I;function uc(p,t,e,n={},i={},r=0,a=1/0){t.boundingBox||t.computeBoundingBox(),go.set(t.boundingBox.min,t.boundingBox.max,e),go.needsUpdate=!0;let c=p.geometry,l=c.attributes.position,f=c.index,u=t.attributes.position,d=t.index,m=Ht.getPrimitive(),g=Ht.getPrimitive(),x=Zf,S=Jf,b=null,E=null;i&&(b=$f,E=Kf);let T=1/0,h=null,o=null;return Tr.copy(e).invert(),fi.matrix.copy(Tr),p.shapecast({boundsTraverseOrder:_=>go.distanceToBox(_),intersectsBounds:(_,s,R)=>R<T&&R<a?(s&&(fi.min.copy(_.min),fi.max.copy(_.max),fi.needsUpdate=!0),!0):!1,intersectsRange:(_,s)=>{if(t.boundsTree)return t.boundsTree.shapecast({boundsTraverseOrder:w=>fi.distanceToBox(w),intersectsBounds:(w,v,y)=>y<T&&y<a,intersectsRange:(w,v)=>{for(let y=w,A=w+v;y<A;y++){mt(g,3*y,d,u),g.a.applyMatrix4(e),g.b.applyMatrix4(e),g.c.applyMatrix4(e),g.needsUpdate=!0;for(let M=_,C=_+s;M<C;M++){mt(m,3*M,f,l),m.needsUpdate=!0;let P=m.distanceToTriangle(g,x,b);if(P<T&&(S.copy(x),E&&E.copy(b),T=P,h=M,o=y),P<r)return!0}}}});{let R=ke(t);for(let w=0,v=R;w<v;w++){mt(g,3*w,d,u),g.a.applyMatrix4(e),g.b.applyMatrix4(e),g.c.applyMatrix4(e),g.needsUpdate=!0;for(let y=_,A=_+s;y<A;y++){mt(m,3*y,f,l),m.needsUpdate=!0;let M=m.distanceToTriangle(g,x,b);if(M<T&&(S.copy(x),E&&E.copy(b),T=M,h=y,o=w),M<r)return!0}}}}}),Ht.releasePrimitive(m),Ht.releasePrimitive(g),T===1/0?null:(n.point?n.point.copy(S):n.point=S.clone(),n.distance=T,n.faceIndex=h,i&&(i.point?i.point.copy(E):i.point=E.clone(),i.point.applyMatrix4(Tr),S.applyMatrix4(Tr),i.distance=S.sub(i.point).length(),i.faceIndex=o),n)}function fc(p,t=null){t&&Array.isArray(t)&&(t=new Set(t));let e=p.geometry,n=e.index?e.index.array:null,i=e.attributes.position,r,a,c,l,f=0,u=p._roots;for(let m=0,g=u.length;m<g;m++)r=u[m],a=new Uint32Array(r),c=new Uint16Array(r),l=new Float32Array(r),d(0,f),f+=r.byteLength;function d(m,g,x=!1){let S=m*2;if(st(S,c)){let b=pt(m,a),E=_t(S,c),T=1/0,h=1/0,o=1/0,_=-1/0,s=-1/0,R=-1/0;for(let w=b,v=b+E;w<v;w++){let y=3*p.resolveTriangleIndex(w);for(let A=0;A<3;A++){let M=y+A;M=n?n[M]:M;let C=i.getX(M),P=i.getY(M),L=i.getZ(M);C<T&&(T=C),C>_&&(_=C),P<h&&(h=P),P>s&&(s=P),L<o&&(o=L),L>R&&(R=L)}}return l[m+0]!==T||l[m+1]!==h||l[m+2]!==o||l[m+3]!==_||l[m+4]!==s||l[m+5]!==R?(l[m+0]=T,l[m+1]=h,l[m+2]=o,l[m+3]=_,l[m+4]=s,l[m+5]=R,!0):!1}else{let b=ct(m),E=lt(m,a),T=x,h=!1,o=!1;if(t){if(!T){let y=b/8+g/32,A=E/8+g/32;h=t.has(y),o=t.has(A),T=!h&&!o}}else h=!0,o=!0;let _=T||h,s=T||o,R=!1;_&&(R=d(b,g,T));let w=!1;s&&(w=d(E,g,T));let v=R||w;if(v)for(let y=0;y<3;y++){let A=b+y,M=E+y,C=l[A],P=l[A+3],L=l[M],N=l[M+3];l[m+y]=C<L?C:L,l[m+y+3]=P>N?P:N}return v}}}function dc(p,t,e,n,i,r,a){j.setBuffer(p._roots[t]),_o(0,p,e,n,i,r,a),j.clearBuffer()}function _o(p,t,e,n,i,r,a){let{float32Array:c,uint16Array:l,uint32Array:f}=j,u=p*2;if(st(u,l)){let m=pt(p,f),g=_t(u,l);rc(t,e,n,m,g,i,r,a)}else{let m=ct(p);oe(m,c,n,r,a)&&_o(m,t,e,n,i,r,a);let g=lt(p,f);oe(g,c,n,r,a)&&_o(g,t,e,n,i,r,a)}}var Qf=["x","y","z"];function pc(p,t,e,n,i,r){j.setBuffer(p._roots[t]);let a=xo(0,p,e,n,i,r);return j.clearBuffer(),a}function xo(p,t,e,n,i,r){let{float32Array:a,uint16Array:c,uint32Array:l}=j,f=p*2;if(st(f,c)){let d=pt(p,l),m=_t(f,c);return sc(t,e,n,d,m,i,r)}else{let d=An(p,l),m=Qf[d],x=n.direction[m]>=0,S,b;x?(S=ct(p),b=lt(p,l)):(S=lt(p,l),b=ct(p));let T=oe(S,a,n,i,r)?xo(S,t,e,n,i,r):null;if(T){let _=T.point[m];if(x?_<=a[b+d]:_>=a[b+d+3])return T}let o=oe(b,a,n,i,r)?xo(b,t,e,n,i,r):null;return T&&o?T.distance<=o.distance?T:o:T||o||null}}var wr=new Et,Fn=new Rt,Bn=new Rt,di=new Q,mc=new It,Ar=new It;function gc(p,t,e,n){j.setBuffer(p._roots[t]);let i=yo(0,p,e,n);return j.clearBuffer(),i}function yo(p,t,e,n,i=null){let{float32Array:r,uint16Array:a,uint32Array:c}=j,l=p*2;if(i===null&&(e.boundingBox||e.computeBoundingBox(),mc.set(e.boundingBox.min,e.boundingBox.max,n),i=mc),st(l,a)){let u=t.geometry,d=u.index,m=u.attributes.position,g=e.index,x=e.attributes.position,S=pt(p,c),b=_t(l,a);if(di.copy(n).invert(),e.boundsTree)return dt(p,r,Ar),Ar.matrix.copy(di),Ar.needsUpdate=!0,e.boundsTree.shapecast({intersectsBounds:T=>Ar.intersectsBox(T),intersectsTriangle:T=>{T.a.applyMatrix4(n),T.b.applyMatrix4(n),T.c.applyMatrix4(n),T.needsUpdate=!0;for(let h=S,o=b+S;h<o;h++)if(mt(Bn,3*t.resolveTriangleIndex(h),d,m),Bn.needsUpdate=!0,T.intersectsTriangle(Bn))return!0;return!1}});{let E=ke(e);for(let T=S,h=b+S;T<h;T++){let o=t.resolveTriangleIndex(T);mt(Fn,3*o,d,m),Fn.a.applyMatrix4(di),Fn.b.applyMatrix4(di),Fn.c.applyMatrix4(di),Fn.needsUpdate=!0;for(let _=0,s=E*3;_<s;_+=3)if(mt(Bn,_,g,x),Bn.needsUpdate=!0,Fn.intersectsTriangle(Bn))return!0}}}else{let u=ct(p),d=lt(p,c);return dt(u,r,wr),!!(i.intersectsBox(wr)&&yo(u,t,e,n,i)||(dt(d,r,wr),i.intersectsBox(wr)&&yo(d,t,e,n,i)))}}var Er=new Q,vo=new It,pi=new It,jf=new I,td=new I,ed=new I,nd=new I;function _c(p,t,e,n={},i={},r=0,a=1/0){t.boundingBox||t.computeBoundingBox(),vo.set(t.boundingBox.min,t.boundingBox.max,e),vo.needsUpdate=!0;let c=p.geometry,l=c.attributes.position,f=c.index,u=t.attributes.position,d=t.index,m=Ht.getPrimitive(),g=Ht.getPrimitive(),x=jf,S=td,b=null,E=null;i&&(b=ed,E=nd);let T=1/0,h=null,o=null;return Er.copy(e).invert(),pi.matrix.copy(Er),p.shapecast({boundsTraverseOrder:_=>vo.distanceToBox(_),intersectsBounds:(_,s,R)=>R<T&&R<a?(s&&(pi.min.copy(_.min),pi.max.copy(_.max),pi.needsUpdate=!0),!0):!1,intersectsRange:(_,s)=>{if(t.boundsTree){let R=t.boundsTree;return R.shapecast({boundsTraverseOrder:w=>pi.distanceToBox(w),intersectsBounds:(w,v,y)=>y<T&&y<a,intersectsRange:(w,v)=>{for(let y=w,A=w+v;y<A;y++){let M=R.resolveTriangleIndex(y);mt(g,3*M,d,u),g.a.applyMatrix4(e),g.b.applyMatrix4(e),g.c.applyMatrix4(e),g.needsUpdate=!0;for(let C=_,P=_+s;C<P;C++){let L=p.resolveTriangleIndex(C);mt(m,3*L,f,l),m.needsUpdate=!0;let N=m.distanceToTriangle(g,x,b);if(N<T&&(S.copy(x),E&&E.copy(b),T=N,h=C,o=y),N<r)return!0}}}})}else{let R=ke(t);for(let w=0,v=R;w<v;w++){mt(g,3*w,d,u),g.a.applyMatrix4(e),g.b.applyMatrix4(e),g.c.applyMatrix4(e),g.needsUpdate=!0;for(let y=_,A=_+s;y<A;y++){let M=p.resolveTriangleIndex(y);mt(m,3*M,f,l),m.needsUpdate=!0;let C=m.distanceToTriangle(g,x,b);if(C<T&&(S.copy(x),E&&E.copy(b),T=C,h=y,o=w),C<r)return!0}}}}}),Ht.releasePrimitive(m),Ht.releasePrimitive(g),T===1/0?null:(n.point?n.point.copy(S):n.point=S.clone(),n.distance=T,n.faceIndex=h,i&&(i.point?i.point.copy(E):i.point=E.clone(),i.point.applyMatrix4(Er),S.applyMatrix4(Er),i.distance=S.sub(i.point).length(),i.faceIndex=o),n)}function So(p,t,e){return p===null?null:(p.point.applyMatrix4(t.matrixWorld),p.distance=p.point.distanceTo(e.ray.origin),p.object=t,p)}var Cr=new It,Rr=new me,xc=new I,yc=new Q,vc=new I,Mo=["getX","getY","getZ"],Ir=class p extends _r{static serialize(t,e={}){e={cloneBuffers:!0,...e};let n=t.geometry,i=t._roots,r=t._indirectBuffer,a=n.getIndex(),c={version:1,roots:null,index:null,indirectBuffer:null};return e.cloneBuffers?(c.roots=i.map(l=>l.slice()),c.index=a?a.array.slice():null,c.indirectBuffer=r?r.slice():null):(c.roots=i,c.index=a?a.array:null,c.indirectBuffer=r),c}static deserialize(t,e,n={}){n={setIndex:!0,indirect:!!t.indirectBuffer,...n};let{index:i,roots:r,indirectBuffer:a}=t;t.version||(console.warn("MeshBVH.deserialize: Serialization format has been changed and will be fixed up. It is recommended to regenerate any stored serialized data."),l(r));let c=new p(e,{...n,[si]:!0});if(c._roots=r,c._indirectBuffer=a||null,n.setIndex){let f=e.getIndex();if(f===null){let u=new Vt(t.index,1,!1);e.setIndex(u)}else f.array!==i&&(f.array.set(i),f.needsUpdate=!0)}return c;function l(f){for(let u=0;u<f.length;u++){let d=f[u],m=new Uint32Array(d),g=new Uint16Array(d);for(let x=0,S=d.byteLength/32;x<S;x++){let b=8*x,E=2*b;st(E,g)||(m[b+6]=m[b+6]/8-x)}}}}get primitiveStride(){return 3}get resolveTriangleIndex(){return this.resolvePrimitiveIndex}constructor(t,e={}){e.maxLeafTris&&(console.warn('MeshBVH: "maxLeafTris" option has been deprecated. Use maxLeafSize, instead.'),e={...e,maxLeafSize:e.maxLeafTris}),super(t,e)}shiftTriangleOffsets(t){return super.shiftPrimitiveOffsets(t)}writePrimitiveBounds(t,e,n){let i=this.geometry,r=this._indirectBuffer,a=i.attributes.position,c=i.index?i.index.array:null,f=(r?r[t]:t)*3,u=f+0,d=f+1,m=f+2;c&&(u=c[u],d=c[d],m=c[m]);for(let g=0;g<3;g++){let x=a[Mo[g]](u),S=a[Mo[g]](d),b=a[Mo[g]](m),E=x;S<E&&(E=S),b<E&&(E=b);let T=x;S>T&&(T=S),b>T&&(T=b),e[n+g]=E,e[n+g+3]=T}return e}computePrimitiveBounds(t,e,n){let i=this.geometry,r=this._indirectBuffer,a=i.attributes.position,c=i.index?i.index.array:null,l=a.normalized;if(t<0||e+t-n.offset>n.length/6)throw new Error("MeshBVH: compute triangle bounds range is invalid.");let f=a.array,u=a.offset||0,d=3;a.isInterleavedBufferAttribute&&(d=a.data.stride);let m=["getX","getY","getZ"],g=n.offset;for(let x=t,S=t+e;x<S;x++){let E=(r?r[x]:x)*3,T=(x-g)*6,h=E+0,o=E+1,_=E+2;c&&(h=c[h],o=c[o],_=c[_]),l||(h=h*d+u,o=o*d+u,_=_*d+u);for(let s=0;s<3;s++){let R,w,v;l?(R=a[m[s]](h),w=a[m[s]](o),v=a[m[s]](_)):(R=f[h+s],w=f[o+s],v=f[_+s]);let y=R;w<y&&(y=w),v<y&&(y=v);let A=R;w>A&&(A=w),v>A&&(A=v);let M=(A-y)/2,C=s*2;n[T+C+0]=y+M,n[T+C+1]=M+(Math.abs(y)+M)*Tn}}return n}raycastObject3D(t,e,n=[]){let{material:i}=t;if(i===void 0)return;yc.copy(t.matrixWorld).invert(),Rr.copy(e.ray).applyMatrix4(yc),vc.setFromMatrixScale(t.matrixWorld),xc.copy(Rr.direction).multiply(vc);let r=xc.length(),a=e.near/r,c=e.far/r;if(e.firstHitOnly===!0){let l=this.raycastFirst(Rr,i,a,c);l=So(l,t,e),l&&n.push(l)}else{let l=this.raycast(Rr,i,a,c);for(let f=0,u=l.length;f<u;f++){let d=So(l[f],t,e);d&&n.push(d)}}return n}refit(t=null){return(this.indirect?fc:ic)(this,t)}raycast(t,e=bn,n=0,i=1/0){let r=this._roots,a=[],c=this.indirect?dc:ac;for(let l=0,f=r.length;l<f;l++)c(this,l,e,t,a,n,i);return a}raycastFirst(t,e=bn,n=0,i=1/0){let r=this._roots,a=null,c=this.indirect?pc:cc;for(let l=0,f=r.length;l<f;l++){let u=c(this,l,e,t,n,i);u!=null&&(a==null||u.distance<a.distance)&&(a=u)}return a}intersectsGeometry(t,e){let n=!1,i=this._roots,r=this.indirect?gc:hc;for(let a=0,c=i.length;a<c&&(n=r(this,a,t,e),!n);a++);return n}shapecast(t){let e=Ht.getPrimitive(),n=super.shapecast({...t,intersectsPrimitive:t.intersectsTriangle,scratchPrimitive:e,iterate:this.indirect?oc:nc});return Ht.releasePrimitive(e),n}bvhcast(t,e,n){let{intersectsRanges:i,intersectsTriangles:r}=n,a=Ht.getPrimitive(),c=this.geometry.index,l=this.geometry.attributes.position,f=this.indirect?x=>{let S=this.resolveTriangleIndex(x);mt(a,S*3,c,l)}:x=>{mt(a,x*3,c,l)},u=Ht.getPrimitive(),d=t.geometry.index,m=t.geometry.attributes.position,g=t.indirect?x=>{let S=t.resolveTriangleIndex(x);mt(u,S*3,d,m)}:x=>{mt(u,x*3,d,m)};if(r){if(!(t instanceof p))throw new Error('MeshBVH: "intersectsTriangles" callback can only be used with another MeshBVH.');let x=(S,b,E,T,h,o,_,s)=>{for(let R=E,w=E+T;R<w;R++){g(R),u.a.applyMatrix4(e),u.b.applyMatrix4(e),u.c.applyMatrix4(e),u.needsUpdate=!0;for(let v=S,y=S+b;v<y;v++)if(f(v),a.needsUpdate=!0,r(a,u,v,R,h,o,_,s))return!0}return!1};if(i){let S=i;i=function(b,E,T,h,o,_,s,R){return S(b,E,T,h,o,_,s,R)?!0:x(b,E,T,h,o,_,s,R)}}else i=x}return super.bvhcast(t,e,{intersectsRanges:i})}intersectsBox(t,e){return Cr.set(t.min,t.max,e),Cr.needsUpdate=!0,this.shapecast({intersectsBounds:n=>Cr.intersectsBox(n),intersectsTriangle:n=>Cr.intersectsTriangle(n)})}intersectsSphere(t){return this.shapecast({intersectsBounds:e=>t.intersectsBox(e),intersectsTriangle:e=>e.intersectsSphere(t)})}closestPointToGeometry(t,e,n={},i={},r=0,a=1/0){return(this.indirect?_c:uc)(this,t,e,n,i,r,a)}closestPointToPoint(t,e={},n=0,i=1/0){return Za(this,t,e,n,i)}};var Sc=Math.pow(10,-Math.log10(1e-6)),id=5e-7*Sc;function ue(p){return~~(p*Sc+id)}function Mc(p){return`${ue(p.x)},${ue(p.y)}`}function bo(p){return`${ue(p.x)},${ue(p.y)},${ue(p.z)}`}function bc(p){return`${ue(p.x)},${ue(p.y)},${ue(p.z)},${ue(p.w)}`}function Tc(p,t,e){e.direction.subVectors(t,p).normalize();let n=p.dot(e.direction);return e.origin.copy(p).addScaledVector(e.direction,-n),e}function Pr(){return typeof SharedArrayBuffer<"u"}function wc(p){if(p.buffer instanceof SharedArrayBuffer)return p;let t=p.constructor,e=p.buffer,n=new SharedArrayBuffer(e.byteLength),i=new Uint8Array(e);return new Uint8Array(n).set(i,0),new t(n)}function rd(p){return p.index?p.index.count:p.attributes.position.count}function On(p){return rd(p)/3}var sd=1e-8,od=new I;function Ec(p){return~~(p/3)}function Cc(p){return p%3}function Ac(p,t){return p.start-t.start}function To(p,t){return od.subVectors(t,p.origin).dot(p.direction)}function Rc(p,t,e,n=sd){p.sort(Ac),t.sort(Ac);for(let c=0;c<p.length;c++){let l=p[c];for(let f=0;f<t.length;f++){let u=t[f];if(!(u.start>l.end)){if(l.end<u.start||u.end<l.start)continue;if(l.start<=u.start&&l.end>=u.end)r(u.end,l.end)||p.splice(c+1,0,{start:u.end,end:l.end,index:l.index}),l.end=u.start,u.start=0,u.end=0;else if(l.start>=u.start&&l.end<=u.end)r(l.end,u.end)||t.splice(f+1,0,{start:l.end,end:u.end,index:u.index}),u.end=l.start,l.start=0,l.end=0;else if(l.start<=u.start&&l.end<=u.end){let d=l.end;l.end=u.start,u.start=d}else if(l.start>=u.start&&l.end>=u.end){let d=u.end;u.end=l.start,l.start=d}else throw new Error}if(e.has(l.index)||e.set(l.index,[]),e.has(u.index)||e.set(u.index,[]),e.get(l.index).push(u.index),e.get(u.index).push(l.index),a(u)&&(t.splice(f,1),f--),a(l)){p.splice(c,1),c--;break}}}i(p),i(t);function i(c){for(let l=0;l<c.length;l++)a(c[l])&&(c.splice(l,1),l--)}function r(c,l){return Math.abs(l-c)<n}function a(c){return Math.abs(c.end-c.start)<n}}var Lr=class{constructor(){this._rays=[]}addRay(t){this._rays.push(t)}findClosestRay(t){let e=this._rays,n=t.clone();n.direction.multiplyScalar(-1);let i=1/0,r=null;for(let l=0,f=e.length;l<f;l++){let u=e[l];if(a(u,t)&&a(u,n))continue;let d=c(u,t),m=c(u,n),g=Math.min(d,m);g<i&&(i=g,r=u)}return r;function a(l,f){let u=l.origin.distanceTo(f.origin)>1e-5;return l.direction.angleTo(f.direction)>1e-4||u}function c(l,f){let u=l.origin.distanceTo(f.origin),d=l.direction.angleTo(f.direction);return u/1e-5+d/1e-4}}};var wo=new I,Ao=new I,Nr=new me;function Ic(p,t,e){let n=p.attributes,i=p.index,r=n.position,a=new Map,c=new Map,l=Array.from(t),f=new Lr;for(let u=0,d=l.length;u<d;u++){let m=l[u],g=Ec(m),x=Cc(m),S=3*g+x,b=3*g+(x+1)%3;i&&(S=i.getX(S),b=i.getX(b)),wo.fromBufferAttribute(r,S),Ao.fromBufferAttribute(r,b),Tc(wo,Ao,Nr);let E,T=f.findClosestRay(Nr);T===null&&(T=Nr.clone(),f.addRay(T)),c.has(T)||c.set(T,{forward:[],reverse:[],ray:T}),E=c.get(T);let h=To(T,wo),o=To(T,Ao);h>o&&([h,o]=[o,h]),Nr.direction.dot(T.direction)<0?E.reverse.push({start:h,end:o,index:m}):E.forward.push({start:h,end:o,index:m})}return c.forEach(({forward:u,reverse:d},m)=>{Rc(u,d,a,e),u.length===0&&d.length===0&&c.delete(m)}),{disjointConnectivityMap:a,fragmentMap:c}}var ad=new tt,Eo=new I,cd=new Jt,Co=["","",""],Dr=class{constructor(){this.data=null,this.disjointConnections=null,this.unmatchedDisjointEdges=null,this.unmatchedEdges=-1,this.matchedEdges=-1,this.useDrawRange=!0,this.useAllAttributes=!1,this.matchDisjointEdges=!1,this.degenerateEpsilon=1e-8}getSiblingTriangleIndex(t,e){let n=this.data[t*3+e];return n===-1?-1:~~(n/3)}getSiblingEdgeIndex(t,e){let n=this.data[t*3+e];return n===-1?-1:n%3}getDisjointSiblingTriangleIndices(t,e){let n=t*3+e,i=this.disjointConnections.get(n);return i?i.map(r=>~~(r/3)):[]}getDisjointSiblingEdgeIndices(t,e){let n=t*3+e,i=this.disjointConnections.get(n);return i?i.map(r=>r%3):[]}isFullyConnected(){return this.unmatchedEdges===0}updateFrom(t){let{useAllAttributes:e,useDrawRange:n,matchDisjointEdges:i,degenerateEpsilon:r}=this,a=e?h:T,c=new Map,{attributes:l}=t,f=e?Object.keys(l):null,u=t.index,d=l.position,m=On(t),g=m,x=0;n&&(x=t.drawRange.start,t.drawRange.count!==1/0&&(m=~~(t.drawRange.count/3)));let S=this.data;(!S||S.length<3*g)&&(S=new Int32Array(3*g)),S.fill(-1);let b=0,E=new Set;for(let o=x,_=m*3+x;o<_;o+=3){let s=o;for(let R=0;R<3;R++){let w=s+R;u&&(w=u.getX(w)),Co[R]=a(w)}for(let R=0;R<3;R++){let w=(R+1)%3,v=Co[R],y=Co[w],A=`${y}_${v}`;if(c.has(A)){let M=s+R,C=c.get(A);S[M]=C,S[C]=M,c.delete(A),b+=2,E.delete(C)}else{let M=`${v}_${y}`,C=s+R;c.set(M,C),E.add(C)}}}if(i){let{fragmentMap:o,disjointConnectivityMap:_}=Ic(t,E,r);E.clear(),o.forEach(({forward:s,reverse:R})=>{s.forEach(({index:w})=>E.add(w)),R.forEach(({index:w})=>E.add(w))}),this.unmatchedDisjointEdges=o,this.disjointConnections=_,b=m*3-E.size}this.matchedEdges=b,this.unmatchedEdges=E.size,this.data=S;function T(o){return Eo.fromBufferAttribute(d,o),bo(Eo)}function h(o){let _="";for(let s=0,R=f.length;s<R;s++){let w=l[f[s]],v;switch(w.itemSize){case 1:v=ue(w.getX(o));break;case 2:v=Mc(ad.fromBufferAttribute(w,o));break;case 3:v=bo(Eo.fromBufferAttribute(w,o));break;case 4:v=bc(cd.fromBufferAttribute(w,o));break}_!==""&&(_+="|"),_+=v}return _}}};var Ge=class extends ei{constructor(...t){super(...t),this.isBrush=!0,this._previousMatrix=new Q,this._previousMatrix.elements.fill(0),this._halfEdges=null,this._boundsTree=null,this._groupIndices=null,this._hash=null}markUpdated(){this._previousMatrix.copy(this.matrix)}isDirty(){let{matrix:t,_previousMatrix:e}=this,n=t.elements,i=e.elements;for(let r=0;r<16;r++)if(n[r]!==i[r])return!0;return!1}prepareGeometry(){let t=this.geometry,e=t.attributes,n=Pr(),i=t.index,r=t.attributes.position,a=i?`${i.uuid}_${i.count}_${i.version}`:"-1_-1_-1",c=`${r.uuid}_${r.count}_${r.version}`,l=`${t.uuid}_${a}_${c}`;if(this._hash===l)return;if(this._hash=l,n)for(let m in e){let g=e[m];if(g.isInterleavedBufferAttribute)throw new Error("Brush: InterleavedBufferAttributes are not supported.");g.array=wc(g.array)}t.boundsTree=new Ir(t,{maxLeafSize:3,indirect:!0,useSharedArrayBuffer:n}),t.halfEdges||(t.halfEdges=new Dr),t.halfEdges.updateFrom(t);let f=On(t);(!t.groupIndices||t.groupIndices.length!==f)&&(t.groupIndices=new Uint16Array(f));let u=t.groupIndices,d=t.groups;for(let m=0,g=d.length;m<g;m++){let{start:x,count:S}=d[m];for(let b=x/3,E=(x+S)/3;b<E;b++)u[b]=m}}disposeCacheData(){let{geometry:t}=this;t.halfEdges=null,t.boundsTree=null,t.groupIndices=null}};var ld=Object.getOwnPropertyNames,Qt=(p,t)=>function(){return t||(0,p[ld(p)[0]])((t={exports:{}}).exports,t),t.exports},Ur=Qt({"node_modules/binary-search-bounds/search-bounds.js"(p,t){"use strict";function e(l,f,u,d,m){for(var g=m+1;d<=m;){var x=d+m>>>1,S=l[x],b=u!==void 0?u(S,f):S-f;b>=0?(g=x,m=x-1):d=x+1}return g}function n(l,f,u,d,m){for(var g=m+1;d<=m;){var x=d+m>>>1,S=l[x],b=u!==void 0?u(S,f):S-f;b>0?(g=x,m=x-1):d=x+1}return g}function i(l,f,u,d,m){for(var g=d-1;d<=m;){var x=d+m>>>1,S=l[x],b=u!==void 0?u(S,f):S-f;b<0?(g=x,d=x+1):m=x-1}return g}function r(l,f,u,d,m){for(var g=d-1;d<=m;){var x=d+m>>>1,S=l[x],b=u!==void 0?u(S,f):S-f;b<=0?(g=x,d=x+1):m=x-1}return g}function a(l,f,u,d,m){for(;d<=m;){var g=d+m>>>1,x=l[g],S=u!==void 0?u(x,f):x-f;if(S===0)return g;S<=0?d=g+1:m=g-1}return-1}function c(l,f,u,d,m,g){return typeof u=="function"?g(l,f,u,d===void 0?0:d|0,m===void 0?l.length-1:m|0):g(l,f,void 0,u===void 0?0:u|0,d===void 0?l.length-1:d|0)}t.exports={ge:function(l,f,u,d,m){return c(l,f,u,d,m,e)},gt:function(l,f,u,d,m){return c(l,f,u,d,m,n)},lt:function(l,f,u,d,m){return c(l,f,u,d,m,i)},le:function(l,f,u,d,m){return c(l,f,u,d,m,r)},eq:function(l,f,u,d,m){return c(l,f,u,d,m,a)}}}}),Ro=Qt({"node_modules/two-product/two-product.js"(p,t){"use strict";t.exports=n;var e=+(Math.pow(2,27)+1);function n(i,r,a){var c=i*r,l=e*i,f=l-i,u=l-f,d=i-u,m=e*r,g=m-r,x=m-g,S=r-x,b=c-u*x,E=b-d*x,T=E-u*S,h=d*S-T;return a?(a[0]=h,a[1]=c,a):[h,c]}}}),Pc=Qt({"node_modules/robust-sum/robust-sum.js"(p,t){"use strict";t.exports=n;function e(i,r){var a=i+r,c=a-i,l=a-c,f=r-c,u=i-l,d=u+f;return d?[d,a]:[a]}function n(i,r){var a=i.length|0,c=r.length|0;if(a===1&&c===1)return e(i[0],r[0]);var l=a+c,f=new Array(l),u=0,d=0,m=0,g=Math.abs,x=i[d],S=g(x),b=r[m],E=g(b),T,h;S<E?(h=x,d+=1,d<a&&(x=i[d],S=g(x))):(h=b,m+=1,m<c&&(b=r[m],E=g(b))),d<a&&S<E||m>=c?(T=x,d+=1,d<a&&(x=i[d],S=g(x))):(T=b,m+=1,m<c&&(b=r[m],E=g(b)));for(var o=T+h,_=o-T,s=h-_,R=s,w=o,v,y,A,M,C;d<a&&m<c;)S<E?(T=x,d+=1,d<a&&(x=i[d],S=g(x))):(T=b,m+=1,m<c&&(b=r[m],E=g(b))),h=R,o=T+h,_=o-T,s=h-_,s&&(f[u++]=s),v=w+o,y=v-w,A=v-y,M=o-y,C=w-A,R=C+M,w=v;for(;d<a;)T=x,h=R,o=T+h,_=o-T,s=h-_,s&&(f[u++]=s),v=w+o,y=v-w,A=v-y,M=o-y,C=w-A,R=C+M,w=v,d+=1,d<a&&(x=i[d]);for(;m<c;)T=b,h=R,o=T+h,_=o-T,s=h-_,s&&(f[u++]=s),v=w+o,y=v-w,A=v-y,M=o-y,C=w-A,R=C+M,w=v,m+=1,m<c&&(b=r[m]);return R&&(f[u++]=R),w&&(f[u++]=w),u||(f[u++]=0),f.length=u,f}}}),hd=Qt({"node_modules/two-sum/two-sum.js"(p,t){"use strict";t.exports=e;function e(n,i,r){var a=n+i,c=a-n,l=a-c,f=i-c,u=n-l;return r?(r[0]=u+f,r[1]=a,r):[u+f,a]}}}),Lc=Qt({"node_modules/robust-scale/robust-scale.js"(p,t){"use strict";var e=Ro(),n=hd();t.exports=i;function i(r,a){var c=r.length;if(c===1){var l=e(r[0],a);return l[0]?l:[l[1]]}var f=new Array(2*c),u=[.1,.1],d=[.1,.1],m=0;e(r[0],a,u),u[0]&&(f[m++]=u[0]);for(var g=1;g<c;++g){e(r[g],a,d);var x=u[1];n(x,d[0],u),u[0]&&(f[m++]=u[0]);var S=d[1],b=u[1],E=S+b,T=E-S,h=b-T;u[1]=E,h&&(f[m++]=h)}return u[1]&&(f[m++]=u[1]),m===0&&(f[m++]=0),f.length=m,f}}}),Nc=Qt({"node_modules/robust-subtract/robust-diff.js"(p,t){"use strict";t.exports=n;function e(i,r){var a=i+r,c=a-i,l=a-c,f=r-c,u=i-l,d=u+f;return d?[d,a]:[a]}function n(i,r){var a=i.length|0,c=r.length|0;if(a===1&&c===1)return e(i[0],-r[0]);var l=a+c,f=new Array(l),u=0,d=0,m=0,g=Math.abs,x=i[d],S=g(x),b=-r[m],E=g(b),T,h;S<E?(h=x,d+=1,d<a&&(x=i[d],S=g(x))):(h=b,m+=1,m<c&&(b=-r[m],E=g(b))),d<a&&S<E||m>=c?(T=x,d+=1,d<a&&(x=i[d],S=g(x))):(T=b,m+=1,m<c&&(b=-r[m],E=g(b)));for(var o=T+h,_=o-T,s=h-_,R=s,w=o,v,y,A,M,C;d<a&&m<c;)S<E?(T=x,d+=1,d<a&&(x=i[d],S=g(x))):(T=b,m+=1,m<c&&(b=-r[m],E=g(b))),h=R,o=T+h,_=o-T,s=h-_,s&&(f[u++]=s),v=w+o,y=v-w,A=v-y,M=o-y,C=w-A,R=C+M,w=v;for(;d<a;)T=x,h=R,o=T+h,_=o-T,s=h-_,s&&(f[u++]=s),v=w+o,y=v-w,A=v-y,M=o-y,C=w-A,R=C+M,w=v,d+=1,d<a&&(x=i[d]);for(;m<c;)T=b,h=R,o=T+h,_=o-T,s=h-_,s&&(f[u++]=s),v=w+o,y=v-w,A=v-y,M=o-y,C=w-A,R=C+M,w=v,m+=1,m<c&&(b=-r[m]);return R&&(f[u++]=R),w&&(f[u++]=w),u||(f[u++]=0),f.length=u,f}}}),ud=Qt({"node_modules/robust-orientation/orientation.js"(p,t){"use strict";var e=Ro(),n=Pc(),i=Lc(),r=Nc(),a=5,c=11102230246251565e-32,l=(3+16*c)*c,f=(7+56*c)*c;function u(o,_,s,R){return function(v,y,A){var M=o(o(_(y[1],A[0]),_(-A[1],y[0])),o(_(v[1],y[0]),_(-y[1],v[0]))),C=o(_(v[1],A[0]),_(-A[1],v[0])),P=R(M,C);return P[P.length-1]}}function d(o,_,s,R){return function(v,y,A,M){var C=o(o(s(o(_(A[1],M[0]),_(-M[1],A[0])),y[2]),o(s(o(_(y[1],M[0]),_(-M[1],y[0])),-A[2]),s(o(_(y[1],A[0]),_(-A[1],y[0])),M[2]))),o(s(o(_(y[1],M[0]),_(-M[1],y[0])),v[2]),o(s(o(_(v[1],M[0]),_(-M[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),M[2])))),P=o(o(s(o(_(A[1],M[0]),_(-M[1],A[0])),v[2]),o(s(o(_(v[1],M[0]),_(-M[1],v[0])),-A[2]),s(o(_(v[1],A[0]),_(-A[1],v[0])),M[2]))),o(s(o(_(y[1],A[0]),_(-A[1],y[0])),v[2]),o(s(o(_(v[1],A[0]),_(-A[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),A[2])))),L=R(C,P);return L[L.length-1]}}function m(o,_,s,R){return function(v,y,A,M,C){var P=o(o(o(s(o(s(o(_(M[1],C[0]),_(-C[1],M[0])),A[2]),o(s(o(_(A[1],C[0]),_(-C[1],A[0])),-M[2]),s(o(_(A[1],M[0]),_(-M[1],A[0])),C[2]))),y[3]),o(s(o(s(o(_(M[1],C[0]),_(-C[1],M[0])),y[2]),o(s(o(_(y[1],C[0]),_(-C[1],y[0])),-M[2]),s(o(_(y[1],M[0]),_(-M[1],y[0])),C[2]))),-A[3]),s(o(s(o(_(A[1],C[0]),_(-C[1],A[0])),y[2]),o(s(o(_(y[1],C[0]),_(-C[1],y[0])),-A[2]),s(o(_(y[1],A[0]),_(-A[1],y[0])),C[2]))),M[3]))),o(s(o(s(o(_(A[1],M[0]),_(-M[1],A[0])),y[2]),o(s(o(_(y[1],M[0]),_(-M[1],y[0])),-A[2]),s(o(_(y[1],A[0]),_(-A[1],y[0])),M[2]))),-C[3]),o(s(o(s(o(_(M[1],C[0]),_(-C[1],M[0])),y[2]),o(s(o(_(y[1],C[0]),_(-C[1],y[0])),-M[2]),s(o(_(y[1],M[0]),_(-M[1],y[0])),C[2]))),v[3]),s(o(s(o(_(M[1],C[0]),_(-C[1],M[0])),v[2]),o(s(o(_(v[1],C[0]),_(-C[1],v[0])),-M[2]),s(o(_(v[1],M[0]),_(-M[1],v[0])),C[2]))),-y[3])))),o(o(s(o(s(o(_(y[1],C[0]),_(-C[1],y[0])),v[2]),o(s(o(_(v[1],C[0]),_(-C[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),C[2]))),M[3]),o(s(o(s(o(_(y[1],M[0]),_(-M[1],y[0])),v[2]),o(s(o(_(v[1],M[0]),_(-M[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),M[2]))),-C[3]),s(o(s(o(_(A[1],M[0]),_(-M[1],A[0])),y[2]),o(s(o(_(y[1],M[0]),_(-M[1],y[0])),-A[2]),s(o(_(y[1],A[0]),_(-A[1],y[0])),M[2]))),v[3]))),o(s(o(s(o(_(A[1],M[0]),_(-M[1],A[0])),v[2]),o(s(o(_(v[1],M[0]),_(-M[1],v[0])),-A[2]),s(o(_(v[1],A[0]),_(-A[1],v[0])),M[2]))),-y[3]),o(s(o(s(o(_(y[1],M[0]),_(-M[1],y[0])),v[2]),o(s(o(_(v[1],M[0]),_(-M[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),M[2]))),A[3]),s(o(s(o(_(y[1],A[0]),_(-A[1],y[0])),v[2]),o(s(o(_(v[1],A[0]),_(-A[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),A[2]))),-M[3]))))),L=o(o(o(s(o(s(o(_(M[1],C[0]),_(-C[1],M[0])),A[2]),o(s(o(_(A[1],C[0]),_(-C[1],A[0])),-M[2]),s(o(_(A[1],M[0]),_(-M[1],A[0])),C[2]))),v[3]),s(o(s(o(_(M[1],C[0]),_(-C[1],M[0])),v[2]),o(s(o(_(v[1],C[0]),_(-C[1],v[0])),-M[2]),s(o(_(v[1],M[0]),_(-M[1],v[0])),C[2]))),-A[3])),o(s(o(s(o(_(A[1],C[0]),_(-C[1],A[0])),v[2]),o(s(o(_(v[1],C[0]),_(-C[1],v[0])),-A[2]),s(o(_(v[1],A[0]),_(-A[1],v[0])),C[2]))),M[3]),s(o(s(o(_(A[1],M[0]),_(-M[1],A[0])),v[2]),o(s(o(_(v[1],M[0]),_(-M[1],v[0])),-A[2]),s(o(_(v[1],A[0]),_(-A[1],v[0])),M[2]))),-C[3]))),o(o(s(o(s(o(_(A[1],C[0]),_(-C[1],A[0])),y[2]),o(s(o(_(y[1],C[0]),_(-C[1],y[0])),-A[2]),s(o(_(y[1],A[0]),_(-A[1],y[0])),C[2]))),v[3]),s(o(s(o(_(A[1],C[0]),_(-C[1],A[0])),v[2]),o(s(o(_(v[1],C[0]),_(-C[1],v[0])),-A[2]),s(o(_(v[1],A[0]),_(-A[1],v[0])),C[2]))),-y[3])),o(s(o(s(o(_(y[1],C[0]),_(-C[1],y[0])),v[2]),o(s(o(_(v[1],C[0]),_(-C[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),C[2]))),A[3]),s(o(s(o(_(y[1],A[0]),_(-A[1],y[0])),v[2]),o(s(o(_(v[1],A[0]),_(-A[1],v[0])),-y[2]),s(o(_(v[1],y[0]),_(-y[1],v[0])),A[2]))),-C[3])))),N=R(P,L);return N[N.length-1]}}function g(o){var _=o===3?u:o===4?d:m;return _(n,e,i,r)}var x=g(3),S=g(4),b=[function(){return 0},function(){return 0},function(_,s){return s[0]-_[0]},function(_,s,R){var w=(_[1]-R[1])*(s[0]-R[0]),v=(_[0]-R[0])*(s[1]-R[1]),y=w-v,A;if(w>0){if(v<=0)return y;A=w+v}else if(w<0){if(v>=0)return y;A=-(w+v)}else return y;var M=l*A;return y>=M||y<=-M?y:x(_,s,R)},function(_,s,R,w){var v=_[0]-w[0],y=s[0]-w[0],A=R[0]-w[0],M=_[1]-w[1],C=s[1]-w[1],P=R[1]-w[1],L=_[2]-w[2],N=s[2]-w[2],D=R[2]-w[2],U=y*P,F=A*C,q=A*M,O=v*P,z=v*C,H=y*M,V=L*(U-F)+N*(q-O)+D*(z-H),k=(Math.abs(U)+Math.abs(F))*Math.abs(L)+(Math.abs(q)+Math.abs(O))*Math.abs(N)+(Math.abs(z)+Math.abs(H))*Math.abs(D),ot=f*k;return V>ot||-V>ot?V:S(_,s,R,w)}];function E(o){var _=b[o.length];return _||(_=b[o.length]=g(o.length)),_.apply(void 0,o)}function T(o,_,s,R,w,v,y){return function(M,C,P,L,N){switch(arguments.length){case 0:case 1:return 0;case 2:return R(M,C);case 3:return w(M,C,P);case 4:return v(M,C,P,L);case 5:return y(M,C,P,L,N)}for(var D=new Array(arguments.length),U=0;U<arguments.length;++U)D[U]=arguments[U];return o(D)}}function h(){for(;b.length<=a;)b.push(g(b.length));t.exports=T.apply(void 0,[E].concat(b));for(var o=0;o<=a;++o)t.exports[o]=b[o]}h()}}),fd=Qt({"node_modules/cdt2d/lib/monotone.js"(p,t){"use strict";var e=Ur(),n=ud()[3],i=0,r=1,a=2;t.exports=S;function c(b,E,T,h,o){this.a=b,this.b=E,this.idx=T,this.lowerIds=h,this.upperIds=o}function l(b,E,T,h){this.a=b,this.b=E,this.type=T,this.idx=h}function f(b,E){var T=b.a[0]-E.a[0]||b.a[1]-E.a[1]||b.type-E.type;return T||b.type!==i&&(T=n(b.a,b.b,E.b),T)?T:b.idx-E.idx}function u(b,E){return n(b.a,b.b,E)}function d(b,E,T,h,o){for(var _=e.lt(E,h,u),s=e.gt(E,h,u),R=_;R<s;++R){for(var w=E[R],v=w.lowerIds,A=v.length;A>1&&n(T[v[A-2]],T[v[A-1]],h)>0;)b.push([v[A-1],v[A-2],o]),A-=1;v.length=A,v.push(o);for(var y=w.upperIds,A=y.length;A>1&&n(T[y[A-2]],T[y[A-1]],h)<0;)b.push([y[A-2],y[A-1],o]),A-=1;y.length=A,y.push(o)}}function m(b,E){var T;return b.a[0]<E.a[0]?T=n(b.a,b.b,E.a):T=n(E.b,E.a,b.a),T||(E.b[0]<b.b[0]?T=n(b.a,b.b,E.b):T=n(E.b,E.a,b.b),T||b.idx-E.idx)}function g(b,E,T){var h=e.le(b,T,m),o=b[h],_=o.upperIds,s=_[_.length-1];o.upperIds=[s],b.splice(h+1,0,new c(T.a,T.b,T.idx,[s],_))}function x(b,E,T){var h=T.a;T.a=T.b,T.b=h;var o=e.eq(b,T,m),_=b[o],s=b[o-1];s.upperIds=_.upperIds,b.splice(o,1)}function S(b,E){for(var T=b.length,h=E.length,o=[],_=0;_<T;++_)o.push(new l(b[_],null,i,_));for(var _=0;_<h;++_){var s=E[_],R=b[s[0]],w=b[s[1]];R[0]<w[0]?o.push(new l(R,w,a,_),new l(w,R,r,_)):R[0]>w[0]&&o.push(new l(w,R,a,_),new l(R,w,r,_))}o.sort(f);for(var v=o[0].a[0]-(1+Math.abs(o[0].a[0]))*Math.pow(2,-52),y=[new c([v,1],[v,0],-1,[],[],[],[])],A=[],_=0,M=o.length;_<M;++_){var C=o[_],P=C.type;P===i?d(A,y,b,C.a,C.idx):P===a?g(y,b,C):x(y,b,C)}return A}}}),dd=Qt({"node_modules/cdt2d/lib/triangulation.js"(p,t){"use strict";var e=Ur();t.exports=a;function n(c,l){this.stars=c,this.edges=l}var i=n.prototype;function r(c,l,f){for(var u=1,d=c.length;u<d;u+=2)if(c[u-1]===l&&c[u]===f){c[u-1]=c[d-2],c[u]=c[d-1],c.length=d-2;return}}i.isConstraint=(function(){var c=[0,0];function l(f,u){return f[0]-u[0]||f[1]-u[1]}return function(f,u){return c[0]=Math.min(f,u),c[1]=Math.max(f,u),e.eq(this.edges,c,l)>=0}})(),i.removeTriangle=function(c,l,f){var u=this.stars;r(u[c],l,f),r(u[l],f,c),r(u[f],c,l)},i.addTriangle=function(c,l,f){var u=this.stars;u[c].push(l,f),u[l].push(f,c),u[f].push(c,l)},i.opposite=function(c,l){for(var f=this.stars[l],u=1,d=f.length;u<d;u+=2)if(f[u]===c)return f[u-1];return-1},i.flip=function(c,l){var f=this.opposite(c,l),u=this.opposite(l,c);this.removeTriangle(c,l,f),this.removeTriangle(l,c,u),this.addTriangle(c,u,f),this.addTriangle(l,f,u)},i.edges=function(){for(var c=this.stars,l=[],f=0,u=c.length;f<u;++f)for(var d=c[f],m=0,g=d.length;m<g;m+=2)l.push([d[m],d[m+1]]);return l},i.cells=function(){for(var c=this.stars,l=[],f=0,u=c.length;f<u;++f)for(var d=c[f],m=0,g=d.length;m<g;m+=2){var x=d[m],S=d[m+1];f<Math.min(x,S)&&l.push([f,x,S])}return l};function a(c,l){for(var f=new Array(c),u=0;u<c;++u)f[u]=[];return new n(f,l)}}}),pd=Qt({"node_modules/robust-in-sphere/in-sphere.js"(p,t){"use strict";var e=Ro(),n=Pc(),i=Nc(),r=Lc(),a=6;function c(h){var o=h===3?d:h===4?m:h===5?g:x;return o(n,i,e,r)}function l(){return 0}function f(){return 0}function u(){return 0}function d(h,o,_,s){function R(w,v,y){var A=_(w[0],w[0]),M=s(A,v[0]),C=s(A,y[0]),P=_(v[0],v[0]),L=s(P,w[0]),N=s(P,y[0]),D=_(y[0],y[0]),U=s(D,w[0]),F=s(D,v[0]),q=h(o(F,N),o(L,M)),O=o(U,C),z=o(q,O);return z[z.length-1]}return R}function m(h,o,_,s){function R(w,v,y,A){var M=h(_(w[0],w[0]),_(w[1],w[1])),C=s(M,v[0]),P=s(M,y[0]),L=s(M,A[0]),N=h(_(v[0],v[0]),_(v[1],v[1])),D=s(N,w[0]),U=s(N,y[0]),F=s(N,A[0]),q=h(_(y[0],y[0]),_(y[1],y[1])),O=s(q,w[0]),z=s(q,v[0]),H=s(q,A[0]),V=h(_(A[0],A[0]),_(A[1],A[1])),k=s(V,w[0]),ot=s(V,v[0]),J=s(V,y[0]),Y=h(h(s(o(J,H),v[1]),h(s(o(ot,F),-y[1]),s(o(z,U),A[1]))),h(s(o(ot,F),w[1]),h(s(o(k,L),-v[1]),s(o(D,C),A[1])))),G=h(h(s(o(J,H),w[1]),h(s(o(k,L),-y[1]),s(o(O,P),A[1]))),h(s(o(z,U),w[1]),h(s(o(O,P),-v[1]),s(o(D,C),y[1])))),X=o(Y,G);return X[X.length-1]}return R}function g(h,o,_,s){function R(w,v,y,A,M){var C=h(_(w[0],w[0]),h(_(w[1],w[1]),_(w[2],w[2]))),P=s(C,v[0]),L=s(C,y[0]),N=s(C,A[0]),D=s(C,M[0]),U=h(_(v[0],v[0]),h(_(v[1],v[1]),_(v[2],v[2]))),F=s(U,w[0]),q=s(U,y[0]),O=s(U,A[0]),z=s(U,M[0]),H=h(_(y[0],y[0]),h(_(y[1],y[1]),_(y[2],y[2]))),V=s(H,w[0]),k=s(H,v[0]),ot=s(H,A[0]),J=s(H,M[0]),Y=h(_(A[0],A[0]),h(_(A[1],A[1]),_(A[2],A[2]))),G=s(Y,w[0]),X=s(Y,v[0]),$=s(Y,y[0]),Nt=s(Y,M[0]),at=h(_(M[0],M[0]),h(_(M[1],M[1]),_(M[2],M[2]))),et=s(at,w[0]),nt=s(at,v[0]),it=s(at,y[0]),rt=s(at,A[0]),Xe=h(h(h(s(h(s(o(rt,Nt),y[1]),h(s(o(it,J),-A[1]),s(o($,ot),M[1]))),v[2]),h(s(h(s(o(rt,Nt),v[1]),h(s(o(nt,z),-A[1]),s(o(X,O),M[1]))),-y[2]),s(h(s(o(it,J),v[1]),h(s(o(nt,z),-y[1]),s(o(k,q),M[1]))),A[2]))),h(s(h(s(o($,ot),v[1]),h(s(o(X,O),-y[1]),s(o(k,q),A[1]))),-M[2]),h(s(h(s(o(rt,Nt),v[1]),h(s(o(nt,z),-A[1]),s(o(X,O),M[1]))),w[2]),s(h(s(o(rt,Nt),w[1]),h(s(o(et,D),-A[1]),s(o(G,N),M[1]))),-v[2])))),h(h(s(h(s(o(nt,z),w[1]),h(s(o(et,D),-v[1]),s(o(F,P),M[1]))),A[2]),h(s(h(s(o(X,O),w[1]),h(s(o(G,N),-v[1]),s(o(F,P),A[1]))),-M[2]),s(h(s(o($,ot),v[1]),h(s(o(X,O),-y[1]),s(o(k,q),A[1]))),w[2]))),h(s(h(s(o($,ot),w[1]),h(s(o(G,N),-y[1]),s(o(V,L),A[1]))),-v[2]),h(s(h(s(o(X,O),w[1]),h(s(o(G,N),-v[1]),s(o(F,P),A[1]))),y[2]),s(h(s(o(k,q),w[1]),h(s(o(V,L),-v[1]),s(o(F,P),y[1]))),-A[2]))))),gt=h(h(h(s(h(s(o(rt,Nt),y[1]),h(s(o(it,J),-A[1]),s(o($,ot),M[1]))),w[2]),s(h(s(o(rt,Nt),w[1]),h(s(o(et,D),-A[1]),s(o(G,N),M[1]))),-y[2])),h(s(h(s(o(it,J),w[1]),h(s(o(et,D),-y[1]),s(o(V,L),M[1]))),A[2]),s(h(s(o($,ot),w[1]),h(s(o(G,N),-y[1]),s(o(V,L),A[1]))),-M[2]))),h(h(s(h(s(o(it,J),v[1]),h(s(o(nt,z),-y[1]),s(o(k,q),M[1]))),w[2]),s(h(s(o(it,J),w[1]),h(s(o(et,D),-y[1]),s(o(V,L),M[1]))),-v[2])),h(s(h(s(o(nt,z),w[1]),h(s(o(et,D),-v[1]),s(o(F,P),M[1]))),y[2]),s(h(s(o(k,q),w[1]),h(s(o(V,L),-v[1]),s(o(F,P),y[1]))),-M[2])))),ut=o(Xe,gt);return ut[ut.length-1]}return R}function x(h,o,_,s){function R(w,v,y,A,M,C){var P=h(h(_(w[0],w[0]),_(w[1],w[1])),h(_(w[2],w[2]),_(w[3],w[3]))),L=s(P,v[0]),N=s(P,y[0]),D=s(P,A[0]),U=s(P,M[0]),F=s(P,C[0]),q=h(h(_(v[0],v[0]),_(v[1],v[1])),h(_(v[2],v[2]),_(v[3],v[3]))),O=s(q,w[0]),z=s(q,y[0]),H=s(q,A[0]),V=s(q,M[0]),k=s(q,C[0]),ot=h(h(_(y[0],y[0]),_(y[1],y[1])),h(_(y[2],y[2]),_(y[3],y[3]))),J=s(ot,w[0]),Y=s(ot,v[0]),G=s(ot,A[0]),X=s(ot,M[0]),$=s(ot,C[0]),Nt=h(h(_(A[0],A[0]),_(A[1],A[1])),h(_(A[2],A[2]),_(A[3],A[3]))),at=s(Nt,w[0]),et=s(Nt,v[0]),nt=s(Nt,y[0]),it=s(Nt,M[0]),rt=s(Nt,C[0]),Xe=h(h(_(M[0],M[0]),_(M[1],M[1])),h(_(M[2],M[2]),_(M[3],M[3]))),gt=s(Xe,w[0]),ut=s(Xe,v[0]),yt=s(Xe,y[0]),vt=s(Xe,A[0]),St=s(Xe,C[0]),Xn=h(h(_(C[0],C[0]),_(C[1],C[1])),h(_(C[2],C[2]),_(C[3],C[3]))),Mt=s(Xn,w[0]),bt=s(Xn,v[0]),Tt=s(Xn,y[0]),wt=s(Xn,A[0]),At=s(Xn,M[0]),pl=h(h(h(s(h(h(s(h(s(o(At,St),A[1]),h(s(o(wt,rt),-M[1]),s(o(vt,it),C[1]))),y[2]),s(h(s(o(At,St),y[1]),h(s(o(Tt,$),-M[1]),s(o(yt,X),C[1]))),-A[2])),h(s(h(s(o(wt,rt),y[1]),h(s(o(Tt,$),-A[1]),s(o(nt,G),C[1]))),M[2]),s(h(s(o(vt,it),y[1]),h(s(o(yt,X),-A[1]),s(o(nt,G),M[1]))),-C[2]))),v[3]),h(s(h(h(s(h(s(o(At,St),A[1]),h(s(o(wt,rt),-M[1]),s(o(vt,it),C[1]))),v[2]),s(h(s(o(At,St),v[1]),h(s(o(bt,k),-M[1]),s(o(ut,V),C[1]))),-A[2])),h(s(h(s(o(wt,rt),v[1]),h(s(o(bt,k),-A[1]),s(o(et,H),C[1]))),M[2]),s(h(s(o(vt,it),v[1]),h(s(o(ut,V),-A[1]),s(o(et,H),M[1]))),-C[2]))),-y[3]),s(h(h(s(h(s(o(At,St),y[1]),h(s(o(Tt,$),-M[1]),s(o(yt,X),C[1]))),v[2]),s(h(s(o(At,St),v[1]),h(s(o(bt,k),-M[1]),s(o(ut,V),C[1]))),-y[2])),h(s(h(s(o(Tt,$),v[1]),h(s(o(bt,k),-y[1]),s(o(Y,z),C[1]))),M[2]),s(h(s(o(yt,X),v[1]),h(s(o(ut,V),-y[1]),s(o(Y,z),M[1]))),-C[2]))),A[3]))),h(h(s(h(h(s(h(s(o(wt,rt),y[1]),h(s(o(Tt,$),-A[1]),s(o(nt,G),C[1]))),v[2]),s(h(s(o(wt,rt),v[1]),h(s(o(bt,k),-A[1]),s(o(et,H),C[1]))),-y[2])),h(s(h(s(o(Tt,$),v[1]),h(s(o(bt,k),-y[1]),s(o(Y,z),C[1]))),A[2]),s(h(s(o(nt,G),v[1]),h(s(o(et,H),-y[1]),s(o(Y,z),A[1]))),-C[2]))),-M[3]),s(h(h(s(h(s(o(vt,it),y[1]),h(s(o(yt,X),-A[1]),s(o(nt,G),M[1]))),v[2]),s(h(s(o(vt,it),v[1]),h(s(o(ut,V),-A[1]),s(o(et,H),M[1]))),-y[2])),h(s(h(s(o(yt,X),v[1]),h(s(o(ut,V),-y[1]),s(o(Y,z),M[1]))),A[2]),s(h(s(o(nt,G),v[1]),h(s(o(et,H),-y[1]),s(o(Y,z),A[1]))),-M[2]))),C[3])),h(s(h(h(s(h(s(o(At,St),A[1]),h(s(o(wt,rt),-M[1]),s(o(vt,it),C[1]))),v[2]),s(h(s(o(At,St),v[1]),h(s(o(bt,k),-M[1]),s(o(ut,V),C[1]))),-A[2])),h(s(h(s(o(wt,rt),v[1]),h(s(o(bt,k),-A[1]),s(o(et,H),C[1]))),M[2]),s(h(s(o(vt,it),v[1]),h(s(o(ut,V),-A[1]),s(o(et,H),M[1]))),-C[2]))),w[3]),s(h(h(s(h(s(o(At,St),A[1]),h(s(o(wt,rt),-M[1]),s(o(vt,it),C[1]))),w[2]),s(h(s(o(At,St),w[1]),h(s(o(Mt,F),-M[1]),s(o(gt,U),C[1]))),-A[2])),h(s(h(s(o(wt,rt),w[1]),h(s(o(Mt,F),-A[1]),s(o(at,D),C[1]))),M[2]),s(h(s(o(vt,it),w[1]),h(s(o(gt,U),-A[1]),s(o(at,D),M[1]))),-C[2]))),-v[3])))),h(h(h(s(h(h(s(h(s(o(At,St),v[1]),h(s(o(bt,k),-M[1]),s(o(ut,V),C[1]))),w[2]),s(h(s(o(At,St),w[1]),h(s(o(Mt,F),-M[1]),s(o(gt,U),C[1]))),-v[2])),h(s(h(s(o(bt,k),w[1]),h(s(o(Mt,F),-v[1]),s(o(O,L),C[1]))),M[2]),s(h(s(o(ut,V),w[1]),h(s(o(gt,U),-v[1]),s(o(O,L),M[1]))),-C[2]))),A[3]),s(h(h(s(h(s(o(wt,rt),v[1]),h(s(o(bt,k),-A[1]),s(o(et,H),C[1]))),w[2]),s(h(s(o(wt,rt),w[1]),h(s(o(Mt,F),-A[1]),s(o(at,D),C[1]))),-v[2])),h(s(h(s(o(bt,k),w[1]),h(s(o(Mt,F),-v[1]),s(o(O,L),C[1]))),A[2]),s(h(s(o(et,H),w[1]),h(s(o(at,D),-v[1]),s(o(O,L),A[1]))),-C[2]))),-M[3])),h(s(h(h(s(h(s(o(vt,it),v[1]),h(s(o(ut,V),-A[1]),s(o(et,H),M[1]))),w[2]),s(h(s(o(vt,it),w[1]),h(s(o(gt,U),-A[1]),s(o(at,D),M[1]))),-v[2])),h(s(h(s(o(ut,V),w[1]),h(s(o(gt,U),-v[1]),s(o(O,L),M[1]))),A[2]),s(h(s(o(et,H),w[1]),h(s(o(at,D),-v[1]),s(o(O,L),A[1]))),-M[2]))),C[3]),s(h(h(s(h(s(o(wt,rt),y[1]),h(s(o(Tt,$),-A[1]),s(o(nt,G),C[1]))),v[2]),s(h(s(o(wt,rt),v[1]),h(s(o(bt,k),-A[1]),s(o(et,H),C[1]))),-y[2])),h(s(h(s(o(Tt,$),v[1]),h(s(o(bt,k),-y[1]),s(o(Y,z),C[1]))),A[2]),s(h(s(o(nt,G),v[1]),h(s(o(et,H),-y[1]),s(o(Y,z),A[1]))),-C[2]))),w[3]))),h(h(s(h(h(s(h(s(o(wt,rt),y[1]),h(s(o(Tt,$),-A[1]),s(o(nt,G),C[1]))),w[2]),s(h(s(o(wt,rt),w[1]),h(s(o(Mt,F),-A[1]),s(o(at,D),C[1]))),-y[2])),h(s(h(s(o(Tt,$),w[1]),h(s(o(Mt,F),-y[1]),s(o(J,N),C[1]))),A[2]),s(h(s(o(nt,G),w[1]),h(s(o(at,D),-y[1]),s(o(J,N),A[1]))),-C[2]))),-v[3]),s(h(h(s(h(s(o(wt,rt),v[1]),h(s(o(bt,k),-A[1]),s(o(et,H),C[1]))),w[2]),s(h(s(o(wt,rt),w[1]),h(s(o(Mt,F),-A[1]),s(o(at,D),C[1]))),-v[2])),h(s(h(s(o(bt,k),w[1]),h(s(o(Mt,F),-v[1]),s(o(O,L),C[1]))),A[2]),s(h(s(o(et,H),w[1]),h(s(o(at,D),-v[1]),s(o(O,L),A[1]))),-C[2]))),y[3])),h(s(h(h(s(h(s(o(Tt,$),v[1]),h(s(o(bt,k),-y[1]),s(o(Y,z),C[1]))),w[2]),s(h(s(o(Tt,$),w[1]),h(s(o(Mt,F),-y[1]),s(o(J,N),C[1]))),-v[2])),h(s(h(s(o(bt,k),w[1]),h(s(o(Mt,F),-v[1]),s(o(O,L),C[1]))),y[2]),s(h(s(o(Y,z),w[1]),h(s(o(J,N),-v[1]),s(o(O,L),y[1]))),-C[2]))),-A[3]),s(h(h(s(h(s(o(nt,G),v[1]),h(s(o(et,H),-y[1]),s(o(Y,z),A[1]))),w[2]),s(h(s(o(nt,G),w[1]),h(s(o(at,D),-y[1]),s(o(J,N),A[1]))),-v[2])),h(s(h(s(o(et,H),w[1]),h(s(o(at,D),-v[1]),s(o(O,L),A[1]))),y[2]),s(h(s(o(Y,z),w[1]),h(s(o(J,N),-v[1]),s(o(O,L),y[1]))),-A[2]))),C[3]))))),ml=h(h(h(s(h(h(s(h(s(o(At,St),A[1]),h(s(o(wt,rt),-M[1]),s(o(vt,it),C[1]))),y[2]),s(h(s(o(At,St),y[1]),h(s(o(Tt,$),-M[1]),s(o(yt,X),C[1]))),-A[2])),h(s(h(s(o(wt,rt),y[1]),h(s(o(Tt,$),-A[1]),s(o(nt,G),C[1]))),M[2]),s(h(s(o(vt,it),y[1]),h(s(o(yt,X),-A[1]),s(o(nt,G),M[1]))),-C[2]))),w[3]),h(s(h(h(s(h(s(o(At,St),A[1]),h(s(o(wt,rt),-M[1]),s(o(vt,it),C[1]))),w[2]),s(h(s(o(At,St),w[1]),h(s(o(Mt,F),-M[1]),s(o(gt,U),C[1]))),-A[2])),h(s(h(s(o(wt,rt),w[1]),h(s(o(Mt,F),-A[1]),s(o(at,D),C[1]))),M[2]),s(h(s(o(vt,it),w[1]),h(s(o(gt,U),-A[1]),s(o(at,D),M[1]))),-C[2]))),-y[3]),s(h(h(s(h(s(o(At,St),y[1]),h(s(o(Tt,$),-M[1]),s(o(yt,X),C[1]))),w[2]),s(h(s(o(At,St),w[1]),h(s(o(Mt,F),-M[1]),s(o(gt,U),C[1]))),-y[2])),h(s(h(s(o(Tt,$),w[1]),h(s(o(Mt,F),-y[1]),s(o(J,N),C[1]))),M[2]),s(h(s(o(yt,X),w[1]),h(s(o(gt,U),-y[1]),s(o(J,N),M[1]))),-C[2]))),A[3]))),h(h(s(h(h(s(h(s(o(wt,rt),y[1]),h(s(o(Tt,$),-A[1]),s(o(nt,G),C[1]))),w[2]),s(h(s(o(wt,rt),w[1]),h(s(o(Mt,F),-A[1]),s(o(at,D),C[1]))),-y[2])),h(s(h(s(o(Tt,$),w[1]),h(s(o(Mt,F),-y[1]),s(o(J,N),C[1]))),A[2]),s(h(s(o(nt,G),w[1]),h(s(o(at,D),-y[1]),s(o(J,N),A[1]))),-C[2]))),-M[3]),s(h(h(s(h(s(o(vt,it),y[1]),h(s(o(yt,X),-A[1]),s(o(nt,G),M[1]))),w[2]),s(h(s(o(vt,it),w[1]),h(s(o(gt,U),-A[1]),s(o(at,D),M[1]))),-y[2])),h(s(h(s(o(yt,X),w[1]),h(s(o(gt,U),-y[1]),s(o(J,N),M[1]))),A[2]),s(h(s(o(nt,G),w[1]),h(s(o(at,D),-y[1]),s(o(J,N),A[1]))),-M[2]))),C[3])),h(s(h(h(s(h(s(o(At,St),y[1]),h(s(o(Tt,$),-M[1]),s(o(yt,X),C[1]))),v[2]),s(h(s(o(At,St),v[1]),h(s(o(bt,k),-M[1]),s(o(ut,V),C[1]))),-y[2])),h(s(h(s(o(Tt,$),v[1]),h(s(o(bt,k),-y[1]),s(o(Y,z),C[1]))),M[2]),s(h(s(o(yt,X),v[1]),h(s(o(ut,V),-y[1]),s(o(Y,z),M[1]))),-C[2]))),w[3]),s(h(h(s(h(s(o(At,St),y[1]),h(s(o(Tt,$),-M[1]),s(o(yt,X),C[1]))),w[2]),s(h(s(o(At,St),w[1]),h(s(o(Mt,F),-M[1]),s(o(gt,U),C[1]))),-y[2])),h(s(h(s(o(Tt,$),w[1]),h(s(o(Mt,F),-y[1]),s(o(J,N),C[1]))),M[2]),s(h(s(o(yt,X),w[1]),h(s(o(gt,U),-y[1]),s(o(J,N),M[1]))),-C[2]))),-v[3])))),h(h(h(s(h(h(s(h(s(o(At,St),v[1]),h(s(o(bt,k),-M[1]),s(o(ut,V),C[1]))),w[2]),s(h(s(o(At,St),w[1]),h(s(o(Mt,F),-M[1]),s(o(gt,U),C[1]))),-v[2])),h(s(h(s(o(bt,k),w[1]),h(s(o(Mt,F),-v[1]),s(o(O,L),C[1]))),M[2]),s(h(s(o(ut,V),w[1]),h(s(o(gt,U),-v[1]),s(o(O,L),M[1]))),-C[2]))),y[3]),s(h(h(s(h(s(o(Tt,$),v[1]),h(s(o(bt,k),-y[1]),s(o(Y,z),C[1]))),w[2]),s(h(s(o(Tt,$),w[1]),h(s(o(Mt,F),-y[1]),s(o(J,N),C[1]))),-v[2])),h(s(h(s(o(bt,k),w[1]),h(s(o(Mt,F),-v[1]),s(o(O,L),C[1]))),y[2]),s(h(s(o(Y,z),w[1]),h(s(o(J,N),-v[1]),s(o(O,L),y[1]))),-C[2]))),-M[3])),h(s(h(h(s(h(s(o(yt,X),v[1]),h(s(o(ut,V),-y[1]),s(o(Y,z),M[1]))),w[2]),s(h(s(o(yt,X),w[1]),h(s(o(gt,U),-y[1]),s(o(J,N),M[1]))),-v[2])),h(s(h(s(o(ut,V),w[1]),h(s(o(gt,U),-v[1]),s(o(O,L),M[1]))),y[2]),s(h(s(o(Y,z),w[1]),h(s(o(J,N),-v[1]),s(o(O,L),y[1]))),-M[2]))),C[3]),s(h(h(s(h(s(o(vt,it),y[1]),h(s(o(yt,X),-A[1]),s(o(nt,G),M[1]))),v[2]),s(h(s(o(vt,it),v[1]),h(s(o(ut,V),-A[1]),s(o(et,H),M[1]))),-y[2])),h(s(h(s(o(yt,X),v[1]),h(s(o(ut,V),-y[1]),s(o(Y,z),M[1]))),A[2]),s(h(s(o(nt,G),v[1]),h(s(o(et,H),-y[1]),s(o(Y,z),A[1]))),-M[2]))),w[3]))),h(h(s(h(h(s(h(s(o(vt,it),y[1]),h(s(o(yt,X),-A[1]),s(o(nt,G),M[1]))),w[2]),s(h(s(o(vt,it),w[1]),h(s(o(gt,U),-A[1]),s(o(at,D),M[1]))),-y[2])),h(s(h(s(o(yt,X),w[1]),h(s(o(gt,U),-y[1]),s(o(J,N),M[1]))),A[2]),s(h(s(o(nt,G),w[1]),h(s(o(at,D),-y[1]),s(o(J,N),A[1]))),-M[2]))),-v[3]),s(h(h(s(h(s(o(vt,it),v[1]),h(s(o(ut,V),-A[1]),s(o(et,H),M[1]))),w[2]),s(h(s(o(vt,it),w[1]),h(s(o(gt,U),-A[1]),s(o(at,D),M[1]))),-v[2])),h(s(h(s(o(ut,V),w[1]),h(s(o(gt,U),-v[1]),s(o(O,L),M[1]))),A[2]),s(h(s(o(et,H),w[1]),h(s(o(at,D),-v[1]),s(o(O,L),A[1]))),-M[2]))),y[3])),h(s(h(h(s(h(s(o(yt,X),v[1]),h(s(o(ut,V),-y[1]),s(o(Y,z),M[1]))),w[2]),s(h(s(o(yt,X),w[1]),h(s(o(gt,U),-y[1]),s(o(J,N),M[1]))),-v[2])),h(s(h(s(o(ut,V),w[1]),h(s(o(gt,U),-v[1]),s(o(O,L),M[1]))),y[2]),s(h(s(o(Y,z),w[1]),h(s(o(J,N),-v[1]),s(o(O,L),y[1]))),-M[2]))),-A[3]),s(h(h(s(h(s(o(nt,G),v[1]),h(s(o(et,H),-y[1]),s(o(Y,z),A[1]))),w[2]),s(h(s(o(nt,G),w[1]),h(s(o(at,D),-y[1]),s(o(J,N),A[1]))),-v[2])),h(s(h(s(o(et,H),w[1]),h(s(o(at,D),-v[1]),s(o(O,L),A[1]))),y[2]),s(h(s(o(Y,z),w[1]),h(s(o(J,N),-v[1]),s(o(O,L),y[1]))),-A[2]))),M[3]))))),qo=o(pl,ml);return qo[qo.length-1]}return R}var S=[l,f,u];function b(h){var o=S[h.length];return o||(o=S[h.length]=c(h.length)),o.apply(void 0,h)}function E(h,o,_,s,R,w,v,y){function A(M,C,P,L,N,D){switch(arguments.length){case 0:case 1:return 0;case 2:return s(M,C);case 3:return R(M,C,P);case 4:return w(M,C,P,L);case 5:return v(M,C,P,L,N);case 6:return y(M,C,P,L,N,D)}for(var U=new Array(arguments.length),F=0;F<arguments.length;++F)U[F]=arguments[F];return h(U)}return A}function T(){for(;S.length<=a;)S.push(c(S.length));t.exports=E.apply(void 0,[b].concat(S));for(var h=0;h<=a;++h)t.exports[h]=S[h]}T()}}),md=Qt({"node_modules/cdt2d/lib/delaunay.js"(p,t){"use strict";var e=pd()[4],n=Ur();t.exports=r;function i(a,c,l,f,u,d){var m=c.opposite(f,u);if(!(m<0)){if(u<f){var g=f;f=u,u=g,g=d,d=m,m=g}c.isConstraint(f,u)||e(a[f],a[u],a[d],a[m])<0&&l.push(f,u)}}function r(a,c){for(var l=[],f=a.length,u=c.stars,d=0;d<f;++d)for(var m=u[d],g=1;g<m.length;g+=2){var x=m[g];if(!(x<d)&&!c.isConstraint(d,x)){for(var S=m[g-1],b=-1,E=1;E<m.length;E+=2)if(m[E-1]===x){b=m[E];break}b<0||e(a[d],a[x],a[S],a[b])<0&&l.push(d,x)}}for(;l.length>0;){for(var x=l.pop(),d=l.pop(),S=-1,b=-1,m=u[d],T=1;T<m.length;T+=2){var h=m[T-1],o=m[T];h===x?b=o:o===x&&(S=h)}S<0||b<0||e(a[d],a[x],a[S],a[b])>=0||(c.flip(d,x),i(a,c,l,S,d,b),i(a,c,l,d,b,S),i(a,c,l,b,x,S),i(a,c,l,x,S,b))}}}}),gd=Qt({"node_modules/cdt2d/lib/filter.js"(p,t){"use strict";var e=Ur();t.exports=l;function n(f,u,d,m,g,x,S){this.cells=f,this.neighbor=u,this.flags=m,this.constraint=d,this.active=g,this.next=x,this.boundary=S}var i=n.prototype;function r(f,u){return f[0]-u[0]||f[1]-u[1]||f[2]-u[2]}i.locate=(function(){var f=[0,0,0];return function(u,d,m){var g=u,x=d,S=m;return d<m?d<u&&(g=d,x=m,S=u):m<u&&(g=m,x=u,S=d),g<0?-1:(f[0]=g,f[1]=x,f[2]=S,e.eq(this.cells,f,r))}})();function a(f,u){for(var d=f.cells(),m=d.length,g=0;g<m;++g){var x=d[g],S=x[0],b=x[1],E=x[2];b<E?b<S&&(x[0]=b,x[1]=E,x[2]=S):E<S&&(x[0]=E,x[1]=S,x[2]=b)}d.sort(r);for(var T=new Array(m),g=0;g<T.length;++g)T[g]=0;var h=[],o=[],_=new Array(3*m),s=new Array(3*m),R=null;u&&(R=[]);for(var w=new n(d,_,s,T,h,o,R),g=0;g<m;++g)for(var x=d[g],v=0;v<3;++v){var S=x[v],b=x[(v+1)%3],y=_[3*g+v]=w.locate(b,S,f.opposite(b,S)),A=s[3*g+v]=f.isConstraint(S,b);y<0&&(A?o.push(g):(h.push(g),T[g]=1),u&&R.push([b,S,-1]))}return w}function c(f,u,d){for(var m=0,g=0;g<f.length;++g)u[g]===d&&(f[m++]=f[g]);return f.length=m,f}function l(f,u,d){var m=a(f,d);if(u===0)return d?m.cells.concat(m.boundary):m.cells;for(var g=1,x=m.active,S=m.next,b=m.flags,E=m.cells,T=m.constraint,h=m.neighbor;x.length>0||S.length>0;){for(;x.length>0;){var o=x.pop();if(b[o]!==-g){b[o]=g;for(var _=E[o],s=0;s<3;++s){var R=h[3*o+s];R>=0&&b[R]===0&&(T[3*o+s]?S.push(R):(x.push(R),b[R]=g))}}}var w=S;S=x,x=w,S.length=0,g=-g}var v=c(E,b,u);return d?v.concat(m.boundary):v}}}),_d=Qt({"node_modules/cdt2d/cdt2d.js"(p,t){var e=fd(),n=dd(),i=md(),r=gd();t.exports=u;function a(d){return[Math.min(d[0],d[1]),Math.max(d[0],d[1])]}function c(d,m){return d[0]-m[0]||d[1]-m[1]}function l(d){return d.map(a).sort(c)}function f(d,m,g){return m in d?d[m]:g}function u(d,m,g){Array.isArray(m)?(g=g||{},m=m||[]):(g=m||{},m=[]);var x=!!f(g,"delaunay",!0),S=!!f(g,"interior",!0),b=!!f(g,"exterior",!0),E=!!f(g,"infinity",!1);if(!S&&!b||d.length===0)return[];var T=e(d,m);if(x||S!==b||E){for(var h=n(d.length,l(m)),o=0;o<T.length;++o){var _=T[o];h.addTriangle(_[0],_[1],_[2])}return x&&i(d,h),b?S?E?r(h,0,E):h.cells():r(h,1,E):r(h,-1)}else return T}}}),Dc=_d();var jt=class{constructor(t){this.createFn=t,this._pool=[],this._index=0}getInstance(){return this._index>=this._pool.length&&this._pool.push(this.createFn()),this._pool[this._index++]}clear(){this._index=0}reset(){this._pool.length=0,this._index=0}};var Uc=1e-16,xd=1e-16,je=new I,Fc=new I,Bc=new jt(()=>({param:0,index:0})),yd=new jt(()=>new I);function vd(p,t,e,n){Bc.clear(),t.length=0,e.length=0;for(let f=0,u=p.length;f<u;f++){let d=p[f];l(d.start),l(d.end)}for(let f=0,u=p.length;f<u;f++){let d=p[f];for(let m=f+1;m<u;m++){let g=p[m];d.distanceSqToLine3(g,je,Fc)<Uc*n&&l(Fc)}}let i=[];for(let f=0,u=p.length;f<u;f++){i.length=0;let d=p[f];for(let m=0,g=t.length;m<g;m++){let x=t[m],S=d.closestPointToPointParameter(x,!0);if(d.at(S,je),x.distanceToSquared(je)<Uc*n){let b=Bc.getInstance();b.param=S,b.index=m,i.push(b)}}i.sort(c);for(let m=0,g=i.length-1;m<g;m++){let x=i[m].index,S=i[m+1].index;x!==S&&e.push([x,S])}}let r=new Set,a=0;for(let f=0,u=e.length;f<u;f++){let d=e[f],m=Math.min(d[0],d[1]),g=Math.max(d[0],d[1]),x=m+","+g;r.has(x)||(r.add(x),e[a++]=d)}e.length=a;function c(f,u){return f.param-u.param}function l(f){for(let u=0;u<t.length;u++){let d=t[u];if(f===d||f.distanceToSquared(d)<xd*n)return u}return t.push(yd.getInstance().copy(f)),t.length-1}}var mi=class{constructor(){this.trianglePool=new jt(()=>new Rt),this.linePool=new jt(()=>new ht),this.triangles=[],this.triangleIndices=[],this.constrainedEdges=[],this.triangleConnectivity=[],this.normal=new I,this.projOrigin=new I,this.projU=new I,this.projV=new I,this.baseTri=new Rt,this.baseIndices=new Array(3)}initialize(t,e=null,n=null,i=null){this.reset();let{normal:r,baseTri:a,projU:c,projV:l,projOrigin:f,constrainedEdges:u,linePool:d,baseIndices:m}=this;t.getNormal(r),a.copy(t),a.update(),m[0]=e,m[1]=n,m[2]=i,u.length=0;let g=d.getInstance();g.start.copy(a.a),g.end.copy(a.b);let x=d.getInstance();x.start.copy(a.b),x.end.copy(a.c);let S=d.getInstance();S.start.copy(a.c),S.end.copy(a.a),u.push(g,x,S),f.copy(a.a),c.subVectors(a.b,a.a).normalize(),l.crossVectors(r,c).normalize()}addConstraintEdge(t){let{constrainedEdges:e,linePool:n}=this,i=n.getInstance().copy(t);e.push(i)}_to2D(t,e){let{projOrigin:n,projU:i,projV:r}=this;return je.subVectors(t,n),e.set(je.dot(i),je.dot(r),0)}_from2D(t,e,n){let{projOrigin:i,projU:r,projV:a}=this;return n.copy(i).addScaledVector(r,t).addScaledVector(a,e),n}triangulate(){let{triangles:t,trianglePool:e,triangleConnectivity:n,triangleIndices:i,linePool:r,baseTri:a,constrainedEdges:c,baseIndices:l}=this;t.length=0,e.clear();let f=[];for(let E=0,T=c.length;E<T;E++){let h=c[E],o=r.getInstance();this._to2D(h.start,o.start),this._to2D(h.end,o.end),f.push(o)}let u=0;for(let E=0;E<3;E++){let T=this._to2D(a.points[E],je);u=Math.max(u,Math.abs(T.x),Math.abs(T.y))}let d=[],m=[];vd(f,d,m,u);let g=[];for(let E=0,T=d.length;E<T;E++){let h=d[E];g.push([h.x,h.y])}let x=Dc(g,m,{exterior:!1}),S=new Map;for(let E=0,T=m.length;E<T;E++){let h=m[E];S.set(`${h[0]}_${h[1]}`,-1),S.set(`${h[1]}_${h[0]}`,-1)}let b=`${l[0]}_${l[1]}_${l[2]}_`;for(let E=0,T=x.length;E<T;E++){let h=x[E],[o,_,s]=h,R=e.getInstance();this._from2D(g[o][0],g[o][1],R.a),this._from2D(g[_][0],g[_][1],R.b),this._from2D(g[s][0],g[s][1],R.c),t.push(R);let w=[];n.push(w);let v=[];i.push(v);for(let y=0;y<3;y++){let A=h[y];v.push(A<3?l[A]:b+A);let M=h[(y+1)%3],C=`${A}_${M}`;if(S.has(C)){let P=S.get(C);P!==-1&&(w.push(P),n[P].push(E))}else{let P=`${M}_${A}`;S.set(P,E)}}}}reset(){this.trianglePool.clear(),this.linePool.clear(),this.triangles.length=0,this.triangleIndices.length=0,this.triangleConnectivity.length=0,this.constrainedEdges.length=0}};var Sd=1e-14,Io=new I,Oc=new I,zc=new I;function fe(p,t=Sd){Io.subVectors(p.b,p.a),Oc.subVectors(p.c,p.a),zc.subVectors(p.b,p.c);let e=Io.angleTo(Oc),n=Io.angleTo(zc),i=Math.PI-e-n;return Math.abs(e)<t||Math.abs(n)<t||Math.abs(i)<t||p.a.distanceToSquared(p.b)<t||p.a.distanceToSquared(p.c)<t||p.b.distanceToSquared(p.c)<t}var Po=1e-10,gi=1e-10,Ae=new ht,Lt=new ht,Ee=new I,Vc=new I,kc=new I,Fr=new re,Lo=new Rt,_i=class{constructor(){this.trianglePool=new jt(()=>new ft),this.triangles=[],this.normal=new I}initialize(t){this.reset();let{triangles:e,trianglePool:n,normal:i}=this;if(Array.isArray(t))for(let r=0,a=t.length;r<a;r++){let c=t[r];if(r===0)c.getNormal(i);else if(Math.abs(1-c.getNormal(Ee).dot(i))>Po)throw new Error("Triangle Splitter: Cannot initialize with triangles that have different normals.");let l=n.getInstance();l.copy(c),e.push(l)}else{t.getNormal(i);let r=n.getInstance();r.copy(t),e.push(r)}}splitByTriangle(t,e){let{triangles:n}=this;if(e){for(let r=0,a=n.length;r<a;r++){let c=n[r];c.coplanarCount=0}let i=[t.a,t.b,t.c];for(let r=0;r<3;r++){let a=(r+1)%3,c=i[r],l=i[a];t.getNormal(Vc).normalize(),Ee.subVectors(l,c).normalize(),kc.crossVectors(Vc,Ee),Fr.setFromNormalAndCoplanarPoint(kc,c),this.splitByPlane(Fr,t)}}else t.getPlane(Fr),this.splitByPlane(Fr,t)}splitByPlane(t,e){let{triangles:n,trianglePool:i}=this;Lo.copy(e),Lo.needsUpdate=!0;for(let r=0,a=n.length;r<a;r++){let c=n[r];if(!Lo.intersectsTriangle(c,Ae,!0))continue;let{a:l,b:f,c:u}=c,d=0,m=-1,g=!1,x=[],S=[],b=[l,f,u];for(let E=0;E<3;E++){let T=(E+1)%3;Ae.start.copy(b[E]),Ae.end.copy(b[T]);let h=t.distanceToPoint(Ae.start),o=t.distanceToPoint(Ae.end);if(Math.abs(h)<gi&&Math.abs(o)<gi){g=!0;break}if(h>0?x.push(E):S.push(E),Math.abs(h)<gi)continue;let _=!!t.intersectLine(Ae,Ee);!_&&Math.abs(o)<gi&&(Ee.copy(Ae.end),_=!0),_&&!(Ee.distanceTo(Ae.start)<Po)&&(Ee.distanceTo(Ae.end)<Po&&(m=E),d===0?Lt.start.copy(Ee):Lt.end.copy(Ee),d++)}if(!g&&d===2&&Lt.distance()>gi)if(m!==-1){m=(m+1)%3;let E=0;E===m&&(E=(E+1)%3);let T=E+1;T===m&&(T=(T+1)%3);let h=i.getInstance();h.a.copy(b[T]),h.b.copy(Lt.end),h.c.copy(Lt.start),fe(h)||n.push(h),c.a.copy(b[E]),c.b.copy(Lt.start),c.c.copy(Lt.end),fe(c)&&(n.splice(r,1),r--,a--)}else{let E=x.length>=2?S[0]:x[0];if(E===0){let s=Lt.start;Lt.start=Lt.end,Lt.end=s}let T=(E+1)%3,h=(E+2)%3,o=i.getInstance(),_=i.getInstance();b[T].distanceToSquared(Lt.start)<b[h].distanceToSquared(Lt.end)?(o.a.copy(b[T]),o.b.copy(Lt.start),o.c.copy(Lt.end),_.a.copy(b[T]),_.b.copy(b[h]),_.c.copy(Lt.start)):(o.a.copy(b[h]),o.b.copy(Lt.start),o.c.copy(Lt.end),_.a.copy(b[T]),_.b.copy(b[h]),_.c.copy(Lt.end)),c.a.copy(b[E]),c.b.copy(Lt.end),c.c.copy(Lt.start),fe(o)||n.push(o),fe(_)||n.push(_),fe(c)&&(n.splice(r,1),r--,a--)}else d===3&&console.warn("TriangleClipper: Coplanar clip not handled")}}reset(){this.triangles.length=0,this.trianglePool.clear()}};var xi=class{constructor(){this.coplanarSet=new Map,this.intersectionSet=new Map,this.edgeSet=new Map,this.ids=[]}add(t,e,n=!1){let{intersectionSet:i,coplanarSet:r,ids:a}=this;i.has(t)||(i.set(t,[]),a.push(t)),i.get(t).push(e),n&&(r.has(t)||r.set(t,new Set),r.get(t).add(e))}addIntersectionEdge(t,e){let{edgeSet:n}=this;n.has(t)||n.set(t,new Set),n.get(t).add(e)}getIntersectionEdges(t){return this.edgeSet.get(t)||null}};var No=1e-10,Md=1e-15,bd=1e-10,Td=1e-10,Gc=new ht,zn=new ht,Hc=new I,Wc=new I,Xc=new I,Do=new re,Vn=new I,Br=new I;function Yc(p,t){p.getNormal(Vn),t.getNormal(Br);let e=Vn.dot(Br);if(Math.abs(1-Math.abs(e))>=bd)return!1;let n=Vn.dot(p.a),i=Vn.dot(t.a);return Math.abs(n-i)<Td}function qc(p,t,e,n){let i=0,r=1;p.delta(Hc);let a=[t.a,t.b,t.c];for(let c=0;c<3;c++){let l=a[c],f=a[(c+1)%3];Wc.subVectors(f,l),Xc.crossVectors(e,Wc),Do.setFromNormalAndCoplanarPoint(Xc,l);let u=Do.distanceToPoint(p.start),d=Do.normal.dot(Hc);if(Math.abs(d)<Md){if(u<-No)return null;continue}let m=-u/d;if(d>0?i=Math.max(i,m):r=Math.min(r,m),i>r+No)return null}return r-i<No?null:(p.at(i,n.start),p.at(r,n.end),n)}function Uo(p,t,e){let n=0;p.getNormal(Vn),t.getNormal(Br);let i=[t.a,t.b,t.c];for(let a=0;a<3;a++){zn.start.copy(i[a]),zn.end.copy(i[(a+1)%3]);let c=qc(zn,p,Vn,Gc);c!==null&&(n>=e.length&&e.push(new ht),e[n].copy(c),n++)}let r=[p.a,p.b,p.c];for(let a=0;a<3;a++){zn.start.copy(r[a]),zn.end.copy(r[(a+1)%3]);let c=qc(zn,t,Br,Gc);c!==null&&(n>=e.length&&e.push(new ht),e[n].copy(c),n++)}return n}var kn=new me,Zc=new Q,Or=new ht,Fo=[],zr=new jt(()=>new ht),Gn=-1,Hn=1,yi=-2,vi=2,Wn=0,tn=1,kr=2,Vr=null;function Oo(p){Vr=p}function zo(p,t,e=null){p.getMidpoint(kn.origin),p.getNormal(kn.direction),e&&(kn.origin.applyMatrix4(e),kn.direction.transformDirection(e));let n=t.raycastFirst(kn,ii);return!!(n&&kn.direction.dot(n.face.normal)>0)?Gn:Hn}function $c(p,t){let e=new xi,n=new xi;return zr.clear(),Zc.copy(p.matrixWorld).invert().multiply(t.matrixWorld),p.geometry.boundsTree.bvhcast(t.geometry.boundsTree,Zc,{intersectsTriangles(i,r,a,c){if(!fe(i)&&!fe(r)){let f=(Yc(i,r)?Uo(i,r,Fo):0)>2;if(f||i.intersectsTriangle(r,Or,!0)){let d=p.geometry.boundsTree.resolveTriangleIndex(a),m=t.geometry.boundsTree.resolveTriangleIndex(c);if(e.add(d,m,f),n.add(m,d,f),f){let g=Uo(i,r,Fo);for(let x=0;x<g;x++){let S=zr.getInstance().copy(Fo[x]);e.addIntersectionEdge(d,S),n.addIntersectionEdge(m,S)}}else{let g=zr.getInstance().copy(Or),x=zr.getInstance().copy(Or);e.addIntersectionEdge(d,g),n.addIntersectionEdge(m,x)}Vr&&(Vr.addEdge(Or),Vr.addIntersectingTriangles(a,i,c,r))}}return!1}}),{aIntersections:e,bIntersections:n}}function Vo(p,t,e=!1){switch(p){case 0:if(t===Hn||t===vi&&!e)return tn;break;case 1:if(e){if(t===Gn)return Wn}else if(t===Hn||t===yi)return tn;break;case 2:if(e){if(t===Hn||t===yi)return tn}else if(t===Gn)return Wn;break;case 4:if(t===Gn)return Wn;if(t===Hn)return tn;break;case 3:if(t===Gn||t===vi&&!e)return tn;break;case 5:if(!e&&(t===Hn||t===yi))return tn;break;case 6:if(!e&&(t===Gn||t===vi))return tn;break;default:throw new Error(`Unrecognized CSG operation enum "${p}".`)}return kr}var ko=class{constructor(t){this.triangle=new ft().copy(t),this.intersects={}}addTriangle(t,e){this.intersects[t]=new ft().copy(e)}getIntersectArray(){let t=[],{intersects:e}=this;for(let n in e)t.push(e[n]);return t}},Gr=class{constructor(){this.data={}}addTriangleIntersection(t,e,n,i){let{data:r}=this;r[t]||(r[t]=new ko(e)),r[t].addTriangle(n,i)}getTrianglesAsArray(t=null){let{data:e}=this,n=[];if(t!==null)t in e&&n.push(e[t].triangle);else for(let i in e)n.push(e[i].triangle);return n}getTriangleIndices(){return Object.keys(this.data).map(t=>parseInt(t))}getIntersectionIndices(t){let{data:e}=this;return e[t]?Object.keys(e[t].intersects).map(n=>parseInt(n)):[]}getIntersectionsAsArray(t=null,e=null){let{data:n}=this,i=new Set,r=[],a=c=>{if(n[c])if(e!==null)n[c].intersects[e]&&r.push(n[c].intersects[e]);else{let l=n[c].intersects;for(let f in l)i.has(f)||(i.add(f),r.push(l[f]))}};if(t!==null)a(t);else for(let c in n)a(c);return r}reset(){this.data={}}},Hr=class{constructor(){this.enabled=!1,this.triangleIntersectsA=new Gr,this.triangleIntersectsB=new Gr,this.intersectionEdges=[]}addIntersectingTriangles(t,e,n,i){let{triangleIntersectsA:r,triangleIntersectsB:a}=this;r.addTriangleIntersection(t,e,n,i),a.addTriangleIntersection(n,i,t,e)}addEdge(t){this.intersectionEdges.push(t.clone())}reset(){this.triangleIntersectsA.reset(),this.triangleIntersectsB.reset(),this.intersectionEdges=[]}init(){this.enabled&&(this.reset(),Oo(this))}complete(){this.enabled&&Oo(null)}};var te=new Q,en=new Q,Xt=new Q,We=new W,de=new ft,nn=new ft,pe=new ft,He=new ft,rn=[],ge=[],Wr=new Set,Kc=new I,Qc=new I,jc=new jt(()=>new ft),tl=new I,Xr=[];function il(p,t,e,n,i,r={}){let{useGroups:a=!0}=r,{aIntersections:c,bIntersections:l}=$c(p,t),f=[],u=null,d;return d=a?0:-1,nl(p,t,c,e,!1,i,d),el(p,t,c,e,!1,n,i,d),e.findIndex(g=>g!==6&&g!==5)!==-1&&(i.forEach(g=>g.clearIndexMap()),d=a?p.geometry.groups.length||1:-1,nl(t,p,l,e,!0,i,d),el(t,p,l,e,!0,n,i,d)),i.forEach(g=>g.clearIndexMap()),rn.length=0,{groups:f,materials:u}}function el(p,t,e,n,i,r,a,c=0){te.copy(t.matrixWorld).invert().multiply(p.matrixWorld),en.copy(te).invert(),i?Xt.copy(te):Xt.identity();let l=Xt.determinant()<0;We.getNormalMatrix(Xt).multiplyScalar(l?-1:1);let f=p.geometry.groupIndices,u=p.geometry.index,d=p.geometry.attributes.position,m=t.geometry.boundsTree,g=t.geometry.index,x=t.geometry.attributes.position,S=e.ids;for(let b=0,E=S.length;b<E;b++){let T=S[b],h=c===-1?0:f[T]+c,o=3*T,_=o+0,s=o+1,R=o+2;u&&(_=u.getX(_),s=u.getX(s),R=u.getX(R)),de.a.fromBufferAttribute(d,_),de.b.fromBufferAttribute(d,s),de.c.fromBufferAttribute(d,R),i&&(de.a.applyMatrix4(te),de.b.applyMatrix4(te),de.c.applyMatrix4(te)),r.reset(),r.initialize(de,_,s,R),Xr.length=0,jc.clear(),de.getNormal(Qc);let w=e.coplanarSet.get(T);if(w)for(let M of w){let C=3*M,P=C+0,L=C+1,N=C+2;g&&(P=g.getX(P),L=g.getX(L),N=g.getX(N));let D=jc.getInstance();D.a.fromBufferAttribute(x,P),D.b.fromBufferAttribute(x,L),D.c.fromBufferAttribute(x,N),i||(D.a.applyMatrix4(en),D.b.applyMatrix4(en),D.c.applyMatrix4(en)),Xr.push(D)}if(r.addConstraintEdge){let M=e.getIntersectionEdges(T);if(M)for(let C of M)r.addConstraintEdge(C);r.triangulate()}else{let C=e.intersectionSet.get(T);for(let P=0,L=C.length;P<L;P++){let N=C[P],D=w&&w.has(N),U=3*N,F=U+0,q=U+1,O=U+2;g&&(F=g.getX(F),q=g.getX(q),O=g.getX(O)),nn.a.fromBufferAttribute(x,F),nn.b.fromBufferAttribute(x,q),nn.c.fromBufferAttribute(x,O),i||(nn.a.applyMatrix4(en),nn.b.applyMatrix4(en),nn.c.applyMatrix4(en)),r.splitByTriangle(nn,D)}}let{triangles:v,triangleIndices:y=[],triangleConnectivity:A=[]}=r;for(let M=0,C=a.length;M<C;M++)a[M].initInterpolatedAttributeData(p.geometry,Xt,We,_,s,R);Wr.clear();for(let M=0,C=v.length;M<C;M++){if(Wr.has(M))continue;let P=v[M],L=i?null:te,N=null;P.getMidpoint(Kc);for(let D=0,U=Xr.length;D<U;D++){let F=Xr[D];if(F.containsPoint(Kc)){F.getNormal(tl),N=Qc.dot(tl)>0?vi:yi;break}}N===null&&(N=zo(P,m,L)),rn.length=0,ge.length=0;for(let D=0,U=n.length;D<U;D++){let F=Vo(n[D],N,i);F!==kr&&(rn.push(F),ge.push(a[D]))}if(ge.length!==0){let D=[M];for(;D.length>0;){let U=D.pop();if(Wr.has(U))continue;Wr.add(U);let F=y[U],q=null,O=null,z=null;F&&(q=F[0],O=F[1],z=F[2]);let H=v[U];de.getBarycoord(H.a,He.a),de.getBarycoord(H.b,He.b),de.getBarycoord(H.c,He.c);for(let V=0,k=ge.length;V<k;V++){let ot=ge[V],Y=rn[V]===Wn,G=l!==Y;ot.appendInterpolatedAttributeData(h,He.a,q,G),G?(ot.appendInterpolatedAttributeData(h,He.c,z,G),ot.appendInterpolatedAttributeData(h,He.b,O,G)):(ot.appendInterpolatedAttributeData(h,He.b,O,G),ot.appendInterpolatedAttributeData(h,He.c,z,G))}}}}}return S.length}function nl(p,t,e,n,i,r,a=0){te.copy(t.matrixWorld).invert().multiply(p.matrixWorld),i?Xt.copy(te):Xt.identity();let c=Xt.determinant()<0;We.getNormalMatrix(Xt).multiplyScalar(c?-1:1);let l=t.geometry.boundsTree,f=p.geometry.groupIndices,u=p.geometry.index,m=p.geometry.attributes.position,g=[],x=p.geometry.halfEdges,S=new Set(e.ids),b=On(p.geometry);for(let E=0;E<b&&S.size!==b;E++){if(S.has(E))continue;S.add(E),g.push(E);let T=3*E,h=T+0,o=T+1,_=T+2;u&&(h=u.getX(h),o=u.getX(o),_=u.getX(_)),pe.a.fromBufferAttribute(m,h),pe.b.fromBufferAttribute(m,o),pe.c.fromBufferAttribute(m,_),i&&(pe.a.applyMatrix4(te),pe.b.applyMatrix4(te),pe.c.applyMatrix4(te));let s=zo(pe,l,i?null:te);rn.length=0,ge.length=0;for(let R=0,w=n.length;R<w;R++){let v=Vo(n[R],s,i);v!==kr&&(rn.push(v),ge.push(r[R]))}for(;g.length>0;){let R=g.pop();for(let w=0;w<3;w++){let v=x.getSiblingTriangleIndex(R,w);v!==-1&&!S.has(v)&&(g.push(v),S.add(v))}if(ge.length!==0){let w=3*R,v=w+0,y=w+1,A=w+2;u&&(v=u.getX(v),y=u.getX(y),A=u.getX(A));let M=a===-1?0:f[R]+a;if(pe.a.fromBufferAttribute(m,v),pe.b.fromBufferAttribute(m,y),pe.c.fromBufferAttribute(m,A),!fe(pe))for(let C=0,P=ge.length;C<P;C++){let L=ge[C],U=rn[C]===Wn!==c;L.appendIndexFromGeometry(p.geometry,Xt,We,M,v,U),U?(L.appendIndexFromGeometry(p.geometry,Xt,We,M,A,U),L.appendIndexFromGeometry(p.geometry,Xt,We,M,y,U)):(L.appendIndexFromGeometry(p.geometry,Xt,We,M,y,U),L.appendIndexFromGeometry(p.geometry,Xt,We,M,A,U))}}}}}function Ad(p){return p=~~p,p+4-p%4}var qr=class{constructor(t,e=500){this.expansionFactor=1.5,this.type=t,this.length=0,this.array=null,this.setSize(e)}setType(t){if(t===this.type)return;if(this.length!==0)throw new Error("TypeBackedArray: Cannot change the type while there is used data in the buffer.");let e=this.array.buffer;this.array=new t(e),this.type=t}setSize(t){if(this.array&&t===this.array.length)return;let e=this.type,n=Pr()?SharedArrayBuffer:ArrayBuffer,i=new e(new n(Ad(t*e.BYTES_PER_ELEMENT)));this.array&&i.set(this.array,0),this.array=i}expand(){let{array:t,expansionFactor:e}=this;this.setSize(t.length*e)}push(...t){let{array:e,length:n}=this;n+t.length>e.length&&(this.expand(),e=this.array);for(let i=0,r=t.length;i<r;i++)e[n+i]=t[i];this.length+=t.length}clear(){this.length=0}};var qt=new I,Go=new I,Ho=new I,Wo=new I,Yr=new Jt,Ed=new Jt,Cd=new Jt,Rd=new Jt;function Id(p,t,e,n,i,r=!1,a=!1){return i.set(0,0,0,0).addScaledVector(p,n.x).addScaledVector(t,n.y).addScaledVector(e,n.z),r&&i.normalize(),a&&i.multiplyScalar(-1),i}function rl(p,t,e){switch(t){case 1:e.push(p.x);break;case 2:e.push(p.x,p.y);break;case 3:e.push(p.x,p.y,p.z);break;case 4:e.push(p.x,p.y,p.z,p.w);break}}var Si=class extends qr{get count(){return this.length/this.itemSize}constructor(...t){super(...t),this.itemSize=1,this.normalized=!1}},Zr=class{constructor(){this.attributeData={},this.groupIndices=[],this.forwardIndexMap=new Map,this.invertedIndexMap=new Map,this.interpolatedFields={}}initFromGeometry(t,e){this.clear();let{attributeData:n}=this,i=t.attributes;for(let r=0,a=e.length;r<a;r++){let c=e[r],l=i[c],f=l.array.constructor;n[c]||(n[c]=new Si(f)),n[c].setType(f),n[c].itemSize=l.itemSize,n[c].normalized=l.normalized}for(let r in n.attributes)e.includes(r)||n.delete(r)}initInterpolatedAttributeData(t,e,n,i,r,a){let{attributeData:c,interpolatedFields:l}=this,{attributes:f}=t;for(let u in c){let d=f[u];if(!d)throw new Error(`CSG Operations: Attribute ${u} not available on geometry.`);let m,g,x;if(u==="position"?(m=Go.fromBufferAttribute(d,i).applyMatrix4(e),g=Ho.fromBufferAttribute(d,r).applyMatrix4(e),x=Wo.fromBufferAttribute(d,a).applyMatrix4(e)):u==="normal"?(m=Go.fromBufferAttribute(d,i).applyNormalMatrix(n),g=Ho.fromBufferAttribute(d,r).applyNormalMatrix(n),x=Wo.fromBufferAttribute(d,a).applyNormalMatrix(n)):u==="tangent"?(m=Go.fromBufferAttribute(d,i).transformDirection(e),g=Ho.fromBufferAttribute(d,r).transformDirection(e),x=Wo.fromBufferAttribute(d,a).transformDirection(e)):(m=Ed.fromBufferAttribute(d,i),g=Cd.fromBufferAttribute(d,r),x=Rd.fromBufferAttribute(d,a)),!l[u])l[u]=[m.clone(),g.clone(),x.clone()];else{let S=l[u];S[0].copy(m),S[1].copy(g),S[2].copy(x)}}}appendInterpolatedAttributeData(t,e,n=null,i=!1){let{groupIndices:r,attributeData:a,interpolatedFields:c,forwardIndexMap:l,invertedIndexMap:f}=this;for(;r.length<=t;)r.push(new Si(Uint32Array));let u=i?f:l,d=r[t];if(n!==null&&u.has(n))d.push(u.get(n));else{u.set(n,a.position.count),d.push(a.position.count);for(let m in c){let g=a[m],x=m==="normal"||m==="tangent",S=i&&x,b=g.itemSize,[E,T,h]=c[m];Id(E,T,h,e,Yr,x,S),rl(Yr,b,g)}}}appendIndexFromGeometry(t,e,n,i,r,a=!1){let{groupIndices:c,attributeData:l,forwardIndexMap:f,invertedIndexMap:u}=this;for(;c.length<=i;)c.push(new Si(Uint32Array));let d=a?u:f,m=c[i];if(r!==null&&d.has(r))m.push(d.get(r));else{d.set(r,l.position.count),m.push(l.position.count);let{attributes:g}=t;for(let x in l){let S=l[x],b=g[x];if(!b)throw new Error(`CSG Operations: Attribute ${x} not available on geometry.`);let E=b.itemSize;x==="position"?(qt.fromBufferAttribute(b,r).applyMatrix4(e),S.push(qt.x,qt.y,qt.z)):x==="normal"?(qt.fromBufferAttribute(b,r).applyNormalMatrix(n),a&&qt.multiplyScalar(-1),S.push(qt.x,qt.y,qt.z)):x==="tangent"?(qt.fromBufferAttribute(b,r).transformDirection(e),a&&qt.multiplyScalar(-1),S.push(qt.x,qt.y,qt.z)):(Yr.fromBufferAttribute(b,r),rl(Yr,E,S))}}}buildGeometry(t,e){let n=!1,{groupIndices:i,attributeData:r}=this,{attributes:a,index:c}=t;for(let u in r){let d=r[u],{type:m,itemSize:g,normalized:x,length:S,count:b}=d,E=d.array.buffer,T=a[u];(!T||T.count<b||T.array.type!==m)&&(T=new Vt(new m(S),g,x),t.setAttribute(u,T),n=!0),T.array.set(new m(E,0,S),0),T.needsUpdate=!0}let l=i.reduce((u,d)=>d.count+u,0);(!t.index||c.count<l||c.array.type!==Uint32Array)&&(t.setIndex(new Vt(new Uint32Array(l),1)),n=!0),t.clearGroups();let f=0;for(let u=0,d=Math.min(e.length,i.length);u<d;u++){let{index:m,materialIndex:g}=e[u],{count:x}=i[m],S=i[m].array.buffer;x!==0&&(t.index.array.set(new Uint32Array(S,0,x),f),t.addGroup(f,x,g),f+=x)}t.setDrawRange(0,f),t.boundsTree=null,t.boundingBox=null,t.boundingSphere=null,n&&t.dispose()}clearIndexMap(){this.forwardIndexMap.clear(),this.invertedIndexMap.clear()}clear(){let{groupIndices:t,attributeData:e}=this;this.interpolatedFields={};for(let n in e)e[n].clear();t.forEach(n=>{n.clear()}),this.clearIndexMap()}};function sl(p,t){for(let e in p.attributes)t.includes(e)||(p.deleteAttribute(e),p.dispose());return p}function ol(p,t){let e=[];for(let n=0,i=p.length;n<i;n++){let r=p[n],a=t[r.materialIndex];e.push({...r,materialIndex:t.indexOf(a)})}return e}function al(p,t){let e=[],n=new Map;for(let i=0,r=p.length;i<r;i++){let a=p[i];n.has(a.materialIndex)||(n.set(a.materialIndex,e.length),e.push(t[a.materialIndex])),a.materialIndex=n.get(a.materialIndex)}return e}function cl(p){for(let t=0;t<p.length-1;t++){let e=p[t],n=p[t+1];if(e.materialIndex===n.materialIndex){let i=e.start,r=n.start+n.count;n.start=i,n.count=r-i,p.splice(t,1),t--}}}function Xo(p,t){let e=t;return Array.isArray(t)||(e=[],p.forEach(n=>{e[n.materialIndex]=t})),e}var Jr=class{get useCDTClipping(){return this.triangleSplitter instanceof mi}set useCDTClipping(t){t!==this.useCDTClipping&&(this.triangleSplitter=t?new mi:new _i)}constructor(){this.triangleSplitter=new _i,this.geometryBuilders=[],this.attributes=["position","uv","normal"],this.useGroups=!0,this.consolidateGroups=!0,this.removeUnusedMaterials=!0,this.debug=new Hr}getGroupRanges(t){return!this.useGroups||t.groups.length===0?[{start:0,count:1/0,materialIndex:0}]:t.groups.map(n=>({...n}))}evaluate(t,e,n,i=new Ge){let r=!0;if(Array.isArray(n)||(n=[n]),Array.isArray(i)||(i=[i],r=!1),i.length!==n.length)throw new Error("Evaluator: operations and target array passed as different sizes.");t.prepareGeometry(),e.prepareGeometry();let{triangleSplitter:a,geometryBuilders:c,attributes:l,useGroups:f,consolidateGroups:u,removeUnusedMaterials:d,debug:m}=this;for(;c.length<i.length;)c.push(new Zr);i.forEach((h,o)=>{c[o].initFromGeometry(t.geometry,l),sl(h.geometry,l)}),m.init(),il(t,e,n,a,c,{useGroups:f}),m.complete();let g=this.getGroupRanges(t.geometry),x=Xo(g,t.material),S=this.getGroupRanges(e.geometry),b=Xo(S,e.material);S.forEach(h=>h.materialIndex+=x.length);let E=[...x,...b],T=[...g,...S].map((h,o)=>({...h,index:o}));return f?f&&u&&(T=ol(T,E),T.sort((h,o)=>h.materialIndex-o.materialIndex)):T=[{start:0,count:1/0,index:0,materialIndex:0}],i.forEach((h,o)=>{let _=h.geometry;c[o].buildGeometry(_,T),t.matrixWorld.decompose(h.position,h.quaternion,h.scale),h.updateMatrix(),h.matrixWorld.copy(t.matrixWorld),f?(h.material=E,u&&cl(_.groups),d&&(h.material=al(_.groups,E))):h.material=E[0]}),r?i:i[0]}evaluateHierarchy(t,e=new Ge){t.updateMatrixWorld(!0);let n=(r,a)=>{let c=r.children;for(let l=0,f=c.length;l<f;l++){let u=c[l];u.isOperationGroup?n(u,a):a(u)}},i=r=>{let a=r.children,c=!1;for(let f=0,u=a.length;f<u;f++){let d=a[f];c=i(d)||c}let l=r.isDirty();if(l&&r.markUpdated(),c&&!r.isOperationGroup){let f;return n(r,u=>{f?f=this.evaluate(f,u,u.operation):f=this.evaluate(r,u,u.operation)}),r._cachedGeometry=f.geometry,r._cachedMaterials=f.material,!0}else return c||l};return i(t),e.geometry=t._cachedGeometry,e.material=t._cachedMaterials,e}reset(){this.triangleSplitter.reset()}};var fl=6e3,Ld=2e4;function ll(p){if(!(p instanceof Float32Array)||!p.length||p.length%27||p.length/27>fl||p.some(i=>!Number.isFinite(i)))throw Error("Invalid boolean operand");let t=new Float32Array(p.length/3),e=new Float32Array(p.length/3);for(let i=0;i<p.length/9;i++)t.set(p.subarray(i*9,i*9+3),i*3),e.set(p.subarray(i*9+6,i*9+9),i*3);let n=new Mn;return n.setAttribute("position",new Je(t,3)),n.setAttribute("color",new Je(e,3)),n}function hl(p){let t=p.getAttribute("position"),e=new Map,n=i=>[t.getX(i),t.getY(i),t.getZ(i)].map(r=>Math.round(r*1e6)).join(",");for(let i=0;i<t.count;i+=3){let r=[n(i),n(i+1),n(i+2)];if(new Set(r).size!==3)return!1;for(let a=0;a<3;a++){let c=r[a],l=r[(a+1)%3],f=c<l,u=f?c+"|"+l:l+"|"+c,d=e.get(u)??[0,0];d[0]++,d[1]+=f?1:-1,e.set(u,d)}}return[...e.values()].every(([i,r])=>i===2&&r===0)}function ul(p){let t=p.getAttribute("position"),e=0;for(let n=0;n<t.count;n+=3)e+=t.getX(n)*(t.getY(n+1)*t.getZ(n+2)-t.getZ(n+1)*t.getY(n+2))+t.getY(n)*(t.getZ(n+1)*t.getX(n+2)-t.getX(n+1)*t.getZ(n+2))+t.getZ(n)*(t.getX(n+1)*t.getY(n+2)-t.getY(n+1)*t.getX(n+2));if(e<0)for(let n of Object.values(p.attributes))for(let i=0;i<t.count;i+=3)for(let r=0;r<n.itemSize;r++){let a=(i+1)*n.itemSize+r,c=(i+2)*n.itemSize+r,l=n.array[a];n.array[a]=n.array[c],n.array[c]=l}}function dl(p,t){if((p.length+t.length)/27>fl)throw Error("Boolean input exceeds quick preview budget");let e=ll(p),n=ll(t),i;try{if(!hl(n))throw Error("Boolean cutter is not a closed solid");let r=hl(e);ul(n),r&&ul(e);let a=new Ge(e),c=new Ge(n);a.updateMatrixWorld(),c.updateMatrixWorld();let l=new Jr;l.attributes=["position","color"],l.useGroups=!1,i=l.evaluate(a,c,r?1:5);let f=i.geometry,u=f.getAttribute("position"),d=f.getAttribute("color"),m=f.index?.count??u.count;if(!m||m%3||m/3>Ld)throw Error("Boolean result exceeds quick preview budget");let g=new Float32Array(m*9);for(let x=0;x<m;x+=3){let S=[0,1,2].map(_=>f.index?f.index.getX(x+_):x+_),b=S.map(_=>[u.getX(_),u.getY(_),u.getZ(_)]),E=b[1].map((_,s)=>_-b[0][s]),T=b[2].map((_,s)=>_-b[0][s]),h=[E[1]*T[2]-E[2]*T[1],E[2]*T[0]-E[0]*T[2],E[0]*T[1]-E[1]*T[0]],o=Math.hypot(...h);for(let _=0;_<3;_++)g.set([...b[_],...h.map(s=>o?s/o:0),d.getX(S[_]),d.getY(S[_]),d.getZ(S[_])],(x+_)*9)}if(g.some(x=>!Number.isFinite(x)))throw Error("Invalid boolean result");return g}finally{e.dispose(),n.dispose(),i?.geometry.dispose()}}self.onmessage=({data:p})=>{for(let[t,e]of p.entries())try{let n=performance.now(),i=dl(e.a,e.b);self.postMessage({id:t,values:i,elapsed:performance.now()-n},[i.buffer])}catch{self.postMessage({id:t,error:!0})}self.postMessage({done:!0})};})();
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
