/*! @license Includes TensorFlow.js WebGPU backend 4.22.0 (Apache-2.0). See https://github.com/kubohiroya/turbowarp-teachable-machine/blob/v4.4.0/THIRD_PARTY_NOTICES.md. */
(function(u){var gi=Object.create,Se=Object.defineProperty,xi=Object.getOwnPropertyDescriptor,vi=Object.getOwnPropertyNames,Ci=Object.getPrototypeOf,je=Object.prototype.hasOwnProperty,_e=(e,i)=>{let t={};for(var s in e)Se(t,s,{get:e[s],enumerable:!0});return i||Se(t,Symbol.toStringTag,{value:"Module"}),t},bi=(e,i,t,s)=>{if(i&&typeof i=="object"||typeof i=="function")for(var a=vi(i),r=0,n=a.length,o;r<n;r++)o=a[r],!je.call(e,o)&&o!==t&&Se(e,o,{get:(l=>i[l]).bind(null,o),enumerable:!(s=xi(i,o))||s.enumerable});return e},yi=(e,i,t)=>(t=e!=null?gi(Ci(e)):{},bi(i||!e||!e.__esModule||!je.call(e,"default")?Se(t,"default",{value:e,enumerable:!0}):t,e));u=yi(u);var K=(0,u.env)();K.registerFlag("WEBGPU_DEFERRED_SUBMIT_BATCH_SIZE",()=>15),K.registerFlag("WEBGPU_CPU_FORWARD",()=>!0),K.registerFlag("WEBGPU_MATMUL_PROGRAM_TYPE",()=>-1),K.registerFlag("WEBGPU_USE_NAIVE_CONV2D_TRANSPOSE",()=>!0),K.registerFlag("WEBGPU_USE_LOW_POWER_GPU",()=>!1),K.registerFlag("WEBGPU_CPU_HANDOFF_SIZE_THRESHOLD",()=>1e3),K.registerFlag("WEBGPU_USE_PROFILE_TOOL",()=>!1),K.registerFlag("WEBGPU_IMPORT_EXTERNAL_TEXTURE",()=>!0),K.registerFlag("WEBGPU_USE_NAIVE_CONV2D_DEBUG",()=>!1),K.registerFlag("WEBGPU_THRESHOLD_TO_INCREASE_WORKGROUPS_FOR_MATMUL",()=>-1),K.registerFlag("WEBGPU_CONV_SEPARATE_IM2COL_SHADER",()=>!1),K.registerFlag("WEBGPU_PRINT_SHADER",()=>""),K.registerFlag("WEBGPU_ENGINE_COMPILE_ONLY",()=>!1);var Si=class{constructor(e){e&&(this.vendor=e.vendor,this.architecture=e.architecture,this.intelGPUGeneration=this.getIntelGPUGeneration())}getIntelGPUGeneration(){if(this.isIntel()){if(this.architecture.startsWith("gen"))return Number(this.architecture.match(/\d+/));if(this.architecture.startsWith("xe"))return 12}return 0}isIntel(){return this.vendor==="intel"}},Ii=class{constructor(e){this.device=e,this.numUsedBuffers=0,this.numFreeBuffers=0,this.freeBuffers=new Map,this.usedBuffers=new Map,this.numBytesUsed=0,this.numBytesAllocated=0}acquireBuffer(e,i,t=!1,s=!0){let a;const r=et(e,i);return s?(this.freeBuffers.has(r)||this.freeBuffers.set(r,[]),this.freeBuffers.get(r).length>0?(a=this.freeBuffers.get(r).pop(),this.numFreeBuffers--):(a=this.device.createBuffer({size:e,usage:i,mappedAtCreation:t}),this.numBytesAllocated+=e)):(a=this.device.createBuffer({size:e,usage:i,mappedAtCreation:t}),this.numBytesAllocated+=e),this.usedBuffers.has(r)||this.usedBuffers.set(r,[]),this.usedBuffers.get(r).push(a),this.numUsedBuffers++,this.numBytesUsed+=e,a}releaseBuffer(e,i=!0){if(this.freeBuffers.size===0)return;const t=e.size,s=e.usage,a=et(t,s),r=this.usedBuffers.get(a),n=r.indexOf(e);if(n<0)throw new Error("Cannot find the buffer in buffer manager");r[n]=r[r.length-1],r.pop(),this.numUsedBuffers--,this.numBytesUsed-=t,i?(this.freeBuffers.get(a).push(e),this.numFreeBuffers++):(e.destroy(),this.numBytesAllocated-=t)}getNumUsedBuffers(){return this.numUsedBuffers}getNumFreeBuffers(){return this.numFreeBuffers}dispose(){this.freeBuffers.forEach((e,i)=>{e.forEach(t=>{t.destroy()})}),this.usedBuffers.forEach((e,i)=>{e.forEach(t=>{t.destroy()})}),this.freeBuffers=new Map,this.usedBuffers=new Map,this.numUsedBuffers=0,this.numFreeBuffers=0,this.numBytesUsed=0,this.numBytesAllocated=0}};function et(e,i){return`${e}_${i}`}var ki=class{constructor(e){this.device=e,this.numUsedTextures=0,this.numFreeTextures=0,this.freeTextures=new Map,this.usedTextures=new Map,this.numBytesUsed=0,this.numBytesAllocated=0}acquireTexture(e,i,t,s){const a=it(t),r=e*i*a,n=tt(e,i,t,s);if(this.freeTextures.has(n)||this.freeTextures.set(n,[]),this.usedTextures.has(n)||this.usedTextures.set(n,[]),this.numBytesUsed+=r,this.numUsedTextures++,this.freeTextures.get(n).length>0){this.numFreeTextures--;const l=this.freeTextures.get(n).shift();return this.usedTextures.get(n).push(l),l}this.numBytesAllocated+=r;const o=this.device.createTexture({size:[e,i],format:t,usage:s});return this.usedTextures.get(n).push(o),o}releaseTexture(e){if(this.freeTextures.size===0)return;const i=e.width,t=e.height,s=e.format,a=e.usage,r=tt(i,t,s,a);this.freeTextures.has(r)||this.freeTextures.set(r,[]),this.freeTextures.get(r).push(e),this.numFreeTextures++,this.numUsedTextures--;const n=this.usedTextures.get(r),o=n.indexOf(e);if(o<0)throw new Error("Cannot release a texture that was never provided by this texture manager");n.splice(o,1);const l=it(s),d=i*t*l;this.numBytesUsed-=d}getNumUsedTextures(){return this.numUsedTextures}getNumFreeTextures(){return this.numFreeTextures}dispose(){this.freeTextures.forEach((e,i)=>{e.forEach(t=>{t.destroy()})}),this.usedTextures.forEach((e,i)=>{e.forEach(t=>{t.destroy()})}),this.freeTextures=new Map,this.usedTextures=new Map,this.numUsedTextures=0,this.numFreeTextures=0,this.numBytesUsed=0,this.numBytesAllocated=0}};function tt(e,i,t,s){return`${e}_${i}_${t}_${s}`}function it(e){if(e==="rgba8unorm")return 16;throw new Error(`${e} is not supported!`)}function wi(e,i){if(Math.max(...e)>5)throw new Error("Cannot symbolically compute strides for rank > 6 tensor.");const t=e.length,s="xyzwuv",a=e.map(n=>`${i}.${s[n]}`),r=new Array(t-1);r[t-2]=a[t-1];for(let n=t-3;n>=0;--n)r[n]=`(${r[n+1]} * ${a[n+1]})`;return r}var ee=(e,i,t)=>t==="int32"?`atomicAdd(${e}, bitcast<i32>(${i}));`:`
          {
            var oldValue = 0;
            loop {
              let newValueF32 = bitcast<f32>(oldValue) + (${i});
              let newValue = bitcast<i32>(newValueF32);
              let res = atomicCompareExchangeWeak(${e}, oldValue, newValue);
              if res.exchanged {
                break;
              }
              oldValue = res.old_value;
            }
          }`,ue;(function(e){e[e.FROM_PIXELS=0]="FROM_PIXELS",e[e.DRAW=1]="DRAW"})(ue||(ue={}));var Ri=(e,i,t,s,a)=>{const r=$i(t,{dtype:s.dtype,shape:s.shape},i),n=e.createShaderModule({code:r,label:i.constructor.name});let o=(0,u.env)().get("WEBGPU_PRINT_SHADER");if(o!==""){o=o.toLowerCase();const l=o.split(",");(o==="all"||l.some(d=>i.shaderKey.toLowerCase().includes(d)))&&(console.group(i.shaderKey),console.debug(r),console.groupEnd())}return a?e.createComputePipelineAsync({compute:{module:n,entryPoint:"_start"},label:i.constructor.name,layout:"auto"}):e.createComputePipeline({compute:{module:n,entryPoint:"_start"},label:i.constructor.name,layout:"auto"})},A=(e,i="f32")=>{switch(e){case 1:return`${i}`;case 2:return`vec2<${i}>`;case 3:return`vec3<${i}>`;case 4:return`vec4<${i}>`;default:throw new Error(`${e}-component ${i} is not supported.`)}};function B(e){if(e<=1)return"i32";if(e===2)return"vec2<i32>";if(e===3)return"vec3<i32>";if(e===4)return"vec4<i32>";if(e===5)return"vec5";if(e===6)return"vec6";throw Error(`GPU for rank ${e} is not yet supported`)}function j(e){if(e===0)return"x";if(e===1)return"y";if(e===2)return"z";if(e===3)return"w";if(e===4)return"u";if(e===5)return"v";throw Error(`Index ${e} is not yet supported`)}function k(...e){let i;switch(e.length){case 0:i=`
        fn main()
      `;break;case 1:i=`
        fn main(${e[0]} : i32)
      `;break;default:throw Error("Unreachable")}return i}function at(e,i){let t;return t=`
     ${Pi(i)}
      fn _start(@builtin(local_invocation_id) LocalId : vec3<u32>,
                @builtin(global_invocation_id) GlobalId : vec3<u32>,
                @builtin(local_invocation_index) LocalIndex: u32,
                @builtin(workgroup_id) WorkgroupId : vec3<u32>,
                @builtin(num_workgroups) NumWorkgroups : vec3<u32>) {
        localId = LocalId;
        localIndex = LocalIndex;
        globalId = GlobalId;
        numWorkgroups = NumWorkgroups;
        workgroupId = WorkgroupId;
        ${e?"main(getGlobalIndex());":"main();"};
      }
    `,t}function Pi(e){return`
  @compute @workgroup_size(${e.workgroupSize[0]}, ${e.workgroupSize[1]}, ${e.workgroupSize[2]})
`}function $i(e,i,t){const s=[],a=t.workgroupSize[0]*t.workgroupSize[1]*t.workgroupSize[2];if(t.outputComponent=t.outputComponent?t.outputComponent:1,s.push(`

      var<private> localId: vec3<u32>;
      var<private> localIndex: u32;
      var<private> globalId: vec3<u32>;
      var<private> numWorkgroups: vec3<u32>;
      var<private> workgroupId: vec3<u32>;

      // Only used when the y/z dimension of workgroup size is 1.
      fn getGlobalIndex() -> i32 {
        ${rt(t)?"  return i32(globalId.x);":`  return i32((workgroupId.z * numWorkgroups.x * numWorkgroups.y +
                workgroupId.y * numWorkgroups.x + workgroupId.x) * ${a}u +
                localIndex);
        `}
      }
    `),t.pixelsOpType!=null){const m=t.pixelsOpType===ue.FROM_PIXELS?`@group(0) @binding(0) var<storage, read_write> result: array<${ie(i.dtype,t.outputComponent)}>;`:`@group(0) @binding(1) var<storage, read> inBuf : array<${ie(e[0].dtype,t.outputComponent)}>;`,f=i.shape.length===3?"vec2<i32>":"i32";s.push(`
        struct Uniform {
          outShapeStrides : ${f},
          size            : i32,
          numChannels     : i32,
          alpha           : f32,
        };

        ${m}
        @group(0) @binding(2) var<uniform> uniforms: Uniform;
      `);const g=nt(t);return[st,s.join(`
`),Ie(i.shape),t.getUserCode(),at(g,t)].join(`
`)}let r,n,o="struct Uniforms { NAN : f32, INFINITY : f32, ";t.variableNames.forEach((m,f)=>{const g=B(e[f].shape.length);o+=`${m.charAt(0).toLowerCase()+m.slice(1)}Shape : ${g}, `,r=e[f].shape.length-1,n=B(r),o+=`${m.charAt(0).toLowerCase()+m.slice(1)}ShapeStrides: ${n}, `});const l=B(i.shape.length);o+=`outShape : ${l}, `,r=i.shape.length-1,n=B(r),o+=`
         outShapeStrides: ${n}, `,t.size&&(o+="size : i32, "),t.uniforms&&(o+=t.uniforms),o+="};",o=Bi(o),s.push(o),t.atomic?s.push(`
      @group(0) @binding(0) var<storage, read_write> result: array<atomic<i32>>;
    `):s.push(`
      @group(0) @binding(0) var<storage, read_write> result: array<${ie(i.dtype,t.outputComponent)}>;
    `),t.variableNames.forEach((m,f)=>{s.push(`
      @group(0) @binding(${1+f}) var<storage, read> ${m}: array<${t.variableComponents?ie(e[f].dtype,t.variableComponents[f]):ie(e[f].dtype,t.outputComponent)}>;
        `)}),o!==""&&s.push(`
      @group(0) @binding(${1+t.variableNames.length}) var<uniform> uniforms: Uniforms;
      `);const d=Ei(i.shape,t.dispatchLayout),h=[st,s.join(`
`)+Ni,Ie(i.shape),d,Ti(i.shape.length)];t.atomic||h.push(Li(i.shape,i.dtype,t.outputComponent)),t.variableNames.forEach((m,f)=>{h.push(`${Ie(e[f].shape,m)}`)});const p=e.map((m,f)=>Fi(m,i.shape,t.variableComponents?t.variableComponents[f]:t.outputComponent,t.dispatchLayout.x.length===i.shape.length)).join(`
`);h.push(p),h.push(t.getUserCode());const c=nt(t);return h.push(at(c,t)),h.join(`
`)}function Di(e,i,t){let s=e.shaderKey;if(e.pixelsOpType!=null)return s;const a=[],r=[];i.forEach(h=>{a.push(h.shape),r.push(h.dtype)}),a.push(t.shape),r.push(t.dtype);const n=i.map(h=>u.backend_util.getBroadcastDims(h.shape,t.shape)),o=i.map(h=>u.util.arraysEqual(h.shape,t.shape)).join("_"),l=n.map(h=>h.join("_")).join(";"),d=rt(e)?"flatDispatch":"";return s+="_"+(e.workgroupSize?e.workgroupSize.join(","):"")+a.map(h=>h.length).join(",")+r.join(",")+e.variableNames.join(",")+l+o+d,s}var st=`
  struct vec5 {x: i32, y: i32, z: i32, w: i32, u: i32};
  struct vec6 {x: i32, y: i32, z: i32, w: i32, u: i32, v: i32};

  // Checks whether coordinates lie within the bounds of the shape.
  fn coordsInBounds2D(coord : vec2<i32>, shape : vec2<i32>) -> bool {
    return all(coord >= vec2<i32>(0)) && all(coord < shape);
  }
  fn coordsInBounds3D(coord : vec3<i32>, shape : vec3<i32>) -> bool {
    return all(coord >= vec3<i32>(0)) && all(coord < shape);
  }
  fn coordsInBounds4D(coord : vec4<i32>, shape : vec4<i32>) -> bool {
    return all(coord >= vec4<i32>(0)) && all(coord < shape);
  }

  fn getIndexFromCoords1D(coord : i32, shape : i32) -> i32 {
    return coord;
  }
  fn getIndexFromCoords2D(coords : vec2<i32>, shape : vec2<i32>) -> i32 {
    return dot(coords, vec2<i32>(shape.y, 1));
  }
  fn getIndexFromCoords3D(coords : vec3<i32>, shape : vec3<i32>) -> i32 {
    return dot(coords, vec3<i32>(shape.y * shape.z, shape.z, 1));
  }
  fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
    return dot(coords, vec4<i32>(
        shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
  }
  fn getIndexFromCoords5D(coords : vec5, shape : vec5) -> i32 {
    let shapeStrides: vec5 = vec5(shape.y * shape.z * shape.w * shape.u, shape.z * shape.w * shape.u, shape.w * shape.u, shape.u, 1);
    return coords.x*shapeStrides.x + coords.y*shapeStrides.y + coords.z*shapeStrides.z + coords.w*shapeStrides.w + coords.u*shapeStrides.u;
  }
  fn getIndexFromCoords6D(coords : vec6, shape : vec6) -> i32 {
    let shapeStrides: vec6 = vec6(shape.y * shape.z * shape.w * shape.u * shape.v, shape.z * shape.w * shape.u * shape.v, shape.w * shape.u * shape.v, shape.u * shape.v, shape.v, 1);
    return coords.x*shapeStrides.x + coords.y*shapeStrides.y + coords.z*shapeStrides.z + coords.w*shapeStrides.w + coords.u*shapeStrides.u + coords.v*shapeStrides.v;
  }

  // NaN defination in IEEE 754-1985 is :
  //   - sign = either 0 or 1.
  //   - biased exponent = all 1 bits.
  //   - fraction = anything except all 0 bits (since all 0 bits represents infinity).
  // https://en.wikipedia.org/wiki/IEEE_754-1985#Representation_of_non-numbers
  fn isnan(val: f32) -> bool {
    let floatToUint: u32 = bitcast<u32>(val);
    return (floatToUint & 0x7fffffffu) > 0x7f800000u;
  }
  fn isnanVec4(val : vec4<f32>) -> vec4<bool> {
    let floatToUint: vec4<u32> = bitcast<vec4<u32>>(val);
    return (floatToUint & vec4<u32>(0x7fffffffu)) > vec4<u32>(0x7f800000u);
  }
`,Ni=`
  fn isinf(val: f32) -> bool {
    return abs(val) == uniforms.INFINITY;
  }
`;function Ie(e,i=""){const t=e.length,s=i!==""?`get${i.charAt(0).toUpperCase()+i.slice(1)}CoordsFromIndex`:"getCoordsFromIndex",a=i!==""?`${i.charAt(0).toLowerCase()+i.slice(1)}ShapeStrides`:"outShapeStrides";if(t<=1)return`fn ${s}(index : i32) -> i32 { return index; }`;const r=u.util.computeStrides(e),n=B(t),o=[];for(let d=0;d<t;d++)o.push(`d${d}`);if(r.length===1)return`    fn ${s}(index : i32) -> vec2<i32> {
      let d0 = index / uniforms.${a}; let d1 = index - d0 * uniforms.${a};
      return vec2<i32>(d0, d1);
    }`;let l;return l="var index2 = index;"+r.map((d,h)=>`${`let ${o[h]} = index2 / uniforms.${a}.${j(h)}`}; ${h===r.length-1?`let ${o[h+1]} = index2 - ${o[h]} * uniforms.${a}.${j(h)}`:`index2 = index2 - ${o[h]} * uniforms.${a}.${j(h)}`};`).join(""),`
    fn ${s}(index : i32) -> ${n} {
      ${l}
      return ${n}(${o.join(",")});
    }
  `}function zi(e,i){const t=e.name,s=e.shape.length,a=B(s),r="get"+t.charAt(0).toUpperCase()+t.slice(1),n=["d0","d1","d2","d3","d4","d5"].slice(0,s),o=n.map(h=>`${h} : i32`).join(", ");if(s<1)return`
      fn ${r}() -> ${A(i)} {
        return ${A(i)}(${t}[0]);
      }
    `;const l=`uniforms.${t.charAt(0).toLowerCase()+t.slice(1)}Shape`;let d=`${s}D`;return s===0&&(d="1D"),`
    fn ${r}(${o}) -> ${A(i)} {
      return ${A(i)}(${t}[getIndexFromCoords${d}(${a}(${n.join(",")}),
        ${l})${i===1?"":` / ${i}`}]);
    }
   `}function Ai(e,i,t,s){const a=e.name,r=a.charAt(0).toUpperCase()+a.slice(1),n="get"+r+"ByOutput",o=e.shape.length,l=i.length,d=B(l);if(u.util.arraysEqual(e.shape,i)&&s)return`
    fn ${n}Index(globalIndex : i32) -> ${A(t)} {
      return ${A(t)}(${a}[globalIndex]);
    }

    fn ${n}Coords(coords : ${d}) -> ${A(t)} {
      return ${A(t)}(${a}[${l>1?"getOutputIndexFromCoords(coords)":"coords"}${t===1?"":` / ${t}`}]);
    }
    `;const h=u.backend_util.getBroadcastDims(e.shape,i),p=l-o;let c="";if(o===0)return`
    fn ${n}Index(globalIndex : i32) -> ${A(t)}{
      return get${r}();
    }

    fn ${n}Coords(coords : ${d}) -> ${A(t)}{
      return get${r}();
    }
  `;l<2&&h.length>=1?c="coords = 0;":c=h.map(x=>`coords.${j(x+p)} = 0;`).join(`
`);let m="";l<2&&o>0?m="coords":l>1?m=`${B(o)}(${e.shape.map((x,v)=>`coords.${j(v+p)}`).join(", ")})`:m="coords";const f=`uniforms.${a.charAt(0).toLowerCase()+a.slice(1)}Shape`,g=`${o}D`;return`
  fn ${n}Index(globalIndex : i32) -> ${A(t)} {
    var coords = getCoordsFromIndex(globalIndex);
    ${c}
    return ${A(t)}(${a}[getIndexFromCoords${g}(${m}, ${f})${t===1?"":` / ${t}`}]);
  }

  fn ${n}Coords(coordsIn : ${d}) -> ${A(t)} {
    var coords = coordsIn;
    ${c}
    return ${A(t)}(${a}[getIndexFromCoords${g}(${m}, ${f})${t===1?"":` / ${t}`}]);
  }
`}function Fi(e,i,t,s){let a=zi(e,t);return e.shape.length<=i.length&&(a+=Ai(e,i,t,s)),a}function Ei(e,i){const{x:t,y:s=[],z:a=[]}=i,r=e.length,n=t.length+s.length+a.length;if(n!==r)return"";if(t.length===r)return`fn getOutputCoords() -> ${B(r)}{
    let globalIndex = getGlobalIndex();
    return getCoordsFromIndex(globalIndex);
  }
  `;let o="";const l=[t,s,a];for(let c=0;c<l.length;c++){const m=l[c];if(m.length!==0)if(m.length===1)o+=`let d${m[0]} = i32(globalId[${c}]);`;else{const f=wi(m,"uniforms.outShape");o+=`var index${c} = i32(globalId[${c}]);`;for(let g=0;g<f.length;g++)o+=`let d${m[g]} = index${c} / ${f[g]};`,g===f.length-1?o+=`let d${m[g+1]} = index${c} - d${m[g]} * ${f[g]};`:o+=`index${c} = index${c} - d${m[g]} * ${f[g]};`}}const d=[];for(let c=0;c<n;c++)d.push(`d${c}`);const h=B(n);let p=`fn getOutputCoords() -> ${h} {
  ${o}
`;return d.length===0?p+=`return ${h}(0); }`:p+=`return ${h}(${d.join(",")}); }`,p}function Ti(e){let i="";switch(e){case 0:case 1:i+=`
        fn getOutputIndexFromCoords(coords : i32) -> i32 {
          return coords;
        }
        `;break;case 2:i+=`
        fn getOutputIndexFromCoords(coords : vec2<i32>) -> i32 {
          return dot(coords, vec2<i32>(uniforms.outShapeStrides, 1));
        }
        `;break;case 3:i+=`
        fn getOutputIndexFromCoords(coords : vec3<i32>) -> i32 {
          return dot(coords, vec3<i32>(uniforms.outShapeStrides.x, uniforms.outShapeStrides.y, 1));
        }
        `;break;case 4:i+=`
        fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
          return dot(coords, vec4<i32>(
            uniforms.outShapeStrides.x, uniforms.outShapeStrides.y, uniforms.outShapeStrides.z, 1));
        }
        `;break;case 5:i+=`
        fn getOutputIndexFromCoords(coords : vec5) -> i32 {
          return coords.x * uniforms.outShapeStrides.x +
              coords.y * uniforms.outShapeStrides.y +
              coords.z * uniforms.outShapeStrides.z +
              coords.w * uniforms.outShapeStrides.w +
              coords.u;
        }
        `;break;case 6:i+=`
        fn getOutputIndexFromCoords(coords : vec6) -> i32 {
          return coords.x * uniforms.outShapeStrides.x +
              coords.y * uniforms.outShapeStrides.y +
              coords.z * uniforms.outShapeStrides.z +
              coords.w * uniforms.outShapeStrides.w +
              coords.u * uniforms.outShapeStrides.u +
              coords.v;
        }
        `;break;default:u.util.assert(!1,()=>`Unsupported ${e}D shape`)}return i}function rt(e){return e.dispatch[1]===1&&e.dispatch[2]===1}function ie(e,i=1){if(e==="float32")return A(i,"f32");if(e==="int32"||e==="bool")return A(i,"i32");throw new Error(`type ${e} is not supported.`)}function Li(e,i,t){const s=e.length,a=ie(i,t);let r=`fn setOutputAtIndex(flatIndex : i32, value : ${A(t)}) {
      result[flatIndex] = ${a}(value);
    }

    fn setOutputAtIndexI32(flatIndex : i32, value : ${A(t,"i32")}) {
      result[flatIndex] = ${a}(value);
    }
    `;if(s>=2){const n=["d0","d1","d2","d3","d4","d5"].slice(0,s),o=B(s);r+=`
      fn setOutputAtCoords(${n.map(l=>`${l} : i32`).join(", ")}, value : ${A(t)}) {
        let flatIndex = getOutputIndexFromCoords(${o}(${n.join(", ")}));
        setOutputAtIndex(flatIndex${t===1?"":` / ${t}`}, value);
      }
      fn setOutputAtCoordsI32(${n.map(l=>`${l} : i32`).join(", ")}, value : ${A(t,"i32")}) {
        let flatIndex = getOutputIndexFromCoords(${o}(${n.join(", ")}));
        setOutputAtIndexI32(flatIndex${t===1?"":` / ${t}`}, value);
      }
    `}return r}function Bi(e){return e=e.replace(/(\w+)\s*:\s*vec(5|6)/g,i=>"@align(16) "+i),e=e.replace(/vec(5|6)\s*,\s*(\w+)/g,(i,t,s)=>`vec${t}, @align(16) ${s}`),e}function nt(e){return!(e.dispatchLayout.hasOwnProperty("y")&&e.dispatchLayout.y.length!==0||e.dispatchLayout.hasOwnProperty("z")&&e.dispatchLayout.z.length!==0)}var Wi=_e({GPUBytesPerElement:()=>Ee,MatMulProgramType:()=>Q,assertNotComplex:()=>Le,computeDispatch:()=>w,computeWorkPerThreadForConv2d:()=>Fe,computeWorkgroupInfoForMatMul:()=>ot,computeWorkgroupSizeForConv2d:()=>Ae,flatDispatchLayout:()=>R,isWebGPUSupported:()=>Te,tilesFitEvenlyIntoShape:()=>Vi}),ae=e=>{let i=1;for(let t=0;t<e.length;t++)i*=e[t];return i};function Vi(e,i){if(e.length!==i.length)throw new Error(`Cannot compute whether rank ${e.length} tiles fit evenly into rank ${i.length} shape - ranks must match.`);return i.every((t,s)=>t%e[s]===0)}function w(e,i,t=[1,1,1],s=[1,1,1]){const[a,r,n]=[Math.ceil(ae(e.x.map(o=>i[o]))/(t[0]*s[0])),e.y?Math.ceil(ae(e.y.map(o=>i[o]))/(t[1]*s[1])):1,e.z?Math.ceil(ae(e.z.map(o=>i[o]))/(t[2]*s[2])):1];return[a,r,n]}function ot(e,i,t,s=!1){const a=[8,8,1],r=[4,4,1];return s||(e<=8&&(r[1]=1),i<=16&&t<=16&&(a[0]=4)),{workgroupSize:a,elementsPerThread:r}}function Ae(e,i,t=!1){if(t)return[8,8,1];const s=ae(e.x.map(r=>i[r])),a=ae(e.y.map(r=>i[r]));return s<=4?[4,16,1]:a<=4?[16,4,1]:[16,16,1]}function Fe(e,i,t=!1){if(t)return[4,4,1];const s=ae(e.x.map(r=>i[r])),a=ae(e.y.map(r=>i[r]));return s<=4?[1,2,1]:a<=4?[2,1,1]:[2,2,1]}function R(e){return{x:e.map((i,t)=>t)}}function Ee(e){if(e==="float32"||e==="int32"||e==="bool"||e==="string")return 4;if(e==="complex64")return 8;throw new Error(`Unknown dtype ${e}`)}function Te(){return!!(typeof globalThis<"u"&&globalThis.navigator&&globalThis.navigator.gpu)}function Le(e,i){Array.isArray(e)||(e=[e]),e.forEach(t=>{t!=null&&u.util.assert(t.dtype!=="complex64",()=>`${i} does not support complex64 tensors in the WebGPU backend.`)})}var Q;(function(e){e[e.MatMulReduceProgram=0]="MatMulReduceProgram",e[e.MatMulSplitKProgram=1]="MatMulSplitKProgram",e[e.MatMulSmallOutputSizeProgram=2]="MatMulSmallOutputSizeProgram",e[e.MatMulPackedProgram=3]="MatMulPackedProgram",e[e.MatMulMax=4]="MatMulMax"})(Q||(Q={}));var Mi=(0,u.env)().getNumber("WEBGPU_CPU_HANDOFF_SIZE_THRESHOLD"),Oi=(e,i)=>{const t=e.limits.maxComputeWorkgroupsPerDimension,s=i.dispatchLayout,a=i.dispatch;if(a.every(n=>n<=t))return a;u.util.assert(a[0]>t&&s.y===void 0&&s.z===void 0,()=>"Dispatch size exceeds WebGPU limits in Y or Z dimension.");let r=Math.ceil(Math.sqrt(a[0]));return r>t?(r=Math.ceil(Math.cbrt(a[0])),u.util.assert(r<=t,()=>"Total dispatch size exceeds WebGPU maximum."),[r,r,r]):[r,r,1]},ut=class fi extends u.KernelBackend{nextDataId(){return fi.nextDataId++}constructor(i,t){if(super(),this.commandQueueOwnedIds=new WeakSet,this.dispatchCountInPass=0,this.disposed=!1,this.downloadWaitMs=0,this.tensorDataPendingDisposal=[],this.queryResolveBuffer=null,this.querySet=null,this.querySetCount=2,this.stagingPendingDisposal=[],this.uniformPendingDisposal=[],this.uploadWaitMs=0,this.hasReadSyncWarned=!1,this.hasTimestampQueryWarned=!1,!Te())throw new Error("WebGPU is not supported on this device");this.pipelineCache={},this.device=i,this.queue=i.queue,this.commandEncoder=null,this.computePassEncoder=null,this.adapterInfo=new Si(t),this.supportTimestampQuery=this.device.features.has("timestamp-query"),this.thresholdToIncreaseWorkgroups=this.adapterInfo.intelGPUGeneration>=12?16:8,this.bufferManager=new Ii(this.device),this.textureManager=new ki(this.device),this.tensorMap=new u.DataStorage(this,(0,u.engine)()),(0,u.env)().getBool("WEBGPU_USE_PROFILE_TOOL")&&(this.dummyCanvas=document.createElement("canvas"),this.dummyCanvas.width=1,this.dummyCanvas.height=1,this.dummyContext=this.dummyCanvas.getContext("webgpu"),this.dummyContext.configure({device:i,format:"bgra8unorm"}),document.body.appendChild(this.dummyCanvas))}floatPrecision(){return 32}disposeData(i,t=!1){if(!this.tensorMap.has(i))return!0;const s=this.tensorMap.get(i);return t?s.refCount=0:s.refCount--,s.refCount>0?!1:(s.complexTensorInfos!=null&&(this.disposeData(s.complexTensorInfos.real.dataId),this.disposeData(s.complexTensorInfos.imag.dataId)),this.commandQueueOwnedIds.has(i)?(this.tensorDataPendingDisposal.push(i),!0):(this.releaseResource(i),this.tensorMap.delete(i),!0))}memory(){return{numBytesInGPU:this.bufferManager.numBytesUsed,numBytesAllocatedInGPU:this.bufferManager.numBytesAllocated,unreliable:!1}}releaseResource(i){const t=this.tensorMap.get(i);if(!(!t||!t.resource)){if(t.external){t.resource=null;return}t.resource instanceof GPUBuffer?this.bufferManager.releaseBuffer(t.resource):t.resource instanceof GPUTexture&&this.textureManager.releaseTexture(t.resource),t.resource=null}}refCount(i){return this.tensorMap.has(i)?this.tensorMap.get(i).refCount:0}incRef(i){const t=this.tensorMap.get(i);t.refCount++}decRef(i){if(this.tensorMap.has(i)){const t=this.tensorMap.get(i);t.refCount--}}write(i,t,s){if(s==="complex64"&&i!=null)throw new Error("Cannot write to a complex64 dtype. Please use tf.complex(real, imag).");const a={id:this.nextDataId()};return this.tensorMap.set(a,{dtype:s,shape:t,values:i,refCount:1}),a}move(i,t,s,a,r){if(a==="complex64")throw new Error("Cannot write to a complex64 dtype. Please use tf.complex(real, imag).");this.tensorMap.set(i,{dtype:a,shape:s,values:t,refCount:r})}submitQueue(){this.queue.submit([this.commandEncoder.finish()]),this.commandEncoder=null,this.dispatchCountInPass=0,this.commandQueueOwnedIds=new WeakSet,this.tensorDataPendingDisposal.forEach(i=>{this.releaseResource(i),this.tensorMap.delete(i)}),this.uniformPendingDisposal.forEach(i=>this.bufferManager.releaseBuffer(i)),this.stagingPendingDisposal.forEach(i=>this.bufferManager.releaseBuffer(i,!1)),this.tensorDataPendingDisposal=[],this.uniformPendingDisposal=[],this.stagingPendingDisposal=[]}ensureCommandEncoderReady(){this.commandEncoder||(this.commandEncoder=this.device.createCommandEncoder())}endComputePassEncoder(){this.computePassEncoder&&(this.computePassEncoder.end(),this.computePassEncoder=null)}async checkCompileCompletionAsync(){let i;try{i=await Promise.all(Object.values(this.pipelineCache))}catch(t){throw new Error(t.message)}Object.keys(this.pipelineCache).map((t,s)=>{this.pipelineCache[t]=i[s]})}async getBufferData(i){if((0,u.env)().getBool("WEBGPU_ENGINE_COMPILE_ONLY"))return console.warn("The data may be invalid since WEBGPU_ENGINE_COMPILE_ONLY is true, this can only be called when WEBGPU_ENGINE_COMPILE_ONLY is false"),null;const t=i.size,s=this.bufferManager.acquireBuffer(t,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(i,0,s,0,t),this.submitQueue(),await s.mapAsync(GPUMapMode.READ);const a=s.getMappedRange().slice(0);return s.unmap(),s!=null&&this.bufferManager.releaseBuffer(s),(0,u.env)().getBool("WEBGPU_USE_PROFILE_TOOL")&&(u.util.assert(this.dummyContext!==void 0,()=>"Fail to get context for profiling tool"),this.dummyContext.getCurrentTexture()),a}convertAndCacheOnCPU(i,t){const s=this.tensorMap.get(i);return s.values=t,s.values}readSync(i){const t=this.tensorMap.get(i),{values:s,complexTensorInfos:a}=t;if(s!=null||t.dtype==="string")return s;if(t.dtype==="complex64"){const g=this.readSync(a.real.dataId),x=this.readSync(a.imag.dataId),v=u.util.convertBackendValuesAndArrayBuffer(u.backend_util.mergeRealAndImagArrays(g,x).buffer,"float32");return this.convertAndCacheOnCPU(i,v),v}this.hasReadSyncWarned||(this.hasReadSyncWarned=!0,console.warn("The performance of synchronously reading data from GPU to CPU is poor on the webgpu backend, please use asynchronous APIs instead."));const r=["opaque","premultiplied"],n=t.resource,o=n.size;u.util.assert(o%4===0,()=>"Because there is 4 bytes for one pixel, buffer size must be multiple of 4.");const l=o/4,d=new ArrayBuffer(o),h=256,p=256,c=r.map(g=>new OffscreenCanvas(h,p)),m=new OffscreenCanvas(h,p);this.endComputePassEncoder(),c.map((g,x)=>{const v=g.getContext("webgpu");return v.configure({device:this.device,format:"bgra8unorm",usage:GPUTextureUsage.COPY_DST,alphaMode:r[x]}),v.getCurrentTexture()}).map((g,x)=>{const v=h*4,C=(D,E,T)=>{this.ensureCommandEncoderReady(),this.commandEncoder.copyBufferToTexture({buffer:n,bytesPerRow:v,offset:T},{texture:g},{width:D,height:E}),this.submitQueue();const L=m.getContext("2d",{willReadFrequently:!0});L.clearRect(0,0,D,E),L.drawImage(c[x],0,0);const W=L.getImageData(0,0,D,E).data,H=r[x],M=new Uint8ClampedArray(d,T,D*E*4);for(let O=0;O<M.length;O+=4)if(H==="premultiplied")M[O+3]=W[O+3];else{const Qe=W[O];M[O]=W[O+2],M[O+1]=W[O+1],M[O+2]=Qe}},b=Math.floor(l/(h*p));let y=h,S=p,P=0;for(let D=0;D<b;D++)C(y,S,P),P+=h*p*4;const N=l%(h*p);S=Math.floor(N/h),S>0&&(C(y,S,P),P+=S*(h*4)),y=N%h,y>0&&C(y,1,P)});const f=u.util.convertBackendValuesAndArrayBuffer(d,t.dtype);return this.convertAndCacheOnCPU(i,f),f}async read(i){if(!this.tensorMap.has(i))throw new Error(`Tensor ${i} was not registered!`);const t=this.tensorMap.get(i),{values:s}=t;if(s!=null)return s;let a;if(t.dtype==="complex64"){const r=await Promise.all([this.read(t.complexTensorInfos.real.dataId),this.read(t.complexTensorInfos.imag.dataId)]),n=r[0],o=r[1];a=u.backend_util.mergeRealAndImagArrays(n,o)}else{const r=await this.getBufferData(t.resource);a=u.util.convertBackendValuesAndArrayBuffer(r,t.dtype)}return this.convertAndCacheOnCPU(i,a),a}copyBuffer(i){const t=i.size,s=i.usage,a=this.bufferManager.acquireBuffer(t,s);return this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(i,0,a,0,t),this.submitQueue(),a}createTensorFromGPUData(i,t,s){let a=i.buffer;if(s==="complex64")throw new Error("Cannot write to a complex64 dtype. ");const r={id:this.nextDataId()};this.tensorMap.set(r,{dtype:s,shape:t,values:null,refCount:1,external:i.zeroCopy});const n=this.tensorMap.get(r),o=Ee(n.dtype)*u.util.sizeFromShape(n.shape);if(i.buffer.size<o)throw new Error(`GPUBuffer size(${i.buffer.size}) is smaller than tensor size(${o})!`);if((i.buffer.usage&(GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC))!==(GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC))throw new Error("GPUBuffer.usage should include GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC!");return i.zeroCopy!==!0&&(a=this.copyBuffer(a)),n.resource=a,(0,u.engine)().makeTensorFromDataId(r,t,s,this)}readToGPU(i){const{values:t,dtype:s,shape:a,resource:r}=this.tensorMap.get(i);if(s==="complex64")throw new Error("Does not support reading buffer for complex64 dtype.");if(r==null)throw t!=null?new Error("Data is not on GPU but on CPU."):new Error("There is no data on GPU or CPU.");const n=r,o=n.size,l=n.usage,d=this.bufferManager.acquireBuffer(o,l);this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(r,0,d,0,o),this.submitQueue();const h=this.makeTensorInfo(a,s),p=(0,u.engine)().makeTensorFromTensorInfo(h),c=this.tensorMap.get(h.dataId);return c.resource=d,{tensorRef:p,buffer:d}}bufferSync(i){const t=this.readSync(i.dataId);if(i.dtype==="string")try{const s=t.map(a=>u.util.decodeString(a));return(0,u.buffer)(i.shape,i.dtype,s)}catch{throw new Error("Failed to decode encoded string bytes into utf-8")}return(0,u.buffer)(i.shape,i.dtype,t)}async time(i){!this.supportTimestampQuery&&!this.hasTimestampQueryWarned&&(console.warn("This device doesn't support timestamp-query extension. Start Chrome browser with flag --enable-dawn-features=allow_unsafe_apis to try it again. Otherwise, zero will be shown for the kernel time when profiling mode is enabled."),this.hasTimestampQueryWarned=!0);const t=this.activeTimers,s=[];let a=!1;this.programTimersStack==null?(this.programTimersStack=s,a=!0):this.activeTimers.push(s),this.activeTimers=s,i();const r=u.util.flatten(this.activeTimers.map(d=>d.query)).filter(d=>d!=null),n=u.util.flatten(this.activeTimers.map(d=>d.name)).filter(d=>d!=null);this.activeTimers=t,a&&(this.programTimersStack=null);const o={uploadWaitMs:this.uploadWaitMs,downloadWaitMs:this.downloadWaitMs,kernelMs:null,wallMs:null},l=await Promise.all(r);return o.kernelMs=u.util.sum(l),o.getExtraProfileInfo=()=>l.map((d,h)=>({name:n[h],ms:d})).map(d=>`${d.name}: ${d.ms}`).join(", "),this.uploadWaitMs=0,this.downloadWaitMs=0,o}makeTensorInfo(i,t,s){return t==="string"&&s!=null&&s.length>0&&u.util.isString(s[0])&&(s=s.map(a=>u.util.encodeString(a))),{dataId:this.write(s,i,t),shape:i,dtype:t}}tensorToBinding(i){if(!i)return null;const t=this.tensorMap.get(i.dataId).resource;return t instanceof GPUBuffer?{buffer:t}:t instanceof GPUTexture?t.createView():t}uploadToGPU(i){const t=this.tensorMap.get(i);if(t.resource!=null)return;const s=Ee(t.dtype)*u.util.sizeFromShape(t.shape);let a;const r=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST;if(t.values){if(a=this.bufferManager.acquireBuffer(s,r,!0),a.mapState==="unmapped"){const n=this.bufferManager.acquireBuffer(s,GPUBufferUsage.MAP_WRITE|GPUBufferUsage.COPY_SRC,!0,!1),o=n.getMappedRange();t.dtype==="int32"||t.dtype==="bool"?new Int32Array(o).set(t.values):new Float32Array(o).set(t.values),n.unmap(),this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(n,0,a,0,s),this.stagingPendingDisposal.push(n)}else{const n=a.getMappedRange();t.dtype==="int32"||t.dtype==="bool"?new Int32Array(n).set(t.values):new Float32Array(n).set(t.values),a.unmap()}t.values=null}else a=this.bufferManager.acquireBuffer(s,r);t.resource=a}makeUniforms(i){let t=0,s=0;const a=[];let r=1;i.forEach(l=>{l.data.length===0&&(l.data=[1]);let d;switch(l.data.length){case 1:d=4;break;case 2:d=8;break;case 3:d=16;break;case 4:d=16;break;case 5:d=16;break;case 6:d=16;break;default:u.util.assert(!1,()=>`Unsupported ${l.data.length}D shape`)}(s===5||s===6)&&(d=16),d>r&&(r=d),t=Math.ceil(t/d)*d,s=l.data.length,a.push(t),t+=l.data.length*4}),t=Math.ceil(t/r)*r;const n=new ArrayBuffer(t);i.forEach((l,d)=>{const h=a[d];l.type==="int32"?new Int32Array(n,h,l.data.length).set(l.data):l.type==="uint32"?new Uint32Array(n,h,l.data.length).set(l.data):new Float32Array(n,h,l.data.length).set(l.data)});const o=this.bufferManager.acquireBuffer(t,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);return this.queue.writeBuffer(o,0,n,0,t),this.uniformPendingDisposal.push(o),{offset:0,size:t,buffer:o}}runWebGPUProgram(i,t,s,a,r){if(r||(r=this.makeTensorInfo(i.outputShape,s)),u.util.sizeFromShape(r.shape)===0)return this.tensorMap.get(r.dataId).values=u.util.getTypedArrayFromDType(r.dtype,0),r;this.uploadToGPU(r.dataId),i.dispatch=Oi(this.device,i);const n=t.map((l,d)=>{if(l.dtype==="complex64")throw new Error("GPGPUProgram does not support complex64 input. For complex64 dtypes, please separate the program into real and imaginary parts.");return this.uploadToGPU(l.dataId),{dtype:this.tensorMap.get(l.dataId).dtype,shape:l.shape,name:i.variableNames[d]}});i.shaderKey=Di(i,n,r);const o=(0,u.env)().getBool("WEBGPU_ENGINE_COMPILE_ONLY");return i.shaderKey in this.pipelineCache||(this.pipelineCache[i.shaderKey]=Ri(this.device,i,n,r,o)),i.pipeline=this.pipelineCache[i.shaderKey],o||this.recordAndSubmit(i,r,t,a),r}recordAndSubmit(i,t,s,a){if(i.pipeline instanceof Promise)throw new Error("Please call checkCompileCompletionAsync to ensure parallel compilation is done!");let r=[],n=[];const o="int32";if(i.pixelsOpType==null){r.push({type:"float32",data:[NaN]},{type:"float32",data:[1/0]}),n=s.concat(t).map(m=>m.shape);const c="int32";n.map(m=>{r.push({type:c,data:m});const f=u.util.computeStrides(m);r.push({type:c,data:f})})}else{const c=u.util.computeStrides(t.shape);r.push({type:o,data:c})}if(i.size){const c=u.util.sizeFromShape(i.outputShape);r.push({type:o,data:[i.outputComponent?c/i.outputComponent:c]})}a&&(r=[...r,...a]);const l=[this.tensorToBinding(t),...s.map(c=>this.tensorToBinding(c)),this.makeUniforms(r)];s.forEach(c=>{this.commandQueueOwnedIds.add(c.dataId)}),this.commandQueueOwnedIds.add(t.dataId);const d=this.device.createBindGroup({layout:i.pipeline.getBindGroupLayout(0),entries:l.map((c,m)=>({binding:m,resource:c}))}),h=this.activeTimers!=null;this.ensureCommandEncoderReady();const p={};h&&this.supportTimestampQuery?(this.endComputePassEncoder(),this.querySet==null&&(this.querySet=this.device.createQuerySet({type:"timestamp",count:this.querySetCount})),p.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1},this.computePassEncoder=this.commandEncoder.beginComputePass(p)):this.computePassEncoder||(this.computePassEncoder=this.commandEncoder.beginComputePass(p)),this.computePassEncoder.setPipeline(i.pipeline),this.computePassEncoder.setBindGroup(0,d),this.computePassEncoder.dispatchWorkgroups(i.dispatch[0],i.dispatch[1],i.dispatch[2]),this.dispatchCountInPass++,(h||(0,u.env)().get("WEBGPU_DEFERRED_SUBMIT_BATCH_SIZE")<=this.dispatchCountInPass||i.pixelsOpType===ue.DRAW)&&(this.endComputePassEncoder(),h?this.activeTimers.push({name:i.constructor.name,query:this.getQueryTime()}):this.submitQueue())}async getQueryTime(){if(!this.supportTimestampQuery)return 0;this.queryResolveBuffer==null&&(this.queryResolveBuffer=this.bufferManager.acquireBuffer(this.querySetCount*8,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST|GPUBufferUsage.QUERY_RESOLVE)),this.commandEncoder.resolveQuerySet(this.querySet,0,this.querySetCount,this.queryResolveBuffer,0);const i=this.bufferManager.acquireBuffer(this.querySetCount*8,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,i,0,this.querySetCount*8),this.submitQueue(),await i.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(i.getMappedRange()),s=Number(t[1]-t[0])/1e6;return i.unmap(),this.bufferManager.releaseBuffer(i),s}shouldExecuteOnCPU(i,t=Mi){return(0,u.env)().getBool("WEBGPU_CPU_FORWARD")&&i.every(s=>this.tensorMap.get(s.dataId).resource==null&&u.util.sizeFromShape(s.shape)<t)}numDataIds(){return this.tensorMap.numDataIds()-this.tensorDataPendingDisposal.length}dispose(){this.disposed||(this.querySet!=null&&this.querySet.destroy(),this.bufferManager.dispose(),this.textureManager.dispose(),this.disposed=!0)}};ut.nextDataId=0,Te()&&(0,u.registerBackend)("webgpu",async()=>{const e={powerPreference:(0,u.env)().get("WEBGPU_USE_LOW_POWER_GPU")?"low-power":"high-performance"},i=await navigator.gpu.requestAdapter(e),t={},s=[];i.features.has("timestamp-query")&&s.push("timestamp-query"),i.features.has("bgra8unorm-storage")&&s.push(["bgra8unorm-storage"]),t.requiredFeatures=s;const a=i.limits;t.requiredLimits={maxComputeWorkgroupStorageSize:a.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:a.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:a.maxStorageBufferBindingSize,maxBufferSize:a.maxBufferSize,maxComputeWorkgroupSizeX:a.maxComputeWorkgroupSizeX,maxComputeInvocationsPerWorkgroup:a.maxComputeInvocationsPerWorkgroup};const r=await i.requestDevice(t),n="info"in i?i.info:"requestAdapterInfo"in i?await i.requestAdapterInfo():void 0;return new ut(r,n)},3);var z;(function(e){e[e.ADD=0]="ADD",e[e.ATAN2=1]="ATAN2",e[e.COMPLEX_MULTIPLY_IMAG=2]="COMPLEX_MULTIPLY_IMAG",e[e.COMPLEX_MULTIPLY_REAL=3]="COMPLEX_MULTIPLY_REAL",e[e.DIV=4]="DIV",e[e.ELU_DER=5]="ELU_DER",e[e.EQUAL=6]="EQUAL",e[e.FLOOR_DIV=7]="FLOOR_DIV",e[e.GREATER=8]="GREATER",e[e.GREATER_EQUAL=9]="GREATER_EQUAL",e[e.LESS=10]="LESS",e[e.LESS_EQUAL=11]="LESS_EQUAL",e[e.LOGICAL_AND=12]="LOGICAL_AND",e[e.LOGICAL_OR=13]="LOGICAL_OR",e[e.MAX=14]="MAX",e[e.MIN=15]="MIN",e[e.MOD=16]="MOD",e[e.MUL=17]="MUL",e[e.NOT_EQUAL=18]="NOT_EQUAL",e[e.POW=19]="POW",e[e.PRELU=20]="PRELU",e[e.SQUARED_DIFFERENCE=21]="SQUARED_DIFFERENCE",e[e.SUB=22]="SUB"})(z||(z={}));var Ui="let resultTemp = a + b;",Gi="let resultTemp = atan2(a, b);",Hi="let resultTemp = areal * breal - aimag * bimag;",qi="let resultTemp = areal * bimag + aimag * breal;",Xi="let resultTemp = a / b;",Ki="let resultTemp = select(a * (b + 1.0), a, b >= b - b);",Yi=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a == b);
`,Qi=`
  let remainder =
      select(a % b, round(a % b), (round(a) == a) & (round(b) == b));
  let quotient = (a - remainder) / b;
  let resultTemp =
      round(select(quotient, quotient - 1, sign(remainder) == -sign(b)));
`,Zi=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a > b);
`,Ji=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a >= b);
`,ji=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a < b);
`,_i=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a <= b);
`,ea="return f32(a >= 1.0 && b >= 1.0);",ta=`return (vec4<f32>(a >= vec4<f32>(1.0)) *
  vec4<f32>(b >= vec4<f32>(1.0)));`,ia="return f32(a >= 1.0 || b >= 1.0);",aa=`return min(vec4<f32>(a >= vec4<f32>(1.0)) +
  vec4<f32>(b >= vec4<f32>(1.0)), vec4<f32>(1.0));`,sa="let resultTemp = max(a, b);",ra="let resultTemp = min(a, b);",na=`
  let isNaN = b == 0.;
  var resultTemp = a % b;
  resultTemp = select((resultTemp + b) % b, resultTemp,
      (a < 0. && b < 0.) || (a >= 0. && b > 0.));
`,oa=`
  let isNaN = !vec4<bool>(b);
  var resultTemp = vec4<f32>(a % b);
  if (!((a[0] < 0. && b[0] < 0.) || (a[0] >= 0. && b[0] > 0.))) {
    resultTemp[0] = (resultTemp[0] + b[0]) % b[0];
  }
  if (!((a[1] < 0. && b[1] < 0.) || (a[1] >= 0. && b[1] > 0.))) {
    resultTemp[1] = (resultTemp[1] + b[1]) % b[1];
  }
  if (!((a[2] < 0. && b[2] < 0.) || (a[2] >= 0. && b[2] > 0.))) {
    resultTemp[2] = (resultTemp[2] + b[2]) % b[2];
  }
  if (!((a[3] < 0. && b[3] < 0.) || (a[3] >= 0. && b[3] > 0.))) {
    resultTemp[3] = (resultTemp[3] + b[3]) % b[3];
  }
`,ua="let resultTemp = a * b;",la=`
  var resultTemp = f32(a != b);
  let valueForNaN = 1.0;
`,da=`
  var resultTemp = vec4<f32>(a != b);
  let valueForNaN = 1.0;
`,ha=`
  let isNaN = a < 0.0 && floor(b) < b;
  if (b == 0.0) {
    return 1.0;
  }
  var resultTemp = select(sign(a) * pow(abs(a), b), pow(abs(a), b),
      round(abs(b) % 2.0) != 1.0);
`,pa=`
  let isModRound1Bool = vec4<i32>(round(abs(b) % vec4<f32>(2.0))) == vec4<i32>(1);
  let isModRound1 = vec4<f32>(isModRound1Bool);
  let multiplier = sign(a) * isModRound1 + (vec4<f32>(1.0) - isModRound1);
  var resultTemp = multiplier * pow(abs(a), b);

  // Ensure that a^0 = 1, including 0^0 = 1 as this correspond to TF and JS
  let isExpZero = b == vec4<f32>(0.0);
  if (isExpZero.r) {
    resultTemp.r = 1.0;
  }
  if (isExpZero.g) {
    resultTemp.g = 1.0;
  }
  if (isExpZero.b) {
    resultTemp.b = 1.0;
  }
  if (isExpZero.a) {
    resultTemp.a = 1.0;
  }
  let isNaN = (a < vec4<f32>(0.0)) & (floor(b) < b);
`,ca="if (a < 0.0) { return b * a; }  return a;",ma=`
  let aLessThanZero = vec4<f32>(a < vec4<f32>(0.0));
  return (aLessThanZero * (b * a)) + ((vec4<f32>(1.0) - aLessThanZero) * a);
`,fa="let resultTemp = (a - b) * (a - b);",ga="let resultTemp = a - b;";function Be(e,i){let t;do{switch(e){case z.ATAN2:t=Gi;break;case z.MAX:t=sa;break;case z.MIN:t=ra;break;case z.MOD:t=i?oa:na;break;case z.NOT_EQUAL:t=i?da:la;break;case z.POW:t=i?pa:ha;break;default:continue}let s,a,r;return i?(s="isnanVec4",a="vec4<f32>",r="vec4<bool>"):(s="isnan",a="f32",r="bool"),`
      let aIsNaN = ${s}(a);
      let aPostLegalization = select(a, ${a}(42), aIsNaN);
      let bIsNaN = ${s}(b);
      let bPostLegalization = select(b, ${a}(42), bIsNaN);
      let isNaN = false;
      let valueForNaN = uniforms.NAN;
      {
        let a = aPostLegalization;
        let b = bPostLegalization;
        ${t}
        return select(
            resultTemp, ${a}(valueForNaN),
            ${r}(isNaN) | aIsNaN | bIsNaN);
      }
    `}while(!1);switch(e){case z.ADD:t=Ui;break;case z.COMPLEX_MULTIPLY_IMAG:t=qi;break;case z.COMPLEX_MULTIPLY_REAL:t=Hi;break;case z.DIV:t=Xi;break;case z.ELU_DER:t=Ki;break;case z.EQUAL:t=Yi;break;case z.FLOOR_DIV:t=Qi;break;case z.GREATER:t=Zi;break;case z.GREATER_EQUAL:t=Ji;break;case z.LESS:t=ji;break;case z.LESS_EQUAL:t=_i;break;case z.LOGICAL_AND:return i?ta:ea;case z.LOGICAL_OR:return i?aa:ia;case z.MUL:t=ua;break;case z.PRELU:return i?ma:ca;case z.SQUARED_DIFFERENCE:t=fa;break;case z.SUB:t=ga}return`
    ${t}
    return resultTemp;
  `}var I;(function(e){e[e.ABS=0]="ABS",e[e.ACOS=1]="ACOS",e[e.ACOSH=2]="ACOSH",e[e.ASIN=3]="ASIN",e[e.ASINH=4]="ASINH",e[e.ATAN=5]="ATAN",e[e.ATANH=6]="ATANH",e[e.CEIL=7]="CEIL",e[e.COS=8]="COS",e[e.COSH=9]="COSH",e[e.ELU=10]="ELU",e[e.ERF=11]="ERF",e[e.EXP=12]="EXP",e[e.EXPM1=13]="EXPM1",e[e.FLOOR=14]="FLOOR",e[e.IS_FINITE=15]="IS_FINITE",e[e.IS_INF=16]="IS_INF",e[e.IS_NAN=17]="IS_NAN",e[e.LINEAR=18]="LINEAR",e[e.LOG=19]="LOG",e[e.LOG1P=20]="LOG1P",e[e.LOGICAL_NOT=21]="LOGICAL_NOT",e[e.NEG=22]="NEG",e[e.RELU=23]="RELU",e[e.RELU6=24]="RELU6",e[e.LEAKYRELU=25]="LEAKYRELU",e[e.RECIPROCAL=26]="RECIPROCAL",e[e.ROUND=27]="ROUND",e[e.RSQRT=28]="RSQRT",e[e.SELU=29]="SELU",e[e.SIGMOID=30]="SIGMOID",e[e.SIGN=31]="SIGN",e[e.SIN=32]="SIN",e[e.SINH=33]="SINH",e[e.SOFTPLUS=34]="SOFTPLUS",e[e.SQRT=35]="SQRT",e[e.SQUARE=36]="SQUARE",e[e.STEP=37]="STEP",e[e.TAN=38]="TAN",e[e.TANH=39]="TANH",e[e.TO_INT=40]="TO_INT"})(I||(I={}));var xa="return abs(a);",va=`
  if (abs(a) > 1.) {
    return uniforms.NAN;
  }
  return acos(a);
`,Ca=`
  if (a < 1.) {
    return uniforms.NAN;
  }
  return acosh(a);
`,ba=`
  if (abs(a) > 1.) {
    return uniforms.NAN;
  }
  return asin(a);
`,ya="return asinh(a);",Sa=`
  if (isnan(a)) {
    return uniforms.NAN;
  }
  return atan(a);
`,Ia=`
  if (abs(a) > 1.) {
    return uniforms.NAN;
  }
  if (a == 1.) {
    return uniforms.INFINITY;
  }
  if (a == -1.) {
    return -uniforms.INFINITY;
  }
  return atanh(a);
`,ka="return ceil(a);",wa="return cos(a);",Ra=`
  let e2x = exp(-a);
  return (e2x + 1.0 / e2x) / 2.0;
`,Pa="return exp(a) - 1.0;",$a="if (a >= 0.0) { return a; }  return (exp(a) - 1.0);",Da=`
  var resFloat = exp(a) - vec4<f32>(1.0);
  if (a.r >= 0.0) {
    resFloat.r = a.r;
  }
  if (a.g >= 0.0) {
    resFloat.g = a.g;
  }
  if (a.b >= 0.0) {
    resFloat.b = a.b;
  }
  if (a.a >= 0.0) {
    resFloat.a = a.a;
  }
  return resFloat;
`,Na=`
  // Error function is calculated approximately with elementary function.
  // See "Handbook of Mathematical Functions with Formulas,
  // Graphs, and Mathematical Tables", Abramowitz and Stegun.
  let p = ${u.backend_util.ERF_P};
  let a1 = ${u.backend_util.ERF_A1};
  let a2 = ${u.backend_util.ERF_A2};
  let a3 = ${u.backend_util.ERF_A3};
  let a4 = ${u.backend_util.ERF_A4};
  let a5 = ${u.backend_util.ERF_A5};

  let sign = sign(a);
  let absA = abs(a);
  let t = 1.0 / (1.0 + p * absA);
  return sign * (1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * exp(-absA * absA));
`,za="return exp(a);",Aa="return floor(a);",Fa="return f32(!isnan(a) && !isinf(a));",Ea="return f32(isinf(a));",Ta="return f32(isnan(a));",La="return a;",Ba=`if (a < 0.0) { return uniforms.NAN; }
  return log(a);`,Wa=`
  if (isnan(a)) { return a; }
  return log(1.0 + a);
`,Va="return f32(!(a >= 1.0));",Ma="return -a;",Oa="if (a < 0.0) { return uniforms.alpha * a; } return a;",Ua=`
  let aLessThanZero = vec4<f32>(a < vec4<f32>(0.0));
  return (aLessThanZero * (uniforms.alpha * a)) + ((vec4<f32>(1.0) - aLessThanZero) * a);
`,Ga="return 1.0 / a;",Ha="return select(a, 0.0, a < 0.0);",qa="return clamp(a, 0.0, 6.0);",Xa="return clamp(a, vec4<f32>(0.0, 0.0, 0.0, 0.0), vec4<f32>(6.0, 6.0, 6.0, 6.0));",Ka=`
  return select(a, vec4<f32>(0.0), a < vec4<f32>(0.0));
`,Ya="return round(a);",Qa="return inverseSqrt(a);",Za=`
  if (a >= 0.0) {
    return ${u.backend_util.SELU_SCALE} * a;
  } else {
    return ${u.backend_util.SELU_SCALEALPHA} * (exp(a) - 1.0);
  }
`,Ja="return 1.0 / (1.0 + exp(-1.0 * a));",ja="return sign(a);",_a="return sin(a);",es=`
  let e2x = exp(a);
  return (e2x - 1.0 / e2x) / 2.0;
`,ts=`
  let epsilon = 1.1920928955078125e-7;
  let threshold = log(epsilon) + 2.0;

  let too_large = a > -threshold;
  let too_small = a < threshold;
  let exp_a = exp(a);

  if (too_large) {
    return a;
  } else if (too_small) {
    return exp_a;
  } else {
    return log(exp_a + 1.0);
  }
`,is="return sqrt(a);",as="return a * a;",ss=`
  if (isnan(a)) {
    return a;
  }

  return select(uniforms.stepAlpha, 1.0, a > 0.0);
`,rs="return tan(a);",ns=`
  let e2x = exp(-2.0 * abs(a));
  return sign(a) * (1.0 - e2x) / (1.0 + e2x);
`,os="return f32(i32((a)));";function se(e,i){switch(e){case I.ABS:return xa;case I.ACOS:return va;case I.ACOSH:return Ca;case I.ASIN:return ba;case I.ASINH:return ya;case I.ATAN:return Sa;case I.ATANH:return Ia;case I.COS:return wa;case I.COSH:return Ra;case I.CEIL:return ka;case I.ELU:return i?Da:$a;case I.ERF:return Na;case I.EXP:return za;case I.EXPM1:return Pa;case I.FLOOR:return Aa;case I.IS_FINITE:return Fa;case I.IS_INF:return Ea;case I.IS_NAN:return Ta;case I.LINEAR:return La;case I.LOG:return Ba;case I.LOG1P:return Wa;case I.LOGICAL_NOT:return Va;case I.NEG:return Ma;case I.LEAKYRELU:return i?Ua:Oa;case I.RECIPROCAL:return Ga;case I.RELU:return i?Ka:Ha;case I.RELU6:return i?Xa:qa;case I.ROUND:return Ya;case I.RSQRT:return Qa;case I.SELU:return Za;case I.SIGMOID:return Ja;case I.SIGN:return ja;case I.SIN:return _a;case I.SINH:return es;case I.SOFTPLUS:return ts;case I.SQRT:return is;case I.SQUARE:return as;case I.STEP:return ss;case I.TAN:return rs;case I.TANH:return ns;case I.TO_INT:return os;default:throw new Error(`BinaryType ${e} is not implemented!`)}}function _(e,i=!1,t=!1,s=3){if(e===null)return"";let a="";if(e==="linear")a=se(I.LINEAR);else if(e==="relu")a=se(I.RELU,t);else if(e==="elu")a=se(I.ELU,t);else if(e==="relu6")a=se(I.RELU6,t);else if(e==="prelu")a=Be(z.PRELU,t);else if(e==="sigmoid")a=se(I.SIGMOID,t);else if(e==="leakyrelu")a=se(I.LEAKYRELU,t);else throw new Error(`Activation ${e} has not been implemented for the WebGPU backend.`);const r=A(t?4:1);let n="";return i?n=`
      fn activation(a : ${r}, coords : vec${s}<i32>) -> ${r} {
        let b = getPreluActivationWeightsByOutputCoords(coords);
        ${a}
      }`:n=`
      fn activation(a : ${r}, coords : vec${s}<i32>) -> ${r} {
        ${a}
      }`,n}function re(e,i){return`
      ${e?"value = value + getBiasByOutputCoords(coords);":""}
      ${i?"value = activation(value, coords);":""}
      `}function lt(e,i,t=!1,s=!1,a=!1,r=1){u.util.assert(e&&r===1||!e,()=>`transposeA ${e} is not compatible with component size ${r}`);const n=`
      ${e?"value = getA(batch, col, row);":"value = getA(batch, row, col);"}

    `,o=i?"value = getB(batch, col, row);":"value = getB(batch, row, col);";return`
  fn mm_readA(batch: i32, row: i32, col: i32) -> ${A(r)} {
    var value = ${A(r)}(0.0);
    ${t&&a?n:`
    ${e?"if(row < uniforms.dimAOuter && col < uniforms.dimInner)":"if(row < uniforms.aShape[1] && col < uniforms.aShape[2])"}
    {
      ${n}
    }
    `}
    return value;
  }

  fn mm_readB(batch: i32, row: i32, col: i32) -> ${A(r)} {
    var value = ${A(r)}(0.0);
    ${o}
    return value;
  }
  `}function We(e,i,t,s,a=!1,r=!1,n=!1,o=1){return`
  ${lt(t,s,a,r,n,o)}
  fn mm_write(batch: i32, row: i32, col: i32, valueIn: ${A(o)}) {
    ${a&&r?"":"if (row < uniforms.dimAOuter && col < uniforms.dimBOuter)"}
    {
      var value = valueIn;
      let coords = vec3<i32>(batch, row, col);
      ${re(e,i)}
      setOutputAtCoords(coords[0], coords[1], coords[2], value);
    }
  }
  `}var us=(e,i)=>e?`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          kStart + inputRow,
          globalRowStart + inputCol * ${i});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          globalRow + innerRow,
          kStart + inputCol * ${i});
        `,ls=(e,i,t,s)=>{if(e)return`
      for (var k = 0; k < ${s}; k++) {
        let BCached0 = mm_Bsub[k][tileCol];
        let ACached0 = mm_Asub[k][localRow];
        for (var i = 0; i < ${t}; i++) {
          acc[i] = fma(BCached0, vec4<f32>(ACached0[i]), acc[i]);
        }
      }`;{let a="",r="";for(let n=0;n<i;n++)a+=`let BCached${n} = mm_Bsub[k * ${i} + ${n}][tileCol];`,r+=`acc[i] = fma(BCached${n}, vec4<f32>(ACached[${n}]), acc[i]);`;return`
      for (var k = 0; k < ${s/i}; k++) {
        ${a}
        for (var i = 0; i < ${t}; i++) {
          let ACached = mm_Asub[tileRow + i][k];
          ${r}
        }
      }`}};function ke(e,i,t=!1,s=32,a=!1,r=32,n=!1){const o=i[1]*e[1],l=i[0]*e[0],d=t?o:s,h=t?s:o,p=d/i[0],c=s/i[1],m=e[1],f=e[0];return u.util.assert((t&&p===4&&e[1]===4||!t&&(p===3||p===4))&&d%i[0]===0&&s%i[1]===0&&e[0]===4,()=>`If transposeA ${t} is true, innerElementSize ${p} and workPerThread[1] ${e[1]} must be 4.
          Otherwise, innerElementSize ${p} must be 3 or 4.
      tileAWidth ${d} must be divisible by workgroupSize[0]${i[0]}. tileInner ${s} must be divisible by workgroupSize[1] ${i[1]}. colPerThread ${e[0]} must be 4.`),`
  var<workgroup> mm_Asub : array<array<vec${p}<f32>, ${d/p}>, ${h}>;
  var<workgroup> mm_Bsub : array<array<vec4<f32>, ${l/e[0]}>, ${s}>;

  ${k()} {
    let localRow = i32(localId.y);
    let tileRow = localRow * ${m};
    let tileCol = i32(localId.x);

    let globalRow = i32(globalId.y) * ${m};
    let globalCol = i32(globalId.x) * ${f};
    let batch = ${a?"0":"i32(globalId.z)"};
    let batchA = ${a||!n?"batch":"batch % uniforms.aShape[0]"};
    let batchB = ${a||!n?"batch":"batch % uniforms.bShape[0]"};
    let globalRowStart = i32(workgroupId.y) * ${o};

    let numTiles = ${a?`${Math.ceil(r/s)}`:`(uniforms.dimInner - 1) / ${s} + 1`};
    var kStart = ${a?`i32(globalId.z) * ${r}`:"0"};

    var acc: array<vec4<f32>, ${m}>;

    // Loop over shared dimension.
    let tileRowB = localRow * ${c};
    for (var t = 0; t < numTiles; t++) {
        // Load one tile of A into local memory.
        for (var innerRow = 0; innerRow < ${m}; innerRow++) {
            let inputRow = tileRow + innerRow;
            let inputCol = tileCol;
            ${us(t,p)}
        }

        // Load one tile of B into local memory.
        for (var innerRow = 0; innerRow < ${c}; innerRow++) {
            let inputRow = tileRowB + innerRow;
            let inputCol = tileCol;
            mm_Bsub[inputRow][inputCol] = mm_readB(batchB, kStart + inputRow, globalCol);
        }
        kStart = kStart + ${s};
        workgroupBarrier();

        // Compute acc values for a single thread.
        ${ls(t,p,m,s)}
        workgroupBarrier();
    }

    for (var innerRow = 0; innerRow < ${m}; innerRow++) {
        mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
    }
  }`}var dt=e=>e?`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          kStart + inputRow,
          globalRowStart + inputCol);
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          globalRowStart + inputRow,
          kStart + inputCol);
        `,ds=e=>e?"let ACached = mm_Asub[k][tileRow + innerRow];":"let ACached = mm_Asub[tileRow + innerRow][k];";function we(e,i,t=!1,s=32,a=!1,r=32,n=!1,o=!1){const l=e[1]*i[1],d=e[0]*i[0],h=t?l:s,p=t?s:l;u.util.assert(p%i[1]===0&&h%i[0]===0&&s%i[1]===0,()=>`tileAHight ${p} must be divisible by workgroupSize[1]${i[1]}, tileAWidth ${h} must be divisible by workgroupSize[0]${i[0]}, tileInner ${s} must be divisible by workgroupSize[1]${i[1]}`);const c=p/i[1],m=h/i[0],f=s/i[1],g=e[1],x=e[0],v=n?`
      let localRow = i32(localId.y);
      let localCol = i32(localId.x);
      let globalRowStart = i32(workgroupId.y) * ${l};
      let globalColStart = i32(workgroupId.x) * ${d};

      // Loop over shared dimension.
      for (var t = 0; t < numTiles; t++) {
        // Load one tile of A into local memory.
        for (var inputRow = localRow; inputRow < ${p}; inputRow = inputRow + ${i[1]}) {
          for (var inputCol = localCol; inputCol < ${h}; inputCol = inputCol + ${i[0]}) {
            ${dt(t)}
          }
        }
        // Load one tile of B into local memory.
        for (var inputRow = localRow; inputRow < ${s}; inputRow = inputRow + ${i[1]}) {
              for (var inputCol = localCol; inputCol < ${d}; inputCol = inputCol + ${i[0]}) {
            mm_Bsub[inputRow][inputCol] = mm_readB(batchB,
              kStart + inputRow,
              globalColStart + inputCol);
          }
        }
        kStart = kStart + ${s};
        workgroupBarrier();

        // Compute acc values for a single thread.
        var BCached : array<f32, ${x}>;
        for (var k = 0; k < ${s}; k++) {
          for (var inner = 0; inner < ${x}; inner++) {
            BCached[inner] = mm_Bsub[k][localCol + inner * ${i[0]}];
          }
          for (var innerRow = 0; innerRow < ${g}; innerRow++) {
            let ACached = ${t?`mm_Asub[k][localRow + innerRow * ${i[1]}];`:`mm_Asub[localRow + innerRow * ${i[1]}][k];`}
            for (var innerCol = 0; innerCol < ${x}; innerCol++) {
              acc[innerRow][innerCol] =
                  fma(ACached, BCached[innerCol], acc[innerRow][innerCol]);
            }
          }
        }
        workgroupBarrier();
      }
      for (var innerRow = 0; innerRow < ${g}; innerRow++) {
        let gRow = globalRowStart + localRow + innerRow * ${i[1]};
        for (var innerCol = 0; innerCol < ${x}; innerCol++) {
          let gCol = globalColStart + localCol + innerCol * ${i[0]};
          mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
        }
      }
      `:`
  let tileRow = i32(localId.y) * ${g};
  let tileCol = i32(localId.x) * ${x};

  let globalRow = i32(globalId.y) * ${g};
  let globalCol = i32(globalId.x) * ${x};
  let globalRowStart = i32(workgroupId.y) * ${l};

  let tileRowA = i32(localId.y) * ${c};
  let tileColA = i32(localId.x) * ${m};
  let tileRowB = i32(localId.y) * ${f};
  // Loop over shared dimension.
  for (var t = 0; t < numTiles; t++) {
    // Load one tile of A into local memory.
    for (var innerRow = 0; innerRow < ${c}; innerRow++) {
      for (var innerCol = 0; innerCol < ${m}; innerCol++) {
        let inputRow = tileRowA + innerRow;
        let inputCol = tileColA + innerCol;
        ${dt(t)}
      }
    }

    // Load one tile of B into local memory.
    for (var innerRow = 0; innerRow < ${f}; innerRow++) {
      for (var innerCol = 0; innerCol < ${x}; innerCol++) {
        let inputRow = tileRowB + innerRow;
        let inputCol = tileCol + innerCol;
        mm_Bsub[inputRow][inputCol] = mm_readB(batchB,
          kStart + inputRow,
          globalCol + innerCol);
      }
    }
    kStart = kStart + ${s};
    workgroupBarrier();

    // Compute acc values for a single thread.
    var BCached : array<f32, ${x}>;
    for (var k = 0; k < ${s}; k++) {
      for (var inner = 0; inner < ${x}; inner++) {
        BCached[inner] = mm_Bsub[k][tileCol + inner];
      }

      for (var innerRow = 0; innerRow < ${g}; innerRow++) {
        ${ds(t)}
        for (var innerCol = 0; innerCol < ${x}; innerCol++) {
          acc[innerRow][innerCol] =
              fma(ACached, BCached[innerCol], acc[innerRow][innerCol]);
        }
      }
    }

    workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < ${g}; innerRow++) {
    for (var innerCol = 0; innerCol < ${x}; innerCol++) {
      mm_write(batch, globalRow + innerRow, globalCol + innerCol,
          acc[innerRow][innerCol]);
    }
  }
  `;return`
    var<workgroup> mm_Asub : array<array<f32, ${h}>, ${p}>;
    var<workgroup> mm_Bsub : array<array<f32, ${d}>, ${s}>;

    ${k()} {
      let batch = ${a?"0":"i32(globalId.z)"};
      let batchA = ${a||!o?"batch":"batch % uniforms.aShape[0]"};
      let batchB = ${a||!o?"batch":"batch % uniforms.bShape[0]"};
      let numTiles = ${a?`${Math.ceil(r/s)}`:`(uniforms.dimInner - 1) / ${s} + 1`};
      var kStart = ${a?`i32(globalId.z) * ${r}`:"0"};

      var acc : array<array<f32, ${x}>, ${g}>;

      // Without this initialization strange values show up in acc.
      for (var innerRow = 0; innerRow < ${g}; innerRow++) {
        for (var innerCol = 0; innerCol < ${x}; innerCol++) {
          acc[innerRow][innerCol] = 0.0;
        }
      }
      ${v}
    }
  `}var hs=e=>e?`
      mm_readA(batchA, colA, globalRow),
      mm_readA(batchA, colA + 1, globalRow),
      mm_readA(batchA, colA + 2, globalRow),
      mm_readA(batchA, colA + 3, globalRow)
  `:`
      mm_readA(batchA, globalRow, colA),
      mm_readA(batchA, globalRow, colA + 1),
      mm_readA(batchA, globalRow, colA + 2),
      mm_readA(batchA, globalRow, colA + 3)
  `;function ps(e,i=!1){u.util.assert(e[1]===1&&e[2]===1,()=>`A linear work group size is required. But got ${e}.`);const t=e[0]*4;return`
    var<workgroup> mm_Asub : array<vec4<f32>, ${e[0]}>;

    ${k()} {
      let tileCol = i32(localId.x);
      let globalCol = i32(globalId.x);
      let globalRow = i32(globalId.y);

      let numTiles = (uniforms.dimInner - 1) / ${t} + 1;
      let batch = i32(globalId.z);
      let batchA = batch % uniforms.aShape[0];
      let batchB = batch % uniforms.bShape[0];
      // Without this initialization strange values show up in acc.
      var acc = 0.0;

      // Loop over shared dimension.
      for (var t = 0; t < numTiles; t++) {
        // Load one tile of A into local memory.
        let colA = t * ${t} + tileCol * 4;
        mm_Asub[tileCol] = vec4<f32>(${hs(i)});
        workgroupBarrier();

        // Compute acc values for a single thread.
        for (var k = 0; k < ${t/4}; k++) {
          let rowB = t * ${t} + k * 4;
          let BCached = vec4<f32>(mm_readB(batchB, rowB, globalCol),
                              mm_readB(batchB, rowB + 1, globalCol),
                              mm_readB(batchB, rowB + 2, globalCol),
                              mm_readB(batchB, rowB + 3, globalCol));

          let ACached = mm_Asub[k];
          acc = acc + dot(ACached, BCached);
        }

        workgroupBarrier();
      }

      mm_write(batch, globalRow, globalCol, acc);
    }
  `}var cs=class{constructor(e,i,t=!1,s=!1,a=null,r=null,n=null,o=!1){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.outputShape=i,this.dispatchLayout={x:[2],y:[1],z:[0]};const l=t?e[1]:e[2];if(this.isVec4=(l%4===0&&!t||i[1]%4===0&&t)&&i[2]%4===0&&!s,this.outputComponent=this.isVec4?4:1,this.isVectorA=i[1]===1&&!t,!this.isVec4&&this.isVectorA)this.elementsPerThread=[1,1,1],this.workgroupSize=[32,1,1];else{const p=ot(i[1],l,i[2],t);this.workgroupSize=p.workgroupSize,this.elementsPerThread=p.elementsPerThread}this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,this.elementsPerThread);const d=a!=null,h=n!=null;d&&this.variableNames.push("bias"),h&&this.variableNames.push("preluActivationWeights"),this.sequentialAccessByThreads=o,this.transposeA=t,this.transposeB=s,this.addBias=d,this.activation=r,this.hasPreluActivationWeights=h,[this.fitAOuter,this.fitBOuter,this.fitInner]=this.getShapeFit(i[1],i[2],l),this.shaderKey=`matMulPacked_${this.elementsPerThread}_${t}_${s}_${this.activation}_${this.fitAOuter}_${this.fitBOuter}_${this.fitInner}_${this.isVec4}_${this.isVectorA}_${this.sequentialAccessByThreads}`}getShapeFit(e,i,t){const s=this.workgroupSize[1]*this.elementsPerThread[1],a=this.workgroupSize[0]*this.elementsPerThread[0];return!this.isVec4&&this.isVectorA?this.tileInner=this.workgroupSize[0]*4:this.tileInner=a,[e%s===0,i%a===0,t%this.tileInner===0]}getUserCode(){return`
      ${_(this.activation,this.hasPreluActivationWeights,this.isVec4)}
      ${We(this.addBias,this.activation,!1,this.transposeB,this.fitAOuter,this.fitBOuter,this.fitInner,this.isVec4?4:1)}
      ${this.isVec4?ke(this.elementsPerThread,this.workgroupSize,this.transposeA,this.tileInner,!1,null,!0):this.isVectorA?ps(this.workgroupSize,this.transposeA):we(this.elementsPerThread,this.workgroupSize,this.transposeA,this.tileInner,!1,null,this.sequentialAccessByThreads,!0)}
    `}};function ms(e){return`
    var<workgroup> sumValues : array<f32, ${e}>;
    ${k()} {
      let coords = getOutputCoords();
      let batch = coords[0];
      let batchA = batch % uniforms.aShape[0];
      let batchB = batch % uniforms.bShape[0];
      let row = coords[1];
      let col = coords[2];
      var sum = 0.0;
      let Length = uniforms.dimInner;
      for (var k = i32(localId.x); k < Length; k = k + ${e}) {
        let dataA = mm_readA(batchA, row, k);
        let dataB = mm_readB(batchB, k, col);
        sum = sum + dataA * dataB;
      }
      sumValues[localId.x] = sum;
      workgroupBarrier();

      for(var currentSize = ${e/2}u; currentSize > 1u;
          currentSize = currentSize / 2u) {
        if (localId.x < currentSize)
        {
          sumValues[localId.x] = sumValues[localId.x] + sumValues[localId.x + currentSize];
        }
        workgroupBarrier();
      }

      if (localId.x == 0u) {
        sum = sumValues[0] + sumValues[1];
        mm_write(batch, row, col, sum);
      }
    }
  `}var fs=class{constructor(e,i=!1,t=!1,s=null,a=null,r=null){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.workgroupSize=[256,1,1],this.outputShape=e,this.dispatchLayout={x:[],y:[1,2],z:[0]},this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize);const n=s!=null,o=r!=null;n&&this.variableNames.push("bias"),o&&this.variableNames.push("preluActivationWeights"),this.transposeA=i,this.transposeB=t,this.addBias=n,this.activation=a,this.hasPreluActivationWeights=o,this.shaderKey=`matMulReduce_${this.activation}_${i}_${t}`}getUserCode(){return`
      ${_(this.activation,this.hasPreluActivationWeights)}
      ${We(this.addBias,this.activation,this.transposeA,this.transposeB)}
      ${ms(this.workgroupSize[0])}
    `}};function gs(e){const i=e[1],t=e[0],s=i>t?i:t;return`
  var<workgroup> mm_Asub : array<array<f32, ${s}>, ${i}>;
  var<workgroup> mm_Bsub : array<array<f32, ${t}>, ${s}>;

  // If the output size is small for matrix multiplication, avoid to use vec4
  // and handle some elements per thread to optimally utilize the ALU.
  // Read data from global memory to registers firstly, then store them into
  // shared memory, so it is instruction-Level parallelism for arithmetic
  // operations and others handle IO operations between barrier api, makes ALU
  // and load/store units work simultaneously, could improves the performance.
  ${k()} {
    let tileRow = i32(localId.y);
    let tileCol = i32(localId.x);
    let globalRow = i32(globalId.y);
    let globalCol = i32(globalId.x);
    let batch = i32(globalId.z);
    let batchA = batch % uniforms.aShape[0];
    let batchB = batch % uniforms.bShape[0];

    // uniforms.dimInner should be greater than 0.
    let numTiles = (uniforms.dimInner - 1) / ${s} + 1;
    var acc = 0.0;

    var globalColA = tileCol;
    var globalRowB = 0;
    var regA = mm_readA(batchA, globalRow, globalColA);
    var regB0 = mm_readB(batchB, globalRowB + 2 * tileRow, globalCol);
    var regB1 = mm_readB(batchB, globalRowB + 2 * tileRow + 1, globalCol);
    globalColA = globalColA + ${s};
    globalRowB = globalRowB + ${s};

    for (var t = 0; t < numTiles; t = t + 1) {
      mm_Asub[tileRow][tileCol] = regA;
      mm_Bsub[2 * tileRow][tileCol] = regB0;
      mm_Bsub[2 * tileRow + 1][tileCol] = regB1;

      workgroupBarrier();

      regA = mm_readA(batchA, globalRow, globalColA);
      regB0 = mm_readB(batchB, globalRowB + 2 * tileRow, globalCol);
      regB1 = mm_readB(batchB, globalRowB + 2 * tileRow + 1, globalCol);
      globalColA = globalColA + ${s};
      globalRowB = globalRowB + ${s};

      for (var k = 0; k < ${s}; k = k + 1) {
        acc = acc + mm_Asub[tileRow][k] * mm_Bsub[k][tileCol];
      }
      workgroupBarrier();
    }

    mm_write(batch, globalRow, globalCol, acc);
  }
  `}var xs=class{constructor(e,i,t,s=!1,a=!1,r=null,n=null,o=null){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.workgroupSize=[16,8,1],this.outputShape=t,this.dispatchLayout={x:[2],y:[1],z:[0]},this.dispatch=[Math.ceil(t[2]/this.workgroupSize[0]),Math.ceil(t[1]/this.workgroupSize[1]),t[0]];const l=r!=null;l&&this.variableNames.push("bias");const d=o!=null;d&&this.variableNames.push("preluActivationWeights"),this.transposeA=s,this.transposeB=a,this.addBias=l,this.activation=n,this.hasPreluActivationWeights=d,this.shaderKey=`matMulSmallOutputSize_${this.activation}_${s}_${a}`}getUserCode(){return`
      ${_(this.activation,this.hasPreluActivationWeights)}
      ${We(this.addBias,this.activation,this.transposeA,this.transposeB)}
      ${gs(this.workgroupSize)}
    `}},vs=class{constructor(e,i,t=!1,s=!1){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.workgroupSize=[8,8,1],this.atomic=!0,this.splitedDimInner=128,u.util.assert(e[0]===1,()=>"MatMulSplitKProgram only supports batch = 1."),this.outputShape=e,this.dispatchLayout={x:[2],y:[1],z:[0,3]};const a=(t&&this.outputShape[1]%4===0||!t&&i%4===0)&&this.outputShape[2]%4===0;this.elementsPerThread=[4,4,this.splitedDimInner],this.outputComponent=a?4:1,a||(this.outputShape[1]<16&&(this.elementsPerThread[1]=1),this.outputShape[2]<16&&(this.elementsPerThread[0]=1)),this.dispatch=w(this.dispatchLayout,[this.outputShape[0],this.outputShape[1],this.outputShape[2],i],this.workgroupSize,this.elementsPerThread),this.transposeA=t,this.transposeB=s,this.shaderKey=`matMulSplitK_${t}_${s}_${this.elementsPerThread}_${this.outputComponent}`}getUserCode(){const e=this.outputComponent;return`
      ${lt(!1,this.transposeB,!1,!1,!1,e)}
      fn mm_write(batch: i32, row : i32, col : i32, value : ${A(e)}) {
        if (row < uniforms.dimAOuter && col < uniforms.dimBOuter) {
          let coords = vec3<i32>(batch, row, col);
          let flatIndex = getOutputIndexFromCoords(coords);
          // The problem is that we should initialize output to zero before using.
          // Otherwise, the original value will be added to the result.
          for (var i = 0; i < ${e}; i = i + 1) {
            ${ee("&result[flatIndex + i]",`${e>1?"value[i]":"value"}`,"float32")}
          }
        }
      }
      ${e===4?ke(this.elementsPerThread,this.workgroupSize,this.transposeA,32,!0,this.splitedDimInner):we(this.elementsPerThread,this.workgroupSize,this.transposeA,32,!0,this.splitedDimInner)}
    `}},Cs=class{constructor(e,i=null,t=null,s=null){this.uniforms="",this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.addBias=i!=null,this.hasPreluActivationWeights=s!=null,this.activation=t,this.addBias&&this.variableNames.push("bias"),this.hasPreluActivationWeights&&this.variableNames.push("preluActivationWeights"),this.shaderKey=`biasActivation_${t}`}getUserCode(){return`
    ${_(this.activation,this.hasPreluActivationWeights)}
    ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        var value = getXByOutputIndex(index);
        ${re(this.addBias,this.activation)}
        setOutputAtIndex(index, value);
      }
    }
    `}},bs=class{constructor(e){this.variableNames=[],this.outputShape=[],this.uniforms="value : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="fill"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.size) {
        setOutputAtIndex(index, uniforms.value);
      }
    }
  `}};function U(e){const{backend:i,attrs:t}=e,{shape:s,value:a}=t;let{dtype:r}=t;if(r=r||u.util.inferDtype(a),r==="string"){const n=u.util.getArrayFromDType(r,u.util.sizeFromShape(s));return n.fill(a),i.makeTensorInfo(s,r,n)}else{const n=new bs(s),o=[{type:"float32",data:[a]}];return i.runWebGPUProgram(n,[],r,o)}}var ys={kernelName:u.Fill,backendName:"webgpu",kernelFunc:U};function $(e){const{inputs:i,attrs:t}=e,{x:s}=i,{shape:a}=t,r=u.util.sizeFromShape(s.shape),n=u.util.inferFromImplicitShape(a,r),o=u.util.sizeFromShape(n);return u.util.assert(r===o,()=>`The new shape (${n}) has ${o} elements and the old shape (${s.shape}) has ${r} elements. The new shape and old shape must have the same number of elements.`),e.backend.incRef(s.dataId),{dataId:s.dataId,shape:n,dtype:s.dtype}}var Ss={kernelName:u.Reshape,backendName:"webgpu",kernelFunc:$};function Re({a:e,b:i,transposeA:t,transposeB:s,backend:a,bias:r=null,preluActivationWeights:n=null,leakyreluAlpha:o=0,activation:l=null}){const d=e.shape.length,h=i.shape.length,p=t?e.shape[d-2]:e.shape[d-1],c=s?i.shape[h-1]:i.shape[h-2],m=t?e.shape[d-1]:e.shape[d-2],f=s?i.shape[h-2]:i.shape[h-1],g=e.shape.slice(0,-2),x=i.shape.slice(0,-2),v=u.util.sizeFromShape(g),C=u.util.sizeFromShape(x),b=u.broadcast_util.assertAndGetBroadcastShape(e.shape.slice(0,-2),i.shape.slice(0,-2)).concat([m,f]);u.util.assert(p===c,()=>`Error in matMul: inner shapes (${p}) and (${c}) of Tensors with shapes ${e.shape} and ${i.shape} and transposeA=${t} and transposeB=${s} must match.`);const y=t?[v,p,m]:[v,m,p],S=s?[C,f,c]:[C,c,f],P=$({inputs:{x:e},backend:a,attrs:{shape:y}}),N=$({inputs:{x:i},backend:a,attrs:{shape:S}}),D=[P,N],E=Math.max(v,C),T=[P,N],L=[{type:"int32",data:[m]},{type:"int32",data:[f]},{type:"int32",data:[p]}];let W,H;const M=[E,m,f];let O=(0,u.env)().get("WEBGPU_MATMUL_PROGRAM_TYPE");if(O<0){const ce=(0,u.env)().getNumber("WEBGPU_THRESHOLD_TO_INCREASE_WORKGROUPS_FOR_MATMUL"),be=ce>0?ce:a.thresholdToIncreaseWorkgroups,ye=E*Math.ceil(m/32)*Math.ceil(f/32);ye<=be||m<=8&&ye<=be*2?E*m*f<=128?O=Q.MatMulReduceProgram:E===1&&c>=2e3?O=Q.MatMulSplitKProgram:O=Q.MatMulSmallOutputSizeProgram:O=Q.MatMulPackedProgram}switch(O){case Q.MatMulReduceProgram:W=new fs(M,t,s,r,l,n);break;case Q.MatMulSplitKProgram:if(H=U({backend:a,attrs:{shape:M,value:0,dtype:e.dtype}}),W=new vs(M,c,t,s),r||l){H=a.runWebGPUProgram(W,T,e.dtype,L,H);const be=new Cs(H.shape,r,l,n);let ye=null;const Ze=[H];r&&Ze.push(r),n&&Ze.push(n),l==="leakyrelu"&&(ye=[{type:"float32",data:[o]}],be.uniforms+=" alpha : f32,");const mi=a.runWebGPUProgram(be,Ze,H.dtype,ye);D.push(H);const Xp=$({inputs:{x:mi},backend:a,attrs:{shape:b}});D.push(mi);for(const Kp of D)a.disposeData(Kp.dataId);return Xp}break;case Q.MatMulSmallOutputSizeProgram:W=new xs(y,S,M,t,s,r,l,n);break;case Q.MatMulPackedProgram:const ce=a.adapterInfo.isIntel();W=new cs(y,M,t,s,r,l,n,ce);break;default:throw new Error(`Unsupported MatMulProgramType ${O}.`)}r&&T.push(r),n&&T.push(n),l==="leakyrelu"&&(L.push({type:"float32",data:[o]}),W.uniforms+=" alpha : f32,"),H=a.runWebGPUProgram(W,T,e.dtype,L,H);const Qe=$({inputs:{x:H},backend:a,attrs:{shape:b}});D.push(H);for(const ce of D)a.disposeData(ce.dataId);return Qe}function Is(e){const{inputs:i,backend:t,attrs:s}=e,{a,b:r,bias:n,preluActivationWeights:o}=i,{transposeA:l,transposeB:d,activation:h,leakyreluAlpha:p}=s;return Re({a,b:r,transposeA:l,transposeB:d,backend:t,bias:n,preluActivationWeights:o,leakyreluAlpha:p,activation:h})}var ks={kernelName:u._FusedMatMul,backendName:"webgpu",kernelFunc:Is},ht=class{constructor(e,i,t){this.variableNames=["AReal","AImag","BReal","BImag"],this.workgroupSize=[128,1,1],this.size=!0,this.outputShape=u.backend_util.assertAndGetBroadcastShape(i,t),this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey=`binaryOpComplex_${e}`,this.op=e}getUserCode(){return`
      fn binaryOpComplex(
          areal : f32, aimag : f32, breal : f32, bimag : f32) -> f32 {
        ${Be(this.op,!1)}
      }

      ${k("index")} {
        if(index < uniforms.size) {
          let areal = getARealByOutputIndex(index);
          let aimag = getAImagByOutputIndex(index);
          let breal = getBRealByOutputIndex(index);
          let bimag = getBImagByOutputIndex(index);
          setOutputAtIndex(index, binaryOpComplex(areal, aimag, breal, bimag));
        }
      }
    `}},Pe=class{constructor(e,i,t){if(this.size=!0,this.variableNames=["A","B"],this.outputShape=u.backend_util.assertAndGetBroadcastShape(i,t),this.dispatchLayout=R(this.outputShape),this.op=e,this.useSharedMemoryWithA=i.length<=1&&t.length>1&&i[0]<128,this.useSharedMemoryWithB=t.length<=1&&i.length>1&&t[0]<128,this.useSharedMemoryWithA||this.useSharedMemoryWithB)this.outputComponent=1,this.variableComponents=[1,1],this.lastDimensionSize=this.useSharedMemoryWithB?t[0]:i[0],this.shaderKey=`binary_${e}_${this.lastDimensionSize}`,this.type="shared",this.workgroupSize=[256,1,1];else{const s=i.length>0&&i[i.length-1]%4===0,a=t.length>0&&t[t.length-1]%4===0;s&&a?(this.outputComponent=4,this.variableComponents=[4,4]):s&&(u.util.isScalarShape(t)||t[t.length-1]===1)||a&&(u.util.isScalarShape(i)||i[i.length-1]===1)?(this.outputComponent=4,this.variableComponents=s?[4,1]:[1,4]):(this.outputComponent=1,this.variableComponents=[1,1]),this.type="nonshared",this.shaderKey=`binary_${e}_${this.variableComponents}`,this.workgroupSize=[128,1,1]}this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.outputComponent,1,1])}getUserCode(){let e;const i=this.outputComponent===4?"vec4<f32>":"f32",t=`
    fn binaryOperation(a : ${i}, b : ${i}) -> ${i} {
      ${Be(this.op,this.outputComponent===4)}
    };
    `;if(this.type==="shared"){const s=this.lastDimensionSize>1?`coords[${this.outputShape.length-1}]`:"0",a=this.useSharedMemoryWithB?`let a = getAByOutputIndex(index);
          let b = sharedBuf[${s}];`:`let a = sharedBuf[${s}];
          let b = getBByOutputIndex(index);`;e=`
        ${t}
        var<workgroup> sharedBuf : array<f32, ${this.lastDimensionSize}>;
        ${k("index")} {
          // Fill in the shared memory buffer.
          let localIndex = i32(localId.x);
          if(localIndex < ${this.lastDimensionSize}) {
            sharedBuf[localIndex] = f32(${this.useSharedMemoryWithB?"B":"A"}[localIndex]);
          }
          workgroupBarrier();

          if(index < uniforms.size) {
            let coords = getCoordsFromIndex(index);
            ${a}
            setOutputAtIndex(index, binaryOperation(a, b));
          }
        }
        `}else e=`
       ${t}
       ${k("index")} {
         if (index < uniforms.size) {
           let coords = getCoordsFromIndex(index * ${this.outputComponent});
           let a = ${i}(getAByOutputCoords(coords));
           let b = ${i}(getBByOutputCoords(coords));
           setOutputAtIndex(index, binaryOperation(a, b));
         }
       }
       `;return e}};function q(e){const{inputs:i}=e,{x:t}=i;return e.backend.incRef(t.dataId),{dataId:t.dataId,shape:t.shape,dtype:t.dtype}}var ws={kernelName:u.Identity,backendName:"webgpu",kernelFunc:q};function ne(e){const{inputs:i,backend:t}=e,{real:s,imag:a}=i,r=t.makeTensorInfo(s.shape,"complex64"),n=t.tensorMap.get(r.dataId);return n.complexTensorInfos={real:q({inputs:{x:s},backend:t}),imag:q({inputs:{x:a},backend:t})},r}var Rs={kernelName:u.Complex,backendName:"webgpu",kernelFunc:ne},le=class{constructor(e,i,t=""){this.variableNames=["A"],this.size=!0;const s=128;this.workgroupSize=[s,1,1],this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.op=i,t!==""&&(this.uniforms=t),this.shaderKey=`unary_${i}`}getUserCode(){return`
      fn unaryOperation(a : f32) -> f32 {
        ${se(this.op,!1)}
      }
      ${k("index")} {
        if (index < uniforms.size) {
          let a = getAByOutputIndex(index);
          setOutputAtIndex(index, unaryOperation(a));
        }
      }
      `}};function F({opType:e,cpuKernelImpl:i,dtype:t}){return({inputs:s,backend:a})=>{const{x:r}=s,n=a,o=t||r.dtype;if(n.shouldExecuteOnCPU([r])&&i!=null){const d=i(n.tensorMap.get(r.dataId).values,o);return n.makeTensorInfo(r.shape,o,d)}const l=new le(r.shape,e);return n.runWebGPUProgram(l,[r],o)}}function V({opType:e,cpuKernelImpl:i,supportsComplex:t=!1,dtype:s}){return({inputs:a,backend:r})=>{const{a:n,b:o}=a,l=r;if(t&&n.dtype==="complex64"){const p=l.tensorMap.get(n.dataId),c=l.tensorMap.get(o.dataId);let m,f;if(e!==z.MUL)[m,f]=[[p.complexTensorInfos.real,c.complexTensorInfos.real],[p.complexTensorInfos.imag,c.complexTensorInfos.imag]].map(x=>{const[v,C]=x,b={dataId:v.dataId,dtype:v.dtype,shape:n.shape},y={dataId:C.dataId,dtype:C.dtype,shape:o.shape},S=new Pe(e,n.shape,o.shape);return l.runWebGPUProgram(S,[b,y],(0,u.upcastType)(v.dtype,C.dtype))});else{const x=new ht(z.COMPLEX_MULTIPLY_REAL,n.shape,o.shape),v=new ht(z.COMPLEX_MULTIPLY_IMAG,n.shape,o.shape),C=[{dataId:p.complexTensorInfos.real.dataId,dtype:p.complexTensorInfos.real.dtype,shape:n.shape},{dataId:p.complexTensorInfos.imag.dataId,dtype:p.complexTensorInfos.imag.dtype,shape:n.shape},{dataId:c.complexTensorInfos.real.dataId,dtype:c.complexTensorInfos.real.dtype,shape:o.shape},{dataId:c.complexTensorInfos.imag.dataId,dtype:c.complexTensorInfos.imag.dtype,shape:o.shape}];m=l.runWebGPUProgram(x,C,"float32"),f=l.runWebGPUProgram(v,C,"float32")}const g=ne({inputs:{real:m,imag:f},backend:l});return l.disposeData(m.dataId),l.disposeData(f.dataId),g}const d=s||(0,u.upcastType)(n.dtype,o.dtype);if((n.dtype==="string"||o.dtype==="string"||l.shouldExecuteOnCPU([n,o]))&&i!=null){const p=l.tensorMap.get(n.dataId).values,c=l.tensorMap.get(o.dataId).values,m=n.dtype==="string"?u.backend_util.fromUint8ToStringArray(p):p,f=n.dtype==="string"?u.backend_util.fromUint8ToStringArray(c):c,[g,x]=i(n.shape,o.shape,m,f,d);return l.makeTensorInfo(x,d,g)}const h=new Pe(e,n.shape,o.shape);return l.runWebGPUProgram(h,[n,o],d)}}function pt(e,i){Array.isArray(e)||(e=[e]),e.forEach(t=>{t!=null&&u.util.assert(t.dtype!=="complex64",()=>`${i} does not support complex64 tensors in the CPU backend.`)})}function Ps(e){const i=new Float32Array(e.length);for(let t=0;t<e.length;++t)i[t]=Math.abs(e[t]);return i}function G(e){return(i,t,s,a,r)=>{const n=u.backend_util.assertAndGetBroadcastShape(i,t),o=n.length,l=u.util.computeStrides(n),d=u.util.sizeFromShape(n),h=u.util.getTypedArrayFromDType(r,d),p=i.length,c=t.length,m=u.util.computeStrides(i),f=u.util.computeStrides(t),g=u.backend_util.getBroadcastDims(i,n),x=u.backend_util.getBroadcastDims(t,n);if(g.length+x.length===0)for(let v=0;v<h.length;++v)h[v]=e(s[v%s.length],a[v%a.length]);else for(let v=0;v<h.length;++v){const C=u.util.indexToLoc(v,o,l),b=C.slice(-p);g.forEach(N=>b[N]=0);const y=u.util.locToIndex(b,p,m),S=C.slice(-c);x.forEach(N=>S[N]=0);const P=u.util.locToIndex(S,c,f);h[v]=e(s[y],a[P])}return[h,n]}}function Ve(e){const{inputs:i,backend:t}=e,{real:s,imag:a}=i,r=t.data.get(s.dataId).values,n=t.data.get(a.dataId).values,o=t.makeTensorInfo(s.shape,"complex64"),l=t.data.get(o.dataId);return l.complexTensorInfos={real:t.makeTensorInfo(s.shape,"float32",r),imag:t.makeTensorInfo(a.shape,"float32",n)},o}function Me(e,i,t="float32"){if(t==="complex64"){const a=Me(e,i,"float32"),r=Me(e,i,"float32");return Ve({inputs:{real:a,imag:r},backend:e})}const s=u.util.makeZerosTypedArray(u.util.sizeFromShape(i),t);return e.makeTensorInfo(i,t,s)}function ct(e){const{inputs:i,backend:t}=e,{x:s}=i;return t.incRef(s.dataId),{dataId:s.dataId,shape:s.shape,dtype:s.dtype}}function $s(e){const{inputs:i,backend:t}=e,{input:s}=i,a=t.data.get(s.dataId).complexTensorInfos.real,r=t.data.get(a.dataId).values;return t.makeTensorInfo(a.shape,a.dtype,r)}function mt(e,i,t,s){if(s==="int32")return[i,"int32",Int32Array.from(e)];if(s==="bool"){const a=u.util.toTypedArray([0],t),[r,n]=G((o,l)=>o!==l?1:0)(i,[],e,a,"bool");return[n,"bool",r]}throw new Error(`Error in Cast: failed to cast ${t} to ${s}`)}function $e(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{dtype:r}=s;if(r==="complex64"){if(a.dtype==="complex64")return ct({inputs:{x:a},backend:t});const h=Me(t,a.shape,a.dtype),p=$e({inputs:{x:a},backend:t,attrs:{dtype:"float32"}}),c=Ve({inputs:{real:p,imag:h},backend:t});return t.disposeIntermediateTensorInfo(h),t.disposeIntermediateTensorInfo(p),c}if(a.dtype==="complex64"){const h=$s({inputs:{input:a},backend:t}),p=$e({inputs:{x:h},backend:t,attrs:{dtype:r}});return t.disposeIntermediateTensorInfo(h),p}if(!u.util.hasEncodingLoss(a.dtype,r)){const h=ct({inputs:{x:a},backend:t});return{dataId:h.dataId,shape:h.shape,dtype:r}}const n=t.data.get(a.dataId).values,[o,l,d]=mt(n,a.shape,a.dtype,r);return t.makeTensorInfo(o,l,d)}function X(e,i,t,s){return t==null?({inputs:a,backend:r})=>{const{a:n,b:o}=a,l=r;pt([n,o],e);const d=l.data.get(n.dataId).values,h=l.data.get(o.dataId).values,p=n.dtype==="string"?u.backend_util.fromUint8ToStringArray(d):d,c=n.dtype==="string"?u.backend_util.fromUint8ToStringArray(h):h,m=s||n.dtype,[f,g]=i(n.shape,o.shape,p,c,m);return l.makeTensorInfo(g,m,f)}:({inputs:a,backend:r})=>{const{a:n,b:o}=a,l=r;if(n.dtype==="complex64"||o.dtype==="complex64"){const d=$e({inputs:{x:n},backend:l,attrs:{dtype:"complex64"}}),h=l.data.get(d.dataId),p=h.complexTensorInfos.real,c=h.complexTensorInfos.imag,m=l.data.get(p.dataId).values,f=l.data.get(c.dataId).values,g=$e({inputs:{x:o},backend:l,attrs:{dtype:"complex64"}}),x=l.data.get(g.dataId),v=x.complexTensorInfos.real,C=x.complexTensorInfos.imag,b=l.data.get(v.dataId).values,y=l.data.get(C.dataId).values,[S,P,N]=t(n.shape,o.shape,m,f,b,y),D=l.makeTensorInfo(N,"float32",S),E=l.makeTensorInfo(N,"float32",P),T=Ve({inputs:{real:D,imag:E},backend:l});return l.disposeIntermediateTensorInfo(d),l.disposeIntermediateTensorInfo(g),l.disposeIntermediateTensorInfo(D),l.disposeIntermediateTensorInfo(E),T}else{const d=l.data.get(n.dataId).values,h=l.data.get(o.dataId).values,p=s||n.dtype,[c,m]=i(n.shape,o.shape,d,h,p);return l.makeTensorInfo(m,p,c)}}}function Oe(e){return(i,t,s,a,r,n)=>{const o=u.backend_util.assertAndGetBroadcastShape(i,t),l=u.util.sizeFromShape(o),d=o.length,h=u.util.computeStrides(o),p=u.util.getTypedArrayFromDType("float32",l),c=u.util.getTypedArrayFromDType("float32",l),m=u.backend_util.getBroadcastDims(i,o),f=u.backend_util.getBroadcastDims(t,o),g=u.backend_util.mergeRealAndImagArrays(s,a),x=u.backend_util.mergeRealAndImagArrays(r,n),v=i.length,C=u.util.computeStrides(i),b=t.length,y=u.util.computeStrides(t);if(m.length+f.length===0)for(let S=0;S<p.length;S++){const P=S%g.length,N=S%x.length,D=e(g[P*2],g[P*2+1],x[N*2],x[N*2+1]);p[S]=D.real,c[S]=D.imag}else for(let S=0;S<p.length;S++){const P=u.util.indexToLoc(S,d,h),N=P.slice(-v);m.forEach(W=>N[W]=0);const D=u.util.locToIndex(N,v,C),E=P.slice(-b);f.forEach(W=>E[W]=0);const T=u.util.locToIndex(E,b,y),L=e(g[D*2],g[D*2+1],x[T*2],x[T*2+1]);p[S]=L.real,c[S]=L.imag}return[p,c,o]}}var ft=G(((e,i)=>e+i)),Ds=Oe(((e,i,t,s)=>({real:e+t,imag:i+s}))),Yp=X(u.Add,ft,Ds);function Ns(e,i,t,s,a){const r=u.util.sizeFromShape(s),n=u.util.makeZerosTypedArray(a,t);for(let o=0;o<e.length;o++){const l=e[o];if(l<0)throw new Error("Input x must be non-negative!");l>=a||(r>0?n[l]+=i[o]:n[l]+=1)}return n}function zs(e,i,t,s=!1){const a=e.shape[0],r=e.shape[1],n=(0,u.buffer)([a,t],i.dtype);for(let o=0;o<a;o++)for(let l=0;l<r;l++){const d=e.get(o,l);if(d<0)throw new Error("Input x must be non-negative!");d>=t||(s?n.set(1,o,d):i.size>0?n.set(n.get(o,d)+i.get(o,l),o,d):n.set(n.get(o,d)+1,o,d))}return n}var gt=G(((e,i)=>e&i)),Qp=X(u.BitwiseAnd,gt);function Z(e){return(i,t,s)=>{const a=u.util.getArrayFromDType(t,i.length);for(let r=0;r<i.length;++r)a[r]=e(i[r],s);return a}}function xt(e,i,t){return te(e,Z(i),t)}function te(e,i,t){return({inputs:s,attrs:a,backend:r})=>{const{x:n}=s;pt(n,e);const o=r,l=o.data.get(n.dataId).values;let d;if(n.dtype==="string"){if(!Array.isArray(l))throw new Error("String tensor's value was not an instance of Array");d=u.backend_util.fromUint8ToStringArray(l)}else d=l;const h=t||n.dtype,p=i(d,h,a);return o.makeTensorInfo(n.shape,h,p)}}var vt=Z(e=>Math.ceil(e)),Zp=te(u.Ceil,vt);function As(e,i,t,s){const a=u.util.getArrayFromDType(t,u.util.sizeFromShape(i));if(s&&t!=="string"){let r=0;e.forEach(n=>{const o=u.util.sizeFromShape(n.shape);a.set(n.vals,r),r+=o})}else{let r=0;e.forEach(n=>{const o=t==="string"?u.backend_util.fromUint8ToStringArray(n.vals):n.vals;let l=0;for(let d=0;d<n.shape[0];++d){const h=d*i[1]+r;for(let p=0;p<n.shape[1];++p)a[h+p]=o[l++]}r+=n.shape[1]})}return a}var Ct=G((e,i)=>e===i?1:0),Jp=X(u.Equal,Ct,null,"bool"),bt=Z(e=>Math.exp(e)),jp=te(u.Exp,bt,"float32"),yt=Z(e=>Math.expm1(e)),_p=te(u.Expm1,yt),St=Z(e=>Math.floor(e)),ec=te(u.Floor,St),It=G((e,i)=>Math.floor(e/i)),tc=X(u.FloorDiv,It,null,"int32");function Fs(e,i,t,s,a,r,n,o,l){const d=(0,u.buffer)([s,r],t);for(let h=0;h<s;h++){const p=[];let c=0;for(let m=0;m<a;m++){const f=e[h*a+m];c+=f*n[m],p.push(f)}if(c<0||c>=l/r)throw new Error(`Invalid indices: ${p} does not index into ${o}`);for(let m=0;m<r;m++)d.values[h*r+m]=i.get(...i.indexToLoc(c*r+m))}return d}function Es(e,i,t){const s=(0,u.buffer)(t,e.dtype);for(let a=0;a<s.size;++a){const r=s.indexToLoc(a).slice(),n=r[0],o=r[2],l=i.locToIndex([n,o]);r[2]=i.values[l];const d=e.locToIndex(r);0<=d&&d<e.values.length&&(s.values[a]=e.values[d])}return s}var kt=G((e,i)=>e>i?1:0),ic=X(u.Greater,kt,null,"bool"),wt=G((e,i)=>e>=i?1:0),ac=X(u.GreaterEqual,wt,null,"bool"),Rt=G((e,i)=>e<i?1:0),sc=X(u.Less,Rt,null,"bool"),Pt=G((e,i)=>e<=i?1:0),rc=X(u.LessEqual,Pt,null,"bool");function Ts(e,i,t){const s=(i-e)/(t-1),a=u.util.makeZerosTypedArray(t,"float32");a[0]=e;for(let r=1;r<a.length;r++)a[r]=a[r-1]+s;return a}var $t=Z(e=>Math.log(e)),nc=te(u.Log,$t);function Ls(e,i,t,s){const a=u.util.getTypedArrayFromDType(s,u.util.sizeFromShape(t));for(let r=0;r<a.length;++r){const n=r*i;let o=e[n];for(let l=0;l<i;++l){const d=e[n+l];(Number.isNaN(d)||d>o)&&(o=d)}a[r]=o}return a}var Dt=G(((e,i)=>Math.max(e,i))),oc=X(u.Maximum,Dt),Nt=G(((e,i)=>Math.min(e,i))),uc=X(u.Minimum,Nt),Ue=G(((e,i)=>e*i)),Bs=Oe(((e,i,t,s)=>({real:e*t-i*s,imag:e*s+i*t}))),lc=X(u.Multiply,Ue,Bs);function Ws(e,i,t){const s=u.util.createScalarValue(-1,t);return Ue([],i,s,e,t)}var zt=G(((e,i)=>e!==i?1:0)),dc=X(u.NotEqual,zt,null,"bool");function Vs(e,i,t,s,a){const r=i.length,n=u.util.sizeFromShape(i),o=u.util.computeStrides(i),l=u.util.computeStrides(a),d=u.util.getTypedArrayFromDType(t,u.util.sizeFromShape(a));for(let h=0;h<n;++h){const p=u.util.indexToLoc(h,r,o),c=new Array(p.length);for(let f=0;f<c.length;f++)c[f]=p[s[f]];const m=u.util.locToIndex(c,r,l);d[m]=e[h]}return d}function Ms(e,i,t,s){const[a,r]=u.backend_util.computeOutAndReduceShapes(e,s),n=(0,u.upcastType)(i,"int32"),o=u.util.makeZerosTypedArray(u.util.sizeFromShape(a),n),l=u.util.sizeFromShape(r);for(let d=0;d<o.length;++d){const h=d*l;let p=1;for(let c=0;c<l;++c)p*=t[h+c];o[d]=p}return{outVals:o,outShape:a,outDtype:n}}function Os(e,i,t){e.forEach((s,a)=>{if(s<0||s>=t){const r=u.util.indexToLoc(a,i.length,u.util.computeStrides(i)).join(",");throw new Error(`indices[${r}] = ${s} is not in [0, ${t})`)}})}function Us(e,i){for(let t=0;t<e.length;++t){const s=e[t],a=t===e.length-1?i:e[t+1].length;if(s.length===0)throw new Error("Ragged splits may not be empty");if(s[0]<0)throw new Error("Ragged splits must be non-negative");if(s[s.length-1]>a)throw new Error("Ragged splits must not point past values");for(let r=1;r<s.length;++r)if(s[r-1]>s[r])throw new Error("Ragged splits must be sorted in ascending order")}}function Gs(e,i,t,s){const a=[];let r=0;const n=i.length-1+t.length,o=new Array(n).fill(null).map(()=>[0]);Us(t,s);let l=1;for(let d=0;d<i.length-1;++d){l*=i[d];const h=i[d+1];for(let p=1;p<l+1;++p)o[d].push(p*h)}for(let d=0;d<e.length;++d){let h=e[d],p=e[d]+1;for(let c=0;c<t.length;++c){const m=t[c],f=c+i.length-1;if(f>=0){const g=o[f],x=g[g.length-1]-m[h];for(let v=h;v<p;++v)o[f].push(m[v+1]+x)}h=m[h],p=m[p]}p!==h&&(a.push([h,p]),r+=p-h)}return{outSplits:o,valueSlices:a,numValues:r}}function Hs(e){const i=[];for(let t=0;t<e.length;++t){const s=e[t].length,a=u.util.getArrayFromDType("int32",s);i.push(a),e[t].forEach((r,n)=>a[n]=r)}return i}function At(e,i){const t=e.slice(0,i);for(;t.length<i;)t.push(1);for(let s=i;s<e.length;s++)t[i-1]*=e[s];return t}function qs(e,i,t,s,a,r){const n=At(i,2)[1],o=At(r,2)[1];let l=0;for(const d of t)for(let h=d[0];h<d[1];++h){for(let p=0;p<s;++p)a[l*o+p]=e[h*n+p];++l}}function Xs(e,i,t,s,a){const r=i.slice();r[0]=a;const n=u.util.getArrayFromDType(t,u.util.sizeFromShape(r)),o=e.length;return qs(e,i,s,o===0?0:o/i[0],n,r),[n,r]}function Ks(e,i,t,s,a,r,n,o){if(e.length===0)throw new Error("paramsNestedSplits must be non empty");if(i[0].length===0)throw new Error("Split tensors must not be scalars");if(Os(r,n,i[0][0]-1),s.length===0)throw new Error("params.rank must be nonzero");const l=s[0],{outSplits:d,valueSlices:h,numValues:p}=Gs(r,n,e,l),c=Hs(d),m=Xs(t,s,a,h,p);return[c,m[0],m[1]]}var Ft=2147483647;function Ys(e,i,t,s,a,r,n){if(i.length>1)throw new Error("starts must be a scalar or vector");if(a.length>1)throw new Error("limits must be a scalar or vector");if(n.length>1)throw new Error("deltas must be a scalar or vector");const o=i.length===0,l=a.length===0,d=n.length===0,h=[];o||h.push(i[0]),l||h.push(a[0]),d||h.push(n[0]);for(let x=1;x<h.length;++x)if(h[x]!==h[x-1])throw new Error("starts, limits, and deltas must have the same shape");const p=h.length===0?1:h[0],c=u.util.getArrayFromDType("int32",p+1);c[0]=0;for(let x=0;x<p;++x){const v=o?e[0]:e[x],C=l?s[0]:s[x],b=d?r[0]:r[x];if(b===0)throw new Error("Requires delta != 0");let y;if(b>0&&C<v||b<0&&C>v)y=0;else if(y=Math.ceil(Math.abs((C-v)/b)),y>Ft)throw new Error(`Requires ((limit - start) / delta) <= ${Ft}`);c[x+1]=c[x]+y}const m=c[p],f=u.util.getArrayFromDType(t,m);let g=0;for(let x=0;x<p;++x){const v=c[x+1]-c[x];let C=o?e[0]:e[x];const b=d?r[0]:r[x];for(let y=0;y<v;++y)f[g++]=C,C+=b}return[c,f]}var Y=u.backend_util.RowPartitionType,Qs=class Je{constructor(i,t,s,a,r,n,o,l,d,h){this.shape=i,this.shapeShape=t,this.values=s,this.valuesShape=a,this.valuesDType=r,this.defaultValue=n,this.defaultValueShape=o,this.rowPartitionValues=l,this.rowPartitionValuesShapes=d,this.rowPartitionTypes=u.backend_util.getRowPartitionTypesHelper(h),this.raggedRank=u.backend_util.getRaggedRank(this.rowPartitionTypes)}getRowPartitionTypeByDimension(i){return this.rowPartitionTypes[0]===Y.FIRST_DIM_SIZE?this.rowPartitionTypes[i+1]:this.rowPartitionTypes[i]}getRowPartitionTensor(i){return this.rowPartitionTypes[0]===Y.FIRST_DIM_SIZE?this.rowPartitionValues[i+1]:this.rowPartitionValues[i]}getMaxWidth(i){const t=this.getRowPartitionTensor(i-1);switch(this.getRowPartitionTypeByDimension(i-1)){case Y.VALUE_ROWIDS:return Je.getMaxWidthValueRowID(t);case Y.ROW_SPLITS:return Je.getMaxWidthRowSplit(t);default:throw new Error(`Cannot handle partition type ${Y[this.getRowPartitionTypeByDimension(i-1)]}`)}}static getMaxWidthRowSplit(i){const t=i.length;if(t===0||t===1)return 0;let s=0;for(let a=0;a<t-1;++a){const r=i[a+1]-i[a];r>s&&(s=r)}return s}static getMaxWidthValueRowID(i){const t=i.length;if(t===0)return 0;let s=0,a=i[0],r=0;for(let n=1;n<t;++n){const o=i[n];o!==a&&(a=o,r=Math.max(n-s,r),s=n)}return Math.max(t-s,r)}tensorShapeFromTensor(i,t,s=!0){if(t.length===0){if(i[0]===-1)return[];throw new Error("The only valid scalar shape tensor is the fully unknown shape specified as -1.")}return Tt(i,s)}calculateOutputSize(i){const t=this.valuesShape,s=this.defaultValueShape;u.backend_util.validateDefaultValueShape(s,t);const a=this.tensorShapeFromTensor(this.shape,this.shapeShape),r=u.backend_util.combineRaggedTensorToTensorShapes(this.raggedRank,a,t);r[0]<0&&(r[0]=i);for(let n=1;n<=this.raggedRank;++n)r[n]<0&&(r[n]=this.getMaxWidth(n));return r}calculateFirstParentOutputIndex(i,t,s){const a=Math.min(i,s),r=[];let n=0;for(let o=0;o<a;++o,n+=t)r.push(n);for(let o=a;o<i;++o)r.push(-1);return u.util.assert(r.length===i,()=>"Final length of result must be equal to firstDimension."),r}calculateOutputIndexRowSplit(i,t,s,a){const r=i.length,n=[];for(let o=0;o<r-1;++o){const l=i[o+1]-i[o];let d=Math.min(a,l),h=t[o];h===-1&&(d=0);for(let p=0;p<d;++p)n.push(h),h+=s;for(let p=0;p<l-d;++p)n.push(-1)}if(r>0&&n.length!==i[r-1])throw new Error("Invalid row split size.");return n}calculateOutputIndexValueRowID(i,t,s,a){const r=i.length,n=[];if(r===0)return[];let o=0,l=i[0];if(l>=t.length)throw new Error(`Got currentValueRowId=${l}, which is not less than ${t.length}`);let d=t[l];n.push(d);for(let h=1;h<r;++h){const p=i[h];if(p===l)d>=0&&(++o,o<a?d+=s:d=-1);else{if(o=0,l=p,p>=t.length)throw new Error(`Got nextValueRowId=${p} which is not less than ${t.length}`);d=t[p]}n.push(d)}if(n.length!==i.length)throw new Error("Invalid row ids.");return n}calculateOutputIndex(i,t,s,a){const r=this.getRowPartitionTensor(i),n=this.getRowPartitionTypeByDimension(i);switch(n){case Y.VALUE_ROWIDS:return this.calculateOutputIndexValueRowID(r,t,s,a);case Y.ROW_SPLITS:if(r.length-1>t.length)throw new Error(`Row partition size is greater than output size: ${r.length-1} > ${t.length}`);return this.calculateOutputIndexRowSplit(r,t,s,a);default:throw new Error(`Unsupported partition type: ${Y[n]}`)}}getFirstDimensionSize(){const i=this.rowPartitionValues[0];if(this.rowPartitionTypes.length===0)throw new Error("No row_partition_types given.");const t=this.rowPartitionTypes[0];switch(t){case Y.FIRST_DIM_SIZE:return i[0];case Y.VALUE_ROWIDS:throw new Error("Cannot handle VALUE_ROWIDS in first dimension.");case Y.ROW_SPLITS:return this.rowPartitionValuesShapes[0][0]-1;default:throw new Error(`Cannot handle type ${Y[t]}`)}}compute(){if(this.rowPartitionValues[0].length<=0)throw new Error("Invalid first partition input. Tensor requires at least one element.");const i=this.getFirstDimensionSize(),t=this.calculateOutputSize(i),s=new Array(this.raggedRank+1);s[s.length-1]=1;for(let n=s.length-2;n>=0;--n)s[n]=s[n+1]*t[n+1];const a=Tt(t,!1),r=u.util.getArrayFromDType(this.valuesDType,u.util.sizeFromShape(a));if(s[0]*t[0]>0){let n=this.calculateFirstParentOutputIndex(i,s[0],t[0]);for(let o=1;o<=this.raggedRank;++o)n=this.calculateOutputIndex(o-1,n,s[o],t[o]);this.setOutput(this.raggedRank,n,r,a)}return[a,r]}setOutput(i,t,s,a){if(s.length===0)return;const r=this.values,n=s;let o=a.slice();o=o.slice(i+1);const l=u.util.sizeFromShape(o),d=t.length;let h=this.defaultValue;if(h.length!==l&&h.length!==1){const f=this.defaultValueShape;(0,u.tidy)(()=>{const g=(0,u.reshape)(h,f);h=(0,u.broadcastTo)(g,o).dataSync()})}let p=0,c=0,m=0;for(let f=0;f<=d;++f){let g=f<d?t[f]:-1;if(g===m){++m;continue}if(c<m){const x=r.subarray(p*l);Et(n.subarray(c*l),x,(m-c)*l)}if(f>=d){const x=s.length;g=Math.floor(x/l)}if(g>m)if(this.defaultValue.length===1)n.subarray(m*l,g*l).fill(this.defaultValue[0]),m=g;else for(;g>m;)Et(n.slice(m*l),h,l),++m;g<0?(p=f+1,c=m):(p=f,c=m,m=c+1)}}};function Et(e,i,t){for(let s=0;s<t;s++)e[s]=i[s]}function Tt(e,i){const t=[];for(let s of e){if(s<0){if(!i)throw new Error(`Dimension ${s} must be >= 0`);if(s<-1)throw new Error(`Dimension ${s} must be >= -1`);s=-1}t.push(s)}return t}function Zs(e,i,t,s,a,r,n,o,l,d){return new Qs(e,i,t,s,a,r,n,o,l,d).compute()}function Js(e,i,t,s){if(e===i||e<i&&t<0||i<e&&t>1)return u.util.makeZerosTypedArray(0,s);const a=Math.abs(Math.ceil((i-e)/t)),r=u.util.makeZerosTypedArray(a,s);i<e&&t===1&&(t=-1),r[0]=e;for(let n=1;n<r.length;n++)r[n]=r[n-1]+t;return r}var Lt=Z(e=>1/Math.sqrt(e)),hc=te(u.Rsqrt,Lt);function js(e,i,t,s,a,r,n,o,l,d){const h=[s/a,a],p=e.values,c=i.values;if(s===0)return(0,u.buffer)(t,i.dtype);const m=l instanceof u.TensorBuffer?l:(0,u.buffer)(h,i.dtype);typeof l=="string"||typeof l=="number"?m.values.fill(l):typeof l=="boolean"&&m.values.fill(+l);for(let f=0;f<r;f++){const g=[];let x=0;for(let v=0;v<n;v++){const C=p[f*n+v];g.push(C),x+=C*o[v]}if(x<0||x>=s/a)throw new Error(`Invalid indices: ${g} does not index into ${t}`);for(let v=0;v<a;v++)d?m.values[x*a+v]+=c[f*a+v]:m.values[x*a+v]=i.rank===0?c[0]:c[f*a+v]}return m}var _s=Z(e=>1/(1+Math.exp(-e))),pc=xt(u.Sigmoid,e=>1/(1+Math.exp(-e)));function er(e,i,t,s,a){const r=u.slice_util.isSliceContinous(s,i,t),n=u.util.sizeFromShape(t),o=u.util.computeStrides(s);if(r){const p=u.slice_util.computeFlatOffset(i,o);return a==="string"?e.slice(p,p+n):e.subarray(p,p+n)}const l=a==="string"?u.backend_util.fromUint8ToStringArray(e):e,d=(0,u.buffer)(s,a,l),h=(0,u.buffer)(t,a);for(let p=0;p<h.size;++p){const c=h.indexToLoc(p),m=c.map((f,g)=>f+i[g]);h.set(d.get(...m),...c)}return a==="string"?u.backend_util.fromStringArrayToUint8(h.values):h.values}function tr(e,i,t,s,a,r,n){const o=i[0],l=r[0],d=new Array(l),h=new Array(o),p=i[1];if(l===0){if(o!==0)throw new Error(u.backend_util.getSparseFillEmptyRowsIndicesDenseShapeMismatch(o));const x=u.util.getArrayFromDType(t,0),v=u.util.getArrayFromDType(a,0);return[x,[0,p],v,d,h]}let c=!0,m=0;const f=new Array(l).fill(0);for(let x=0;x<o;++x){const v=e[x*p];if(v<0)throw new Error(u.backend_util.getSparseFillEmptyRowsNegativeIndexErrorMessage(x,v));if(v>=l)throw new Error(u.backend_util.getSparseFillEmptyRowsOutOfRangeIndexErrorMessage(x,v,l));++f[v],c=c&&v>=m,m=v}let g=!0;for(let x=0;x<l;++x){const v=f[x]===0;d[x]=v,g=g&&!v,f[x]=Math.max(f[x],1),x>0&&(f[x]+=f[x-1])}if(g&&c){const x=e,v=s;for(let C=0;C<o;++C)h[C]=C;return[x,[o,p],v,d,h]}else{const x=f[l-1],v=u.util.getArrayFromDType(t,x*p),C=u.util.getArrayFromDType(a,x),b=new Array(l).fill(0);for(let y=0;y<o;++y){const S=e[y*p],P=b[S],N=(S===0?0:f[S-1])+P;b[S]++;for(let D=0;D<p;++D)v[N*p+D]=e[y*p+D];C[N]=s[y],h[y]=N}for(let y=0;y<l;++y)if(b[y]===0){const S=y===0?0:f[y-1];v[S*p+0]=y;for(let P=1;P<p;++P)v[S*p+P]=0;C[S]=n}return[v,[x,p],C,d,h]}}function ir(e,i,t,s,a){const r=u.util.sizeFromShape(s),n=i[0],o=a.length,l=[];let d=1,h=-1;for(let g=0;g<o;++g){const x=a[g];if(x===-1){if(h!==-1)throw new Error(u.backend_util.getSparseReshapeMultipleNegativeOneOutputDimErrorMessage(h,g));h=g,l.push(1)}else{if(x<0)throw new Error(u.backend_util.getSparseReshapeNegativeOutputDimErrorMessage(g,x));d*=x,l.push(x)}}if(h!==-1){if(d<=0)throw new Error(u.backend_util.getSparseReshapeEmptyTensorZeroOutputDimErrorMessage());const g=Math.trunc(r/d);if(d*g!==r)throw new Error(u.backend_util.getSparseReshapeInputOutputMultipleErrorMessage(s,l));l[h]=g}if(u.util.sizeFromShape(l)!==r)throw new Error(u.backend_util.getSparseReshapeInputOutputMismatchErrorMessage(s,l));const p=s.length,c=[];if(p>0){c[p-1]=1;for(let g=p-2;g>=0;--g)c[g]=c[g+1]*s[g+1]}const m=[];if(o>0){m[o-1]=1;for(let g=o-2;g>=0;--g)m[g]=m[g+1]*l[g+1]}const f=u.util.getArrayFromDType(t,n*o);for(let g=0;g<n;++g){let x=0;for(let v=0;v<p;++v)x+=e[g*p+v]*c[v];for(let v=0;v<o;++v)f[g*o+v]=Math.trunc(x/m[v]),x%=m[v]}return[f,[n,o],l]}function ar(e,i,t,s,a,r=!1,n=0){const o=s.length,l=[i[0],e.length/i[0]],d=l[1],h=o>0?a[o-1]+1:0;if(h<0)throw new Error(u.backend_util.getSparseSegmentReductionNegativeSegmentIdsErrorMessage());const p=i.slice();p[0]=h;const c=p.reduce((C,b)=>C*b,1),m=u.util.getArrayFromDType(t,c);if(o===0)return h>0&&m.fill(n),[m,p];if(h<=0)throw new Error(u.backend_util.getSparseSegmentReductionNegativeSegmentIdsErrorMessage());let f=0,g=1,x=0,v=a[f];for(;;){let C=0;if(g<o){if(C=a[g],v===C){++g;continue}if(v>=C)throw new Error(u.backend_util.getSparseSegmentReductionNonIncreasingSegmentIdsErrorMessage())}if(v<0||v>=h)throw new Error(u.backend_util.getSparseSegmentReductionSegmentIdOutOfRangeErrorMessage(v,h));v>x&&m.fill(n,x*d,v*d);for(let b=f;b<g;++b){const y=s[b];if(y<0||y>=l[0])throw new Error(u.backend_util.getSparseSegmentReductionIndicesOutOfRangeErrorMessage(b,s[b],l[0]));for(let S=0;S<d;S++)m[v*d+S]+=e[y*d+S]}if(r)for(let b=0;b<d;b++)m[v*d+b]/=g-f;if(f=g,++g,x=v+1,v=C,g>o)break}return x<h&&m.fill(n,x*d,h*d),[m,p]}var sr=Z(e=>Math.sqrt(e)),cc=xt(u.Sqrt,e=>Math.sqrt(e)),Bt=G(((e,i)=>{const t=e-i;return t*t})),mc=X(u.SquaredDifference,Bt),Wt=Z((e,i)=>{const{pattern:t,replaceGlobal:s,rewrite:a}=i;return e.replace(new RegExp(t,s?"g":""),a)}),fc=te(u.StaticRegexReplace,Wt);function rr(e,i,t,s){const a=(0,u.buffer)(e,i.dtype);for(let r=0;r<a.size;r++){const n=a.indexToLoc(r),o=new Array(n.length);for(let l=0;l<o.length;l++)o[l]=n[l]*t[l]+s[l];a.set(i.get(...o),...n)}return a}var nr=class{constructor(e,i,t,s,a,r){this.separator=u.util.encodeString(e),this.nGramWidths=i,this.leftPad=u.util.encodeString(t),this.rightPad=u.util.encodeString(s),this.padWidth=a,this.preserveShort=r}getPadWidth(e){return Math.min(this.padWidth<0?e-1:this.padWidth,e-1)}getNumNGrams(e,i){const t=this.getPadWidth(i);return Math.max(0,e+2*t-i+1)}createNGrams(e,i,t,s,a,r){for(let n=0;n<a;++n){const o=this.getPadWidth(r),l=Math.max(0,o-n),d=Math.max(0,o-(a-(n+1))),h=r-(l+d),p=i+(l>0?0:n-o);let c=0;c+=l*this.leftPad.length;for(let v=0;v<h;++v)c+=e[p+v].length;c+=d*this.rightPad.length;const m=l+d+h-1;c+=m*this.separator.length,t[s+n]=new Uint8Array(c);const f=t[s+n];let g=0;const x=v=>v.forEach(C=>f[g++]=C);for(let v=0;v<l;++v)x(this.leftPad),x(this.separator);for(let v=0;v<h-1;++v)x(e[p+v]),x(this.separator);if(h>0){x(e[p+h-1]);for(let v=0;v<d;++v)x(this.separator),x(this.rightPad)}else{for(let v=0;v<d-1;++v)x(this.rightPad),x(this.separator);x(this.rightPad)}}}compute(e,i){const t=e.length,s=i.length;if(s>0){let o=i[0];if(o!==0)throw new Error(`First split value must be 0, got ${o}`);for(let l=1;l<s;++l){let d=i[l]>=o;if(d=d&&i[l]<=t,!d)throw new Error(`Invalid split value ${i[l]}, must be in [${o}, ${t}]`);o=i[l]}if(o!==t)throw new Error(`Last split value must be data size. Expected ${t}, got ${o}`)}const a=s-1,r=u.util.getArrayFromDType("int32",s);if(t===0||s===0){const o=new Array(t);for(let l=0;l<=a;++l)r[l]=0;return[o,r]}r[0]=0;for(let o=1;o<=a;++o){const l=i[o]-i[o-1];let d=0;this.nGramWidths.forEach(h=>{d+=this.getNumNGrams(l,h)}),this.preserveShort&&l>0&&d===0&&(d=1),r[o]=r[o-1]+d}const n=new Array(r[a]);for(let o=0;o<a;++o){const l=i[o];let d=r[o];if(this.nGramWidths.forEach(h=>{const p=i[o+1]-i[o],c=this.getNumNGrams(p,h);this.createNGrams(e,l,n,d,c,h),d+=c}),this.preserveShort&&d===r[o]){const h=i[o+1]-i[o];if(h===0)continue;const p=h+2*this.padWidth;this.createNGrams(e,l,n,d,1,p)}}return[n,r]}};function or(e,i,t,s,a,r,n,o){return new nr(t,s,a,r,n,o).compute(e,i)}function ur(e,i,t,s){if(!e.length)return;if(i.length===0){for(let r=0;r<e.length;++r)s.push(e.subarray(r,r+1));return}if(i.length===1){const r=i[0];let n=e.indexOf(r);for(;n!==-1;){const o=e.subarray(0,n);(!t||o.length!==0)&&s.push(o),e=e.subarray(n+1),n=e.indexOf(r)}(!t||e.length!==0)&&s.push(e);return}let a=0;for(let r=0;r<e.length+1;r++)if(r===e.length||i.indexOf(e[r])!==-1){const n=e.subarray(a,r);(!t||n.length!==0)&&s.push(n),a=r+1}}function lr(e,i,t){const s=e.length,a=[];let r=0,n=0;const o=new Array(s);for(let c=0;c<s;++c){const m=a.length;ur(e[c],i,t,a);const f=a.length-m;o[c]=f,r+=f,n=Math.max(n,f)}const l=u.util.getArrayFromDType("int32",r*2),d=new Array(r),h=[s,n];let p=0;for(let c=0;c<s;++c)for(let m=0;m<o[c];++m)l[p*2]=c,l[p*2+1]=m,d[p]=a[p],++p;return[l,d,h]}function dr(e,i){const t=u.util.getArrayFromDType("int32",e.length);for(let s=0;s<e.length;++s)t[s]=u.util.fingerPrint64(e[s]).modulo(i).getLowBitsUnsigned();return t}var Vt=G(((e,i)=>e-i)),hr=Oe(((e,i,t,s)=>({real:e-t,imag:i-s}))),gc=X(u.Sub,Vt,hr);function pr(e,i){const t=new Array(e.rank);for(let a=0;a<t.length;a++)t[a]=e.shape[a]*i[a];const s=(0,u.buffer)(t,e.dtype);for(let a=0;a<s.values.length;++a){const r=s.indexToLoc(a),n=new Array(e.rank);for(let l=0;l<n.length;l++)n[l]=r[l]%e.shape[l];const o=e.locToIndex(n);s.values[a]=e.values[o]}return s}var me=(e,i)=>{const t=i.value-e.value;return t===0?e.index-i.index:t};function Mt(e,i,t=0,s=e.length-1){for(;s>t;){if(s-t>600){const o=s-t+1,l=i-t+1,d=Math.log(o),h=.5*Math.exp(2*d/3),p=.5*Math.sqrt(d*h*(o-h)/o)*Math.sign(l-o/2);Mt(e,i,Math.max(t,Math.floor(i-l*h/o+p)),Math.min(s,Math.floor(i+(o-l)*h/o+p)))}const a=e[i];let r=t,n=s;for(u.util.swap(e,t,i),me(e[s],a)>0&&u.util.swap(e,t,s);r<n;){for(u.util.swap(e,r,n),r++,n--;me(e[r],a)<0;)r=r+1;for(;me(e[n],a)>0;)n=n-1}me(e[t],a)===0?u.util.swap(e,t,n):(n=n+1,u.util.swap(e,n,s)),n<=i&&(t=n+1),i<=n&&(s=n-1)}}function cr(e,i,t,s,a){const r=i[i.length-1],[n,o]=[e.length/r,r],l=u.util.getTypedArrayFromDType(t,n*s),d=u.util.getTypedArrayFromDType("int32",n*s);for(let p=0;p<n;p++){const c=p*o,m=e.subarray(c,c+o);let f=new Array(m.length);m.forEach((C,b)=>f[b]={value:C,index:b}),s<f.length&&(Mt(f,s),f=f.slice(0,s)),a&&f.sort(me);const g=p*s,x=l.subarray(g,g+s),v=d.subarray(g,g+s);for(let C=0;C<s;C++)x[C]=f[C].value,v[C]=f[C].index}const h=i.slice();return h[h.length-1]=s,[(0,u.buffer)(h,t,l),(0,u.buffer)(h,"int32",d)]}function mr(e,i,t,s){const a=u.util.parseAxisParam(i,t)[0],r=[1,t[0],1];for(let f=0;f<a;f++)r[0]*=t[f];r[1]=t[a];for(let f=a+1;f<t.length;f++)r[2]*=t[f];const n=new Map,o=new Int32Array(t[a]),l=new u.TensorBuffer(r,s,e),d=[],h=r[0]===1&&r[2]===1;for(let f=0;f<t[a];f++){let g;if(h)g=e[f].toString();else{const v=[];for(let C=0;C<r[0];C++)for(let b=0;b<r[2];b++)v.push(l.get(C,f,b));g=v.join(",")}const x=n.get(g);if(x!=null)o[f]=x;else{const v=n.size;n.set(g,v),o[f]=v,d.push(f)}}const p=r.slice();p[1]=n.size;const c=new u.TensorBuffer(p,s);d.forEach((f,g)=>{for(let x=0;x<r[0];x++)for(let v=0;v<r[2];v++)c.set(l.get(x,f,v),x,g,v)});const m=t.slice();return m[a]=p[1],{outputValues:c.values,outputShape:m,indices:o}}var fr=_e({addImpl:()=>ft,bincountImpl:()=>Ns,bincountReduceImpl:()=>zs,bitwiseAndImpl:()=>gt,castImpl:()=>mt,ceilImpl:()=>vt,concatImpl:()=>As,equalImpl:()=>Ct,expImpl:()=>bt,expm1Impl:()=>yt,floorDivImpl:()=>It,floorImpl:()=>St,gatherNdImpl:()=>Fs,gatherV2Impl:()=>Es,greaterEqualImpl:()=>wt,greaterImpl:()=>kt,lessEqualImpl:()=>Pt,lessImpl:()=>Rt,linSpaceImpl:()=>Ts,logImpl:()=>$t,maxImpl:()=>Ls,maximumImpl:()=>Dt,minimumImpl:()=>Nt,multiplyImpl:()=>Ue,negImpl:()=>Ws,notEqualImpl:()=>zt,prodImpl:()=>Ms,raggedGatherImpl:()=>Ks,raggedRangeImpl:()=>Ys,raggedTensorToTensorImpl:()=>Zs,rangeImpl:()=>Js,rsqrtImpl:()=>Lt,scatterImpl:()=>js,sigmoidImpl:()=>_s,simpleAbsImpl:()=>Ps,sliceImpl:()=>er,sparseFillEmptyRowsImpl:()=>tr,sparseReshapeImpl:()=>ir,sparseSegmentReductionImpl:()=>ar,sqrtImpl:()=>sr,squaredDifferenceImpl:()=>Bt,staticRegexReplaceImpl:()=>Wt,stridedSliceImpl:()=>rr,stringNGramsImpl:()=>or,stringSplitImpl:()=>lr,stringToHashBucketFastImpl:()=>dr,subImpl:()=>Vt,tileImpl:()=>pr,topKImpl:()=>cr,transposeImpl:()=>Vs,uniqueImpl:()=>mr}),{addImpl:gr,castImpl:xr,ceilImpl:vr,concatImpl:Cr,equalImpl:br,expImpl:yr,expm1Impl:Sr,floorImpl:Ir,floorDivImpl:kr,gatherNdImpl:wr,gatherV2Impl:Rr,greaterEqualImpl:Pr,greaterImpl:$r,lessEqualImpl:Dr,lessImpl:Nr,logImpl:zr,maxImpl:Ar,maximumImpl:Fr,minimumImpl:Er,multiplyImpl:Tr,negImpl:Lr,notEqualImpl:Br,prodImpl:Wr,rangeImpl:Vr,rsqrtImpl:Mr,scatterImpl:Or,simpleAbsImpl:Ur,sliceImpl:Gr,stridedSliceImpl:Hr,stringNGramsImpl:qr,subImpl:Xr,tileImpl:Kr,topKImpl:Yr,transposeImpl:Qr,uniqueImpl:xc}=fr,Zr=F({opType:I.ABS,cpuKernelImpl:Ur}),Jr={kernelName:u.Abs,backendName:"webgpu",kernelFunc:Zr},jr=F({opType:I.ACOS}),_r={kernelName:u.Acos,backendName:"webgpu",kernelFunc:jr},en=F({opType:I.ACOSH}),tn={kernelName:u.Acosh,backendName:"webgpu",kernelFunc:en},an=V({opType:z.ADD,cpuKernelImpl:gr,supportsComplex:!0}),sn={kernelName:u.Add,backendName:"webgpu",kernelFunc:an},rn=class{constructor(e){this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e[0],this.variableNames=e.map((i,t)=>`T${t}`),this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.shaderKey="addN"}getUserCode(){const e=[];this.variableNames.forEach(t=>{e.push(`let v${t} = get${t}ByOutputCoords(coords);`)});const i=this.variableNames.map(t=>`v${t}`).join(" + ");return`
      ${k("index")} {
        for (var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let flatIndex = index * ${this.workPerThread} + i;
          if (flatIndex < uniforms.size) {
            let coords = getCoordsFromIndex(flatIndex);
            ${e.join(`
        `)}
            setOutputAtIndex(flatIndex, ${i});
          }
        }
      }
    `}};function nn(e){const{inputs:i,backend:t}=e,s=i;if(s.length===1)return q({inputs:{x:s[0]},backend:t});const a=s.map(o=>o.dtype).reduce((o,l)=>(0,u.upcastType)(o,l)),r=s.map(o=>o.shape),n=new rn(r);return t.runWebGPUProgram(n,s,a)}var on={kernelName:u.AddN,backendName:"webgpu",kernelFunc:nn},un=class{constructor(e,i){this.variableNames=["A"],this.workgroupSize=[16,16,1];const t=new Array(e.length);for(let s=0;s<t.length;s++)t[s]=e[i[s]];this.outputShape=t,this.dispatchLayout={x:[0],y:[1]},this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[1,1,1]),this.shaderKey="transposeShared"}getUserCode(){u.util.assert(this.workgroupSize[0]===this.workgroupSize[1],()=>`Must be a square tile, current tile shape is ${this.workgroupSize[0]} x ${this.workgroupSize[1]}`);const e=this.workgroupSize[0];return`
      var<workgroup> tile : array<array<f32, ${this.workgroupSize[0]+1}>, ${this.workgroupSize[0]}>;
      ${k()} {
        var x = i32(workgroupId.x) * ${e} + i32(localId.x);
        var y = i32(workgroupId.y) * ${e} + i32(localId.y);
        let width = uniforms.outShape[0];
        let height = uniforms.outShape[1];
        if (x < width && y < height) {
          tile[localId.y][localId.x] = f32(A[y * width + x]);
        }
        workgroupBarrier();

        x = i32(workgroupId.y) * ${e} + i32(localId.x);
        y = i32(workgroupId.x) * ${e} + i32(localId.y);
        if (x < height && y < width) {
          setOutputAtIndex((y * height + x), tile[localId.x]
            [localId.y]);
        }
      }
    `}},ln=class{constructor(e,i){this.variableNames=["A"],this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0;const t=new Array(e.length);for(let s=0;s<t.length;s++)t[s]=e[i[s]];this.outputShape=t,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.newDim=i,this.shaderKey=`transpose_${i}`}getUserCode(){const e=B(this.outputShape.length),i=Ot(this.newDim);return`
      ${k("index")} {
        for(var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let flatIndex = index * ${this.workPerThread} + i;
          if(flatIndex < uniforms.size) {
            let coords = getCoordsFromIndex(flatIndex);
            setOutputAtIndex(flatIndex, A[getIndexFromCoords${this.outputShape.length}D(
              ${e}(${i}), uniforms.aShape)]);
          }
        }
      }
    `}};function Ot(e){const i=e.length;if(i>6)throw Error(`Transpose for rank ${i} is not yet supported`);const t=new Array(i);for(let s=0;s<e.length;s++)t[e[s]]=`coords.${j(s)}`;return t.join()}function J(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{perm:r}=s,n=t,o=a.shape.length,l=new Array(o);for(let h=0;h<l.length;h++)l[h]=a.shape[r[h]];if(t.shouldExecuteOnCPU([a])){const h=n.tensorMap.get(a.dataId).values,p=Qr(h,a.shape,a.dtype,r,l);return t.makeTensorInfo(l,a.dtype,p)}if(a.shape.length===2&&u.util.arraysEqual(r,[1,0])){const h=new un(a.shape,r);return n.runWebGPUProgram(h,[a],a.dtype)}const d=new ln(a.shape,r);return n.runWebGPUProgram(d,[a],a.dtype)}var dn={kernelName:u.Transpose,backendName:"webgpu",kernelFunc:J},hn=class{constructor(e,i,t){this.variableNames=["x"],this.uniforms="reduceSize : i32,",this.size=!0,this.inputShape=[e.batchSize,e.inSize];const[s]=u.backend_util.computeOutAndReduceShapes(this.inputShape,[1]);this.outputShape=s.length===0?[1]:s,e.inSize>=32768&&t>=512?this.workgroupSize=[512,1,1]:e.inSize>=4096?this.workgroupSize=[256,1,1]:this.workgroupSize=[64,1,1],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,[1,1,1]),this.reduceType=i,this.shaderKey=`reduce_${i}`}getUserCode(){let e="",i="0.0";const t=this.workgroupSize[0];this.reduceType==="min"||this.reduceType==="max"?(e=`
         if (isnan(candidate)) {
          bestValue = uniforms.NAN;
         } else if (!isnan(bestValue) && candidate ${this.reduceType==="min"?"<":">"} bestValue)
           {  bestValue = candidate; }`,i="f32(x[offset])"):this.reduceType==="sum"||this.reduceType==="mean"?e=" bestValue = bestValue + candidate; ":this.reduceType==="prod"?(e=" bestValue = bestValue * candidate; ",i="1.0"):this.reduceType==="all"?(e=" bestValue = f32(bestValue >= 1.0 && candidate >= 1.0); ",i="1.0"):this.reduceType==="any"&&(e=" bestValue = f32(bestValue >= 1.0 || candidate >= 1.0); ",i="0.0");const s=this.reduceType==="mean"?"setOutputAtIndex(outputIndex, bestValue / f32(uniforms.reduceSize));":"setOutputAtIndex(outputIndex, bestValue);";return`
       fn DIV_CEIL(a : u32, b : u32) -> u32 {
        return ((a - 1u) / b + 1u);
       }

       ${`
         var<workgroup> xBestValues : array<f32, ${t}>;
       `}
       fn getOffset(outputIndex : i32) -> i32 {
         let outputCoords = getCoordsFromIndex(outputIndex);
         let offset = ${this.outputShape.length===1?"outputCoords":"outputCoords[0]"} * uniforms.reduceSize;
          return offset;
       }
       ${k("index")} {
         let outputIndex = index / ${t};
         let offset = getOffset(outputIndex);
         var bestValue = ${i};
         let Length = uniforms.reduceSize;
         let WorkPerThread = DIV_CEIL(u32(Length), ${t}u);
         for (var k = i32(localId.x); k < Length && outputIndex < uniforms.size;
             k = k + ${t}) {
           let candidate = f32(x[offset + k]);
           ${e}
         }
         xBestValues[localId.x] = bestValue;
         workgroupBarrier();

         var reduceSize = min(u32(Length), ${t}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (localId.x < currentSize) {
            let candidate = xBestValues[localId.x + interval];
            ${e}
            xBestValues[localId.x] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (localId.x == 0u && outputIndex < uniforms.size) {
          ${s}
        }
       }
     `}},pn={mean:"float32",all:"bool",any:"bool"};function oe(e,i,t,s,a){const r=e.shape.length,n=[],o=u.util.parseAxisParam(i,e.shape);let l=o;const d=u.backend_util.getAxesPermutation(l,r);let h=e;d!=null&&(h=J({inputs:{x:e},attrs:{perm:d},backend:a}),l=u.backend_util.getInnerMostAxes(l.length,r),n.push(h)),u.backend_util.assertAxesAreInnerMostDims(s,l,r);const[p,c]=u.backend_util.computeOutAndReduceShapes(h.shape,l);let m=p;t&&(m=u.backend_util.expandShapeToKeepDim(p,o));let f;if((s==="max"||s==="prod")&&a.shouldExecuteOnCPU([h])){const g=a.tensorMap.get(h.dataId).values;switch(s){case"max":const x=Ar(g,u.util.sizeFromShape(c),m,e.dtype);f=a.makeTensorInfo(m,e.dtype,x);break;case"prod":const{outVals:v,outShape:C,outDtype:b}=Wr(h.shape,h.dtype,g,l);f=a.makeTensorInfo(C,b,v);break;default:throw new Error(`${s} CPU implementation is not yet supported.`)}}else{const g=u.util.sizeFromShape(c),x={windowSize:g,inSize:g,batchSize:u.util.sizeFromShape(h.shape)/g,outSize:1},v=pn[s]||(0,u.sumOutType)(e.dtype),C=[{type:"int32",data:[g]}],b=new hn(x,s,a.device.limits.maxComputeWorkgroupSizeX),y=a.runWebGPUProgram(b,[h],v,C);n.push(y),f=$({inputs:{x:y},attrs:{shape:m},backend:a})}return n.forEach(g=>a.disposeData(g.dataId)),f}function cn(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{keepDims:r,axis:n}=s;return oe(a,n,r,"all",t)}var mn={kernelName:u.All,backendName:"webgpu",kernelFunc:cn};function fn(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{keepDims:r,axis:n}=s;return oe(a,n,r,"any",t)}var gn={kernelName:u.Any,backendName:"webgpu",kernelFunc:fn},Ut=class{constructor(e,i,t){this.workgroupSize=[64,1,1],this.variableNames=["x"],this.uniforms="infinityValue : f32,",this.size=!0;const s=[i];this.op=t==="min"?"<":">";const[a,r]=u.backend_util.computeOutAndReduceShapes(e,s);this.outputShape=a.length===0?[1]:a,this.dispatchLayout=R(this.outputShape),u.util.sizeFromShape(r)<32?(this.type="plain",this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize)):(this.type="shared",this.dispatch=w(this.dispatchLayout,this.outputShape,[1,1,1])),this.inputShape=e,this.shaderKey=`argMinMax_${this.op}_${this.type}`}getUserCode(){const e=this.workgroupSize[0],i=()=>this.inputShape.length===1?"uniforms.xShape":`uniforms.xShape.${j(this.inputShape.length-1)}`,t=()=>{let s="";if(this.outputShape.length===1)this.inputShape.length!==1&&(s+="outputCoords,");else for(let a=0;a<this.outputShape.length;a++)s+=`outputCoords.${j(a)},`;return s};return this.type==="shared"?`
      fn DIV_CEIL(a : u32, b : u32) -> u32 {
        return ((a - 1u) / b + 1u);
      }

      ${`
      var<workgroup> xBestIndices : array<i32, ${e}>;
      var<workgroup> xBestValues : array<f32, ${e}>;
    `}

      ${k("index")} {
        let outputIndex = index / ${e};
        let reduceLength = ${i()};

        var bestIndex = i32(localId.x);
        var bestValue = uniforms.infinityValue;
        let outputCoords = getCoordsFromIndex(outputIndex);
        for (var k = i32(localId.x); k < reduceLength && outputIndex < uniforms.size;
            k = k + ${e}) {
          let candidate = getX(${t()} k);
          if (!isnan(candidate) && candidate ${this.op} bestValue) {
            bestValue = candidate;
            bestIndex = k;
          }
        }
        xBestValues[localId.x] = bestValue;
        xBestIndices[localId.x] = bestIndex;
        workgroupBarrier();

        var reduceSize = min(u32(reduceLength), ${e}u);
        for (var currentSize = reduceSize / 2u; reduceSize > 1u;
            currentSize = reduceSize / 2u) {
          let interval = DIV_CEIL(reduceSize, 2u);
          if (localId.x < currentSize) {
            let candidate = xBestValues[localId.x + interval];
            if (candidate ${this.op} bestValue) {
              bestValue = candidate;
              xBestValues[localId.x] = bestValue;
              xBestIndices[localId.x] = xBestIndices[localId.x + interval];
            }
          }
          reduceSize = interval;
          workgroupBarrier();
        }

        if (localId.x == 0u && outputIndex < uniforms.size) {
          setOutputAtIndexI32(outputIndex, xBestIndices[localId.x]);
        }
      }
    `:`
      ${k("index")} {
        if (index < uniforms.size) {
          let outputCoords = getCoordsFromIndex(index);
          var bestIndex = 0;
          var bestValue = getX(${t()} 0);
          let reduceLength = ${i()};
          for (var i = 1; i < reduceLength; i++) {
            let candidate = getX(${t()} i);
            if (candidate ${this.op} bestValue) {
              bestValue = candidate;
              bestIndex = i;
            }
          }
          setOutputAtIndexI32(index, bestIndex);
        }
      }
      `}};function xn(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{axis:r}=s;let n=u.util.parseAxisParam(r,a.shape);const o=u.backend_util.getAxesPermutation(n,a.shape.length);let l=a;const d=[];o!=null&&(l=J({inputs:{x:a},backend:t,attrs:{perm:o}}),d.push(l),n=u.backend_util.getInnerMostAxes(n.length,l.shape.length)),u.backend_util.assertAxesAreInnerMostDims("argMax",[n[0]],l.shape.length);const h=new Ut(l.shape,n[0],"max"),p=[{type:"float32",data:[Number.NEGATIVE_INFINITY]}],c=t.runWebGPUProgram(h,[l],"int32",p);return d.forEach(m=>t.disposeData(m.dataId)),c}var vn={kernelName:u.ArgMax,backendName:"webgpu",kernelFunc:xn};function Cn(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{axis:r}=s;let n=u.util.parseAxisParam(r,a.shape);const o=u.backend_util.getAxesPermutation(n,a.shape.length);let l=a;const d=[];o!=null&&(l=J({inputs:{x:a},backend:t,attrs:{perm:o}}),d.push(l),n=u.backend_util.getInnerMostAxes(n.length,l.shape.length)),u.backend_util.assertAxesAreInnerMostDims("argMin",[n[0]],l.shape.length);const h=new Ut(l.shape,n[0],"min"),p=[{type:"float32",data:[Number.POSITIVE_INFINITY]}],c=t.runWebGPUProgram(h,[l],"int32",p);return d.forEach(m=>t.disposeData(m.dataId)),c}var bn={kernelName:u.ArgMin,backendName:"webgpu",kernelFunc:Cn},yn=F({opType:I.ASIN}),Sn={kernelName:u.Asin,backendName:"webgpu",kernelFunc:yn},In=F({opType:I.ASINH}),kn={kernelName:u.Asinh,backendName:"webgpu",kernelFunc:In},wn=F({opType:I.ATAN}),Rn={kernelName:u.Atan,backendName:"webgpu",kernelFunc:wn},Pn=V({opType:z.ATAN2}),$n={kernelName:u.Atan2,backendName:"webgpu",kernelFunc:Pn},Dn=F({opType:I.ATANH}),Nn={kernelName:u.Atanh,backendName:"webgpu",kernelFunc:Dn},zn=class{constructor(e){this.variableNames=["x"],this.uniforms="strides : vec2<i32>,",this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=e.outShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="poolWithFilterSizeEqualsOne"}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let batch = coords[0];
          let d = coords[3];

          let xRCCorner = coords.yz * uniforms.strides;
          let xRCorner = xRCCorner.x;
          let xCCorner = xRCCorner.y;

          let value = getX(batch, xRCorner, xCCorner, d);
          setOutputAtIndex(index, value);
        }
      }
    `}},fe=class{constructor(e,i,t=!1,s=!1,a=!1){if(this.variableNames=["x"],this.uniforms="strides : vec2<i32>, pads : vec2<i32>, dilations : vec2<i32>, convDims : vec2<i32>, filterDims : vec2<i32>,",this.workgroupSize=[128,1,1],this.size=!0,i==="avg"&&t)throw new Error("Cannot compute positions for average pool.");this.outputShape=e.outShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.poolType=i,this.computePositions=t,this.flattenPositions=s,this.includeBatchIndex=a,this.shaderKey=`pool2D_${i}_${t}_${s}_${a}`}getUserCode(){let e;this.poolType==="avg"?e="resultValue = resultValue + value; count = count + 1.0;":this.computePositions?e=`let currMaxValue = mix(value, maxValue, maxValueFound);
      if (value >= currMaxValue) {
        maxValue = value;
        maxValueFound = 1.0;
        maxPosition = ${this.flattenPositions?this.includeBatchIndex?"((batch * uniforms.xShape[1] + xR) * uniforms.xShape[2] + xC) * uniforms.xShape[3] + d":"(xR * uniforms.xShape[2] + xC) * uniforms.xShape[3] + d":"wR * uniforms.filterDims.y + wC"};
      }`:e="resultValue = max(value, resultValue);";let i="resultValue";return this.poolType==="avg"&&(i="resultValue / max(count, 1.0)"),`
      ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
          let batch = coords[0];
          let d = coords[3];
          let xRCCorner = vec2<i32>(coords.yz) * uniforms.strides - uniforms.pads;
          let xRCorner = xRCCorner.x;
          let xCCorner = xRCCorner.y;

          ${this.computePositions?`var maxValue = 0.0;
            var maxValueFound = 0.0;
            var maxPosition = 0;`:`var resultValue = ${this.poolType==="avg"?"0.0":"-1.0 / pow(10.0, -20.0)"};`}

          var count = 0.0;
          for (var wR = 0; wR < uniforms.filterDims.x; wR = wR + uniforms.dilations.x) {
            let xR = xRCorner + wR;

            if (xR < 0 || xR >= uniforms.convDims.x) {
              continue;
            }

            for (var wC = 0; wC < uniforms.filterDims.y; wC = wC + uniforms.dilations.y) {
              let xC = xCCorner + wC;
              if (xC < 0 || xC >= uniforms.convDims.y) {
                continue;
              }

              let value = getX(batch, xR, xC, d);
              ${e}
            }
          }

          ${this.computePositions?"setOutputAtIndexI32(index, maxPosition);":`setOutputAtIndex(index, ${i});`}
        }
      }
    `}},Ge=class{constructor(e,i,t=!1,s=!1,a=!1){if(this.variableNames=["x"],this.uniforms="strides : vec3<i32>, pads : vec3<i32>, convDims : vec3<i32>, filterDims : vec3<i32>,",this.workgroupSize=[128,1,1],this.size=!0,i==="avg"&&t)throw new Error("Cannot compute positions for average pool.");this.outputShape=e.outShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.poolType=i,this.computePositions=t,this.flattenPositions=s,this.includeBatchIndex=a,this.shaderKey=`pool3D_${i}_${t}_${s}_${a}`}getUserCode(){let e;this.poolType==="avg"?e="resultValue += value; count += 1.0;":this.computePositions?e=`let currMaxValue = mix(value, maxValue, maxValueFound);
      if (value >= currMaxValue) {
        maxValue = value;
        maxValueFound = 1.0;
        maxPosition = ${this.flattenPositions?this.includeBatchIndex?"(((batch * uniforms.xShape.y + xD) * uniforms.xShape.z + xR) * uniforms.xShape.w + xC) * uniforms.xShape.u + ch":"((xD * uniforms.xShape.z + xR) * uniforms.xShape.w + xC) * uniforms.xShape.u + ch":"wD * uniforms.filterDims.y * uniforms.filterDims.y + wR * uniforms.filterDims.z + wC"};
      }`:e="resultValue = max(value, resultValue);";let i="resultValue";return this.poolType==="avg"&&(i="resultValue / max(count, 1.0)"),`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let batch = coords.x;
          let ch = coords.u;

          let xCorner = vec3<i32>(coords.y, coords.z, coords.w) * uniforms.strides - uniforms.pads;
          let xDCorner = xCorner.x;
          let xRCorner = xCorner.y;
          let xCCorner = xCorner.z;

          ${this.computePositions?`var maxValue = 0.0;
            var maxValueFound = 0.0;
            var maxPosition = 0;`:`var resultValue = ${this.poolType==="avg"?"0.0":"-1.0 / pow(10.0, -20.0)"};`}

          var count = 0.0;
          for (var wD = 0; wD < uniforms.filterDims.x; wD++) {
            let xD = xDCorner + wD;
            if (xD < 0 || xD >= uniforms.convDims.x) {
              continue;
            }

            for (var wR = 0; wR < uniforms.filterDims.y; wR++) {
              let xR = xRCorner + wR;
              if (xR < 0 || xR >= uniforms.convDims.y) {
                continue;
              }

              for (var wC = 0; wC < uniforms.filterDims.z; wC++) {
                let xC = xCCorner + wC;
                if (xC < 0 || xC >= uniforms.convDims.z) {
                  continue;
                }

                let value = getX(batch, xD, xR, xC, ch);
                ${e}
              }
            }
          }

          ${this.computePositions?"setOutputAtIndexI32(index, maxPosition);":`setOutputAtIndex(index, ${i});`}
        }
      }
    `}};function Gt(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{reductionIndices:r,keepDims:n}=s;return oe(a,r,n,"max",t)}var An={kernelName:u.Max,backendName:"webgpu",kernelFunc:Gt};function Ht(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{keepDims:r,axis:n}=s;return oe(a,n,r,"mean",t)}var Fn={kernelName:u.Mean,backendName:"webgpu",kernelFunc:Ht};function qt(e,i,t,s){if(i.filterWidth===1&&i.filterHeight===1&&u.util.arraysEqual(i.inShape,i.outShape))return q({inputs:{x:e},backend:s});if(i.filterWidth===i.inWidth&&i.filterHeight===i.inHeight&&i.batchSize===1&&i.padInfo.type==="VALID"){const n=e.shape.length,o=$({inputs:{x:e},backend:s,attrs:{shape:[e.shape[n-3]*e.shape[n-2],e.shape[n-1]]}});let l;t==="avg"?l=Ht({inputs:{x:o},backend:s,attrs:{axis:0,keepDims:!1}}):(u.util.assert(t==="max",()=>`Invalid pool type ${t}`),l=Gt({inputs:{x:o},backend:s,attrs:{reductionIndices:0,keepDims:!1}}));const d=$({inputs:{x:l},backend:s,attrs:{shape:i.outShape}});return s.disposeData(o.dataId),s.disposeData(l.dataId),d}let a;const r=[{type:"int32",data:[i.strideHeight,i.strideWidth]}];return i.filterHeight===1&&i.filterWidth===1?a=new zn(i):(t==="avg"?a=new fe(i,"avg"):(u.util.assert(t==="max",()=>`Invalid pool type ${t}`),a=new fe(i,"max")),r.push({type:"int32",data:[i.padInfo.top,i.padInfo.left]},{type:"int32",data:[i.dilationHeight,i.dilationWidth]},{type:"int32",data:[i.inHeight,i.inWidth]},{type:"int32",data:[i.effectiveFilterHeight,i.effectiveFilterWidth]})),s.runWebGPUProgram(a,[e],e.dtype,r)}function En(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{filterSize:r,strides:n,pad:o,dimRoundingMode:l}=s,d=u.backend_util.computePool2DInfo(a.shape,r,n,1,o,l);return qt(a,d,"avg",t)}var Tn={kernelName:u.AvgPool,backendName:"webgpu",kernelFunc:En};function Ln(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{filterSize:r,strides:n,pad:o,dataFormat:l,dimRoundingMode:d}=s,h=u.backend_util.computePool3DInfo(a.shape,r,n,[1,1,1],o,d,l),p=new Ge(h,"avg"),c=[{type:"int32",data:[h.strideDepth,h.strideHeight,h.strideWidth]},{type:"int32",data:[h.padInfo.front,h.padInfo.top,h.padInfo.left]},{type:"int32",data:[h.inDepth,h.inHeight,h.inWidth]},{type:"int32",data:[h.effectiveFilterDepth,h.effectiveFilterHeight,h.effectiveFilterWidth]}];return t.runWebGPUProgram(p,[a],a.dtype,c)}var Bn={kernelName:u.AvgPool3D,backendName:"webgpu",kernelFunc:Ln},Wn=class{constructor(e){this.variableNames=["dy"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, dilations : vec2<i32>, filterDims : vec2<i32>,
       outHeight : i32, outWidth : i32, avgMultiplier : f32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.inShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="avgPool2DBackprop"}getUserCode(){return`
      ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d = coords[3];

        let dyRCCorner = vec2<i32>(coords.yz) - uniforms.pads;
        let dyRCorner = dyRCCorner.x;
        let dyCCorner = dyRCCorner.y;

        // Convolve dy(?, ?, d) with pos mask(:, :, d) to get dx(xR, xC, d).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var wR = 0; wR < uniforms.filterDims[0]; wR = wR + uniforms.dilations[0]) {
          let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[0]);

          if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
            continue;
          }
          let idyR = i32(dyR);

          for (var wC = 0; wC < uniforms.filterDims[1]; wC = wC + uniforms.dilations[1]) {
            let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[1]);

            if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
              continue;
            }
            let idyC = i32(dyC);

            let dyValue = getDy(batch, idyR, idyC, d);

            dotProd = dotProd + dyValue * uniforms.avgMultiplier;
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}},Vn=class{constructor(e){this.variableNames=["dy"],this.uniforms=`strides : vec3<i32>, pads : vec3<i32>, filterDims : vec3<i32>,
       outDepth : i32, outHeight : i32, outWidth : i32, avgMultiplier : f32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.inShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="avgPool3DBackprop"}getUserCode(){return`
      ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords.x;
        let ch = coords.u;

        let dyCorner = vec3<i32>(coords.y, coords.z, coords.w) - uniforms.pads;
        let dyDCorner = dyCorner.x;
        let dyRCorner = dyCorner.y;
        let dyCCorner = dyCorner.z;

        // Convolve dy(?, ?, ?, d) with pos mask(:, :, :, ch) to get
        // dx(xD, xR, xC, ch).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var wD = 0; wD < uniforms.filterDims[0]; wD++) {
          let dyD = f32(dyDCorner + wD) / f32(uniforms.strides[0]);

          if (dyD < 0.0 || dyD >= f32(uniforms.outDepth) || fract(dyD) > 0.0) {
            continue;
          }
          let idyD = i32(dyD);

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[1]);

            if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
              continue;
            }
            let idyR = i32(dyR);

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[2]);

              if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
                continue;
              }
              let idyC = i32(dyC);

              let dyValue = getDy(batch, idyD, idyR, idyC, ch);
              dotProd += dyValue * uniforms.avgMultiplier;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}};function Mn(e){const{inputs:i,backend:t,attrs:s}=e,{dy:a,input:r}=i,n=r,{filterSize:o,strides:l,pad:d,dimRoundingMode:h}=s,p=u.backend_util.computePool3DInfo(n.shape,o,l,1,d,h),c=new Vn(p),m=1/(p.filterDepth*p.filterHeight*p.filterWidth),f=[{type:"int32",data:[p.strideDepth,p.strideHeight,p.strideWidth]},{type:"int32",data:[p.effectiveFilterDepth-1-p.padInfo.front,p.effectiveFilterHeight-1-p.padInfo.top,p.effectiveFilterWidth-1-p.padInfo.left]},{type:"int32",data:[p.effectiveFilterDepth,p.effectiveFilterHeight,p.effectiveFilterWidth]},{type:"int32",data:[p.outDepth]},{type:"int32",data:[p.outHeight]},{type:"int32",data:[p.outWidth]},{type:"float32",data:[m]}];return t.runWebGPUProgram(c,[a],n.dtype,f)}var On={kernelName:u.AvgPool3DGrad,backendName:"webgpu",kernelFunc:Mn};function Un(e){const{inputs:i,backend:t,attrs:s}=e,{dy:a,input:r}=i,n=r;Le([a,r],"avgPoolGrad");const{filterSize:o,strides:l,pad:d}=s,h=u.backend_util.computePool2DInfo(n.shape,o,l,1,d),p=new Wn(h),c=1/(h.filterHeight*h.filterWidth),m=[{type:"int32",data:[h.strideHeight,h.strideWidth]},{type:"int32",data:[h.effectiveFilterHeight-1-h.padInfo.top,h.effectiveFilterWidth-1-h.padInfo.left]},{type:"int32",data:[h.dilationHeight,h.dilationWidth]},{type:"int32",data:[h.effectiveFilterHeight,h.effectiveFilterWidth]},{type:"int32",data:[h.outHeight]},{type:"int32",data:[h.outWidth]},{type:"float32",data:[c]}];return t.runWebGPUProgram(p,[a],n.dtype,m)}var Gn={kernelName:u.AvgPoolGrad,backendName:"webgpu",kernelFunc:Un};function Hn(e){const{inputs:i,backend:t,attrs:s}=e,{a,b:r}=i,{transposeA:n,transposeB:o}=s;return Re({a,b:r,transposeA:n,transposeB:o,backend:t})}var qn={kernelName:u.BatchMatMul,backendName:"webgpu",kernelFunc:Hn},Xn=class{constructor(e,i){this.variableNames=["source"],this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=i,this.rank=i.length,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.start=e,this.uniforms=`start : ${B(e.length)}, `,this.shaderKey="slice"}getUserCode(){const e=B(this.rank),i=Kn(this.rank);let t;return this.start.length===1?t=this.outputShape.map((s,a)=>"sourceLoc = uniforms.start + coords;"):t=this.outputShape.map((s,a)=>`sourceLoc.${He[a]} = uniforms.start.${j(a)} + coords.${He[a]};`),`
      ${k("index")} {
        if (index < uniforms.size) {
          var sourceLoc : ${e};
          let coords = getCoordsFromIndex(index);
          ${t.join(`
`)}
          setOutputAtIndex(index, getSource(${i}));
        }
      }
    `}},He=["x","y","z","w","u","v"];function Kn(e){if(e===1)return"sourceLoc";if(e<=6)return He.slice(0,e).map(i=>`sourceLoc.${i}`).join(",");throw Error(`Slicing for rank ${e} is not yet supported`)}function de(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{begin:r,size:n}=s,[o,l]=u.slice_util.parseSliceParams(a,r,n);if(u.slice_util.assertParamsValid(a,o,l),t.shouldExecuteOnCPU([a])||a.dtype==="string"){const p=t.tensorMap.get(a.dataId),c=Gr(p.values,o,l,a.shape,a.dtype);return t.makeTensorInfo(l,a.dtype,c)}if(u.util.sizeFromShape(l)===0)return t.makeTensorInfo(l,a.dtype,[]);const d=new Xn(o,l),h=[{type:"int32",data:o}];return t.runWebGPUProgram(d,[a],a.dtype,h)}var Yn={kernelName:u.Slice,backendName:"webgpu",kernelFunc:de},Qn=e=>{const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{blockShape:r,crops:n}=s;u.util.assert(a.shape.length<=4,()=>"batchToSpaceND for rank > 4 with a WebGPU backend not implemented yet");const o=r.reduce((C,b)=>C*b),l=u.backend_util.getReshaped(a.shape,r,o),d=u.backend_util.getPermuted(l.length,r.length),h=u.backend_util.getReshapedPermuted(a.shape,r,o),p=u.backend_util.getSliceBeginCoords(n,r.length),c=u.backend_util.getSliceSize(h,n,r.length),m=[],f=$({inputs:{x:a},backend:t,attrs:{shape:l}}),g=J({inputs:{x:f},backend:t,attrs:{perm:d}}),x=$({inputs:{x:g},backend:t,attrs:{shape:h}}),v=de({inputs:{x},backend:t,attrs:{begin:p,size:c}});return m.push(f),m.push(g),m.push(x),m.forEach(C=>t.disposeData(C.dataId)),v},Zn={kernelName:u.BatchToSpaceND,backendName:"webgpu",kernelFunc:Qn},Jn=`
  fn bincount_write(index: i32, value: f32) {
    ${ee("&result[index]","value","float32")}
  }
`,jn=`
  fn bincount_write(index: i32, value: f32) {
    atomicStore(&result[index], bitcast<i32>(value));
  }
`,Xt=class{constructor(e,i,t=!1){this.outputShape=[],this.variableNames=["x"],this.uniforms="binCountSize : i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.hasWeights=!0,this.binaryOutput=!1,this.outputShape=e,this.rank=e.length,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.binaryOutput=t,t&&(this.atomic=!1),this.hasWeights=i,this.hasWeights&&this.variableNames.push("w"),this.shaderKey=`bincount_${this.hasWeights}_${this.binaryOutput}_${this.rank}`}getUserCode(){return`
    ${this.binaryOutput?jn:Jn}
  ${k("index")} {
    ${this.rank===1?`if (index < uniforms.xShape) {
      let indexVal = i32(getX(index));
      if (indexVal < uniforms.binCountSize) {
        let value = ${this.binaryOutput?1:this.hasWeights?"getW(index)":"1."};
        bincount_write(indexVal, value);
      }
    }`:`let coord = getCoordsFromIndex(index);
    if (coordsInBounds2D(coord, uniforms.xShape)) {
      let indexVal = i32(getX(coord[0], coord[1]));
      if (indexVal < uniforms.binCountSize) {
        let value = ${this.binaryOutput?1:this.hasWeights?"getW(coord[0], coord[1])":"1."};
        bincount_write(coord.x * uniforms.binCountSize + indexVal, value);
      }
    }`}
  }
  `}};function _n(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,weights:r}=i,{size:n}=s,o=u.util.sizeFromShape(a.shape),l=u.util.sizeFromShape(r.shape)>0,d=[n],h=r.dtype,p=U({backend:t,attrs:{shape:d,value:0,dtype:h}}),c=new Xt([o],l),m=[{type:"int32",data:[n]}],f=l?[a,r]:[a];return t.runWebGPUProgram(c,f,h,m,p)}var eo={kernelName:u.Bincount,backendName:"webgpu",kernelFunc:_n},to=class{constructor(e){this.outputShape=[],this.variableNames=["s0","s1"],this.uniforms="s0Size : i32, s1Size : i32, ",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[e],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="broadcastArgs"}getUserCode(){return`
  ${k("index")} {
    if (index < uniforms.size) {
      var s0 = 1.0;
      var s1 = 1.0;
      let indexS0 = index - uniforms.size + uniforms.s0Size;
      let indexS1 = index - uniforms.size + uniforms.s1Size;
      if (indexS0 >= 0) {
        s0 = getS0(indexS0);
      }
      if (indexS1 >= 0) {
        s1 = getS1(indexS1);
      }

      if (s0 == 1.0) {
        setOutputAtIndex(index, s1);
      } else if (s1 == 1.0) {
        setOutputAtIndex(index, s0);
      } else if (s0 != s1) {
        setOutputAtIndex(index, uniforms.NAN);
      } else {
        setOutputAtIndex(index, s0);
      }
    }
  }
  `}};function io(e){const{inputs:i,backend:t}=e,{s0:s,s1:a}=i;if(t.shouldExecuteOnCPU([s,a])){const d=t.tensorMap.get(s.dataId),h=t.tensorMap.get(a.dataId),p=d.values,c=h.values,m=u.backend_util.assertAndGetBroadcastShape(Array.from(p),Array.from(c));return t.makeTensorInfo([m.length],"int32",Int32Array.from(m))}const r=u.util.sizeFromShape(s.shape),n=u.util.sizeFromShape(a.shape),o=new to(Math.max(r,n)),l=[{type:"int32",data:[r]},{type:"int32",data:[n]}];return t.runWebGPUProgram(o,[s,a],"int32",l)}var ao={kernelName:u.BroadcastArgs,backendName:"webgpu",kernelFunc:io},Kt=V({opType:z.NOT_EQUAL,dtype:"bool",cpuKernelImpl:Br}),so={kernelName:u.NotEqual,backendName:"webgpu",kernelFunc:Kt};function ge(e){const{inputs:i,backend:t}=e,{input:s}=i,a=t.tensorMap.get(s.dataId);return q({inputs:{x:a.complexTensorInfos.real},backend:t})}var ro={kernelName:u.Real,backendName:"webgpu",kernelFunc:ge};function no(e,i){const t=new le(e.shape,I.TO_INT),s=i.runWebGPUProgram(t,[e],"int32");return{dataId:s.dataId,shape:s.shape,dtype:s.dtype}}function qe(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{dtype:r}=s;if(r==="complex64"){if(a.dtype==="complex64")return q({inputs:{x:a},backend:t});const n=u.zeros(a.shape),o=qe({inputs:{x:a},backend:t,attrs:{dtype:"float32"}}),l=ne({inputs:{real:o,imag:n},backend:t});return n.dispose(),t.disposeData(o.dataId),l}if(a.dtype==="complex64"){const n=ge({inputs:{input:a},backend:t}),o=qe({inputs:{x:n},backend:t,attrs:{dtype:r}});return t.disposeData(n.dataId),o}if(!u.util.hasEncodingLoss(a.dtype,r)){const n=q({inputs:{x:a},backend:t});return{dataId:n.dataId,shape:n.shape,dtype:r}}if(t.shouldExecuteOnCPU([a])){const n=t.tensorMap.get(a.dataId).values,[o,l,d]=xr(n,a.shape,a.dtype,r);return t.makeTensorInfo(o,l,d)}if(r==="int32")return no(a,t);if(r==="bool"){const n=t.makeTensorInfo([],"bool",u.util.getTypedArrayFromDType("bool",1)),o=Kt({inputs:{a,b:n},backend:t});return t.disposeData(n.dataId),o}throw new Error(`Error in Cast: failed to cast ${a.dtype} to ${r}`)}var oo={kernelName:u.Cast,backendName:"webgpu",kernelFunc:qe},uo=F({opType:I.CEIL,cpuKernelImpl:vr}),lo={kernelName:u.Ceil,backendName:"webgpu",kernelFunc:uo},ho=class{constructor(e){this.variableNames=["A"],this.uniforms="minVal : f32, maxVal : f32,",this.workPerThread=4,this.workgroupSize=[64,1,1],this.outputComponent=4,this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.shaderKey="clipVec4"}getUserCode(){return`
      ${k("index")} {
        if(index < uniforms.size) {
          let value = getAByOutputIndex(index);
          var clampedValue = clamp(
              value, vec4<f32>(uniforms.minVal), vec4<f32>(uniforms.maxVal));
          clampedValue = select(clampedValue, value, isnanVec4(value));
          setOutputAtIndex(index, clampedValue);
        }
      }
    `}},po=class{constructor(e){this.variableNames=["A"],this.uniforms="minVal : f32, maxVal : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="clip"}getUserCode(){return`
      ${k("index")} {
        if(index < uniforms.size) {
          let value = getAByOutputIndex(index);
          if (isnan(value)) {
            setOutputAtIndex(index, value);
            return;
          }
          setOutputAtIndex(index, clamp(value, uniforms.minVal, uniforms.maxVal));
        }
      }
    `}};function co(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{clipValueMin:r,clipValueMax:n}=s;let o;const l=[{type:"float32",data:[r]},{type:"float32",data:[n]}];return u.util.sizeFromShape(a.shape)%4===0?o=new ho(a.shape):o=new po(a.shape),t.runWebGPUProgram(o,[a],a.dtype,l)}var mo={kernelName:u.ClipByValue,backendName:"webgpu",kernelFunc:co},fo=class{constructor(e){this.outputShape=[],this.variableNames=["real","imag"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="complexAbs"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.size) {
        let re = abs(getRealByOutputIndex(index));
        let im = abs(getImagByOutputIndex(index));
        let mx = max(re, im);

        // The length function in wgsl may be not underflow-safe on some GPUs.
        // So the safe solution is to ensure underflow-safety in all cases.
        setOutputAtIndex(index, select(mx * length(vec2<f32>(1, min(re, im)/mx)), 0.0, mx == 0.0));
      }
    }
  `}};function Yt(e,i){return{dataId:i.dataId,dtype:i.dtype,shape:e.shape}}function go(e){const{inputs:i,backend:t}=e,{x:s}=i,a=t.tensorMap.get(s.dataId),r=new fo(s.shape),n=[Yt(s,a.complexTensorInfos.real),Yt(s,a.complexTensorInfos.imag)];return t.runWebGPUProgram(r,n,n[0].dtype)}var xo={kernelName:u.ComplexAbs,backendName:"webgpu",kernelFunc:go},vo=class{constructor(e){this.uniforms="",this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=u.backend_util.computeOutShape(e,1),this.variableNames=e.map((i,t)=>`T${t}`),this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.offsetLength=e.length-1;for(let i=0;i<this.offsetLength;i++)this.uniforms+=`offset${i} : i32,`;this.shaderKey="concat"}getUserCode(){const e=[];if(this.offsetLength>0){e.push("if (yC < uniforms.offset0){ setOutputAtCoords(coords.x, coords.y, getT0(yR, yC)); }");for(let s=1;s<this.offsetLength;s++)e.push(`else if (yC < uniforms.offset${[s]}){ setOutputAtCoords(coords.x, coords.y, getT${s}(yR, yC - uniforms.offset${s-1})); }`);const i=this.offsetLength,t=this.offsetLength-1;e.push(`else { setOutputAtCoords(coords.x, coords.y, getT${i}(yR, yC - uniforms.offset${t})); }`)}else e.push("setOutputAtCoords(coords.x, coords.y, getT0(yR, yC));");return`
      ${k("index")} {
        for(var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let flatIndex = index * ${this.workPerThread} + i;
          if(flatIndex < uniforms.size) {
            let coords = getCoordsFromIndex(flatIndex);
            let yR = coords.x;
            let yC = coords.y;

            ${e.join(`
        `)}
          }
        }
      }
    `}};function De(e){const{inputs:i,backend:t}=e,{input:s}=i,a=t.tensorMap.get(s.dataId);return q({inputs:{x:a.complexTensorInfos.imag},backend:t})}var Co={kernelName:u.Imag,backendName:"webgpu",kernelFunc:De};function xe(e,i,t){const s=e[0].dtype;if(s==="complex64"){const f=e.map(b=>ge({inputs:{input:b},backend:t})),g=e.map(b=>De({inputs:{input:b},backend:t})),x=xe(f,i,t),v=xe(g,i,t),C=ne({inputs:{real:x,imag:v},backend:t});return f.forEach(b=>t.disposeData(b.dataId)),g.forEach(b=>t.disposeData(b.dataId)),t.disposeData(x.dataId),t.disposeData(v.dataId),C}let a=t.shouldExecuteOnCPU(e);if(s==="string"&&(a=!0),a){const f=e.map(S=>{const P=[-1,u.util.sizeFromShape(S.shape.slice(i))];return $({inputs:{x:S},backend:t,attrs:{shape:P}})}),g=f.map(S=>({vals:t.readSync(S.dataId),shape:S.shape})),x=u.backend_util.computeOutShape(f.map(S=>S.shape),1),v=f[0].shape[0]===1,C=Cr(g,x,s,v),b=u.backend_util.computeOutShape(e.map(S=>S.shape),i),y=t.makeTensorInfo(b,s,C);return f.forEach(S=>t.disposeData(S.dataId)),y}const r=t.device.limits.maxStorageBuffersPerShaderStage-1;if(e.length>r){const f=[];for(let x=0;x<e.length;x+=r){const v=e.slice(x,x+r);f.push(xe(v,i,t))}const g=xe(f,i,t);for(const x of f)t.disposeData(x.dataId);return g}const{tensors2D:n,outShape:o}=bo(e,i,t),l=n.map(f=>f.shape),d=new vo(l),h=[],p=new Array(l.length-1);if(p.length>0){p[0]=l[0][1],h.push({type:"int32",data:[p[0]]});for(let f=1;f<p.length;f++)p[f]=p[f-1]+l[f][1],h.push({type:"int32",data:[p[f]]})}const c=t.runWebGPUProgram(d,n,n[0].dtype,h);n.forEach(f=>t.disposeData(f.dataId));const m=$({inputs:{x:c},backend:t,attrs:{shape:o}});return t.disposeData(c.dataId),m}function bo(e,i,t){const s=u.backend_util.computeOutShape(e.map(a=>a.shape),i);return{tensors2D:e.map(a=>$({inputs:{x:a},backend:t,attrs:{shape:[u.util.sizeFromShape(a.shape.slice(0,i)),u.util.sizeFromShape(a.shape.slice(i))]}})),outShape:s}}function Qt(e){const{inputs:i,backend:t,attrs:s}=e,{axis:a}=s,r=u.util.parseAxisParam(a,i[0].shape)[0],n=i.map(d=>d.shape);u.backend_util.assertParamsConsistent(n,r);const o=u.backend_util.computeOutShape(i.map(d=>d.shape),r);if(u.util.sizeFromShape(o)===0)return t.makeTensorInfo(o,i[0].dtype,[]);const l=i.filter(d=>u.util.sizeFromShape(d.shape)>0);return l.length===1?q({inputs:{x:l[0]},backend:t}):xe(l,r,t)}var yo={kernelName:u.Concat,backendName:"webgpu",kernelFunc:Qt};function So(e,i,t,s,a=!1,r=null,n=!1,o=4,l=4,d=4){const h=D=>{switch(D){case 1:return"resData = f32(x[xIndex]);";case 3:return"resData = vec3<f32>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);";case 4:return"resData = vec4<f32>(x[xIndex / 4]);";default:throw new Error(`innerElementSize ${D} is not supported.`)}},p=D=>{switch(D){case 1:return"return f32(W[row * uniforms.wShape[3] + col]);";case 4:return"return vec4<f32>(W[(row * uniforms.wShape[3] + col) / 4]);";default:throw new Error(`innerElementSize ${D} is not supported.`)}},c=e?`
      let coord = vec4<i32>(batch, xRow, xCol, xCh);
      `:`
      let coord = vec4<i32>(batch, xCh, xRow, xCol);
      `,m=e?`
      let coords = vec4<i32>(
        batch,
        row / outWidth,
        row % outWidth,
        col);
      `:`
      let coords = vec4<i32>(
        batch,
        row,
        col / outWidth,
        col % outWidth);
      `,f=e?"uniforms.xShape[1]":"uniforms.xShape[2]",g=e?"uniforms.xShape[2]":"uniforms.xShape[3]",x=e?"row":"col",v=e?"col":"row",C=`
      let inChannels = uniforms.wShape[2];
      let outWidth = ${e?"uniforms.outShape[2]":"uniforms.outShape[3]"};
      let outRow = ${x} / outWidth;
      let outCol = ${x} % outWidth;

      let WRow = ${v} / (uniforms.filterDims[1] * inChannels);
      let WCol = ${v} / inChannels % uniforms.filterDims[1];
      let xRow = outRow * uniforms.strides[0] + uniforms.dilations[0] * WRow - uniforms.pads[0];
      let xCol = outCol * uniforms.strides[1] + uniforms.dilations[1] * WCol - uniforms.pads[1];
      let xCh = ${v} % inChannels;
      var resData = ${A(o)}(0.0);
      // The bounds checking is always needed since we use it to pad zero for
      // the 'same' padding type.
      if (xRow >= 0 && xRow < ${f} && xCol >= 0 && xCol < ${g}) {
        ${c}
        let xIndex = getIndexFromCoords4D(coord, uniforms.xShape);
        ${h(o)}
      }
      return resData;`,b=e?i&&s?`
      ${C}`:`
      if (row < uniforms.dimAOuter && col < uniforms.dimInner) {
        ${C}
      }
      return ${A(o)}(0.0);`:s&&t?`
      ${C}`:`
      if (row < uniforms.dimInner && col < uniforms.dimBOuter) {
        ${C}
      }
      return ${A(o)}(0.0);`,y=`${p(l)}`,S=A(d),P=A(e?o:l),N=A(e?l:o);return`
      ${_(r,n,d===4,4)}
      fn mm_readA(batch: i32, row : i32, col : i32) -> ${P} {
        ${e?b:y}
      }

      fn mm_readB(batch: i32, row : i32, col : i32) -> ${N} {
        ${e?y:b}
      }

      fn mm_write(batch: i32, row : i32, col : i32, valueIn : ${S}) {
        if (row < uniforms.dimAOuter && col < uniforms.dimBOuter)
        {
        var value = valueIn;
        let outWidth = ${e?"uniforms.outShape[2]":"uniforms.outShape[3]"};
        ${m}
        ${re(a,r)}
        setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
        }
      }`}var Io=class{constructor(e,i,t,s,a=!1,r=null,n=!1,o=!1){this.variableNames=["x","W"],this.uniforms="filterDims : vec2<i32>, pads : vec2<i32>, strides : vec2<i32>, dilations : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.outputShape=e.outShape,this.isChannelsLast=e.dataFormat==="channelsLast",this.isVec4=((e.inChannels%4===0||e.inChannels%3===0)&&this.isChannelsLast||e.outWidth%4===0&&!this.isChannelsLast)&&e.outChannels%4===0,this.dispatchLayout=this.isChannelsLast?{x:[3],y:[1,2],z:[0]}:{x:[2,3],y:[1],z:[0]},this.workgroupSize=Ae(this.dispatchLayout,this.outputShape,this.isVec4),this.elementsPerThread=Fe(this.dispatchLayout,this.outputShape,this.isVec4),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,this.elementsPerThread),this.isVec4?(this.outputComponent=4,this.isChannelsLast&&e.inChannels%4!==0?(this.innerElementSize=3,this.variableComponents=[1,4]):(this.innerElementSize=4,this.variableComponents=[4,4]),a&&(this.variableNames.push("bias"),this.variableComponents.push(4)),n&&(this.variableNames.push("preluActivationWeights"),this.variableComponents.push(4))):(this.innerElementSize=this.elementsPerThread[0],a&&this.variableNames.push("bias"),n&&this.variableNames.push("preluActivationWeights")),this.sequentialAccessByThreads=o,this.addBias=a,this.activation=r,this.hasPreluActivationWeights=n,this.tileAOuter=this.workgroupSize[1]*this.elementsPerThread[1],this.tileBOuter=this.workgroupSize[0]*this.elementsPerThread[0],this.tileInner=Math.max(this.workgroupSize[0]*this.innerElementSize,this.workgroupSize[1]),this.fitAOuter=i%this.tileAOuter===0,this.fitBOuter=t%this.tileBOuter===0,this.fitInner=s%this.tileInner===0,this.shaderKey=`conv2DMM_${this.elementsPerThread}_${this.activation}}_${this.fitAOuter}_${this.fitBOuter}_${this.fitInner}_${this.isVec4}_${this.innerElementSize}_${this.isChannelsLast}_${this.sequentialAccessByThreads}`}getUserCode(){const e=this.isVec4?ke(this.elementsPerThread,this.workgroupSize,!this.isChannelsLast,this.tileInner):we(this.elementsPerThread,this.workgroupSize,!this.isChannelsLast,this.tileInner,!1,null,this.sequentialAccessByThreads),i=this.isVec4?[this.innerElementSize,4,4]:[1,1,1];return`
    ${So(this.isChannelsLast,this.fitAOuter,this.fitBOuter,this.fitInner,this.addBias,this.activation,this.hasPreluActivationWeights,i[0],i[1],i[2])}
    ${e}
  `}},ko=class{constructor(e,i=!1,t=null,s=!1){this.variableNames=["x","W"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>,",this.workgroupSize=[4,4,8],this.outputShape=e.outShape,this.isChannelsLast=e.dataFormat==="channelsLast",this.dispatchLayout=this.isChannelsLast?{x:[2],y:[1],z:[0,3]}:{x:[3],y:[2],z:[0,1]},this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.addBias=i,this.activation=t,this.hasPreluActivationWeights=s,i&&this.variableNames.push("bias"),s&&this.variableNames.push("preluActivationWeights"),this.shaderKey=`conv2dnaive_${this.activation}_${this.isChannelsLast}`}getUserCode(){return`
       ${_(this.activation,this.hasPreluActivationWeights,!1,4)}
       fn readInp(batch : i32, row : i32, col : i32, chan : i32) -> f32{
         let coords = vec4<i32>(batch, row, col, chan);
         if (coordsInBounds4D(coords, uniforms.xShape)) {
           return  getX(batch, row, col, chan);
         } else {
          return 0.0;
         }
       }
       fn readFilt(row : i32, col : i32, xChannel : i32, outChannel : i32) -> f32{
         let coords = vec4<i32>(row, col, xChannel, outChannel);
         if(coordsInBounds4D(coords, uniforms.wShape)) {
           return getW(row, col, xChannel, outChannel);
          } else {
            return 0.0;
          }
       }
       fn writeResult(batch : i32, row : i32, col : i32, chan : i32, valueIn : f32) {
         let coords = ${this.isChannelsLast?"vec4<i32>(batch, row, col, chan);":"vec4<i32>(batch, chan, row, col);"}
         if (coordsInBounds4D(coords, uniforms.outShape)) {
           var value = valueIn;
           ${re(this.addBias,this.activation)}
           setOutputAtCoords(coords.x, coords.y, coords.z, coords.w, value);
         }
       }
       ${k("index")} {
         let coords = getOutputCoords();
         let batch = coords[0];
         let outChannel = ${this.isChannelsLast?"coords[3];":"coords[1];"}
         let outRow = ${this.isChannelsLast?"coords[1];":"coords[2];"}
         let outCol = ${this.isChannelsLast?"coords[2];":"coords[3];"}
         var acc : f32 = 0.0;
         for (var row = 0; row < uniforms.filterDims[0]; row = row + 1) {
           for (var col = 0; col < uniforms.filterDims[1]; col = col + 1) {
             let xRow = outRow * uniforms.strides[0] + uniforms.dilations[0] * row - uniforms.pads[0];
             let xCol = outCol * uniforms.strides[1] + uniforms.dilations[1] * col - uniforms.pads[1];
             for (var xChannel = 0; xChannel < ${this.isChannelsLast?"uniforms.xShape[3];":"uniforms.xShape[1];"} xChannel = xChannel + 1) {
               ${this.isChannelsLast?"let v = readInp(batch, xRow, xCol, xChannel);":"let v = readInp(batch, xChannel, xRow, xCol);"}
               let f = readFilt(row, col, xChannel, outChannel);
               acc = acc + v * f;
             }
           }
         }
         writeResult(batch, outRow, outCol, outChannel, acc);
       }
     `}},wo=class{constructor(e,i){this.variableNames=["x"],this.uniforms=`pads : vec2<i32>, strides : vec2<i32>, dilations : vec2<i32>, outWidth : i32, itemsPerBlockRow : i32,
       inChannels : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.isChannelsLast=i,this.shaderKey=`im2col_${this.isChannelsLast}`}getUserCode(){const e=this.isChannelsLast?1:2,i=this.isChannelsLast?2:3,t=this.isChannelsLast?"coords[1]":"coords[2]",s=this.isChannelsLast?"coords[2]":"coords[1]",a=this.isChannelsLast?"getX(batch, xRow, xCol, ch)":"getX(batch, ch, xRow, xCol)";return`
    ${k("index")} {
      let coords = getCoordsFromIndex(index);
      if(index < uniforms.size) {
        let batch = coords[0];
        let row = ${t};
        let col = ${s};
        let offsetY = (row / uniforms.outWidth) * uniforms.strides[0] - uniforms.pads[0];
        let xRow = offsetY + uniforms.dilations[0] * (col / uniforms.itemsPerBlockRow);
        var value = 0.0;
        if(xRow < uniforms.xShape[${e}] && xRow >= 0) {
          let offsetX = (row % uniforms.outWidth) * uniforms.strides[1] -
              uniforms.pads[1];
          let xCol = offsetX + uniforms.dilations[1] * ((col %
              uniforms.itemsPerBlockRow) / uniforms.inChannels);
          let ch = col % uniforms.inChannels;
          if(xCol < uniforms.xShape[${i}] && xCol >= 0) {
            value = ${a};
          }
        }
        setOutputAtIndex(index, value);
      }
    }
   `}};function Ne(e,i){const t=e.length;return t>=3?i?[...e.slice(0,-3),e[t-3]*e[t-2],e[t-1]]:[...e.slice(0,-3),e[t-3],e[t-2]*e[t-1]]:!i&&t===1&&e[0]>1?[e[0],1]:null}function Ro({x:e,filter:i,convInfo:t,backend:s,bias:a=null,preluActivationWeights:r=null,leakyreluAlpha:n=0,activation:o=null}){const l=t.dataFormat==="channelsLast",d=!l,h=!1,p=l&&t.filterHeight===t.inHeight&&t.filterWidth===t.inWidth&&t.padInfo.type==="VALID",c=[];let m,f;if(p){const v=t.inHeight*t.inWidth*t.inChannels;m=$({inputs:{x:e},backend:s,attrs:{shape:[1,t.batchSize,v]}}),f=$({inputs:{x:i},backend:s,attrs:{shape:[1,v,t.outChannels]}})}else m=$({inputs:{x:e},backend:s,attrs:{shape:l?[t.batchSize,t.inHeight*t.inWidth,t.inChannels]:[t.batchSize,t.inChannels,t.inHeight*t.inWidth]}}),f=$({inputs:{x:i},backend:s,attrs:{shape:[1,t.inChannels,t.outChannels]}});if(c.push(m),c.push(f),r!=null){const v=Ne(r.shape,l);v!=null&&(r=$({inputs:{x:r},backend:s,attrs:{shape:v}}),c.push(r))}if(a!=null){const v=Ne(a.shape,l);v!=null&&(a=$({inputs:{x:a},backend:s,attrs:{shape:v}}),c.push(a))}const g=Re({a:l?m:f,b:l?f:m,transposeA:d,transposeB:h,backend:s,bias:a,activation:o,preluActivationWeights:r,leakyreluAlpha:n}),x=$({inputs:{x:g},backend:s,attrs:{shape:t.outShape}});c.push(g);for(const v of c)s.disposeData(v.dataId);return x}function Po({x:e,filter:i,convInfo:t,backend:s,bias:a=null,preluActivationWeights:r=null,leakyreluAlpha:n=0,activation:o=null}){const{filterWidth:l,filterHeight:d,inChannels:h,strideWidth:p,strideHeight:c,padInfo:m,outWidth:f,outHeight:g,dilationWidth:x,dilationHeight:v,dataFormat:C}=t,b=C==="channelsLast",y=l*d*h,S=g*f,P=b?[t.batchSize,S,y]:[t.batchSize,y,S],N=new wo(P,b),D=[{type:"int32",data:[m.top,m.left]},{type:"int32",data:[c,p]},{type:"int32",data:[v,x]},{type:"int32",data:[f]},{type:"int32",data:[h*l]},{type:"int32",data:[h]}],E=s.runWebGPUProgram(N,[e],e.dtype,D),T=[];T.push(E);const L=$({inputs:{x:i},backend:s,attrs:{shape:[1,y,-1]}});if(T.push(L),r!=null){const M=Ne(r.shape,b);M!=null&&(r=$({inputs:{x:r},backend:s,attrs:{shape:M}}),T.push(r))}if(a!=null){const M=Ne(a.shape,b);M!=null&&(a=$({inputs:{x:a},backend:s,attrs:{shape:M}}),T.push(a))}const W=Re({a:b?E:L,b:b?L:E,transposeA:!b,transposeB:!1,backend:s,bias:a,activation:o,preluActivationWeights:r,leakyreluAlpha:n}),H=$({inputs:{x:W},backend:s,attrs:{shape:t.outShape}});T.push(W);for(const M of T)s.disposeData(M.dataId);return H}function Zt({x:e,filter:i,convInfo:t,backend:s,bias:a=null,preluActivationWeights:r=null,leakyreluAlpha:n=0,activation:o=null}){const l=a!=null,d=r!=null,h=t.dataFormat==="channelsLast",p=h&&t.filterHeight===t.inHeight&&t.filterWidth===t.inWidth&&t.padInfo.type==="VALID",c=(0,u.env)().getBool("WEBGPU_USE_NAIVE_CONV2D_DEBUG");if(!c&&(p||t.filterHeight===1&&t.filterWidth===1&&t.dilationHeight===1&&t.dilationWidth===1&&t.strideHeight===1&&t.strideWidth===1&&(t.padInfo.type==="SAME"||t.padInfo.type==="VALID")))return Ro({x:e,filter:i,convInfo:t,backend:s,bias:a,activation:o,preluActivationWeights:r,leakyreluAlpha:n});const m=(0,u.env)().getNumber("WEBGPU_THRESHOLD_TO_INCREASE_WORKGROUPS_FOR_MATMUL"),f=m>-1?m:s.thresholdToIncreaseWorkgroups,g=t.batchSize*Math.ceil(t.outHeight*t.outWidth/32)*Math.ceil(t.outChannels/32);if((0,u.env)().getBool("WEBGPU_CONV_SEPARATE_IM2COL_SHADER")||g<=f)return Po({x:e,filter:i,convInfo:t,backend:s,bias:a,preluActivationWeights:r,leakyreluAlpha:n,activation:o});let x;const v=[t.padInfo.top,t.padInfo.left],C=[{type:"int32",data:[t.filterHeight,t.filterWidth]},{type:"int32",data:[...v]},{type:"int32",data:[t.strideHeight,t.strideWidth]},{type:"int32",data:[t.dilationHeight,t.dilationWidth]}];if(c)x=new ko(t,l,o,d);else{const P=h?t.outHeight*t.outWidth:t.outChannels,N=h?t.outChannels:t.outHeight*t.outWidth,D=t.filterHeight*t.filterWidth*t.inChannels;C.push({type:"int32",data:[P]},{type:"int32",data:[N]},{type:"int32",data:[D]});const E=s.adapterInfo.isIntel();x=new Io(t,P,N,D,l,o,d,E)}const b=[],y=[e,i];l&&(!h&&a.shape.length===1&&(a=$({inputs:{x:a},backend:s,attrs:{shape:[a.shape[0],1,1]}}),b.push(a)),y.push(a)),d&&(!h&&r.shape.length===1&&(r=$({inputs:{x:r},backend:s,attrs:{shape:[r.shape[0],1,1]}}),b.push(r)),y.push(r)),o==="leakyrelu"&&(C.push({type:"float32",data:[n]}),x.uniforms+=" alpha : f32,");const S=s.runWebGPUProgram(x,y,e.dtype,C);for(const P of b)s.disposeData(P.dataId);return S}function $o(e){const{inputs:i,attrs:t,backend:s}=e,{x:a,filter:r}=i,{strides:n,pad:o,dataFormat:l,dilations:d,dimRoundingMode:h}=t,p=u.backend_util.convertConv2DDataFormat(l),c=u.backend_util.computeConv2DInfo(a.shape,r.shape,n,d,o,h,!1,p);return Zt({x:a,filter:r,convInfo:c,backend:s})}var Do={kernelName:u.Conv2D,backendName:"webgpu",kernelFunc:$o},No=class{constructor(e){this.variableNames=["dy","W"],this.uniforms="filterDims : vec2<i32>, pads : vec2<i32>, strides : vec2<i32>, outBackprop : vec4<i32>,",this.workgroupSize=[64,1,1],this.size=!1,this.isVec4=!1,this.workPerThread=1,this.outputShape=e.inShape,this.isChannelsLast=e.dataFormat==="channelsLast",this.isVec4=this.isChannelsLast&&e.outChannels%4===0&&e.inChannels%4===0,this.isVec4?(this.workPerThread=2,this.outputComponent=4,this.workgroupSize=[4,4,4],this.dispatchLayout={x:[3],y:[2],z:[0,1]},this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[4,this.workPerThread,1])):(this.size=!0,this.workPerThread=1,this.workgroupSize=[64,1,1],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize)),this.shaderKey=`conv2DDerInput_${this.isChannelsLast}_${this.isVec4}_${this.workPerThread}`}getUserCode(){const e=this.isChannelsLast?1:2,i=this.isChannelsLast?2:3,t=this.isChannelsLast?3:1,s=`
    ${k()} {
      let batch = i32(globalId.z) / uniforms.outShape[1];
      let r = i32(globalId.z) % uniforms.outShape[1];
      let c = i32(globalId.y) * ${this.workPerThread};
      let d1 = i32(globalId.x) * 4;

      let dyCorner = vec2<i32>(r, c) - uniforms.pads;

      // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
      // ? = to be determined. : = across all values in that axis.
      var dotProd: array<vec4<f32>, ${this.workPerThread}>;
      for (var i = 0; i < ${this.workPerThread}; i++) {
        dotProd[i] = vec4<f32>(0.0);
      }
      for (var wR = 0; wR < uniforms.filterDims.x; wR = wR + 1) {
        let dyR = f32(dyCorner.x + wR) / f32(uniforms.strides.x);
        let wRPerm = uniforms.filterDims.x - 1 - wR;
        if (dyR < 0.0 || dyR >= f32(uniforms.outBackprop[1]) ||
            fract(dyR) > 0.0) {
          continue;
        }
        let idyR = i32(dyR);

        for (var wC = 0; wC < uniforms.filterDims.y; wC = wC + 1) {
          let dyC = f32(dyCorner.y + wC) / f32(uniforms.strides.y);
          let dyC2 = f32(dyCorner.y + 1 + wC) / f32(uniforms.strides.y);
          let wCPerm = uniforms.filterDims.y - 1 - wC;
          var bDyCVal = true;
          var bDyCVal2 = true;
          if (dyC < 0.0 || dyC >= f32(uniforms.outBackprop[2]) ||
              fract(dyC) > 0.0) {
            bDyCVal = false;
          }
          if (dyC2 < 0.0 || dyC2 >= f32(uniforms.outBackprop[2]) ||
              fract(dyC2) > 0.0) {
            bDyCVal2 = false;
          }

          let idyC = i32(dyC);
          let idyC2 = i32(dyC2);
          if (bDyCVal && bDyCVal2) {
            let d2Length = uniforms.outBackprop[3];
            for (var d2 = 0; d2 < d2Length; d2 = d2 + 4) {
              let wValue0 = getW(wRPerm, wCPerm, d1, d2);
              let wValue1 = getW(wRPerm, wCPerm, d1 + 1, d2);
              let wValue2 = getW(wRPerm, wCPerm, d1 + 2, d2);
              let wValue3 = getW(wRPerm, wCPerm, d1 + 3, d2);
              var xValue =  getDy(batch, idyR, idyC, d2);
              let tmpval = vec4<f32>(dot(xValue, wValue0),
                                     dot(xValue, wValue1),
                                     dot(xValue, wValue2),
                                     dot(xValue, wValue3));
              dotProd[0] = dotProd[0] + tmpval;
              xValue = getDy(batch, idyR, idyC2, d2);
              dotProd[1] = dotProd[1] + vec4<f32>(dot(xValue, wValue0),
                                                  dot(xValue, wValue1),
                                                  dot(xValue, wValue2),
                                                  dot(xValue, wValue3));
            }
          } else if (bDyCVal) {
            let d2Length = uniforms.outBackprop[3];
            for (var d2 = 0; d2 < d2Length; d2 = d2 + 4) {
              let wValue0 = getW(wRPerm, wCPerm, d1, d2);
              let wValue1 = getW(wRPerm, wCPerm, d1 + 1, d2);
              let wValue2 = getW(wRPerm, wCPerm, d1 + 2, d2);
              let wValue3 = getW(wRPerm, wCPerm, d1 + 3, d2);
              var xValue =  getDy(batch, idyR, idyC, d2);
              let tmpval = vec4<f32>(dot(xValue, wValue0),
                                     dot(xValue, wValue1),
                                     dot(xValue, wValue2),
                                     dot(xValue, wValue3));
              dotProd[0] = dotProd[0] + tmpval;
            }
          } else if (bDyCVal2) {
            let d2Length = uniforms.outBackprop[3];
            for (var d2 = 0; d2 < d2Length; d2 = d2 + 4) {
              let wValue0 = getW(wRPerm, wCPerm, d1, d2);
              let wValue1 = getW(wRPerm, wCPerm, d1 + 1, d2);
              let wValue2 = getW(wRPerm, wCPerm, d1 + 2, d2);
              let wValue3 = getW(wRPerm, wCPerm, d1 + 3, d2);
              var xValue =  getDy(batch, idyR, idyC2, d2);
              let tmpval = vec4<f32>(dot(xValue, wValue0),
                                     dot(xValue, wValue1),
                                     dot(xValue, wValue2),
                                     dot(xValue, wValue3));
              dotProd[1] = dotProd[1] + tmpval;
            }
          }
        }
      }

      for (var i = 0; i < ${this.workPerThread}; i = i + 1) {
        let coords = vec4<i32>(batch, r, c + i, d1);
        if (coordsInBounds4D(coords, uniforms.outShape)) {
          setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], dotProd[i]);
        }
      }
    }
    `;return this.isVec4?`
    ${s}
    `:`
    ${k("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d1 = coords[${t}];

        let dyCorner = vec2<i32>(coords[${e}], coords[${i}]) - uniforms.pads;
        let dyRCorner = dyCorner.x;
        let dyCCorner = dyCorner.y;

        // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var wR = 0; wR < uniforms.filterDims.x; wR = wR + 1) {
          let dyR = (f32(dyRCorner) + f32(wR)) / f32(uniforms.strides.x);
          let wRPerm = uniforms.filterDims.x - 1 - wR;
          if (dyR < 0.0 || dyR >= f32(uniforms.outBackprop[1]) || fract(dyR) > 0.0 ||
              wRPerm < 0) {
            continue;
          }
          let idyR = i32(dyR);

          for (var wC = 0; wC < uniforms.filterDims.y; wC = wC + 1) {
            let dyC = (f32(dyCCorner) + f32(wC)) / f32(uniforms.strides.y);
            let wCPerm = uniforms.filterDims.y - 1 - wC;
            if (dyC < 0.0 || dyC >= f32(uniforms.outBackprop[2]) ||
                fract(dyC) > 0.0 || wCPerm < 0) {
              continue;
            }
            let idyC = i32(dyC);

            for (var d2 = 0; d2 < uniforms.outBackprop[3]; d2 = d2 + 1) {
              let xValue = ${this.isChannelsLast?"getDy(batch, idyR, idyC, d2)":"getDy(batch, d2, idyR, idyC)"};
              let wValue = getW(wRPerm, wCPerm, d1, d2);
              dotProd = dotProd + xValue * wValue;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}},zo=class{constructor(e){this.variableNames=["x","dy"],this.uniforms="pads : vec2<i32>, strides : vec2<i32>, batchSize : i32, outHeight : i32, outWidth : i32, inHeight : i32, inWidth : i32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.filterShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.isChannelsLast=e.dataFormat==="channelsLast",this.shaderKey=`conv2DDerFilter_${this.isChannelsLast}`}getUserCode(){return`
    ${k("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let wR = coords[0];
        let wC = coords[1];
        let d1 = coords[2];
        let d2 = coords[3];

        // Convolve x(?, ?, d1) with dy(:, :, d2) to get dw(wR, wC, d1, d2).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var b = 0; b < uniforms.batchSize; b = b + 1) {
          for (var yR = 0; yR < uniforms.outHeight; yR = yR + 1) {
            let xR = wR + yR * uniforms.strides[0] - uniforms.pads[0];
            if (xR < 0 || xR >= uniforms.inHeight) {
              continue;
            }

            for (var yC = 0; yC < uniforms.outWidth; yC = yC + 1) {
              let xC = wC + yC * uniforms.strides[1] - uniforms.pads[1];

              if (xC < 0 || xC >= uniforms.inWidth) {
                continue;
              }

              if (${this.isChannelsLast}) {
                let dyValue = getDy(b, yR, yC, d2);
                let xValue = getX(b, xR, xC, d1);
                dotProd = dotProd + xValue * dyValue;
              } else {
                let dyValue = getDy(b, d2, yR, yC);
                let xValue = getX(b, d1, xR, xC);
                dotProd = dotProd + xValue * dyValue;
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}},Ao=class{constructor(e){this.variableNames=["x","dy"],this.uniforms=`pads : vec3<i32>, strides : vec3<i32>, batchSize : i32, outDepth : i32,
       outHeight : i32, outWidth : i32, inDepth : i32, inHeight : i32, inWidth : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.filterShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="conv3DDerFilter"}getUserCode(){return`
    ${k("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let wF = coords.x;
        let wR = coords.y;
        let wC = coords.z;
        let d1 = coords.w;
        let d2 = coords.u;

        var dotProd = 0.0;
        for (var b = 0; b < uniforms.batchSize; b++) {
          for (var yF = 0; yF < uniforms.outDepth; yF++) {
            let xF = wF + yF * uniforms.strides[0] - uniforms.pads[0];
            if (xF < 0 || xF >= uniforms.inDepth) {
              continue;
            }

            for (var yR = 0; yR < uniforms.outHeight; yR++) {
              let xR = wR + yR * uniforms.strides[1] - uniforms.pads[1];
              if (xR < 0 || xR >= uniforms.inHeight) {
                continue;
              }

              for (var yC = 0; yC < uniforms.outWidth; yC++) {
                let xC = wC + yC * uniforms.strides[2] - uniforms.pads[2];
                if (xC < 0 || xC >= uniforms.inWidth) {
                  continue;
                }

                let dyValue = getDy(b, yF, yR, yC, d2);
                let xValue = getX(b, xF, xR, xC, d1);
                dotProd += xValue * dyValue;
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}},Fo=class{constructor(e){this.variableNames=["dy","W"],this.uniforms=`filterDims : vec3<i32>, pads : vec3<i32>, strides : vec3<i32>,
      outDepth : i32, outHeight : i32, outWidth : i32, outChannels : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.inShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="conv3DDerInput"}getUserCode(){return`
    ${k("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords.x;
        let d1 = coords.u;

        let dyCorner = vec3<i32>(coords.y, coords.z, coords.w) - uniforms.pads;
        let dyFCorner = dyCorner.x;
        let dyRCorner = dyCorner.y;
        let dyCCorner = dyCorner.z;

        var dotProd = 0.0;
        for (var wF = 0; wF < uniforms.filterDims[0]; wF++) {
          let dyF = f32(dyFCorner + wF) / f32(uniforms.strides[0]);
          if (dyF < 0.0 || dyF >= f32(uniforms.outDepth) || fract(dyF) > 0.0) {
            continue;
          }
          let idyF = i32(dyF);

          let wFPerm = uniforms.filterDims[0] - 1 - wF;

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[1]);

            if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
              continue;
            }
            let idyR = i32(dyR);

            let wRPerm = uniforms.filterDims[1] - 1 - wR;

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[2]);

              if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
                continue;
              }
              let idyC = i32(dyC);

              let wCPerm = uniforms.filterDims[2] - 1 - wC;

              for (var d2 = 0; d2 < uniforms.outChannels; d2++) {
                let xValue = getDy(batch, idyF, idyR, idyC, d2);
                let wValue = getW(wFPerm, wRPerm, wCPerm, d1, d2);
                dotProd += xValue * wValue;
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}};function Eo(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,dy:r}=i,{strides:n,pad:o,dataFormat:l,dimRoundingMode:d,filterShape:h}=s,p=u.backend_util.convertConv2DDataFormat(l),c=u.backend_util.computeConv2DInfo(a.shape,h,n,1,o,d,!1,p),m=new zo(c),f=[{type:"int32",data:[c.padInfo.top,c.padInfo.left]},{type:"int32",data:[c.strideHeight,c.strideWidth]},{type:"int32",data:[c.batchSize]},{type:"int32",data:[c.outHeight]},{type:"int32",data:[c.outWidth]},{type:"int32",data:[c.inHeight]},{type:"int32",data:[c.inWidth]}];return t.runWebGPUProgram(m,[a,r],a.dtype,f)}var To={kernelName:u.Conv2DBackpropFilter,backendName:"webgpu",kernelFunc:Eo};function Lo(e=4){const i=s=>{switch(s){case 1:return"return W[getIndexFromCoords4D(coord, uniforms.wShape)];";case 4:return`
            let coord1 = vec4<i32>(coordX, coordY, col + 1, rowInner);
            let coord2 = vec4<i32>(coordX, coordY, col + 2, rowInner);
            let coord3 = vec4<i32>(coordX, coordY, col + 3, rowInner);
            let v0 = W[getIndexFromCoords4D(coord, uniforms.wShape)];
            let v1 = W[getIndexFromCoords4D(coord1, uniforms.wShape)];
            let v2 = W[getIndexFromCoords4D(coord2, uniforms.wShape)];
            let v3 = W[getIndexFromCoords4D(coord3, uniforms.wShape)];
            return vec4<f32>(v0, v1, v2, v3);
            `;default:throw new Error(`innerElementSize ${s} is not supported.`)}},t=`if (row < uniforms.dimAOuter && col < uniforms.dimInner) {
        ${`
      let outRow = row / uniforms.outShape[2];
      let outCol = row % uniforms.outShape[2];

      let WRow = col / (uniforms.filterDims[1] * uniforms.outBackprop[3]);
      let WCol = col / uniforms.outBackprop[3] % uniforms.filterDims[1];
      let xR = f32(outRow - uniforms.pads[0] + WRow) / f32(uniforms.strides[0]);
      let xC = f32(outCol - uniforms.pads[1] + WCol) / f32(uniforms.strides[1]);
      if (xR < 0.0 || xR >= f32(uniforms.outBackprop[1]) || fract(xR) > 0.0) {
        return ${A(e)}(0.0);
      }
      if (xC < 0.0 || xC >= f32(uniforms.outBackprop[2]) || fract(xC) > 0.0) {
        return ${A(e)}(0.0);
      }
      let coord = vec4<i32>(
          batch,
          i32(xR),
          i32(xC),
          col % uniforms.outBackprop[3]);
      return x[getIndexFromCoords4D(coord, uniforms.xShape)/${e}];`}
      }
      return ${A(e)}(0.0);`;return`
  fn mm_readA(batch: i32, row : i32, col : i32) -> ${A(e)} {
    ${t}
  }

  fn mm_readB(batch: i32, row : i32, col : i32) -> ${A(e)} {
    let coordX = uniforms.filterDims.x - 1 -
        row / (uniforms.filterDims[1] * uniforms.outBackprop[3]);
    let coordY = uniforms.filterDims.y - 1 -
        (row / uniforms.outBackprop[3]) % uniforms.filterDims[1];
    if (row < uniforms.dimInner && col < uniforms.dimBOuter &&
        coordX >= 0 && coordY >= 0) {
      let rowInner = row % uniforms.outBackprop[3];
      let coord = vec4<i32>(coordX, coordY, col, rowInner);
      ${i(e)}
    }
    return ${A(e)}(0.0);
  }

  fn mm_write(batch: i32, row : i32, col : i32, valueInput : ${A(e)}) {
    if (row < uniforms.dimAOuter && col < uniforms.dimBOuter) {
      var value = valueInput;
      let outCoord = vec4<i32>(
          batch,
          row / uniforms.outShape[2],
          row % uniforms.outShape[2],
          col);
      result[getIndexFromCoords4D(outCoord, uniforms.outShape)/${e}] = value;
    }
  }`}var Bo=class{constructor(e){this.variableNames=["x","W"],this.uniforms="filterDims : vec2<i32>, pads : vec2<i32>, strides : vec2<i32>, outBackprop : vec4<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.outputShape=e.inShape,u.util.assert(e.dataFormat==="channelsLast",()=>"TODO: NCHW is unimplemented"),this.isVec4=e.inChannels%4===0&&e.outChannels%4===0,this.dispatchLayout={x:[3],y:[1,2],z:[0]},this.workgroupSize=Ae(this.dispatchLayout,this.outputShape,this.isVec4),this.elementsPerThread=Fe(this.dispatchLayout,this.outputShape,this.isVec4),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,this.elementsPerThread),this.isVec4&&(this.outputComponent=4,this.variableComponents=[4,1]),this.shaderKey=`conv2DDerInputMM_${this.isVec4}_${this.elementsPerThread}`}getUserCode(){const e=this.isVec4?ke(this.elementsPerThread,this.workgroupSize):we(this.elementsPerThread,this.workgroupSize);return`
    ${Lo(this.isVec4?4:1)}
    ${e}
    `}};function Wo(e){const{inputs:i,backend:t,attrs:s}=e,{dy:a,filter:r}=i,{inputShape:n,strides:o,pad:l,dataFormat:d,dimRoundingMode:h}=s,p=u.backend_util.convertConv2DDataFormat(d),c=u.backend_util.computeConv2DInfo(n,r.shape,o,1,l,h,!1,p),m=[{type:"int32",data:[c.filterHeight,c.filterWidth]},{type:"int32",data:[c.filterHeight-1-c.padInfo.top,c.filterWidth-1-c.padInfo.left]},{type:"int32",data:[c.strideHeight,c.strideWidth]},{type:"int32",data:[c.batchSize,c.outHeight,c.outWidth,c.outChannels]}];let f;if((0,u.env)().getBool("WEBGPU_USE_NAIVE_CONV2D_TRANSPOSE")||c.dataFormat!=="channelsLast")f=new No(c);else{f=new Bo(c);const g=c.inHeight*c.inWidth,x=c.inChannels,v=c.filterHeight*c.filterWidth*c.outChannels;m.push({type:"uint32",data:[g]},{type:"uint32",data:[x]},{type:"uint32",data:[v]})}return t.runWebGPUProgram(f,[a,r],"float32",m)}var Vo={kernelName:u.Conv2DBackpropInput,backendName:"webgpu",kernelFunc:Wo},Mo=class{constructor(e){this.variableNames=["x","W"],this.uniforms="filterDims: vec3<i32>, pads: vec3<i32>, strides: vec3<i32>, dilations: vec3<i32>,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.outShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="conv3dnaive"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let batch = coords.x;
        let d2 = coords.u;

        let xFRCCorner = vec3<i32>(coords.y, coords.z, coords.w) * uniforms.strides - uniforms.pads;
        let xFCorner = xFRCCorner.x;
        let xRCorner = xFRCCorner.y;
        let xCCorner = xFRCCorner.z;

        let inputDepthNearestVec4 = (uniforms.xShape.u / 4) * 4;
        let inputDepthVec4Remainder = uniforms.xShape.u % 4;

        var dotProd = 0.0;
        for (var wF = 0; wF < uniforms.filterDims[0]; wF++) {
          let xF = xFCorner + wF * uniforms.dilations[0];
          if (xF < 0 || xF >= uniforms.xShape.y) {
            continue;
          }

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let xR = xRCorner + wR * uniforms.dilations[1];
            if (xR < 0 || xR >= uniforms.xShape.z) {
              continue;
            }

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let xC = xCCorner + wC * uniforms.dilations[2];
              if (xC < 0 || xC >= uniforms.xShape.w) {
                continue;
              }

              for (var d1 = 0; d1 < inputDepthNearestVec4; d1 += 4) {
                let xValues = vec4<f32>(
                  getX(batch, xF, xR, xC, d1),
                  getX(batch, xF, xR, xC, d1 + 1),
                  getX(batch, xF, xR, xC, d1 + 2),
                  getX(batch, xF, xR, xC, d1 + 3)
                );
                let wValues = vec4<f32>(
                  getW(wF, wR, wC, d1, d2),
                  getW(wF, wR, wC, d1 + 1, d2),
                  getW(wF, wR, wC, d1 + 2, d2),
                  getW(wF, wR, wC, d1 + 3, d2)
                );

                dotProd += dot(xValues, wValues);
              }

              if (inputDepthVec4Remainder == 1) {
                dotProd += getX(batch, xF, xR, xC, inputDepthNearestVec4) *
                  getW(wF, wR, wC, inputDepthNearestVec4, d2);
              } else if (inputDepthVec4Remainder == 2) {
                let xValues = vec2<f32>(
                  getX(batch, xF, xR, xC, inputDepthNearestVec4),
                  getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1)
                );
                let wValues = vec2<f32>(
                  getW(wF, wR, wC, inputDepthNearestVec4, d2),
                  getW(wF, wR, wC, inputDepthNearestVec4 + 1, d2)
                );
                dotProd += dot(xValues, wValues);
              } else if (inputDepthVec4Remainder == 3) {
                let xValues = vec3<f32>(
                  getX(batch, xF, xR, xC, inputDepthNearestVec4),
                  getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                  getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2)
                );
                let wValues = vec3<f32>(
                  getW(wF, wR, wC, inputDepthNearestVec4, d2),
                  getW(wF, wR, wC, inputDepthNearestVec4 + 1, d2),
                  getW(wF, wR, wC, inputDepthNearestVec4 + 2, d2)
                );
                dotProd += dot(xValues, wValues);
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }`}};function Oo(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,filter:r}=i,{strides:n,pad:o,dilations:l}=s,d=u.backend_util.computeConv3DInfo(a.shape,r.shape,n,l,o),h=[d.padInfo.front,d.padInfo.top,d.padInfo.left],p=[{type:"int32",data:[d.filterDepth,d.filterHeight,d.filterWidth]},{type:"int32",data:[...h]},{type:"int32",data:[d.strideDepth,d.strideHeight,d.strideWidth]},{type:"int32",data:[d.dilationDepth,d.dilationHeight,d.dilationWidth]}],c=new Mo(d),m=(0,u.upcastType)(a.dtype,r.dtype);return t.runWebGPUProgram(c,[a,r],m,p)}var Uo={kernelName:u.Conv3D,backendName:"webgpu",kernelFunc:Oo};function Go(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,dy:r}=i,{strides:n,pad:o,filterShape:l}=s,d=u.backend_util.computeConv3DInfo(a.shape,l,n,1,o),h=new Ao(d),p=[{type:"int32",data:[d.padInfo.front,d.padInfo.top,d.padInfo.left]},{type:"int32",data:[d.strideDepth,d.strideHeight,d.strideWidth]},{type:"int32",data:[d.batchSize]},{type:"int32",data:[d.outDepth]},{type:"int32",data:[d.outHeight]},{type:"int32",data:[d.outWidth]},{type:"int32",data:[d.inDepth]},{type:"int32",data:[d.inHeight]},{type:"int32",data:[d.inWidth]}];return t.runWebGPUProgram(h,[a,r],r.dtype,p)}var Ho={kernelName:u.Conv3DBackpropFilterV2,backendName:"webgpu",kernelFunc:Go};function qo(e){const{inputs:i,backend:t,attrs:s}=e,{dy:a,filter:r}=i,{strides:n,pad:o,inputShape:l}=s,d=u.backend_util.computeConv3DInfo(l,r.shape,n,1,o),h=new Fo(d),p=[{type:"int32",data:[d.filterDepth,d.filterHeight,d.filterWidth]},{type:"int32",data:[d.filterDepth-1-d.padInfo.front,d.filterHeight-1-d.padInfo.top,d.filterWidth-1-d.padInfo.left]},{type:"int32",data:[d.strideDepth,d.strideHeight,d.strideWidth]},{type:"int32",data:[d.outDepth]},{type:"int32",data:[d.outHeight]},{type:"int32",data:[d.outWidth]},{type:"int32",data:[d.outChannels]}];return t.runWebGPUProgram(h,[a,r],a.dtype,p)}var Xo={kernelName:u.Conv3DBackpropInputV2,backendName:"webgpu",kernelFunc:qo},Ko=F({opType:I.COS}),Yo={kernelName:u.Cos,backendName:"webgpu",kernelFunc:Ko},Qo=F({opType:I.COSH}),Zo={kernelName:u.Cosh,backendName:"webgpu",kernelFunc:Qo},Jo=class{constructor(e,i,t,s){this.variableNames=["Image","Boxes","BoxInd"],this.uniforms="extrapolationValue : f32,",this.workgroupSize=[64,1,1],this.size=!0;const[a]=i;this.outputShape=[a,t[0],t[1],e],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.methodId=s==="bilinear"?1:0,this.cropHeightBiggerThan1=this.outputShape[1]>1,this.cropWidthBiggerThan1=this.outputShape[2]>1,this.shaderKey=`cropAndResize_${this.methodId}_${this.cropHeightBiggerThan1}_${this.cropWidthBiggerThan1}`}getUserCode(){const[e,i]=["f32(uniforms.imageShape[1] - 1)","f32(uniforms.imageShape[2] - 1)"],[t,s,a]=this.cropHeightBiggerThan1?[`(${e} / f32(uniforms.outShape[1] - 1))`,"(y2-y1) * height_ratio",`y1*${e} + f32(y)*(height_scale)`]:["0.0","0.0",`0.5 * (y1+y2) * ${e}`],[r,n,o]=this.cropWidthBiggerThan1?[`(${i} / f32(uniforms.outShape[2] - 1))`,"(x2-x1) * width_ratio",`x1*${i} + f32(x)*(width_scale)`]:["0.0","0.0",`0.5 * (x1+x2) * ${i}`];return`
    ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let height_ratio = f32(${t});
        let width_ratio = f32(${r});
        let b = coords[0];
        let y = coords[1];
        let x = coords[2];
        let d = coords[3];
        // get box vals
        let y1 = getBoxes(b, 0);
        let x1 = getBoxes(b, 1);
        let y2 = getBoxes(b, 2);
        let x2 = getBoxes(b, 3);
        // get image in batch index
        let bInd = i32(round(getBoxInd(b)));
        if(bInd < 0 || bInd >= uniforms.outShape[0]) {
          return;
        }
        let height_scale = ${s};
        let width_scale = ${n};
        let in_y = ${a};
        if( in_y < 0.0 || in_y > ${e} ) {
          setOutputAtIndex(index, uniforms.extrapolationValue);
          return;
        }
        let in_x = ${o};
        if( in_x < 0.0 || in_x > ${i} ) {
          setOutputAtIndex(index, uniforms.extrapolationValue);
          return;
        }
        let sourceFracIndexCR = vec2<f32>(in_x,in_y);
        if(${this.methodId} == 1) {
          // Compute the four integer indices.
          let sourceFloorCR = vec2<i32>(sourceFracIndexCR);
          let sourceCeilCR = vec2<i32>(ceil(sourceFracIndexCR));
          let topLeft = getImage(bInd, sourceFloorCR.y, sourceFloorCR.x, d);
          let bottomLeft = getImage(bInd, sourceCeilCR.y, sourceFloorCR.x, d);
          let topRight = getImage(bInd, sourceFloorCR.y, sourceCeilCR.x, d);
          let bottomRight = getImage(bInd, sourceCeilCR.y, sourceCeilCR.x, d);
          let fracCR = sourceFracIndexCR - vec2<f32>(sourceFloorCR);
          let top = topLeft + (topRight - topLeft) * fracCR.x;
          let bottom = bottomLeft + (bottomRight - bottomLeft) * fracCR.x;
          let newValue = top + (bottom - top) * fracCR.y;
          setOutputAtIndex(index, newValue);
        } else {
          // Compute the coordinators of nearest neighbor point.
          let sourceNearestCR = vec2<i32>(floor(
            sourceFracIndexCR + vec2<f32>(0.5,0.5)));
          let newValue = getImage(
            bInd, sourceNearestCR.y, sourceNearestCR.x, d);
          setOutputAtIndex(index, newValue);
        }
      }
    }
    `}},jo=e=>{const{inputs:i,backend:t,attrs:s}=e,{image:a,boxes:r,boxInd:n}=i,{cropSize:o,method:l,extrapolationValue:d}=s,h=new Jo(a.shape[3],r.shape,o,l),p=[{type:"float32",data:[d]}];return t.runWebGPUProgram(h,[a,r,n],"float32",p)},_o={kernelName:u.CropAndResize,backendName:"webgpu",kernelFunc:jo},ve;(function(e){e.Prod="*",e.Sum="+"})(ve||(ve={}));var Jt=class{constructor(e,i,t,s){this.variableNames=["x"],this.uniforms="index : f32,",this.size=!0,this.workgroupSize=[128,1,1],this.outputShape=i,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.exclusive=t,this.reverse=s,this.op=e,this.shaderKey=`cum_${this.op}_${this.exclusive}_${this.reverse}`}getUserCode(){const e=this.outputShape.length,i=this.op===ve.Prod?"1.0":"0.0",t=this.exclusive?i:`getX(${jt(e,"coords",this.op)})`,s=this.outputShape[this.outputShape.length-1];let a="",r="";return this.exclusive?(a=this.reverse?`end != ${s-1}`:"end != 0",r=this.reverse?"end + 1":"end - 1"):(a=this.reverse?`end + pow2 < ${s}`:"end >= pow2",r=this.reverse?"end + pow2":"end - pow2"),`
      ${k("index")} {
       if (index < uniforms.size) {
         var coords = getCoordsFromIndex(index);

         let end = ${_t(e,"coords",this.op)};
         var val = ${t};
         let pow2 = i32(pow(2.0, uniforms.index));
         if (${a}) {
           let idx = ${r};
           ${_t(e,"coords",this.op)} = idx;
           val ${this.op}= getX(${jt(e,"coords",this.op)});
         }
         setOutputAtIndex(index, val);
       }
      }
    `}};function jt(e,i,t){if(e===1)return`${i}`;if(e===2)return`${i}.x, ${i}.y`;if(e===3)return`${i}.x, ${i}.y, ${i}.z`;if(e===4)return`${i}.x, ${i}.y, ${i}.z, ${i}.w`;throw Error(`Cumulative ${t} for rank ${e} is not yet supported`)}function _t(e,i,t){if(e===1)return`${i}`;if(e===2)return`${i}.y`;if(e===3)return`${i}.z`;if(e===4)return`${i}.w`;throw Error(`Cumulative ${t} for rank ${e} is not yet supported`)}function ei(e,i,t,s,a,r){const n=i.shape.length,o=u.backend_util.getAxesPermutation([s],n);let l=i;o!=null&&(l=J({inputs:{x:i},backend:t,attrs:{perm:o}}));const d=u.backend_util.getInnerMostAxes(1,n)[0];if(d!==n-1)throw new Error(`WebGPU cumprod shader expects an inner-most axis=${i.shape.length-1} but got axis=${s}`);const h=l.shape[d];let p=q({inputs:{x:l},backend:t});for(let c=0;c<=Math.ceil(Math.log2(h))-1;c++){const m=new Jt(e,l.shape,!1,r),f=p,g=[{type:"float32",data:[c]}];p=t.runWebGPUProgram(m,[p],p.dtype,g),t.disposeData(f.dataId)}if(a){const c=new Jt(e,l.shape,a,r),m=p;p=t.runWebGPUProgram(c,[p],p.dtype,[{type:"float32",data:[0]}]),t.disposeData(m.dataId)}if(o!=null){const c=u.backend_util.getUndoAxesPermutation(o),m=J({inputs:{x:p},backend:t,attrs:{perm:c}});return t.disposeData(p.dataId),t.disposeData(l.dataId),m}return p}function eu(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{axis:r,exclusive:n,reverse:o}=s;return ei(ve.Prod,a,t,r,n,o)}var tu={kernelName:u.Cumprod,backendName:"webgpu",kernelFunc:eu};function iu(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{axis:r,exclusive:n,reverse:o}=s;return ei(ve.Sum,a,t,r,n,o)}var au={kernelName:u.Cumsum,backendName:"webgpu",kernelFunc:iu};function su(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,weights:r}=i,{size:n,binaryOutput:o}=s,l=a.shape.length===1,d=u.util.sizeFromShape(r.shape)>0,h=r.dtype,p=l?[a.shape[0]]:[a.shape[0],a.shape[1]],c=l?[n]:[a.shape[0],n],m=U({backend:t,attrs:{shape:c,value:0,dtype:h}}),f=new Xt(p,d,o),g=[{type:"int32",data:[n]}],x=d?[a,r]:[a];return t.runWebGPUProgram(f,x,h,g,m)}var ru={kernelName:u.DenseBincount,backendName:"webgpu",kernelFunc:su},nu=class{constructor(e,i){this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.uniforms="blockSize : i32,",this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey=`depthToSpace_${i}`,this.dataFormat=i}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let b = coords[0];
          let h = ${this.getHeightCoordString()};
          let w = ${this.getWidthCoordString()};
          let d = ${this.getDepthCoordString()};

          let in_h = h / uniforms.blockSize;
          let offset_h = h % uniforms.blockSize;
          let in_w = w / uniforms.blockSize;
          let offset_w = w % uniforms.blockSize;
          let offset_d = (offset_h * uniforms.blockSize + offset_w) *
            ${this.getOutputDepthSize()};
          let in_d = d + offset_d;

          let rlt = ${this.getInputSamplingString()};
          setOutputAtIndex(index, rlt);
        }
      }`}getHeightCoordString(){return this.dataFormat==="NHWC"?"coords[1]":"coords[2]"}getWidthCoordString(){return this.dataFormat==="NHWC"?"coords[2]":"coords[3]"}getDepthCoordString(){return this.dataFormat==="NHWC"?"coords[3]":"coords[1]"}getOutputDepthSize(){return this.dataFormat==="NHWC"?"uniforms.outShape[3]":"uniforms.outShape[1]"}getInputSamplingString(){return this.dataFormat==="NHWC"?"getX(b, in_h, in_w, in_d)":"getX(b, in_d, in_h, in_w)"}};function ou(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{blockSize:r,dataFormat:n}=s,o=a.shape[0],l=n==="NHWC"?a.shape[1]:a.shape[2],d=n==="NHWC"?a.shape[2]:a.shape[3],h=n==="NHWC"?a.shape[3]:a.shape[1],p=l*r,c=d*r,m=h/(r*r),f=n==="NHWC"?[o,p,c,m]:[o,m,p,c],g=[{type:"int32",data:[r]}],x=new nu(f,n);return t.runWebGPUProgram(x,[a],a.dtype,g)}var uu={kernelName:u.DepthToSpace,backendName:"webgpu",kernelFunc:ou},lu=class{constructor(e,i,t,s=!1,a=null,r=!1){this.variableNames=["x","W"],this.uniforms="pads : vec2<i32>, inDims : vec2<i32>,",this.workgroupSize=[16,16,1],this.outputShape=e,this.dispatchLayout={x:[3],y:[2],z:[0,1]},this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),s&&this.variableNames.push("bias"),r&&this.variableNames.push("preluActivationWeights"),this.addBias=s,this.activation=a,this.hasPreluActivation=r,this.filterHeight=i,this.filterWidth=t,this.shaderKey=`depthwiseNCHW_${this.activation}_${this.filterHeight}_${this.filterWidth}`}getUserCode(){const e=this.filterWidth*this.filterHeight,i=this.workgroupSize[0]*this.workgroupSize[1]*this.workgroupSize[2],t=this.workgroupSize[1]+this.filterHeight-1,s=this.workgroupSize[0]+this.filterWidth-1;return`
      ${_(this.activation,this.hasPreluActivation,!1,4)}

      var<workgroup> mm_Asub : array<array<f32, ${s}>, ${t}>;
      var<workgroup> mm_Bsub : array<array<f32, ${this.filterWidth}>, ${this.filterHeight}>;
      fn readX(batch : i32, channel : i32, row : i32, col : i32) -> f32 {
        var value = 0.0;
        if (row >=0 && row < uniforms.inDims[0] && col >=0 && col < uniforms.inDims[1])
        {
          value = getX(batch, channel, row, col);
        }
        return value;
      }

      ${k()} {
        let coords = getOutputCoords();
        let batch = coords[0];
        let xRCCorner = vec2<i32>(coords.zw) - uniforms.pads;
        let channelMul = uniforms.wShape[3];
        let d1 = coords[1] / channelMul;
        let q = coords[1] % channelMul;

        let inputRowStart = xRCCorner.x;
        let inputColStart = xRCCorner.y;

        let localRow = i32(localId.y);
        let localCol = i32(localId.x);

        // Load one tile of X into local memory.
        for (var inputRow = localRow; inputRow < ${t}; inputRow = inputRow + ${this.workgroupSize[1]}) {
          for (var inputCol = localCol; inputCol < ${s}; inputCol = inputCol + ${this.workgroupSize[0]}) {
            let rowOffset = inputRow - localRow;
            let colOffset = inputCol - localCol;
            mm_Asub[inputRow][inputCol] = readX(batch, d1, inputRowStart + rowOffset, inputColStart + colOffset);
          }
        }

        // Load one tile of W into local memory.
        var wIndex = i32(localIndex);
        ${e<i?`if (wIndex < ${e})`:`for(; wIndex < ${e}; wIndex = wIndex + ${i})`}

        {
          let wRow = wIndex / ${this.filterWidth};
          let wCol = wIndex % ${this.filterWidth};
          mm_Bsub[wRow][wCol] = getW(wRow, wCol, d1, q);
        }

        workgroupBarrier();

        var value = 0.0;
        for (var wR = 0; wR < ${this.filterHeight}; wR = wR + 1) {
          for (var wC = 0; wC < ${this.filterWidth}; wC = wC + 1) {
            let xVal = mm_Asub[localRow + wR][localCol + wC];
            let wVal = mm_Bsub[wR][wC];
            value = fma(xVal, wVal, value);
          }
        }
        ${re(this.addBias,this.activation)}
        if (coordsInBounds4D(coords, uniforms.outShape)) {
          setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
        }
      }
    `}},ti=class{constructor(e,i=!1,t=null,s=!1){this.variableNames=["x","W"],this.uniforms="pads : vec2<i32>, inDims : vec2<i32>, virtualWidth : i32,",this.workgroupSize=[64,1,1],this.workPerThread=4,this.outputComponent=4,this.outputShape=e.outShape,this.virtualWidth=Math.ceil(this.outputShape[2]/this.workPerThread)*this.workPerThread;const a=[this.outputShape[0],this.outputShape[1],this.virtualWidth,this.outputShape[3]];this.dispatchLayout=R(a),this.dispatch=w(this.dispatchLayout,a,this.workgroupSize,[this.outputComponent*this.workPerThread,1,1]),u.util.assert(e.dataFormat==="channelsLast",()=>"TODO: NCHW is unimplemented"),i&&this.variableNames.push("bias"),s&&this.variableNames.push("preluActivationWeights"),this.convInfo=e,this.addBias=i,this.activation=t,this.hasPreluActivation=s,this.shaderKey=`depthwiseVec4_${t}_${this.convInfo.filterHeight}_${this.convInfo.filterWidth}_${this.convInfo.strideHeight}_${this.convInfo.strideWidth}_${this.workPerThread}`}getUserCode(){const e=(this.workPerThread-1)*this.convInfo.strideWidth+this.convInfo.filterWidth,i=this.convInfo.strideHeight,t=this.convInfo.strideWidth;return`
      ${_(this.activation,this.hasPreluActivation,!0,4)}
      fn readX(batch : i32, row : i32, col : i32, channel : i32) -> vec4<f32> {
        var value = vec4<f32>(0.0);
        if (col >=0 && col < uniforms.inDims[1]) {
          value = getX(batch, row, col, channel);
        }
        return value;
      }

      ${k("index")} {
        let width0 = uniforms.outShape[3] / ${this.outputComponent};
        let d1 = (index % width0) * ${this.outputComponent};
        var index1 = index / width0;
        let width1 = uniforms.virtualWidth / ${this.workPerThread};
        let c = (index1 % width1) * ${this.workPerThread};
        index1 = index1 / width1;
        let r = index1 % uniforms.outShape[1];
        let batch = index1 / uniforms.outShape[1];

        let xRCCorner = vec2<i32>(r, c) * vec2<i32>(${i}, ${t}) - uniforms.pads;

        let xRCorner = xRCCorner.x;
        let xCCorner = xRCCorner.y;
        var xVals : array<vec4<f32>, ${e}>;
        var dotProd : array<vec4<f32>, ${this.workPerThread}>;
        for (var i = 0; i < ${this.workPerThread}; i++) {
          dotProd[i] = vec4<f32>(0.0);
        }

        // Use constant instead of uniform can give better performance.
        for (var wR = 0; wR < ${this.convInfo.filterHeight}; wR = wR + 1) {
          let xR = xRCorner + wR;
          if (xR >=0 && xR < uniforms.inDims[0]) {
            for (var i = 0; i < ${e}; i++) {
              xVals[i] = readX(batch, xR, xCCorner + i, d1);
            }
            for (var wC = 0; wC < ${this.convInfo.filterWidth}; wC = wC + 1) {
              let wValue = getW(wR, wC, d1, 0);
              for (var i = 0; i < ${this.workPerThread}; i++) {
                dotProd[i] = fma(xVals[i * ${t} + wC], wValue, dotProd[i]);
              }
            }
          }
        }

        for (var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let coords = vec4<i32>(batch, r, c + i, d1);
          if (coordsInBounds4D(coords, uniforms.outShape)) {
            var value = dotProd[i];
            ${re(this.addBias,this.activation)}
            setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
          }
        }
      }
    `}},ii=class{constructor(e,i=!1,t=null,s=!1){this.variableNames=["x","W"],this.uniforms=`pads : vec2<i32>, inDims : vec2<i32>, filterHeight : i32,
      filterWidth : i32, strides : vec2<i32>, dilations : vec2<i32>,`,this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=e.outShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.isChannelsLast=e.dataFormat==="channelsLast",i&&this.variableNames.push("bias"),s&&this.variableNames.push("preluActivationWeights"),this.convInfo=e,this.addBias=i,this.activation=t,this.hasPreluActivation=s,this.shaderKey=`depthwise_${this.activation}_${this.isChannelsLast}`}getUserCode(){const e=this.isChannelsLast?"getX(batch, xR, xC, d1);":"getX(batch, d1, xR, xC);";return`
      ${_(this.activation,this.hasPreluActivation,!1,4)}

      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let batch = coords[0];
          let xRCCorner = vec2<i32>(coords.${this.isChannelsLast?"yz":"zw"}) * uniforms.strides - uniforms.pads;
          let d2 = coords[${this.isChannelsLast?3:1}];
          let channelMul = uniforms.wShape[3];
          let d1 = d2 / channelMul;
          let q = d2 % channelMul;

          let inputRowStart = xRCCorner.x;
          let inputColStart = xRCCorner.y;
          let inputRowEnd = inputRowStart + uniforms.filterHeight *
              uniforms.dilations[0];
          let inputColEnd = inputColStart + uniforms.filterWidth *
              uniforms.dilations[1];

          // Convolve x(?, ?, d1)|x(d1, ?, ?) with w(:, :, d1, q) to get
          // y(yR, yC, d2)|y(d2, yR, yC). ? = to be determined. : = across all
          // values in that axis. x(?, ?, d1) and y(yR, yC, d2) is for NHWC.
          // x(d1, ?, ?) and y(d2, yR, yC) is for NCHW.
          var value = 0.0;

          // Extract if checking out of for loop for performance.
          if (inputRowStart >= 0 && inputColStart >= 0 &&
            inputRowEnd < uniforms.inDims[0] &&
                inputColEnd < uniforms.inDims[1]) {
              for (var wR = 0; wR < uniforms.filterHeight; wR = wR + 1) {
                let xR = inputRowStart + wR * uniforms.dilations[0];

                for (var wC = 0; wC < uniforms.filterWidth; wC = wC + 1) {
                  let xC = inputColStart + wC * uniforms.dilations[1];

                  let xVal = ${e};
                  let wVal = getW(wR, wC, d1, q);
                  value = value + xVal * wVal;
                }
              }
            } else {
              for (var wR = 0; wR < uniforms.filterHeight; wR = wR + 1) {
                let xR = inputRowStart + wR * uniforms.dilations[0];

                if (xR < 0 || xR >= uniforms.inDims[0]) {
                  continue;
                }

                for (var wC = 0; wC < uniforms.filterWidth; wC = wC + 1) {
                  let xC = inputColStart + wC * uniforms.dilations[1];

                  if (xC < 0 || xC >= uniforms.inDims[1]) {
                    continue;
                  }

                  let xVal = ${e};
                  let wVal = getW(wR, wC, d1, q);
                  value = value + xVal * wVal;
                }
              }
            }
            ${re(this.addBias,this.activation)}
          setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
        }
      }
    `}};function du(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,filter:r}=i,{strides:n,pad:o,dataFormat:l,dilations:d,dimRoundingMode:h}=s,p=u.backend_util.convertConv2DDataFormat(l);let c=d;c==null&&(c=[1,1]);const m=u.backend_util.computeConv2DInfo(a.shape,r.shape,n,c,o,h,!0,p),f=[{type:"int32",data:[m.padInfo.top,m.padInfo.left]},{type:"int32",data:[m.inHeight,m.inWidth]}],g=m.dataFormat==="channelsLast";let x;return!g&&m.inHeight>16&&m.inWidth>16&&m.strideHeight===1&&m.strideWidth===1&&m.dilationWidth===1&&m.dilationHeight===1&&m.inChannels===m.outChannels?x=new lu(m.outShape,m.filterHeight,m.filterWidth):g&&m.outHeight>4&&m.outWidth>4&&m.strideWidth<=2&&m.inChannels===m.outChannels&&m.dilationHeight===1&&m.dilationWidth===1&&m.inChannels%4===0?(x=new ti(m),f.push({type:"int32",data:[x.virtualWidth]})):(x=new ii(m),f.push({type:"int32",data:[m.filterHeight]},{type:"int32",data:[m.filterWidth]},{type:"int32",data:[m.strideHeight,m.strideWidth]},{type:"int32",data:[m.dilationHeight,m.dilationWidth]})),t.runWebGPUProgram(x,[a,r],a.dtype,f)}var hu={kernelName:u.DepthwiseConv2dNative,backendName:"webgpu",kernelFunc:du},pu=class{constructor(e){this.variableNames=["x","dy"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, filterDims : vec2<i32>, outHeight : i32,
      outWidth : i32, inHeight : i32, inWidth : i32, batchSize : i32, channelMul : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.filterShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="depthwise_conv2d_backprop_filter"}getUserCode(){return`
      ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let wR = coords[0];
        let wC = coords[1];
        let d1 = coords[2];
        let dm = coords[3];
        let d2 = d1 * uniforms.channelMul + dm;

        var dotProd = 0.0;
        for (var b = 0; b < uniforms.batchSize; b++) {
          for (var yR = 0; yR < uniforms.outHeight; yR++) {
            let xR = wR + yR * uniforms.strides[0] - uniforms.pads[0];

            if (xR < 0 || xR >= uniforms.inHeight) {
              continue;
            }

            for (var yC = 0; yC < uniforms.outWidth; yC++) {
              let xC = wC + yC * uniforms.strides[1] - uniforms.pads[1];

              if (xC < 0 || xC >= uniforms.inWidth) {
                continue;
              }

              let dyValue = getDy(b, yR, yC, d2);
              let xValue = getX(b, xR, xC, d1);
              dotProd += xValue * dyValue;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}},cu=class{constructor(e){this.variableNames=["dy","W"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, filterDims : vec2<i32>,
       outHeight : i32, outWidth : i32, channelMul : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.inShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="depthwise_conv2d_backprop_input"}getUserCode(){return`
      ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d1 = coords[3];
        let dyCorner = coords.yz - uniforms.pads;
        let dyRCorner = dyCorner.x;
        let dyCCorner = dyCorner.y;

        var dotProd = 0.0;
        for (var wR = 0; wR < uniforms.filterDims[0]; wR++) {
          let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[0]);

          if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
            continue;
          }

          let idyR = i32(dyR);
          let wRPerm = uniforms.filterDims[0] - 1 - wR;

          for (var wC = 0; wC < uniforms.filterDims[1]; wC++) {
            let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[1]);

            if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
              continue;
            }

            let idyC = i32(dyC);
            let wCPerm = uniforms.filterDims[1] - 1 - wC;

            for (var dm = 0; dm < uniforms.channelMul; dm++) {
              let d2 = d1 * uniforms.channelMul + dm;
              let xValue = getDy(batch, idyR, idyC, d2);
              let wValue = getW(wRPerm, wCPerm, d1, dm);
              dotProd += xValue * wValue;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}};function mu(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,dy:r}=i,{strides:n,dilations:o,pad:l,dimRoundingMode:d,filterShape:h}=s,p=u.backend_util.computeConv2DInfo(a.shape,h,n,o,l,d,!0),c=new pu(p),m=[{type:"int32",data:[p.strideHeight,p.strideWidth]},{type:"int32",data:[p.padInfo.top,p.padInfo.left]},{type:"int32",data:[p.filterHeight,p.filterWidth]},{type:"int32",data:[p.outHeight]},{type:"int32",data:[p.outWidth]},{type:"int32",data:[p.inHeight]},{type:"int32",data:[p.inWidth]},{type:"int32",data:[p.batchSize]},{type:"int32",data:[p.outChannels/p.inChannels]}];return t.runWebGPUProgram(c,[a,r],"float32",m)}var fu={kernelName:u.DepthwiseConv2dNativeBackpropFilter,backendName:"webgpu",kernelFunc:mu};function gu(e){const{inputs:i,backend:t,attrs:s}=e,{dy:a,filter:r}=i,{strides:n,dilations:o,pad:l,dimRoundingMode:d,inputShape:h}=s,p=u.backend_util.computeConv2DInfo(h,r.shape,n,o,l,d,!0),c=new cu(p),m=[{type:"int32",data:[p.strideHeight,p.strideWidth]},{type:"int32",data:[p.filterHeight-1-p.padInfo.top,p.filterWidth-1-p.padInfo.left]},{type:"int32",data:[p.filterHeight,p.filterWidth]},{type:"int32",data:[p.outHeight]},{type:"int32",data:[p.outWidth]},{type:"int32",data:[p.outChannels/p.inChannels]}];return t.runWebGPUProgram(c,[a,r],a.dtype,m)}var xu={kernelName:u.DepthwiseConv2dNativeBackpropInput,backendName:"webgpu",kernelFunc:gu},vu=class{constructor(e){this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[e,e],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="diag"}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let value = select(0.0, getX(coords[0]), coords[0] == coords[1]);
          setOutputAtIndex(index, value);
        }
      }
    `}};function Cu(e){const{inputs:i,backend:t}=e,{x:s}=i,a=[...s.shape,...s.shape],r=u.util.sizeFromShape(s.shape),n=$({inputs:{x:s},backend:t,attrs:{shape:[r]}}),o=new vu(r),l=t.runWebGPUProgram(o,[n],n.dtype),d=$({inputs:{x:l},backend:t,attrs:{shape:a}});return t.disposeData(n.dataId),t.disposeData(l.dataId),d}var bu={kernelName:u.Diag,backendName:"webgpu",kernelFunc:Cu},yu=class{constructor(e){this.variableNames=["x","w"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.outShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="dilation2d"}getUserCode(){return`
       ${k("index")} {
         if (index < uniforms.size) {
           let neg_infinity = -3.4e38;
           let coords = getOutputCoords();
           let batch = coords.x;
           let d1 = coords.w;
           let outTopLeftCorner = coords.yz * uniforms.strides - uniforms.pads;
           let hBeg = outTopLeftCorner.x;
           let wBeg = outTopLeftCorner.y;

           var curVal = neg_infinity;
           for (var h = 0; h < uniforms.filterDims[0]; h = h + 1) {
             let hIn = hBeg + h * uniforms.dilations[0];

             if (hIn >= 0 && hIn < uniforms.xShape[1]) {
               for (var w = 0; w < uniforms.filterDims[1]; w = w + 1) {
                 let wIn = wBeg + w * uniforms.dilations[1];

                 if (wIn >= 0 && wIn < uniforms.xShape[2]) {
                   let val = getX(batch, hIn, wIn, d1) + getW(h, w, d1);
                   if (val > curVal) {
                     curVal = val;
                   }
                 }
               }
             }
           }

           setOutputAtIndex(index, curVal);
         }
       }
     `}};function Su(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,filter:r}=i,{strides:n,pad:o,dilations:l}=s,d=u.backend_util.computeDilation2DInfo(a.shape,r.shape,n,o,"NHWC",l),h=[d.padInfo.top,d.padInfo.left],p=[{type:"int32",data:[d.filterHeight,d.filterWidth]},{type:"int32",data:[...h]},{type:"int32",data:[d.strideHeight,d.strideWidth]},{type:"int32",data:[d.dilationHeight,d.dilationWidth]}],c=new yu(d);return t.runWebGPUProgram(c,[a,r],a.dtype,p)}var Iu={kernelName:u.Dilation2D,backendName:"webgpu",kernelFunc:Su},ku=class{constructor(e,i){if(this.variableNames=["x","w","dy"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>, dySize: i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=e.inShape,this.dispatchLayout=R(e.outShape),this.dispatch=w(this.dispatchLayout,e.outShape,this.workgroupSize),i!=="float32"&&i!=="int32")throw new Error(`Dilation2DBackpropInput only supports float32 and int32
          types, does not support ${i} type.`);this.type=i,this.shaderKey="dilation2DBackpropInput"}getUserCode(){return`
       ${k("index")} {
         if (index < uniforms.dySize) {
           let coords = getDyCoordsFromIndex(index);
           let b = coords[0];
           let r = coords[1];
           let c = coords[2];
           let d = coords[3];

           let dyCorner = vec2<i32>(r, c) * uniforms.strides - uniforms.pads;
           var curVal = -3.4e38;  // neg_infinity
           var xRMax = 0;
           var xCMax = 0;

           // In the case of multiple argmax branches, we only back-propagate
           // along the last branch, i.e., the one with largest value of
           // 'wR * uniforms.filterDims[1] + wC', similarly to the max-pooling
           // backward routines.
           for (var wR = 0; wR < uniforms.filterDims[0]; wR++) {
             let xR = dyCorner.x + wR * uniforms.dilations[0];

             if (xR >= 0 && xR < uniforms.xShape[1]) {
               for (var wC = 0; wC < uniforms.filterDims[1]; wC++) {
                 let xC = dyCorner.y + wC * uniforms.dilations[1];

                 if (xC >= 0 && xC < uniforms.xShape[2]) {
                   let val = getX(b, xR, xC, d) + getW(wR, wC, d);
                   if (val > curVal) {
                     curVal = val;
                     xRMax = xR;
                     xCMax = xC;
                   }
                 }
               }
             }
           }

           let flatIndexIn = d + uniforms.xShape[3] *
               (xCMax + uniforms.xShape[2] * (xRMax + uniforms.xShape[1] * b));
           let value = getDy(b, r, c, d);
           ${ee("&result[flatIndexIn]","value",this.type)}
         }
       }
     `}},wu=class{constructor(e,i,t){if(this.variableNames=["x","w","dy"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>, dySize: i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=e.filterShape,this.dispatchLayout=R(e.outShape),this.dispatch=w(this.dispatchLayout,e.outShape,this.workgroupSize),t!=="float32"&&t!=="int32")throw new Error(`Dilation2DBackpropFilter only supports float32 and int32
          types, does not support ${t} type.`);this.type=t,this.shaderKey="dilation2DBackpropFilter"}getUserCode(){return`
       ${k("index")} {
         if (index < uniforms.dySize) {
           let coords = getDyCoordsFromIndex(index);
           let b = coords[0];
           let r = coords[1];
           let c = coords[2];
           let d = coords[3];

           let dyCorner = vec2<i32>(r, c) * uniforms.strides - uniforms.pads;
           var curVal = -3.4e38;  // neg_infinity
           var wRMax = 0;
           var wCMax = 0;

           // In the case of multiple argmax branches, we only back-propagate
           // along the last branch, i.e., the one with largest value of
           // 'wR * uniforms.filterDims[1] + wC', similarly to the max-pooling
           // backward routines.
           for (var wR = 0; wR < uniforms.filterDims[0]; wR++) {
             let xR = dyCorner.x + wR * uniforms.dilations[0];

             if (xR >= 0 && xR < uniforms.xShape[1]) {
               for (var wC = 0; wC < uniforms.filterDims[1]; wC++) {
                 let xC = dyCorner.y + wC * uniforms.dilations[1];

                 if (xC >= 0 && xC < uniforms.xShape[2]) {
                   let val = getX(b, xR, xC, d) + getW(wR, wC, d);
                   if (val > curVal) {
                     curVal = val;
                     wRMax = wR;
                     wCMax = wC;
                   }
                 }
               }
             }
           }

           let flatIndexIn = d + uniforms.wShape[2] * (wCMax + wRMax * uniforms.wShape[1]);
           let value = getDy(b, r, c, d);
           ${ee("&result[flatIndexIn]","value",this.type)}
         }
       }
     `}};function Ru(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,filter:r,dy:n}=i,{strides:o,pad:l,dilations:d}=s,h=u.backend_util.computeDilation2DInfo(a.shape,r.shape,o,l,"NHWC",d),p=r.dtype,c=new wu(h,r.shape,p),m=[{type:"int32",data:[h.filterHeight,h.filterWidth]},{type:"int32",data:[h.padInfo.top,h.padInfo.left]},{type:"int32",data:[h.strideHeight,h.strideWidth]},{type:"int32",data:[h.dilationHeight,h.dilationWidth]},{type:"int32",data:[u.util.sizeFromShape(h.outShape)]}],f=U({backend:t,attrs:{shape:r.shape,value:0,dtype:p}});return t.runWebGPUProgram(c,[a,r,n],p,m,f)}var Pu={kernelName:u.Dilation2DBackpropFilter,backendName:"webgpu",kernelFunc:Ru};function $u(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,filter:r,dy:n}=i,{strides:o,pad:l,dilations:d}=s,h=u.backend_util.computeDilation2DInfo(a.shape,r.shape,o,l,"NHWC",d),p=a.dtype,c=new ku(h,p),m=[{type:"int32",data:[h.filterHeight,h.filterWidth]},{type:"int32",data:[h.padInfo.top,h.padInfo.left]},{type:"int32",data:[h.strideHeight,h.strideWidth]},{type:"int32",data:[h.dilationHeight,h.dilationWidth]},{type:"int32",data:[u.util.sizeFromShape(h.outShape)]}],f=U({backend:t,attrs:{shape:h.inShape,value:0,dtype:p}});return t.runWebGPUProgram(c,[a,r,n],p,m,f)}var Du={kernelName:u.Dilation2DBackpropInput,backendName:"webgpu",kernelFunc:$u},Nu=class{constructor(e,i,t){this.variableNames=["Image"],this.uniforms="alpha: f32,",this.workgroupSize=[64,1,1],this.pixelsOpType=ue.DRAW,this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.type=i,this.textureFormat=t,this.shaderKey=`draw_${i}_${t}`}getUserCode(){let e;const i=this.type==="float32"?"value":"value / 255.0";return e=`
      if (uniforms.numChannels == 1) {
        rgba[0] = ${i};
        rgba[1] = ${i};
        rgba[2] = ${i};
      } else {
        rgba[d] = ${i};
      }`,`
       @group(0) @binding(0) var outImage : texture_storage_2d<${this.textureFormat}, write>;
       ${k("index")} {
         if (index < uniforms.size) {
           var rgba = vec4<f32>(0.0, 0.0, 0.0, uniforms.alpha);
           for (var d = 0; d < uniforms.numChannels; d = d + 1) {
             let value = f32(inBuf[index * uniforms.numChannels + d]);
             ${e}
           }
           rgba.x = rgba.x * rgba.w;
           rgba.y = rgba.y * rgba.w;
           rgba.z = rgba.z * rgba.w;
           let coords = getCoordsFromIndex(index);
           textureStore(outImage, vec2<i32>(coords.yx), rgba);
         }
       }
      `}};function zu(e){const{inputs:i,backend:t,attrs:s}=e,{image:a}=i,{canvas:r,options:n}=s,[o,l]=a.shape.slice(0,2),{imageOptions:d}=n||{},h=d?.alpha||1,p=t.device.features.has("bgra8unorm-storage")?"bgra8unorm":"rgba8unorm",c=[o,l],m=new Nu(c,a.dtype,p);r.width=l,r.height=o;const f="webgpu";let g=r.getContext(f),x;g||(x=new OffscreenCanvas(l,o),g=x.getContext(f));const v=a.shape.length===3?a.shape[2]:1;g.configure({device:t.device,format:p,usage:GPUTextureUsage.STORAGE_BINDING,alphaMode:"premultiplied"});const C="int32",b=t.makeTensorInfo(c,C),y=t.tensorMap.get(b.dataId);y.resource=g.getCurrentTexture(),y.external=!0;const S=[{type:"uint32",data:[v]},{type:"float32",data:[h]}];if(t.runWebGPUProgram(m,[a],C,S,b),x){const P=r.getContext("2d");if(!P)throw new Error("Please make sure this canvas has only been used for 2d or webgpu context!");P.drawImage(x,0,0)}return t.disposeData(b.dataId),a}var Au={kernelName:u.Draw,backendName:"webgpu",kernelFunc:zu},ai=V({opType:z.MUL,cpuKernelImpl:Tr,supportsComplex:!0}),Fu={kernelName:u.Multiply,backendName:"webgpu",kernelFunc:ai};function si(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{axis:r,keepDims:n}=s;return oe(a,r,n,"sum",t)}var Eu={kernelName:u.Sum,backendName:"webgpu",kernelFunc:si};function Tu(e){const{inputs:i,backend:t,attrs:s}=e,{equation:a}=s,r=i,{allDims:n,summedDims:o,idDims:l}=u.backend_util.decodeEinsumEquation(a,r.length);u.backend_util.checkEinsumDimSizes(n.length,l,r);const{path:d,steps:h}=u.backend_util.getEinsumComputePath(o,l),p=h.length;let c=null,m=n.length;const f=[];for(let g=0;g<p;++g){for(const x of h[g]){const{permutationIndices:v,expandDims:C}=u.backend_util.getEinsumPermutation(m,l[x]);let b;u.backend_util.isIdentityPermutation(v)?b=r[x]:(b=J({inputs:{x:r[x]},backend:t,attrs:{perm:v}}),f.push(b));const y=b.shape.slice();for(let S=0;S<C.length;++S)y.splice(C[S],0,1);u.util.arraysEqual(b.shape,y)||(b=$({inputs:{x:b},backend:t,attrs:{shape:y}}),f.push(b)),c===null?c=b:(c=ai({inputs:{a:b,b:c},backend:t}),f.push(c))}g<p-1&&(d[g]>=0&&(c=si({inputs:{x:c},backend:t,attrs:{axis:d[g]-(n.length-m),keepDims:!1}}),f.push(c)),m--)}for(const g of f)g!==c&&t.disposeData(g.dataId);return c}var Lu={kernelName:u.Einsum,backendName:"webgpu",kernelFunc:Tu},Bu=F({opType:I.ELU}),Wu={kernelName:u.Elu,backendName:"webgpu",kernelFunc:Bu},Vu=e=>{const{inputs:i,backend:t}=e,{dy:s,y:a}=i,r=new Pe(z.ELU_DER,s.shape,a.shape);return t.runWebGPUProgram(r,[s,a],s.dtype)},Mu={kernelName:u.EluGrad,backendName:"webgpu",kernelFunc:Vu},Ou=V({opType:z.EQUAL,dtype:"bool",cpuKernelImpl:br}),Uu={kernelName:u.Equal,backendName:"webgpu",kernelFunc:Ou},Gu=F({opType:I.ERF}),Hu={kernelName:u.Erf,backendName:"webgpu",kernelFunc:Gu},qu=F({opType:I.EXP,cpuKernelImpl:yr,dtype:"float32"}),Xu={kernelName:u.Exp,backendName:"webgpu",kernelFunc:qu};function Xe(e){const{inputs:i,attrs:t,backend:s}=e,{dim:a}=t,{input:r}=i,n=r.shape.length,o=r.shape.slice();let l=a;return a<0&&(u.util.assert(-(n+1)<=a,()=>`Axis must be in the interval [${-(n+1)}, ${n}]`),l=n+a+1),o.splice(l,0,1),$({inputs:{x:r},backend:s,attrs:{shape:o}})}var Ku={kernelName:u.ExpandDims,backendName:"webgpu",kernelFunc:Xe},Yu=F({opType:I.EXPM1,cpuKernelImpl:Sr}),Qu={kernelName:u.Expm1,backendName:"webgpu",kernelFunc:Yu},ri=class{constructor(e,i){this.variableNames=["real","imag"],this.outputShape=[],this.uniforms="exponentMultiplier : f32, denominator: f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=i,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.component=e,this.shaderKey=`fft_${e}`}getUserCode(){return`
    fn unaryOpComplex(real: f32, expR: f32, imag: f32, expI: f32) -> f32 {
      ${this.component==="real"?"return real * expR - imag * expI;":"return real * expI + imag * expR;"}
    }

    fn mulMatDFT(batch: i32, index: i32) -> f32 {
      let indexRatio = f32(index) / f32(uniforms.realShape[1]);
      let exponentMultiplierTimesIndexRatio =
          uniforms.exponentMultiplier * indexRatio;

      var result = 0.0;

      for (var i = 0; i < uniforms.realShape[1]; i = i + 1) {
        // x = (-2|2 * PI / N) * index * i;
        let x = exponentMultiplierTimesIndexRatio * f32(i);
        let expR = cos(x);
        let expI = sin(x);
        let real = getReal(batch, i);
        let imag = getImag(batch, i);

        result = result +
            unaryOpComplex(real, expR, imag, expI) / uniforms.denominator;
      }

      return result;
    }

    ${k("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        setOutputAtIndex(index, mulMatDFT(coords[0], coords[1]));
      }
    }
  `}};function ni(e,i,t){const s=t.tensorMap.get(e.dataId),a=u.util.sizeFromShape(e.shape),r=e.shape[e.shape.length-1],n=a/r,o=[],l=$({inputs:{x:e},backend:t,attrs:{shape:[n,r]}});o.push(l);const d=l.shape,h=new ri("real",d),p=new ri("imag",d),c=[{dataId:s.complexTensorInfos.real.dataId,dtype:s.complexTensorInfos.real.dtype,shape:d},{dataId:s.complexTensorInfos.imag.dataId,dtype:s.complexTensorInfos.imag.dtype,shape:d}],m=i?2*Math.PI:-2*Math.PI,f=i?d[1]:1,g=[{type:"float32",data:[m]},{type:"float32",data:[f]}],x=t.runWebGPUProgram(h,c,"float32",g);o.push(x);const v=t.runWebGPUProgram(p,c,"float32",g);o.push(v);const C=ne({inputs:{real:x,imag:v},backend:t});o.push(C);const b=$({inputs:{x:C},backend:t,attrs:{shape:e.shape}});return o.forEach(y=>t.disposeData(y.dataId)),b}function Zu(e){const{inputs:i,backend:t}=e,{input:s}=i;return ni(s,!1,t)}var Ju={kernelName:u.FFT,backendName:"webgpu",kernelFunc:Zu},ju=class{constructor(e){this.outputShape=[],this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="flipLeftRight"}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let coordX = uniforms.xShape[2] - coords[2] - 1;
          let outputValue = getX(coords[0], coords[1], coordX, coords[3]);
          setOutputAtIndex(index, outputValue);
        }
      }
    `}},_u={kernelName:u.FlipLeftRight,backendName:"webgpu",kernelFunc:({inputs:e,backend:i})=>{const{image:t}=e,s=i,a=new ju(t.shape);return s.runWebGPUProgram(a,[t],t.dtype)}},el=F({opType:I.FLOOR,cpuKernelImpl:Ir}),tl={kernelName:u.Floor,backendName:"webgpu",kernelFunc:el},il=V({opType:z.FLOOR_DIV,cpuKernelImpl:kr,dtype:"int32"}),al={kernelName:u.FloorDiv,backendName:"webgpu",kernelFunc:il},sl=class{constructor(e,i,t=!1){this.pixelsOpType=ue.FROM_PIXELS,this.outputShape=[0],this.variableNames=[],this.workgroupSize=[256,1,1],this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[i,1,1]),this.importVideo=t,this.shaderKey=`fromPixels_${this.importVideo}`}getUserCode(){const e=this.importVideo?"textureLoad(src, vec2<i32>(coords.yx));":"textureLoad(src, vec2<i32>(coords.yx), 0)";return`
      @binding(1) @group(0) var src: ${this.importVideo?"texture_external":"texture_2d<f32>"};
      ${k("index")} {
        let flatIndex = index * uniforms.numChannels;
        if (flatIndex < uniforms.size) {
          let coords = getCoordsFromIndex(flatIndex);
          let values = ${e};
          for (var i = 0; i < uniforms.numChannels; i = i + 1) {
            result[flatIndex + i] = i32(floor(255.0 * values[i]));
          }
        }
      }
  `}},rl={kernelName:u.FromPixels,backendName:"webgpu",kernelFunc:nl},he,Ke=(0,u.env)().getBool("CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU");function nl(e){const{inputs:i,backend:t,attrs:s}=e;let{pixels:a}=i;const{numChannels:r}=s;if(a==null)throw new Error("pixels passed to tf.browser.fromPixels() can not be null");const n=typeof HTMLVideoElement<"u"&&a instanceof HTMLVideoElement,o=typeof HTMLImageElement<"u"&&a instanceof HTMLImageElement,l=typeof HTMLCanvasElement<"u"&&a instanceof HTMLCanvasElement||typeof OffscreenCanvas<"u"&&a instanceof OffscreenCanvas,d=typeof ImageBitmap<"u"&&a instanceof ImageBitmap,[h,p]=n?[a.videoWidth,a.videoHeight]:[a.width,a.height],c=[p,h,r],m=(0,u.env)().getBool("WEBGPU_IMPORT_EXTERNAL_TEXTURE")&&n,f=n||o;if(d||l||f){let C;if(m)C=t.device.importExternalTexture({source:a});else{if(f){const W=(0,u.env)().getBool("CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU");(he==null||W!==Ke)&&(Ke=W,he=document.createElement("canvas").getContext("2d",{willReadFrequently:Ke})),he.canvas.width=h,he.canvas.height=p,he.drawImage(a,0,0,h,p),a=he.canvas}const T=GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,L=t.textureManager.acquireTexture(c[1],c[0],"rgba8unorm",T);t.queue.copyExternalImageToTexture({source:a},{texture:L},[c[1],c[0]]),C=L}const b=u.util.sizeFromShape(c),y=u.util.computeStrides(c),S=new sl(c,r,m),P=[{type:"uint32",data:[b]},{type:"uint32",data:[r]},{type:"uint32",data:[...y]}],N=t.makeTensorInfo([p,h],"int32"),D=t.tensorMap.get(N.dataId);D.resource=C;const E=t.runWebGPUProgram(S,[N],"int32",P);return t.disposeData(N.dataId),E}const g=a.data;let x=g;if(r!=null&&r!==4){x=new Uint8Array(a.width*a.height*r);const C=g.length;let b=0;for(let y=0;y<C;y++)y%4<r&&(x[b++]=g[y])}const v=t.makeTensorInfo(c,"int32",new Int32Array(x));return t.uploadToGPU(v.dataId),v}var ol=class{constructor(e,i,t,s,a){this.uniforms="varianceEpsilon : f32,",this.workgroupSize=[128,1,1],this.size=!0,this.variableNames=["x","mean","variance"],u.backend_util.assertAndGetBroadcastShape(e,i),u.backend_util.assertAndGetBroadcastShape(e,t),this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),s!=null&&(u.backend_util.assertAndGetBroadcastShape(e,s),this.variableNames.push("offset")),a!=null&&(u.backend_util.assertAndGetBroadcastShape(e,a),this.variableNames.push("scale")),this.offsetShape=s,this.scaleShape=a,this.shaderKey="batchNorm"}getUserCode(){let e="0.0";this.offsetShape!=null&&(e="getOffsetByOutputIndex(index)");let i="1.0";return this.scaleShape!=null&&(i="getScaleByOutputIndex(index)"),`
      ${k("index")} {
        if (index < uniforms.size)
        {
          let xValue = getXByOutputIndex(index);
          let meanValue = getMeanByOutputIndex(index);
          let varianValue = getVarianceByOutputIndex(index);
          let offsetValue = ${e};
          let scaleValue = ${i};
          let inv = scaleValue * inverseSqrt(varianValue + f32(uniforms.varianceEpsilon));
          setOutputAtIndex(index,dot(vec3<f32>(xValue, -meanValue, offsetValue), vec3<f32>(inv, inv, 1.0)));
        }
      }
  `}},ul={kernelName:u.FusedBatchNorm,backendName:"webgpu",kernelFunc:({inputs:e,attrs:i,backend:t})=>{const{x:s,scale:a,offset:r,mean:n,variance:o}=e,{varianceEpsilon:l}=i,d=t,h=[s,n,o];let p=null;r!=null&&(p=r.shape,h.push(r));let c=null;a!=null&&(c=a.shape,h.push(a));const m=new ol(s.shape,n.shape,o.shape,p,c),f=[{type:"float32",data:[l]}];return d.runWebGPUProgram(m,h,s.dtype,f)}};function ll(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,filter:r,bias:n,preluActivationWeights:o}=i,{strides:l,pad:d,dataFormat:h,dilations:p,dimRoundingMode:c,activation:m,leakyreluAlpha:f}=s,g=u.backend_util.convertConv2DDataFormat(h),x=u.backend_util.computeConv2DInfo(a.shape,r.shape,l,p,d,c,!1,g);return Zt({x:a,filter:r,convInfo:x,backend:t,bias:n,preluActivationWeights:o,leakyreluAlpha:f,activation:m})}var dl={kernelName:u.FusedConv2D,backendName:"webgpu",kernelFunc:ll};function hl(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,filter:r,bias:n,preluActivationWeights:o}=i,{strides:l,pad:d,dilations:h,dimRoundingMode:p,activation:c,leakyreluAlpha:m}=s;let f=h;f==null&&(f=[1,1]),u.util.assert(u.backend_util.eitherStridesOrDilationsAreOne(l,f),()=>`Error in depthwiseConv2d: Either strides or dilations must be 1. Got strides ${l} and dilations '${f}'`);const g=u.backend_util.computeConv2DInfo(a.shape,r.shape,l,f,d,p,!0),x=[a,r],v=n!=null,C=o!=null;v&&x.push(n),C&&x.push(o);const b=[{type:"int32",data:[g.padInfo.top,g.padInfo.left]},{type:"int32",data:[g.inHeight,g.inWidth]}];let y;return g.outHeight>4&&g.outWidth>4&&g.strideWidth<=2&&g.inChannels===g.outChannels&&g.dilationHeight===1&&g.dilationWidth===1&&g.inChannels%4===0?(y=new ti(g,v,c,C),b.push({type:"int32",data:[y.virtualWidth]})):(y=new ii(g,v,c,C),b.push({type:"int32",data:[g.filterHeight]},{type:"int32",data:[g.filterWidth]},{type:"int32",data:[g.strideHeight,g.strideWidth]},{type:"int32",data:[g.dilationHeight,g.dilationWidth]})),c==="leakyrelu"&&(b.push({type:"float32",data:[m]}),y.uniforms+=" alpha : f32,"),t.runWebGPUProgram(y,x,"float32",b)}var pl={kernelName:u.FusedDepthwiseConv2D,backendName:"webgpu",kernelFunc:hl},cl=class{constructor(e,i){this.variableNames=["A","indices"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=i,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey=`gathernd_${e}`,this.sliceDim=e,this.uniforms=`sliceDim : i32, strides : ${B(e)},`}getUserCode(){let e;return this.sliceDim>1?e="uniforms.strides[j]":e="uniforms.strides",`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          var flattenIndex = 0;
          for (var j = 0; j < uniforms.sliceDim; j = j + 1) {
            let indexTemp = i32(round(getIndices(coords[0], j)));
            let strideNum = ${e};
            flattenIndex = flattenIndex + indexTemp * strideNum;
          }

          setOutputAtIndex(index, getA(flattenIndex, coords[1]));
        }
      }
      `}};function ml(e){const{inputs:i,backend:t}=e,{params:s,indices:a}=i,r=a.shape,n=r[r.length-1],o=u.util.sizeFromShape(s.shape),[l,d,h,p]=u.backend_util.prepareAndValidate(s,a),c=$({inputs:{x:a},backend:t,attrs:{shape:[d,n]}}),m=$({inputs:{x:s},backend:t,attrs:{shape:[u.util.sizeFromShape(s.shape)/h,h]}});if(t.shouldExecuteOnCPU([s,a])||s.dtype==="string"){const C=t.readSync(a.dataId),b=t.bufferSync(s),y=wr(C,b,s.dtype,d,n,h,p,s.shape,o);return t.makeTensorInfo(l,s.dtype,y.values)}const f=new cl(n,[d,h]),g=[{type:"int32",data:[n]},{type:"int32",data:p}],x=t.runWebGPUProgram(f,[m,c],m.dtype,g),v=$({inputs:{x},backend:t,attrs:{shape:l}});return t.disposeData(c.dataId),t.disposeData(m.dataId),t.disposeData(x.dataId),v}var fl={kernelName:u.GatherNd,backendName:"webgpu",kernelFunc:ml},gl=class{constructor(e,i){this.variableNames=["A","indices"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.slice(),this.aShape=e,this.outputShape=i,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="gather"}getUserCode(){const e=xl(this.aShape);return`
      ${k("index")} {
        if (index < uniforms.size) {
          let resRC = getCoordsFromIndex(index);
          let indexZ = i32(getIndices(resRC.x, resRC.z));
          let inBounds = select(0.0, 1.0, indexZ >= 0 && indexZ < uniforms.aShape[2]);
          setOutputAtIndex(index, inBounds * getA(${e}));
        }
      }
    `}};function xl(e){const i=["resRC.x","resRC.y","resRC.z","resRC.w"],t=[];for(let s=0;s<e.length;s++)s===2?t.push("indexZ"):t.push(`${i[s]}`);return t.join()}function oi(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,indices:r}=i,{axis:n,batchDims:o}=s,l=u.util.parseAxisParam(n,a.shape)[0],d=u.backend_util.segment_util.collectGatherOpShapeInfo(a,r,l,o),h=u.util.sizeFromShape(r.shape),p=[],c=$({inputs:{x:a},backend:t,attrs:{shape:[d.batchSize,d.outerSize,d.dimSize,d.sliceSize]}}),m=$({inputs:{x:r},backend:t,attrs:{shape:[d.batchSize,h/d.batchSize]}});p.push(c),p.push(m);const f=[d.batchSize,d.outerSize,h/d.batchSize,d.sliceSize];if(t.shouldExecuteOnCPU([a,r])){const C=t.tensorMap.get(m.dataId).values,b=(0,u.buffer)(m.shape,m.dtype,C),y=t.tensorMap.get(c.dataId).values,S=(0,u.buffer)(c.shape,c.dtype,y),P=Rr(S,b,f);return p.forEach(N=>t.disposeData(N.dataId)),t.makeTensorInfo(d.outputShape,P.dtype,P.values)}const g=new gl(c.shape,f),x=t.runWebGPUProgram(g,[c,m],c.dtype);p.push(x);const v=$({inputs:{x},backend:t,attrs:{shape:d.outputShape}});return p.forEach(C=>t.disposeData(C.dataId)),v}var vl={kernelName:u.GatherV2,backendName:"webgpu",kernelFunc:oi},Cl=V({opType:z.GREATER,cpuKernelImpl:$r,dtype:"bool"}),bl={kernelName:u.Greater,backendName:"webgpu",kernelFunc:Cl},yl=V({opType:z.GREATER_EQUAL,dtype:"bool",cpuKernelImpl:Pr}),Sl={kernelName:u.GreaterEqual,backendName:"webgpu",kernelFunc:yl};function Il(e){const{inputs:i,backend:t}=e,{input:s}=i;return ni(s,!0,t)}var kl={kernelName:u.IFFT,backendName:"webgpu",kernelFunc:Il},wl=F({opType:I.IS_FINITE,dtype:"bool"}),Rl={kernelName:u.IsFinite,backendName:"webgpu",kernelFunc:wl},Pl=F({opType:I.IS_INF,dtype:"bool"}),$l={kernelName:u.IsInf,backendName:"webgpu",kernelFunc:Pl},Dl=F({opType:I.IS_NAN,dtype:"bool"}),Nl={kernelName:u.IsNan,backendName:"webgpu",kernelFunc:Dl};function zl(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{alpha:r}=s,n=[{type:"float32",data:[r]}],o=new le(a.shape,I.LEAKYRELU,"alpha : f32,");return t.runWebGPUProgram(o,[a],"float32",n)}var Al={kernelName:u.LeakyRelu,backendName:"webgpu",kernelFunc:zl},Fl=V({opType:z.LESS,dtype:"bool",cpuKernelImpl:Nr}),El={kernelName:u.Less,backendName:"webgpu",kernelFunc:Fl},Tl=V({opType:z.LESS_EQUAL,dtype:"bool",cpuKernelImpl:Dr}),Ll={kernelName:u.LessEqual,backendName:"webgpu",kernelFunc:Tl},Bl=class{constructor(e){this.variableNames=[],this.outputShape=[],this.uniforms="start : f32, step : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[e],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="linSpace"}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          setOutputAtIndex(index, uniforms.start + f32(index) * uniforms.step);
        }
      }
    `}};function Wl(e){const{backend:i,attrs:t}=e,{start:s,stop:a,num:r}=t,n=(a-s)/(r-1),o=new Bl(r),l=[{type:"float32",data:[s]},{type:"float32",data:[n]}];return i.runWebGPUProgram(o,[],"float32",l)}var Vl={kernelName:u.LinSpace,backendName:"webgpu",kernelFunc:Wl},Ml=F({opType:I.LOG,cpuKernelImpl:zr}),Ol={kernelName:u.Log,backendName:"webgpu",kernelFunc:Ml},Ul=F({opType:I.LOG1P}),Gl={kernelName:u.Log1p,backendName:"webgpu",kernelFunc:Ul},Hl=V({opType:z.LOGICAL_AND,dtype:"bool"}),ql={kernelName:u.LogicalAnd,backendName:"webgpu",kernelFunc:Hl},Xl=F({opType:I.LOGICAL_NOT}),Kl={kernelName:u.LogicalNot,backendName:"webgpu",kernelFunc:Xl},Yl=V({opType:z.LOGICAL_OR}),Ql={kernelName:u.LogicalOr,backendName:"webgpu",kernelFunc:Yl},ui=`
  var powValue = 0.0;
  let basis = uniforms.bias + uniforms.alpha * sum;
  if (uniforms.beta == 0.5) {
    powValue = inverseSqrt(basis);
  } else if (uniforms.beta == 1.0) {
    powValue = 1.0 / basis;
  } else {
    powValue = exp(log(basis) * (-uniforms.beta));
  }
`,Zl=class{constructor(e){this.outputShape=[],this.variableNames=["x"],this.uniforms="radius : i32, bias : f32, alpha : f32, beta : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="lrn"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let b = coords[0];
        let r = coords[1];
        let c = coords[2];
        let d = coords[3];

        let x = getX(b, r, c, d);
        var sum = 0.0;
        for (var i = -uniforms.radius; i <= uniforms.radius; i = i + 1) {
          let idx = d + i;
          if (idx >= 0 && idx < uniforms.xShape[3]) {
            let z = getX(b, r, c, idx);
            sum = sum + z * z;
          }
        }
        ${ui}

        setOutputAtIndex(index, x * powValue);
      }
    }
  `}},Jl=class{constructor(e,i){this.outputShape=[],this.variableNames=["x"],this.uniforms="radius : i32, bias : f32, alpha : f32, beta : f32,",this.workgroupSize=[256,1,1],this.maxAllowRadius=16,u.util.assert(i<=this.maxAllowRadius,()=>`Radius must be less than or equal to ${this.maxAllowRadius}, current radius is ${i}`),this.outputShape=e,this.elementsPerWorkgroup=this.workgroupSize[0]-2*this.maxAllowRadius,this.dispatchLayout={x:[3],y:[2],z:[0,1]},this.dispatch=w(this.dispatchLayout,this.outputShape,[this.elementsPerWorkgroup,this.workgroupSize[1],this.workgroupSize[2]]),this.shaderKey="lrn_shared"}getUserCode(){return`
    var <workgroup>lrnSub: array<f32, ${this.workgroupSize[0]}>;
    const elementsPerWorkgroup = ${this.elementsPerWorkgroup};
    const maxAllowRadius = ${this.maxAllowRadius};

    ${k()} {
      let localDepth = i32(localId.x);
      let workgroupDepth = i32(workgroupId.x) * elementsPerWorkgroup;
      let xDepth = workgroupDepth + localDepth - maxAllowRadius;
      let b = i32(globalId.z) / uniforms.xShape[1];
      let r = i32(globalId.z) - b * uniforms.xShape[1];
      let c = i32(globalId.y);
      let d = workgroupDepth + localDepth;

      var x = 0.0;
      if (xDepth >= 0 && xDepth < uniforms.xShape[3]) {
        x = getX(b, r, c, xDepth);
      }
      lrnSub[localDepth] = x;
      workgroupBarrier();

      if (localDepth < elementsPerWorkgroup && d < uniforms.outShape[3]) {
        var sum = 0.0;
        let index = localDepth + maxAllowRadius;
        for (var i = -uniforms.radius; i <= uniforms.radius; i = i + 1) {
          let z = lrnSub[index + i];
          sum = sum + z * z;
        }
        ${ui}

        setOutputAtCoords(b, r, c, d, lrnSub[index] * powValue);
      }
    } `}};function jl(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{depthRadius:r,bias:n,alpha:o,beta:l}=s;let d;r>16?d=new Zl(a.shape):d=new Jl(a.shape,r);const h=[{type:"int32",data:[r]},{type:"float32",data:[n]},{type:"float32",data:[o]},{type:"float32",data:[l]}];return t.runWebGPUProgram(d,[a],a.dtype,h)}var _l={kernelName:u.LRN,backendName:"webgpu",kernelFunc:jl},ed=class{constructor(e){this.outputShape=[],this.variableNames=["inputImage","outputImage","dy"],this.uniforms="depthRadius : i32, bias : f32, alpha : f32, beta : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="lrn_grad"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let b = coords[0];
        let r = coords[1];
        let c = coords[2];

        let MIN_DEPTH_BEGIN = 0;
        let MAX_DEPTH_END = uniforms.outShape[3];
        var result = 0.0;
        for (var d = MIN_DEPTH_BEGIN; d < MAX_DEPTH_END; d++) {
          let depthBegin = max(MIN_DEPTH_BEGIN, d - uniforms.depthRadius);
          let depthEnd = min(MAX_DEPTH_END, d + uniforms.depthRadius + 1);

          var norm = 0.0;
          for (var k = MIN_DEPTH_BEGIN; k < MAX_DEPTH_END; k++) {
            if (k < depthBegin) {
              continue;
            } else if (k >= depthBegin && k < depthEnd) {
              norm += getInputImage(b, r, c, k) * getInputImage(b, r, c, k);
            } else {
              break;
            }
          }

          norm = uniforms.alpha * norm + uniforms.bias;

          for (var k = MIN_DEPTH_BEGIN; k < MAX_DEPTH_END; k++) {
            if (k < depthBegin) {
              continue;
            } else if (k >= depthBegin && k < depthEnd) {
              var dyi = -2.0 * uniforms.alpha * uniforms.beta
                * getInputImage(b, r, c, k) * getOutputImage(b, r, c, d) / norm;
              if (k == d) {
                dyi += pow(norm, -1.0 * uniforms.beta);
              }
              if (k == coords[3]) {
                dyi *= getDy(b, r, c, d);
                result += dyi;
              }
            } else {
              break;
            }
          }
        }

        setOutputAtIndex(index, result);
      }
    }
  `}};function td(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,y:r,dy:n}=i,{depthRadius:o,bias:l,alpha:d,beta:h}=s,p=new ed(a.shape),c=[{type:"int32",data:[o]},{type:"float32",data:[l]},{type:"float32",data:[d]},{type:"float32",data:[h]}];return t.runWebGPUProgram(p,[a,r,n],a.dtype,c)}var id={kernelName:u.LRNGrad,backendName:"webgpu",kernelFunc:td},ad=V({opType:z.MAX,cpuKernelImpl:Fr}),sd={kernelName:u.Maximum,backendName:"webgpu",kernelFunc:ad};function rd(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{filterSize:r,strides:n,pad:o,dimRoundingMode:l}=s,d=u.backend_util.computePool2DInfo(a.shape,r,n,1,o,l);return qt(a,d,"max",t)}var nd={kernelName:u.MaxPool,backendName:"webgpu",kernelFunc:rd};function od(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{filterSize:r,strides:n,pad:o,dataFormat:l,dimRoundingMode:d}=s,h=u.backend_util.computePool3DInfo(a.shape,r,n,[1,1,1],o,d,l),p=new Ge(h,"max"),c=[{type:"int32",data:[h.strideDepth,h.strideHeight,h.strideWidth]},{type:"int32",data:[h.padInfo.front,h.padInfo.top,h.padInfo.left]},{type:"int32",data:[h.inDepth,h.inHeight,h.inWidth]},{type:"int32",data:[h.effectiveFilterDepth,h.effectiveFilterHeight,h.effectiveFilterWidth]}];return t.runWebGPUProgram(p,[a],a.dtype,c)}var ud={kernelName:u.MaxPool3D,backendName:"webgpu",kernelFunc:od},ld=class{constructor(e){this.variableNames=["dy","maxPos"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, dilations : vec2<i32>, filterDims : vec2<i32>,
       outHeight : i32, outWidth : i32`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.inShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="maxPool2DBackprop"}getUserCode(){return`
      ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d = coords[3];

        let dyRCCorner = vec2<i32>(coords.yz) - uniforms.pads;
        let dyRCorner = dyRCCorner.x;
        let dyCCorner = dyRCCorner.y;

        // Convolve dy(?, ?, d) with pos mask(:, :, d) to get dx(xR, xC, d).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        let lastIndex = uniforms.filterDims[0] * uniforms.filterDims[1] - 1;
        for (var wR = 0; wR < uniforms.filterDims[0]; wR += uniforms.dilations[0]) {
          let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[0]);

          if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
            continue;
          }
          let idyR = i32(dyR);

          for (var wC = 0; wC < uniforms.filterDims[1]; wC += uniforms.dilations[1]) {
            let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[1]);

            if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
              continue;
            }
            let idyC = i32(dyC);

            let dyValue = getDy(batch, idyR, idyC, d);
            let maxPosValue = lastIndex - i32(getMaxPos(batch, idyR, idyC, d));

            // Get the current value, check it against the value from the
            // position matrix.
            let curPosValue = wR * uniforms.filterDims[1] + wC;
            let mask = select(0.0, 1.0, maxPosValue == curPosValue);
            dotProd += dyValue * mask;
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}},dd=class{constructor(e){this.variableNames=["dy","maxPos"],this.uniforms=`strides : vec3<i32>, pads : vec3<i32>, filterDims : vec3<i32>,
      outDepth : i32, outHeight : i32, outWidth : i32`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.inShape,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="maxPool3DBackprop"}getUserCode(){return`
      ${k("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords.x;
        let ch = coords.u;

        let dyCorner = vec3<i32>(coords.y, coords.z, coords.w) - uniforms.pads;
        let dyDCorner = dyCorner.x;
        let dyRCorner = dyCorner.y;
        let dyCCorner = dyCorner.z;

        // Convolve dy(?, ?, ?, ch) with pos mask(:, :, :, d) to get
        // dx(xD, xR, xC, ch).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        let lastIndex = uniforms.filterDims[0] * uniforms.filterDims[1] * uniforms.filterDims[2] - 1;

        for (var wD = 0; wD < uniforms.filterDims[0]; wD++) {
          let dyD = f32(dyDCorner + wD) / f32(uniforms.strides[0]);

          if (dyD < 0.0 || dyD >= f32(uniforms.outDepth) || fract(dyD) > 0.0) {
            continue;
          }
          let idyD = i32(dyD);

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[1]);

            if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
              continue;
            }
            let idyR = i32(dyR);

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[2]);

              if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
                continue;
              }
              let idyC = i32(dyC);

              let dyValue = getDy(batch, idyD, idyR, idyC, ch);
              let maxPosValue = lastIndex - i32(getMaxPos(batch, idyD, idyR, idyC, ch));

              // Get the current value, check it against the value from the
              // position matrix.
              let curPosValue = wD * uniforms.filterDims[1] * uniforms.filterDims[2] + wR * uniforms.filterDims[2] + wC;
              let mask = select(0.0, 1.0, maxPosValue == curPosValue);
              dotProd += dyValue * mask;
            }
          }
        }

        setOutputAtIndex(index, dotProd);
      }
    }
    `}};function hd(e){const{inputs:i,backend:t,attrs:s}=e,{dy:a,input:r}=i,n=r,{filterSize:o,strides:l,pad:d,dimRoundingMode:h}=s,p=u.backend_util.computePool3DInfo(n.shape,o,l,[1,1,1],d,h),c=new Ge(p,"max",!0);let m=[{type:"int32",data:[p.strideDepth,p.strideHeight,p.strideWidth]},{type:"int32",data:[p.padInfo.front,p.padInfo.top,p.padInfo.left]},{type:"int32",data:[p.inDepth,p.inHeight,p.inWidth]},{type:"int32",data:[p.effectiveFilterDepth,p.effectiveFilterHeight,p.effectiveFilterWidth]}];const f=t.runWebGPUProgram(c,[n],"int32",m),g=new dd(p);m=[{type:"int32",data:[p.strideDepth,p.strideHeight,p.strideWidth]},{type:"int32",data:[p.effectiveFilterDepth-1-p.padInfo.front,p.effectiveFilterHeight-1-p.padInfo.top,p.effectiveFilterWidth-1-p.padInfo.left]},{type:"int32",data:[p.effectiveFilterDepth,p.effectiveFilterHeight,p.effectiveFilterWidth]},{type:"int32",data:[p.outDepth]},{type:"int32",data:[p.outHeight]},{type:"int32",data:[p.outWidth]}];const x=t.runWebGPUProgram(g,[a,f],n.dtype,m);return t.disposeData(f.dataId),x}var pd={kernelName:u.MaxPool3DGrad,backendName:"webgpu",kernelFunc:hd};function cd(e){const{inputs:i,backend:t,attrs:s}=e,{dy:a,input:r,output:n}=i,o=r;Le([r,n],"maxPoolGrad");const{filterSize:l,strides:d,pad:h,dimRoundingMode:p}=s,c=u.backend_util.computePool2DInfo(o.shape,l,d,1,h,p),m=new fe(c,"max",!0);let f=[{type:"int32",data:[c.strideHeight,c.strideWidth]},{type:"int32",data:[c.padInfo.top,c.padInfo.left]},{type:"int32",data:[c.dilationHeight,c.dilationWidth]},{type:"int32",data:[c.inHeight,c.inWidth]},{type:"int32",data:[c.effectiveFilterHeight,c.effectiveFilterWidth]}];const g=t.runWebGPUProgram(m,[o],"int32",f),x=new ld(c);f=[{type:"int32",data:[c.strideHeight,c.strideWidth]},{type:"int32",data:[c.effectiveFilterHeight-1-c.padInfo.top,c.effectiveFilterWidth-1-c.padInfo.left]},{type:"int32",data:[c.dilationHeight,c.dilationWidth]},{type:"int32",data:[c.effectiveFilterHeight,c.effectiveFilterWidth]},{type:"int32",data:[c.outHeight]},{type:"int32",data:[c.outWidth]}];const v=t.runWebGPUProgram(x,[a,g],o.dtype,f);return t.disposeData(g.dataId),v}var md={kernelName:u.MaxPoolGrad,backendName:"webgpu",kernelFunc:cd};function fd(e){const{inputs:i,backend:t,attrs:s}=e,{filterSize:a,strides:r,pad:n,includeBatchInIndex:o}=s,{x:l}=i;u.util.assert(l.shape.length===4,()=>`Error in maxPool: input must be rank 4 but got rank ${l.shape.length}.`);const d=[1,1];u.util.assert(u.backend_util.eitherStridesOrDilationsAreOne(r,d),()=>`Error in maxPool: Either strides or dilations must be 1. Got strides ${r} and dilations '${d}'`);const h=u.backend_util.computePool2DInfo(l.shape,a,r,d,n),p=[{type:"int32",data:[h.strideHeight,h.strideWidth]},{type:"int32",data:[h.padInfo.top,h.padInfo.left]},{type:"int32",data:[h.dilationHeight,h.dilationWidth]},{type:"int32",data:[h.inHeight,h.inWidth]},{type:"int32",data:[h.effectiveFilterHeight,h.effectiveFilterWidth]}];let c=new fe(h,"max",!1);const m=t.runWebGPUProgram(c,[l],l.dtype,p);return c=new fe(h,"max",!0,!0,o),[m,t.runWebGPUProgram(c,[l],"int32",p)]}var gd={kernelName:u.MaxPoolWithArgmax,backendName:"webgpu",kernelFunc:fd};function xd(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{axis:r,keepDims:n}=s;return oe(a,r,n,"min",t)}var vd={kernelName:u.Min,backendName:"webgpu",kernelFunc:xd},Cd=V({opType:z.MIN,cpuKernelImpl:Er}),bd={kernelName:u.Minimum,backendName:"webgpu",kernelFunc:Cd},yd=class{constructor(e,i,t){this.uniforms="",this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=i.map((s,a)=>s[0]+e[a]+s[1]),this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.xShape=e,i.map((s,a)=>{this.uniforms+=` pad${a} : vec2<i32>,`}),this.offset=t==="reflect"?0:1,this.shaderKey=`mirrorPad_${t}`}getUserCode(){const e=this.xShape.length,i=this.xShape.map((l,d)=>`uniforms.pad${d}[0]`).join(","),t=this.xShape.map((l,d)=>`uniforms.pad${d}[0] + uniforms.xShape${e>1?`[${d}]`:""}`).join(","),s=e===1?"start":"start[i]",a=e===1?"end":"end[i]",r=e===1?"outC":"outC[i]",n=B(e),o=e>1?["coords[0]","coords[1]","coords[2]","coords[3]"].slice(0,e):"coords";return`
      ${k("index")} {
        if (index < uniforms.size) {
          let start = ${n}(${i});
          let end = ${n}(${t});
          var outC = getCoordsFromIndex(index);
          for (var i = 0; i < ${e}; i = i + 1) {
            if (${r} < ${s}) {
              ${r} = ${s} * 2 - ${r} - ${this.offset};
            } else if(${r} >= ${a}) {
              ${r} = (${a} - 1) * 2 - ${r} + ${this.offset};
            }
          }
          let coords = outC - start;
          setOutputAtIndex(index, getX(${o}));
        }
      }
    `}},Sd={kernelName:u.MirrorPad,backendName:"webgpu",kernelFunc:({inputs:e,attrs:i,backend:t})=>{const{x:s}=e,{paddings:a,mode:r}=i,n=t,o=a.map(d=>({type:"int32",data:[d[0],d[1]]})),l=new yd(s.shape,a,r);return n.runWebGPUProgram(l,[s],s.dtype,o)}},Id=V({opType:z.MOD}),kd={kernelName:u.Mod,backendName:"webgpu",kernelFunc:Id},wd=class{constructor(e,i){this.variableNames=["probs"],this.outputShape=[],this.uniforms="seed : f32, numOutcomes: i32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[e,i],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="multinomial"}getUserCode(){return`
    //Based on the work of Dave Hoskins
    //https://www.shadertoy.com/view/4djSRW
    fn random (seed : f32, resultUV : vec2<f32>) -> f32 {
      let HASHSCALE1 = 443.8975;
      let p = resultUV * seed;
      var p3  = fract(vec3<f32>(p.xyx) * HASHSCALE1);
      p3 = p3 + dot(p3, p3.yzx + 19.19);
      return fract((p3.x + p3.y) * p3.z);
    }

    ${k("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let batch = coords[0];

        let resUV = vec2<f32>(f32(coords[1]) / f32(uniforms.outShape[1]),
            f32(coords[0]) / f32(uniforms.outShape[0]));
        let r = random(uniforms.seed, resUV);
        var cdf = 0.0;
        for (var i = 0; i < uniforms.numOutcomes - 1; i = i + 1) {
          cdf = cdf + getProbs(batch, i);

          if (r < cdf) {
            setOutputAtIndexI32(index, i);
            return;
          }
        }

        // If no other event happened, last event happened.
        setOutputAtIndexI32(index, uniforms.numOutcomes - 1);
      }
    }
  `}},Rd=class{constructor(e){this.variableNames=["logits"],this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=[this.outputShape[0],1,1],this.outputShape[1]>=4096?this.workgroupSize=[256,1,1]:this.workgroupSize=[64,1,1],this.shaderKey="softmax"}getUserCode(){return`
    var<workgroup> buf : array<f32, ${this.workgroupSize[0]}>;
    var<workgroup> rowMaxShared : f32;
    var<workgroup> rowSumShared : f32;
    const blockSize = ${this.workgroupSize[0]};
    ${k("index")} {
      let row = index / blockSize;
      let tid = i32(localId.x);
      let cols = uniforms.outShape[1];

      var threadMax = -3.402823e+38f;
      for (var col = tid; col < cols; col += blockSize) {
        let value = getLogits(row, col);
        threadMax = max(threadMax, value);
      }
      if (tid < cols) {
        buf[tid] = threadMax;
      }
      workgroupBarrier();

      var reduceSize = min(cols, blockSize);
      for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
        reduceSize = currSize + (reduceSize & 1);
        if (tid < currSize) {
          buf[tid] = max(buf[tid], buf[tid + reduceSize]);
        }
        workgroupBarrier();
      }

      if (tid == 0) {
        rowMaxShared = buf[0];
      }
      workgroupBarrier();

      var threadSum = 0.0;
      for (var col = tid; col < cols; col += blockSize) {
        let subExp = exp(getLogits(row, col) - rowMaxShared);
        threadSum += subExp;
      }
      buf[tid] = threadSum;
      workgroupBarrier();

      for (var currSize = blockSize >> 1;  currSize > 0; currSize = currSize >> 1) {
        if (tid < currSize) {
          buf[tid] = buf[tid] + buf[tid + currSize];
        }
        workgroupBarrier();
      }

      if (tid == 0) {
        rowSumShared = buf[0];
      }
      workgroupBarrier();

      for (var col = tid; col < cols; col += blockSize) {
        let value = exp(getLogits(row, col) - rowMaxShared) / rowSumShared;
        setOutputAtCoords(row, col, value);
      }
  }
    `}};function li(e){const{inputs:i,backend:t,attrs:s}=e,{logits:a}=i,{dim:r}=s,n=$({inputs:{x:a},backend:t,attrs:{shape:[u.util.sizeFromShape(a.shape)/a.shape[r],a.shape[r]]}}),o=new Rd(n.shape),l=t.runWebGPUProgram(o,[n],a.dtype),d=$({inputs:{x:l},backend:t,attrs:{shape:a.shape}});return t.disposeData(n.dataId),t.disposeData(l.dataId),d}var Pd={kernelName:u.Softmax,backendName:"webgpu",kernelFunc:li};function $d(e){const{inputs:i,backend:t,attrs:s}=e,{logits:a}=i,{numSamples:r,seed:n,normalized:o}=s,l=o?a:li({inputs:{logits:a},backend:t,attrs:{dim:a.shape.length-1}}),d=l.shape[0],h=l.shape[1],p=new wd(d,r),c=[{type:"float32",data:[n]},{type:"int32",data:[h]}],m=t.runWebGPUProgram(p,[l],"int32",c);return o||t.disposeData(l.dataId),m}var Dd={kernelName:u.Multinomial,backendName:"webgpu",kernelFunc:$d};function Nd(e){const{inputs:i,backend:t}=e,{x:s}=i;if(t.shouldExecuteOnCPU([s])){const r=t.tensorMap.get(s.dataId),[n,o]=Lr(r.values,s.shape,s.dtype);return t.makeTensorInfo(o,s.dtype,n)}const a=new le(s.shape,I.NEG);return t.runWebGPUProgram(a,[s],s.dtype)}var zd={kernelName:u.Neg,backendName:"webgpu",kernelFunc:Nd};function Ad(e){console.warn("tf.nonMaxSuppression() in webgpu locks the UI thread. Call tf.nonMaxSuppressionAsync() instead");const{inputs:i,backend:t,attrs:s}=e,{boxes:a,scores:r}=i,{maxOutputSize:n,iouThreshold:o,scoreThreshold:l}=s,d=t.readSync(a.dataId),h=t.readSync(r.dataId),{selectedIndices:p}=u.kernel_impls.nonMaxSuppressionV3Impl(d,h,n,o,l);return t.makeTensorInfo([p.length],"int32",new Int32Array(p))}var Fd={kernelName:u.NonMaxSuppressionV3,backendName:"webgpu",kernelFunc:Ad};function Ed(e){console.warn("tf.nonMaxSuppression() in webgpu locks the UI thread. Call tf.nonMaxSuppressionAsync() instead");const{inputs:i,backend:t,attrs:s}=e,{boxes:a,scores:r}=i,{maxOutputSize:n,iouThreshold:o,scoreThreshold:l,softNmsSigma:d}=s,h=t.readSync(a.dataId),p=t.readSync(r.dataId),c=n,m=o,f=l,g=d,{selectedIndices:x,selectedScores:v}=u.kernel_impls.nonMaxSuppressionV5Impl(h,p,c,m,f,g);return[t.makeTensorInfo([x.length],"int32",new Int32Array(x)),t.makeTensorInfo([v.length],"float32",new Float32Array(v))]}var Td={kernelName:u.NonMaxSuppressionV5,backendName:"webgpu",kernelFunc:Ed},Ld=class{constructor(e,i){this.variableNames=["x"],this.uniforms="onValue : f32, offValue : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[e,i],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="onehot"}getUserCode(){return`
      ${k("index")} {
        if(index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          setOutputAtIndex(index, mix(uniforms.offValue, uniforms.onValue,
                                      f32(i32(round(getX(coords.x))) == coords.y)));
        }
      }
    `}};function Bd(e){const{inputs:i,backend:t,attrs:s}=e,{indices:a}=i,{dtype:r,depth:n,onValue:o,offValue:l}=s,d=u.util.sizeFromShape(a.shape),h=new Ld(d,n),p=$({inputs:{x:a},backend:t,attrs:{shape:[d]}}),c=[{type:"float32",data:[o]},{type:"float32",data:[l]}],m=t.runWebGPUProgram(h,[p],r,c);t.disposeData(p.dataId);const f=[...a.shape,n],g=$({inputs:{x:m},backend:t,attrs:{shape:f}});return t.disposeData(m.dataId),g}var Wd={kernelName:u.OneHot,backendName:"webgpu",kernelFunc:Bd};function ze(e){const{inputs:i,backend:t}=e,{x:s}=i;if(s.dtype==="complex64"){const a=ge({inputs:{input:s},backend:t}),r=ze({inputs:{x:a},backend:t}),n=De({inputs:{input:s},backend:t}),o=ze({inputs:{x:n},backend:t}),l=ne({inputs:{real:r,imag:o},backend:t});return t.disposeData(a.dataId),t.disposeData(r.dataId),t.disposeData(n.dataId),t.disposeData(o.dataId),l}else return U({attrs:{shape:s.shape,dtype:s.dtype,value:s.dtype==="string"?"":0},backend:t})}var Vd={kernelName:u.ZerosLike,backendName:"webgpu",kernelFunc:ze};function di(e){const{inputs:i,backend:t}=e,{x:s}=i;if(s.dtype==="string")throw new Error("onesLike is not supported under string dtype");if(s.dtype==="complex64"){const a=ge({inputs:{input:s},backend:t}),r=di({inputs:{x:a},backend:t}),n=De({inputs:{input:s},backend:t}),o=ze({inputs:{x:n},backend:t}),l=ne({inputs:{real:r,imag:o},backend:t});return t.disposeData(a.dataId),t.disposeData(r.dataId),t.disposeData(n.dataId),t.disposeData(o.dataId),l}else return U({attrs:{shape:s.shape,dtype:s.dtype,value:1},backend:t})}var Md={kernelName:u.OnesLike,backendName:"webgpu",kernelFunc:di};function Od(e){const{inputs:i,backend:t,attrs:s}=e,{axis:a}=s;if(i.length===1)return Xe({inputs:{input:i[0]},backend:t,attrs:{dim:a}});const r=i[0].shape,n=i[0].dtype;i.forEach(h=>{u.util.assertShapesMatch(r,h.shape,"All tensors passed to stack must have matching shapes"),u.util.assert(n===h.dtype,()=>"All tensors passed to stack must have matching dtypes")});const o=[],l=i.map(h=>{const p=Xe({inputs:{input:h},backend:t,attrs:{dim:a}});return o.push(p),p}),d=Qt({inputs:l,backend:t,attrs:{axis:a}});return o.forEach(h=>t.disposeData(h.dataId)),d}var Ud={kernelName:u.Pack,backendName:"webgpu",kernelFunc:Od};function hi(e,i=!1){const t=e.length,s=B(t),a=e.map((p,c)=>`uniforms.pad${c}[0]`).join(","),r=e.map((p,c)=>`uniforms.pad${c}[0] + uniforms.xShape${t>1?`[${c}]`:""}`).join(","),n=t>1?`${s}(${a})`:`${a}`,o=t>1?`${s}(${r})`:`${r}`,l=t>1?"any(paddedCoords < start)":"paddedCoords < start",d=t>1?"any(paddedCoords >= end)":"paddedCoords >= end",h=t>1?["coords[0]","coords[1]","coords[2]","coords[3]"].slice(0,t):"coords";return`
        let start = ${n};
        let end = ${o};
        if (${l} || ${d}) {
          setOutputAtIndex(index, ${i?0:"uniforms.constantValue"});
        } else {
          let coords = paddedCoords - start;
          setOutputAtIndex(index, getX(${h}));
        }
  `}var Gd=class{constructor(e,i){this.variableNames=["x"],this.uniforms="constantValue : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=i.map((t,s)=>t[0]+e[s]+t[1]),this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),i.map((t,s)=>{this.uniforms+=` pad${s} : vec2<i32>,`}),this.xShape=e,this.shaderKey="pad"}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          let paddedCoords = getCoordsFromIndex(index);
          ${hi(this.xShape)}
        }
      }
    `}},Hd=e=>{const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{paddings:r,constantValue:n}=s;if(r.every(d=>u.util.arraysEqual(d,[0,0])))return q({inputs:{x:a},backend:t});if(u.util.sizeFromShape(a.shape)===0){const d=r.map((h,p)=>h[0]+a.shape[p]+h[1]);return U({backend:t,attrs:{shape:d,value:n,dtype:a.dtype}})}const o=[{type:"float32",data:[n]}];r.map(d=>o.push({type:"int32",data:[d[0],d[1]]}));const l=new Gd(a.shape,r);return t.runWebGPUProgram(l,[a],a.dtype,o)},qd={kernelName:u.PadV2,backendName:"webgpu",kernelFunc:Hd},Xd=V({opType:z.POW}),Kd={kernelName:u.Pow,backendName:"webgpu",kernelFunc:Xd};function Yd(e){const{inputs:i,backend:t}=e,{x:s,alpha:a}=i,r=new Pe(z.PRELU,s.shape,a.shape);return t.runWebGPUProgram(r,[s,a],"float32")}var Qd={kernelName:u.Prelu,backendName:"webgpu",kernelFunc:Yd};function Zd(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{axis:r,keepDims:n}=s;return oe(a,r,n,"prod",t)}var Jd={kernelName:u.Prod,backendName:"webgpu",kernelFunc:Zd},jd=e=>{const{backend:i,attrs:t}=e,{start:s,stop:a,step:r,dtype:n}=t,o=Vr(s,a,r,n);return i.makeTensorInfo([o.length],n,o)},_d={kernelName:u.Range,backendName:"webgpu",kernelFunc:jd},eh=V({opType:z.DIV}),th={kernelName:u.RealDiv,backendName:"webgpu",kernelFunc:eh},ih=F({opType:I.RECIPROCAL}),ah={kernelName:u.Reciprocal,backendName:"webgpu",kernelFunc:ih},sh=F({opType:I.RELU}),rh={kernelName:u.Relu,backendName:"webgpu",kernelFunc:sh},nh=F({opType:I.RELU6}),oh={kernelName:u.Relu6,backendName:"webgpu",kernelFunc:nh},uh=class{constructor(e,i,t){this.variableNames=["x"],this.uniforms="adjustHeightWidth : vec2<f32>, halfPixelCenters : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[e[0],i,t,e[3]],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="resizeBilinear"}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
          let b = coords[0];
          let d = coords[3];
          let rc = coords.yz;

          let effectiveInSize = vec2<f32>(
            f32(uniforms.xShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.xShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveOutSize = vec2<f32>(
            f32(uniforms.outShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.outShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveInputOverOutputRatioRC =
              effectiveInSize / effectiveOutSize;

          // Fractional source index
          let sourceFracIndexRC =
            (vec2<f32>(rc) + vec2<f32>(uniforms.halfPixelCenters)) *
            effectiveInputOverOutputRatioRC - vec2<f32>(uniforms.halfPixelCenters);

          // Compute the four integer indices.
          let sourceFloorRC = vec2<i32>(sourceFracIndexRC);
          let sourceCeilRC = vec2<i32>(
            min(vec2<f32>(uniforms.xShape.yz) - vec2<f32>(1.0), ceil(sourceFracIndexRC)));

          let topLeft = getX(b, sourceFloorRC.x, sourceFloorRC.y, d);
          let bottomLeft = getX(b, sourceCeilRC.x, sourceFloorRC.y, d);
          let topRight = getX(b, sourceFloorRC.x, sourceCeilRC.y, d);
          let bottomRight = getX(b, sourceCeilRC.x, sourceCeilRC.y, d);

          let fracRC = sourceFracIndexRC - vec2<f32>(sourceFloorRC);

          let top = topLeft + (topRight - topLeft) * fracRC.y;
          let bottom = bottomLeft + (bottomRight - bottomLeft) * fracRC.y;
          let newValue = top + (bottom - top) * fracRC.x;

          setOutputAtIndex(index, newValue);
        }
      }
    `}};function lh(e){const{inputs:i,backend:t,attrs:s}=e,{images:a}=i,{alignCorners:r,size:n,halfPixelCenters:o}=s,[l,d]=n,h=[{type:"float32",data:[r&&l>1?1:0,r&&d>1?1:0]},{type:"float32",data:[o?.5:0]}],p=new uh(a.shape,l,d);return t.runWebGPUProgram(p,[a],"float32",h)}var dh={kernelName:u.ResizeBilinear,backendName:"webgpu",kernelFunc:lh},hh=class{constructor(e,i){this.variableNames=["dy"],this.uniforms=`effectiveXSize : vec2<i32>, effectiveYSize : vec2<i32>, heightScale : f32, widthScale : f32,
       invHeightScale : f32, invWidthScale : f32, winHeight : i32, winWidth : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.alignCorners=i,this.shaderKey=`resizeBilinearBackprop_${i}`}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let b = coords[0];
          let d = coords[3];
          let r = coords[1];
          let c = coords[2];

          var accumulator = 0.0;

          // Compute bounds for where in dy we will look
          let startRLerp = floor(f32(r) * uniforms.invHeightScale);
          let startDyR = i32(startRLerp - f32(uniforms.winHeight / 2));

          let startCLerp = floor(f32(c) * uniforms.invWidthScale);
          let startDyC = i32(startCLerp - f32(uniforms.winWidth / 2));

          // Loop over dy
          for (var dyROffset = 0; dyROffset < uniforms.winHeight; dyROffset++) {
            let dyR = startDyR + dyROffset;

            // Guard against the window exceeding the bounds of dy
            if (dyR < 0 || dyR >= uniforms.dyShape[1]) {
              continue;
            }

            for (var dyCOffset = 0; dyCOffset < uniforms.winWidth; dyCOffset++) {
              let dyC = startDyC + dyCOffset;

              // Guard against the window exceeding the bounds of dy
              if (dyC < 0 || dyC >= uniforms.dyShape[2]) {
                continue;
              }

              let dxR = f32(dyR) * uniforms.heightScale;
              let topDxRIndex = i32(floor(dxR));
              let bottomDxRIndex = i32(min(ceil(dxR), f32(uniforms.outShape[1] - 1)));
              let dxRLerp = dxR - f32(topDxRIndex);
              let inverseDxRLerp = 1.0 - dxRLerp;

              let dxC = f32(dyC) * uniforms.widthScale;
              let leftDxCIndex = i32(floor(dxC));
              let rightDxCIndex = i32(min(ceil(dxC), f32(uniforms.outShape[2] - 1)));
              let dxCLerp = dxC - f32(leftDxCIndex);
              let inverseDxCLerp = 1.0 - dxCLerp;

              if (r == topDxRIndex && c == leftDxCIndex) {
                // topLeft
                accumulator +=
                  getDy(b, dyR, dyC, d) * inverseDxRLerp * inverseDxCLerp;
              }

              if (r == topDxRIndex && c == rightDxCIndex) {
                // topRight
                accumulator += getDy(b, dyR, dyC, d) * inverseDxRLerp * dxCLerp;
              }

              if (r == bottomDxRIndex && c == leftDxCIndex) {
                // bottomLeft
                accumulator += getDy(b, dyR, dyC, d) * dxRLerp * inverseDxCLerp;
              }

              if (r == bottomDxRIndex && c == rightDxCIndex) {
                // bottomRight
                accumulator += getDy(b, dyR, dyC, d) * dxRLerp * dxCLerp;
              }
            }
          }
          // End loop over dy

          setOutputAtIndex(index, accumulator);
        }
      }
    `}};function ph(e){const{inputs:i,backend:t,attrs:s}=e,{images:a,dy:r}=i,{alignCorners:n}=s,[,o,l]=a.shape,[,d,h]=r.shape,p=[n&&d>1?o-1:o,n&&h>1?l-1:l],c=[n&&d>1?d-1:d,n&&h>1?h-1:h],m=p[0]/c[0],f=p[1]/c[1],g=1/m,x=1/f,v=Math.ceil(g)*2+2,C=Math.ceil(x)*2+2,b=new hh(a.shape,n),y=[{type:"int32",data:p},{type:"int32",data:c},{type:"float32",data:[m]},{type:"float32",data:[f]},{type:"float32",data:[g]},{type:"float32",data:[x]},{type:"int32",data:[v]},{type:"int32",data:[C]}];return t.runWebGPUProgram(b,[r],r.dtype,y)}var ch={kernelName:u.ResizeBilinearGrad,backendName:"webgpu",kernelFunc:ph},mh=class{constructor(e,i,t,s){this.variableNames=["x"],this.uniforms="adjustHeightWidth : vec2<f32>, roundBase : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[e[0],i,t,e[3]],this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.halfPixelCenters=s,this.shaderKey=`resizeNearest_${s}`}getUserCode(){let e;return this.halfPixelCenters?e="max((vec2<f32>(rc) + vec2<f32>(0.5)) * effectiveInputOverOutputRatioRC, vec2<f32>(0.0))":e="vec2<f32>(rc) * effectiveInputOverOutputRatioRC",`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let b = coords[0];
          let d = coords[3];
          let rc = coords.yz;

          let effectiveInSize = vec2<f32>(
            f32(uniforms.xShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.xShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveOutSize = vec2<f32>(
            f32(uniforms.outShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.outShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveInputOverOutputRatioRC =
              effectiveInSize / effectiveOutSize;

          // Fractional source index
          let sourceFracIndexRC = ${e};

          // Compute the coordinators of nearest neighbor point.
          let inputShapeRC = vec2<f32>(f32(uniforms.xShape.y), f32(uniforms.xShape.z));
          let sourceNearestRC = vec2<i32>(
            min(inputShapeRC - 1.0, floor(sourceFracIndexRC + uniforms.roundBase)));
          let newValue = getX(b, sourceNearestRC.x, sourceNearestRC.y, d);

          setOutputAtIndex(index, newValue);
        }
      }
    `}};function fh(e){const{inputs:i,backend:t,attrs:s}=e,{images:a}=i,{alignCorners:r,halfPixelCenters:n,size:o}=s,[l,d]=o,h=[{type:"float32",data:[r&&l>1?1:0,r&&d>1?1:0]},{type:"float32",data:[r?.5:0]}],p=new mh(a.shape,l,d,n);return t.runWebGPUProgram(p,[a],a.dtype,h)}var gh={kernelName:u.ResizeNearestNeighbor,backendName:"webgpu",kernelFunc:fh},xh=class{constructor(e,i){this.variableNames=["dy"],this.uniforms=`effectiveXSize : vec2<i32>, effectiveYSize : vec2<i32>, invHeightScale : f32, invWidthScale : f32,
       winHeight : i32, winWidth : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.alignCorners=i,this.shaderKey=`resizeNearestNeigborBackprop_${i}`}getUserCode(){return`
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let b = coords[0];
          let d = coords[3];
          let r = coords[1];
          let c = coords[2];

          var accumulator = 0.0;

          // Compute bounds for where in dy we will look
          let startRLerp = floor(f32(r) * uniforms.invHeightScale);
          let startDyR = i32(floor(startRLerp - f32(uniforms.winHeight / 2)));

          let startCLerp = floor(f32(c) * uniforms.invWidthScale);
          let startDyC = i32(floor(startCLerp - f32(uniforms.winWidth / 2)));

          // Loop over dy
          for (var dyROffset = 0; dyROffset < uniforms.winHeight; dyROffset++) {
            let dyR = startDyR + dyROffset;

            // Guard against the window exceeding the bounds of dy
            if (dyR < 0 || dyR >= uniforms.dyShape[1]) {
              continue;
            }

            for (var dyCOffset = 0; dyCOffset < uniforms.winWidth; dyCOffset++) {
              let dyC = startDyC + dyCOffset;

              // Guard against the window exceeding the bounds of dy
              if (dyC < 0 || dyC >= uniforms.dyShape[2]) {
                continue;
              }

              let sourceFracRow = f32(uniforms.effectiveXSize[0]) *
                  (f32(dyR) / f32(uniforms.effectiveYSize[0]));

              let sourceFracCol = f32(uniforms.effectiveXSize[1]) *
                  (f32(dyC) / f32(uniforms.effectiveYSize[1]));

              let sourceNearestRow =
                  i32(min(f32(uniforms.outShape[1] - 1),
                  ${this.alignCorners?"floor(sourceFracRow + 0.5)":"floor(sourceFracRow)"}));

              let sourceNearestCol =
                  i32(min(f32(uniforms.outShape[2] - 1),
                  ${this.alignCorners?"floor(sourceFracCol + 0.5)":"floor(sourceFracCol)"}));

              if (r == sourceNearestRow && c == sourceNearestCol) {
                accumulator += getDy(b, dyR, dyC, d);
              }
            }
          }
          // End loop over dy

          setOutputAtIndex(index, accumulator);
        }
      }
    `}};function vh(e){const{inputs:i,backend:t,attrs:s}=e,{images:a,dy:r}=i,{alignCorners:n}=s,[,o,l]=a.shape,[,d,h]=r.shape,p=[n&&d>1?o-1:o,n&&h>1?l-1:l],c=[n&&d>1?d-1:d,n&&h>1?h-1:h],m=p[0]/c[0],f=p[1]/c[1],g=1/m,x=1/f,v=Math.ceil(g)*2+2,C=Math.ceil(x)*2+2,b=new xh(a.shape,n),y=[{type:"int32",data:p},{type:"int32",data:c},{type:"float32",data:[g]},{type:"float32",data:[x]},{type:"int32",data:[v]},{type:"int32",data:[C]}];return t.runWebGPUProgram(b,[r],r.dtype,y)}var Ch={kernelName:u.ResizeNearestNeighborGrad,backendName:"webgpu",kernelFunc:vh},bh=class{constructor(e){this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms=" axis : vec4<i32>,",this.shaderKey="reverse"}getUserCode(){return`
      
      // Using uniform variables as judging conditions, so the function has
      // coherent execution within all threads.
      fn getReverseCoords(coords : vec4<i32>) -> vec4<i32> {
        var reverseCoords = coords;
        if (uniforms.axis[0] == 1) {
          reverseCoords[0] = uniforms.xShape[0] - coords[0] - 1;
        }
        if (uniforms.axis[1] == 1) {
          reverseCoords[1] = uniforms.xShape[1] - coords[1] - 1;
        }
        if (uniforms.axis[2] == 1) {
          reverseCoords[2] = uniforms.xShape[2] - coords[2] - 1;
        }
        if (uniforms.axis[3] == 1) {
          reverseCoords[3] = uniforms.xShape[3] - coords[3] - 1;
        }

        return reverseCoords;
      }
    
      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let reverseCoords = getReverseCoords(coords);
          setOutputAtIndex(index, getX(reverseCoords[0],
              reverseCoords[1], reverseCoords[2], reverseCoords[3]));
        }
      }
    `}};function yh(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{dims:r}=s,n=a.shape.length;if(n===0)return q({inputs:{x:a},backend:t});const o=a.shape,l=[1,1,1,1];o.forEach((x,v)=>{const C=v+4-n;l[C]=x});const d=u.util.parseAxisParam(r,a.shape),h=[0,0,0,0];d.forEach(x=>{const v=x+4-n;h[v]=1});const p=[{type:"int32",data:h}],c=$({inputs:{x:a},backend:t,attrs:{shape:l}}),m=new bh(l),f=t.runWebGPUProgram(m,[c],c.dtype,p);t.disposeData(c.dataId);const g=$({inputs:{x:f},backend:t,attrs:{shape:o}});return t.disposeData(f.dataId),g}var Sh={kernelName:u.Reverse,backendName:"webgpu",kernelFunc:yh},Ih=class{constructor(e,i){this.outputShape=[],this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms=`centerX : f32, centerY : f32, sinRadians : f32,
          cosRadians : f32,`,this.shaderKey="rotate",this.outputShape=e,typeof i=="number"?(this.uniforms+=" fillValue : f32,",this.fillSnippet="var outputValue = uniforms.fillValue;",this.shaderKey+="_float"):(this.uniforms+=" fillValue : vec3<f32>,",this.fillSnippet="var outputValue = uniforms.fillValue[coords[3]];",this.shaderKey+="_vec3")}getUserCode(){return`
        ${k("index")} {
          if (index < uniforms.size) {
            let coords = getCoordsFromIndex(index);
            let coordXFloat = (f32(coords[2]) - uniforms.centerX) *
                uniforms.cosRadians - (f32(coords[1]) - uniforms.centerY) *
                uniforms.sinRadians;
            let coordYFloat = (f32(coords[2]) - uniforms.centerX) *
                uniforms.sinRadians + (f32(coords[1]) - uniforms.centerY) *
                uniforms.cosRadians;
            let coordX = i32(round(coordXFloat + uniforms.centerX));
            let coordY = i32(round(coordYFloat + uniforms.centerY));
            ${this.fillSnippet}
            if(coordX >= 0 && coordX < uniforms.xShape[2] && coordY >= 0 &&
                coordY < uniforms.xShape[1]) {
              outputValue = getX(coords[0], coordY, coordX, coords[3]);
            }
            setOutputAtIndex(index, outputValue);
          }
        }
      `}},kh={kernelName:u.RotateWithOffset,backendName:"webgpu",kernelFunc:({inputs:e,attrs:i,backend:t})=>{const{image:s}=e,{radians:a,fillValue:r,center:n}=i,o=t,l=new Ih(s.shape,r),[d,h]=u.backend_util.getImageCenter(n,s.shape[1],s.shape[2]),p=[{type:"float32",data:[d]},{type:"float32",data:[h]},{type:"float32",data:[Math.sin(a)]},{type:"float32",data:[Math.cos(a)]}];return typeof r=="number"?p.push({type:"float32",data:[Number.parseFloat(r.toFixed(2))]}):p.push({type:"float32",data:r}),o.runWebGPUProgram(l,[s],s.dtype,p)}},wh=F({opType:I.ROUND}),Rh={kernelName:u.Round,backendName:"webgpu",kernelFunc:wh},Ph=F({opType:I.RSQRT,cpuKernelImpl:Mr}),$h={kernelName:u.Rsqrt,backendName:"webgpu",kernelFunc:Ph},Ce=class{constructor(e,i,t,s,a,r,n,o=!0){this.variableNames=["updates","indices"],this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=r,this.type=n,this.sumDupeIndices=o,this.dispatchLayout=R(e),this.dispatch=w(this.dispatchLayout,e,this.workgroupSize),this.sliceDimGreaterThanOne=i>1,this.shaderKey=`scatter_${t}_${s}_${this.sliceDimGreaterThanOne}_${n}_${o}_${a.length}`;const l=B(a.length);this.uniforms=`sliceDim : i32, strides: ${l}, updatesSize: i32,`,this.updatesRank=s,this.indicesRank=t}getUserCode(){let e="";this.indicesRank===1?e="coords[0]":this.indicesRank===2&&(e="coords[0], j");const i=`getIndices(${e})`,t=this.sliceDimGreaterThanOne?"uniforms.strides[j]":"uniforms.strides";let s="",a="";this.dispatchLayout.x.length===1?(s="flattenedIndex",a=`
      fn getUpdatesCoordsFromFlatIndex(index : i32) -> i32 {
        return index;
      }
      `):this.dispatchLayout.x.length===2&&(s="vec2<i32>(flattenedIndex, coords[1])",a=`
      fn getUpdatesCoordsFromFlatIndex(index : i32) -> vec2<i32> {
        // N.B. |updates| could be a scalar tensor, conceptually representing a
        // 2D tensor with all values equal to that. By design, its size must be
        // the same as |outShape[1]| in one dimension, and |indicesShape[0]|
        // gives the other.
        let sliceSize = uniforms.outShape[1];
        let d0 = index / sliceSize;
        let d1 = index - d0 * sliceSize;
        return vec2<i32>(d0, d1);
      }
      `);const r=`getUpdates(${Array.from({length:this.updatesRank},(n,o)=>`coords[${o}]`).join(", ")})`;return`
    ${a}
      ${k("index")} {
        if (index < uniforms.updatesSize) {
          let coords = getUpdatesCoordsFromFlatIndex(index);
          var flattenedIndex = 0;
          for (var j = 0; j < uniforms.sliceDim; j = j + 1) {
            let indexInside = i32(round(${i}));
            flattenedIndex = flattenedIndex + indexInside * ${t};
          }
          let updateValue =
              ${ie(this.type)}(${r});
          let flatIndex = getOutputIndexFromCoords(${s});

          ${this.sumDupeIndices?ee("&result[flatIndex]","updateValue",this.type):"atomicStore(&result[flatIndex], bitcast<i32>(updateValue));"}
        }
      }`}};function Dh(e){const{inputs:i,backend:t,attrs:s}=e,{indices:a,updates:r}=i,{shape:n}=s,{sliceRank:o,numUpdates:l,sliceSize:d,strides:h,outputSize:p}=u.backend_util.calculateShapes(r,a,n),c=[p/d,d];if(p===0)return t.makeTensorInfo(n,a.dtype);const m=$({inputs:{x:a},backend:t,attrs:{shape:[l,o]}}),f=$({inputs:{x:r},backend:t,attrs:{shape:[l,d]}}),g=f.dtype,x=U({backend:t,attrs:{shape:c,value:0,dtype:g}}),v=u.util.sizeFromShape(f.shape),C=[{type:"int32",data:[o]},{type:"int32",data:h},{type:"int32",data:[v]}],b=new Ce(f.shape,o,m.shape.length,f.shape.length,h,c,g),y=t.runWebGPUProgram(b,[f,m],g,C,x),S=$({inputs:{x:y},backend:t,attrs:{shape:n}});return t.disposeData(m.dataId),t.disposeData(f.dataId),t.disposeData(y.dataId),S}var Nh={kernelName:u.ScatterNd,backendName:"webgpu",kernelFunc:Dh},zh=class{constructor(e,i){this.outputShape=[],this.variableNames=["sortedSequence","values"],this.uniforms="numInputs : i32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.side=i,this.shaderKey=`search_sorted_${i}`}getUserCode(){return`
      fn findBound(batch: i32, value: f32) -> i32 {
        var left = i32(0);
        var right = uniforms.numInputs;
        while (left < right) {
          var mid = (left + right) / 2;
          if (getSortedSequence(batch, mid) ${this.side==="left"?"<":"<="} value) {
            left = mid + 1;
          } else {
            right = mid;
          }
        }
        return right;
      }

      ${k("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let value = getValuesByOutputIndex(index);
          setOutputAtIndexI32(index, findBound(coords[0], value));
        }
      }
    `}};function Ah(e){const{inputs:i,backend:t,attrs:s}=e,{sortedSequence:a,values:r}=i,{side:n}=s,o=new zh([r.shape[0],r.shape[1]],n),l=[{type:"int32",data:[a.shape[1]]}];return t.runWebGPUProgram(o,[a,r],"int32",l)}var Fh={kernelName:u.SearchSorted,backendName:"webgpu",kernelFunc:Ah},Eh=class{constructor(e,i,t){this.variableNames=["c","a","b"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=i,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.cRank=e,this.rank=t,this.shaderKey="select"}getUserCode(){let e,i;if(this.rank>4)throw Error(`Where for rank ${this.rank} is not yet supported`);if(this.rank===1)i="resRC",e="resRC";else{const t=["resRC.x","resRC.y","resRC.z","resRC.w"],s=[],a=[];for(let r=0;r<this.outputShape.length;r++)a.push(`${t[r]}`),r<this.cRank&&s.push(`${t[r]}`);e=s.join(),i=a.join()}return`
      ${k("index")} {
        if (index < uniforms.size) {
          let resRC = getCoordsFromIndex(index);
          let cVal = getC(${e});
          if (cVal >= 1.0) {
            setOutputAtIndex(index, getA(${i}));
          } else {
            setOutputAtIndex(index, getB(${i}));
          }
        }
      }
    `}};function Th(e){const{inputs:i,backend:t}=e,{condition:s,t:a,e:r}=i,n=new Eh(s.shape.length,a.shape,a.shape.length);return t.runWebGPUProgram(n,[s,a,r],(0,u.upcastType)(a.dtype,r.dtype))}var Lh={kernelName:u.Select,backendName:"webgpu",kernelFunc:Th},Bh=F({opType:I.SELU}),Wh={kernelName:u.Selu,backendName:"webgpu",kernelFunc:Bh},Vh=F({opType:I.SIGMOID}),Mh={kernelName:u.Sigmoid,backendName:"webgpu",kernelFunc:Vh},Oh=F({opType:I.SIGN}),Uh={kernelName:u.Sign,backendName:"webgpu",kernelFunc:Oh},Gh=F({opType:I.SIN}),Hh={kernelName:u.Sin,backendName:"webgpu",kernelFunc:Gh},qh=F({opType:I.SINH}),Xh={kernelName:u.Sinh,backendName:"webgpu",kernelFunc:qh},Kh=F({opType:I.SOFTPLUS}),Yh={kernelName:u.Softplus,backendName:"webgpu",kernelFunc:Kh},Qh=class{constructor(e,i,t,s,a,r){this.variableNames=["x"],this.outputShape=[],this.uniforms="",this.workgroupSize=[64,1,1],this.size=!0;const n=new Array(s.length);for(let o=0;o<n.length;o++)n[o]=s[a[o]];this.outputShape=n,this.newDim=a,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.xShape=e,this.paddedXShape=i,this.uniforms+=`reshapedPaddedXShape : ${B(s.length)}, paddedXShapeStrides : ${B(r)}, `,t.map((o,l)=>{this.uniforms+=` pad${l} : vec2<i32>,`}),this.shaderKey=`spaceToBatchND_${a}`}getUserCode(){const e=B(this.outputShape.length),i=Ot(this.newDim);return`
      ${Ie(this.paddedXShape,"PaddedX")}
      ${k("index")} {
        if(index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let switchedIndex = getIndexFromCoords${this.outputShape.length}D(${e}(${i}), uniforms.reshapedPaddedXShape);
          let paddedCoords = getPaddedXCoordsFromIndex(switchedIndex);
          ${hi(this.xShape,!0)}
        }
      }
    `}},Zh=e=>{const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{blockShape:r,paddings:n}=s;u.util.assert(a.shape.length<=4,()=>"spaceToBatchND for rank > 4 with a WebGPU backend not implemented yet");const o=r.reduce((C,b)=>C*b),l=[[0,0]];l.push(...n);for(let C=1+r.length;C<a.shape.length;++C)l.push([0,0]);const d=l.map((C,b)=>C[0]+a.shape[b]+C[1]),h=u.backend_util.getReshaped(d,r,o,!1),p=u.backend_util.getPermuted(h.length,r.length,!1),c=u.backend_util.getReshapedPermuted(d,r,o,!1),m=u.util.computeStrides(d),f=new Qh(a.shape,d,l,h,p,m.length),g=[{type:"int32",data:h},{type:"int32",data:m}];l.map(C=>g.push({type:"int32",data:[C[0],C[1]]}));const x=t.runWebGPUProgram(f,[a],a.dtype,g),v=$({inputs:{x},backend:t,attrs:{shape:c}});return t.disposeData(x.dataId),v},Jh={kernelName:u.SpaceToBatchND,backendName:"webgpu",kernelFunc:Zh},jh=class{constructor(e,i,t){this.variableNames=["input","indices","segmentIds"],this.outputShape=[],this.uniforms="segmentSize : i32, sparseSize : i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=e,this.type=t,this.dispatchLayout=R([i]),this.dispatch=w(this.dispatchLayout,[i],this.workgroupSize),this.shaderKey="sparseSegmentSum"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.sparseSize) {
        let indexInSegmentIds = index / uniforms.segmentSize;
        let indexInSegment = index % uniforms.segmentSize;
        let indexInInput = indices[indexInSegmentIds];
        let segmentId = segmentIds[indexInSegmentIds];

        let value = input[indexInInput * uniforms.segmentSize + indexInSegment];
        let outIndex = segmentId * uniforms.segmentSize + indexInSegment;
        ${ee("&result[outIndex]","value",this.type)}
      }
    }
  `}},_h=class{constructor(e,i){this.variableNames=["segmentIds"],this.outputShape=[],this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=[e],this.dispatchLayout=R(i),this.dispatch=w(this.dispatchLayout,i,this.workgroupSize),this.shaderKey="sparseSegmentIdCountProgram"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.segmentIdsShape) {
        let segmentId = segmentIds[index];
        ${ee("&result[segmentId]","1","int32")}
      }
    }
  `}},ep=class{constructor(e,i){this.variableNames=["segmentSum","sameSegmentIdCount"],this.outputShape=[],this.uniforms="segmentSize : i32",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.type=i,this.dispatchLayout=R(e),this.dispatch=w(this.dispatchLayout,e,this.workgroupSize),this.shaderKey="sparseSegmentMean"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.size) {
        let segmentId = index / uniforms.segmentSize;
        let count = sameSegmentIdCount[segmentId];
        if (count != 0) {
          ${this.type==="float32"?"setOutputAtIndex(index, segmentSum[index] / f32(count));":"setOutputAtIndexI32(index, segmentSum[index] / count);"}
        }
      }
    }
  `}};function pi(e,i,t,s=!1,a){const r=u.util.sizeFromShape(e.shape)/e.shape[0],n=e.dtype,o=u.util.sizeFromShape(i.shape),l=a.readSync(t.dataId),d=o>0?l[o-1]+1:0;let h;const p=e.shape.slice();p[0]=d;const c=o*r,m=U({backend:a,attrs:{shape:p,value:0,dtype:n}});h=new jh(p,c,n);let f=[{type:"int32",data:[r]},{type:"int32",data:[c]}];const g=a.runWebGPUProgram(h,[e,i,t],n,f,m);if(s)return g;const x=U({backend:a,attrs:{shape:[d],value:0,dtype:"int32"}});h=new _h(d,t.shape);const v=a.runWebGPUProgram(h,[t],"int32",null,x),C=U({backend:a,attrs:{shape:p,value:0,dtype:n}});h=new ep(p,n),f=[{type:"int32",data:[r]}];const b=a.runWebGPUProgram(h,[g,v],n,f,C);return a.disposeData(g.dataId),a.disposeData(v.dataId),b}function tp(e){const{inputs:i,backend:t}=e,{data:s,indices:a,segmentIds:r}=i;return pi(s,a,r,!1,t)}var ip={kernelName:u.SparseSegmentMean,backendName:"webgpu",kernelFunc:tp};function ap(e){const{inputs:i,backend:t}=e,{data:s,indices:a,segmentIds:r}=i;return pi(s,a,r,!0,t)}var sp={kernelName:u.SparseSegmentSum,backendName:"webgpu",kernelFunc:ap},rp=class{constructor(e,i){this.variableNames=["A"],this.workgroupSize=[64,1,1],this.size=!0;const t=new Array(e.length);for(let s=0;s<t.length;s++)t[s]=e[s]*i[s];this.outputShape=t,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.rank=this.outputShape.length,this.shaderKey="tile"}getUserCode(){const e=np(this.rank,"uniforms.");return`
      ${k("index")} {
        if (index < uniforms.size) {
          let resRC = getCoordsFromIndex(index);
          setOutputAtIndex(index, getA(${e}));
        }
      }
    `}};function np(e,i=""){if(e>=5)throw Error(`Tile for rank ${e} is not yet supported`);if(e===1)return`(resRC % ${i}aShape)`;const t=["resRC.x","resRC.y","resRC.z","resRC.w"],s=[];for(let a=0;a<e;a++)s.push(`(${t[a]} % ${i}aShape[${a}])`);return s.join()}function Ye(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{reps:r}=s;if(t.shouldExecuteOnCPU([a])||a.dtype==="string"||a.shape.length>=5){const o=t.readSync(a.dataId),l=a.dtype==="string"?o.map(p=>u.util.decodeString(p)):o,d=(0,u.buffer)(a.shape,a.dtype,l),h=Kr(d,r);return t.makeTensorInfo(h.shape,h.dtype,h.values)}const n=new rp(a.shape,r);return t.runWebGPUProgram(n,[a],a.dtype)}var op={kernelName:u.Tile,backendName:"webgpu",kernelFunc:Ye};function up(e){const{inputs:i,backend:t,attrs:s}=e,{sparseIndices:a,sparseValues:r,defaultValue:n}=i,{outputShape:o}=s,{sliceRank:l,numUpdates:d,sliceSize:h,strides:p,outputSize:c}=u.backend_util.calculateShapes(r,a,o),m=!1;if(r.dtype==="string"){const D=t.bufferSync(a),E=t.bufferSync(r),T=u.util.decodeString(t.readSync(n.dataId)[0]),L=Or(D,E,o,c,h,d,l,p,T,m);return t.makeTensorInfo(o,L.dtype,L.values)}const f=[c/h,h],g=$({inputs:{x:a},backend:t,attrs:{shape:[d,l]}}),x=r.shape.length?$({inputs:{x:r},backend:t,attrs:{shape:[d,h]}}):q({inputs:{x:r},backend:t}),v=x.dtype,C=t.makeTensorInfo([],v,u.util.makeZerosTypedArray(1,v)),b=$({inputs:{x:n},backend:t,attrs:{shape:Array(f.length).fill(1)}}),y=Ye({inputs:{x:b},backend:t,attrs:{reps:f}}),S=u.util.sizeFromShape([d,h]),P=[{type:"int32",data:[l]},{type:"int32",data:p},{type:"int32",data:[S]}];switch(d){case 0:break;case 1:{const D=new Ce([d,h],l,g.shape.length,x.shape.length,p,f,v,m);t.runWebGPUProgram(D,[x,g],v,P,y)}break;default:{const D=new Ce([d,h],l,g.shape.length,C.shape.length,p,f,v,m);t.runWebGPUProgram(D,[C,g],v,P,y)}{const D=new Ce([d,h],l,g.shape.length,x.shape.length,p,f,v);t.runWebGPUProgram(D,[x,g],v,P,y)}}const N=$({inputs:{x:y},backend:t,attrs:{shape:o}});return t.disposeData(g.dataId),t.disposeData(x.dataId),t.disposeData(b.dataId),t.disposeData(C.dataId),t.disposeData(y.dataId),N}var lp={kernelName:u.SparseToDense,backendName:"webgpu",kernelFunc:up};function dp(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{numOrSizeSplits:r,axis:n}=s,o=u.util.parseAxisParam(n,a.shape)[0],l=u.backend_util.prepareSplitSize(a,r,o),d=a.shape.length,h=new Array(d).fill(0),p=a.shape.slice();return l.map(c=>{const m=[...p];m[o]=c;const f=de({inputs:{x:a},backend:t,attrs:{begin:h,size:m}});return h[o]+=c,f})}var hp={kernelName:u.SplitV,backendName:"webgpu",kernelFunc:dp},pp=F({opType:I.SQRT}),cp={kernelName:u.Sqrt,backendName:"webgpu",kernelFunc:pp},mp={kernelName:u.Square,backendName:"webgpu",kernelFunc:({inputs:e,backend:i})=>{const{x:t}=e,s=i,a=new le(t.shape,I.SQUARE);return s.runWebGPUProgram(a,[t],t.dtype)}},fp=V({opType:z.SQUARED_DIFFERENCE}),gp={kernelName:u.SquaredDifference,backendName:"webgpu",kernelFunc:fp};function xp({inputs:e,attrs:i,backend:t}){const{x:s}=e,a=new le(s.shape,I.STEP,"stepAlpha : f32,"),r=[{type:"float32",data:[i.alpha]}];return t.runWebGPUProgram(a,[s],s.dtype,r)}var vp={kernelName:u.Step,backendName:"webgpu",kernelFunc:xp},Cp=class{constructor(e){this.variableNames=["x"],this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]);const i=B(this.outputShape.length);this.uniforms=`begin : ${i},  strides : ${i}, `,this.shaderKey="stridedSlice"}getUserCode(){const e=this.outputShape.length;let i="";if(e===1)i="coords * uniforms.strides + uniforms.begin";else{let t=0;i=this.outputShape.map((s,a)=>(t++,this.outputShape.length===1?`coords * uniforms.strides[${a}] + uniforms.begin[${a}]`:`coords[${t-1}] * uniforms.strides[${a}] + uniforms.begin[${a}]`)).join(",")}return`
       ${k("index")} {
         if (index < uniforms.size) {
           let coords = getCoordsFromIndex(index);
           setOutputAtIndex(index, getX(${i}));
         }
       }
     `}};function bp(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{begin:r,end:n,strides:o,beginMask:l,endMask:d,ellipsisMask:h,newAxisMask:p,shrinkAxisMask:c}=s,{finalShapeSparse:m,finalShape:f,isIdentity:g,sliceDim0:x,isSimpleSlice:v,begin:C,end:b,strides:y}=u.slice_util.sliceInfo(a.shape,r,n,o,l,d,h,p,c);let S;if(g)S=$({inputs:{x:a},backend:t,attrs:{shape:f}});else if(x||v){u.util.assert(a.shape.length>=1,()=>`Input must have rank at least 1, got: ${a.shape.length}`);const P=u.slice_util.computeOutShape(C,b,y),N=de({inputs:{x:a},backend:t,attrs:{begin:C,size:P}});S=$({inputs:{x:N},backend:t,attrs:{shape:f}}),t.disposeData(N.dataId)}else if(t.shouldExecuteOnCPU([a])){const P=t.readSync(a.dataId),N=(0,u.buffer)(a.shape,a.dtype,P),D=Hr(m,N,y,C);S=t.makeTensorInfo(f,a.dtype,D.values)}else{const P=new Cp(m),N=[{type:"int32",data:C},{type:"int32",data:y}],D=t.runWebGPUProgram(P,[a],a.dtype,N);S=$({inputs:{x:D},backend:t,attrs:{shape:f}}),t.disposeData(D.dataId)}return S}var yp={kernelName:u.StridedSlice,backendName:"webgpu",kernelFunc:bp};function Sp(e){const{inputs:i,backend:t,attrs:s}=e,{separator:a,nGramWidths:r,leftPad:n,rightPad:o,padWidth:l,preserveShortSequences:d}=s,{data:h,dataSplits:p}=i,c=t.readSync(h.dataId),m=t.readSync(p.dataId),[f,g]=qr(c,m,a,r,n,o,l,d);return[t.makeTensorInfo([f.length],"string",f),t.makeTensorInfo(p.shape,"int32",g)]}var Ip={kernelName:u.StringNGrams,backendName:"webgpu",kernelFunc:Sp},kp=V({opType:z.SUB,cpuKernelImpl:Xr,supportsComplex:!0}),wp={kernelName:u.Sub,backendName:"webgpu",kernelFunc:kp},Rp=F({opType:I.TAN}),Pp={kernelName:u.Tan,backendName:"webgpu",kernelFunc:Rp},$p=F({opType:I.TANH}),Dp={kernelName:u.Tanh,backendName:"webgpu",kernelFunc:$p};function Np(e){const{inputs:i,backend:t,attrs:s}=e,{tensor:a,indices:r,updates:n}=i,{}=s,{sliceRank:o,numUpdates:l,sliceSize:d,strides:h,outputSize:p}=u.backend_util.calculateShapes(n,r,a.shape),c=[p/d,d];if(p===0)return t.makeTensorInfo(a.shape,r.dtype);const m=[],f=$({inputs:{x:r},backend:t,attrs:{shape:[l,o]}});m.push(f);const g=$({inputs:{x:n},backend:t,attrs:{shape:[l,d]}});m.push(g);const x=$({inputs:{x:a},backend:t,attrs:{shape:c}});m.push(x);const v=Ye({inputs:{x},backend:t,attrs:{reps:Array(c.length).fill(1)}}),C=new Ce([l,d],o,f.shape.length,g.shape.length,h,c,a.dtype,!1),b=u.util.sizeFromShape([l,d]),y=[{type:"int32",data:[o]},{type:"int32",data:h},{type:"int32",data:[b]}],S=t.runWebGPUProgram(C,[g,f],x.dtype,y,v);m.push(S);const P=$({inputs:{x:S},backend:t,attrs:{shape:a.shape}});return m.forEach(N=>t.disposeData(N.dataId)),P}var zp={kernelName:u.TensorScatterUpdate,backendName:"webgpu",kernelFunc:Np},Ap=class{constructor(e){this.variableNames=["x","indices"],this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms=`inputSize : i32, firstPass : i32, negativeInf : f32,
        dir : i32, inc : i32,`,this.shaderKey="swap"}getUserCode(){return`
        ${k("index")} {
          if (index < uniforms.size) {
            let outC = getCoordsFromIndex(index);
            let batch = outC[0];
            let elemIdx = outC[1];
            // We compare elements pair-wise within a group of size 2 * inc.
            // The comparing rule for each group alternates between ascending
            // and descending. Within each group, we compare each pair at
            // positions i and i+inc. To decide whether an element at position i
            // is x0 or x1, we mod it by 2 * inc, if the result is smaller than
            // inc, it is in the first half of the group, we denote it as x0,
            // otherwise we denote it as x1.
            // For example, as shown in the Bitonic top K paper referenced
            // above, Figure5(a) shows that element[1] is in the second half of
            // the group when group size is 2, but it is in the first half of
            // the group when group size is 4.
            let isFirstInPair = elemIdx % (2 * uniforms.inc) < uniforms.inc;
            var i = 0;
            if (isFirstInPair) {
              i = elemIdx;
            } else {
              i = elemIdx - uniforms.inc;
            }

            var i0 = 0;
            if (uniforms.firstPass == 1) {
              i0 = i;
            } else {
              i0 = i32(getIndices(batch, i));
            }

            var i1 = 0;
            if (uniforms.firstPass == 1) {
              i1 = i + uniforms.inc;
            } else {
              i1 = i32(getIndices(batch, i + uniforms.inc));
            }

            var x0 = f32(0.0);
            var x1 = f32(0.0);
            if (i0 < uniforms.inputSize) {
              x0 = getX(batch, i0);
            } else {
              x0 = uniforms.negativeInf;
            }
            if (i1 < uniforms.inputSize) {
              x1 = getX(batch, i1);
            } else {
              x1 = uniforms.negativeInf;
            }

            let reverse = elemIdx % (2 * uniforms.dir) >= uniforms.dir;
            let isGreater = x0 > x1 || (x0 == x1 && i1 > i0);
            if (reverse == isGreater) {
              // Elements in opposite order of direction
              let iTemp = i0;
              i0 = i1;
              i1 = iTemp;
            }
            if (isFirstInPair) {
              setOutputAtIndex(index, f32(i0));
            } else {
              setOutputAtIndex(index, f32(i1));
            }
          }
        }
      `}},Fp=class{constructor(e){this.variableNames=["x","indices"],this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms="inputSize : i32, firstPass : i32, k : i32,",this.shaderKey="merge"}getUserCode(){return`
        ${k("index")} {
          if (index < uniforms.size) {
            let outC = getCoordsFromIndex(index);
            let batch = outC[0];
            let elemIdx = outC[1];
            // The output size is half of the previous size.
            // If the previous sequence is | | | | _ _ _ _  | | | |  _ _ _ _
            // (k=4), we only need to output the indices at positions |, the
            // indices at positions _ can be thrown away, see Figure5(b) After
            // Phase 2 (Merge phase) in the Bitonic Top K paper referenced
            // above.
            // For example, the paper shows we only need to output the orange
            // bars. The output sequence should look like this | | | | | | | |.
            // Because the sequence is halved, to map the output index back to
            // the previous sequence to find the corresponding value, we need
            // to double the index. When we double the index, we basically
            // interpolate a position, so 2i looks like
            // | _ | _ | _ | _ | _ | _ | _. We move the | to the first k
            // position of each 2k positions by - elemIdx % k. E.g. for output
            // at index 4,5,6,7, we want to get the corresponding element at
            // original index 8,9,10,11, for output at index 8,9,10,11,
            // we want to get the corresponding element at original index
            // 16,17,18,19, so on and so forth.

            var i = 0;
            if (elemIdx < uniforms.k) {
              i = elemIdx;
            } else {
              i = elemIdx * 2 - elemIdx % uniforms.k;
            }
            var i0 = 0;
            if (uniforms.firstPass == 1) {
              i0 = i;
            } else {
              i0 = i32(getIndices(batch, i));
            }
            var i1 = 0;
            if (uniforms.firstPass == 1) {
              i1 = i + uniforms.k;
            } else {
              i1 = i32(getIndices(batch, i + uniforms.k));
            }

            let x0 = getX(batch, i0);
            var x1 = f32(0.0);
            if (i1 < uniforms.inputSize) {
              x1 = getX(batch, i1);
            } else {
              x1 = x0;
            }

            if (x0 >= x1) {
              setOutputAtIndex(index, f32(i0));
            } else {
              setOutputAtIndex(index, f32(i1));
            }
          }
        }
      `}};function pe(e,i){i!==null&&e.disposeData(i.dataId)}function ci(e){let i=1;for(;i<e;)i*=2;return i}function Ep(e){const{inputs:i,backend:t,attrs:s}=e,{x:a}=i,{k:r,sorted:n}=s,o=a.shape,l=o[o.length-1];if(t.shouldExecuteOnCPU([a])){const y=t.readSync(a.dataId),[S,P]=Yr(y,o,a.dtype,r,n);return[t.makeTensorInfo(S.shape,S.dtype,S.values),t.makeTensorInfo(P.shape,P.dtype,P.values)]}if(r===0)return o[o.length-1]=0,[t.makeTensorInfo(o,a.dtype,[]),t.makeTensorInfo(o,"int32",[])];if(l===1)return[a,U({attrs:{shape:o,dtype:"int32",value:0},backend:t})];const d=u.util.sizeFromShape(o)/l,h=$({inputs:{x:a},attrs:{shape:[d,l]},backend:t}),p=ci(r),c=ci(l);let m=null;const f=()=>m===null?[h,h]:[h,m],g=(y,S,P)=>{const N=f(),D=new Ap(P),E=[{type:"int32",data:[l]},{type:"int32",data:[m===null?1:0]},{type:"float32",data:[Number.NEGATIVE_INFINITY]},{type:"int32",data:[y]},{type:"int32",data:[S]}],T=m;m=t.runWebGPUProgram(D,N,"int32",E),pe(t,T)};for(let y=1;y<p;y*=2){const S=y*2;for(let P=y;P>=1;P/=2)g(S,P,[d,c])}for(let y=c;y>p;y/=2){const S=f(),P=new Fp([d,y/2]),N=[{type:"int32",data:[l]},{type:"int32",data:[m===null?1:0]},{type:"int32",data:[p]}],D=m;m=t.runWebGPUProgram(P,S,"int32",N),pe(t,D);const E=p/2,T=E*2;for(let L=E;L>=1;L/=2)g(T,L,m.shape)}let x=m;m=de({inputs:{x:m},backend:t,attrs:{begin:0,size:[d,r]}}),pe(t,x);let v=oi({inputs:{x:h,indices:m},backend:t,attrs:{axis:1,batchDims:1}});pe(t,h);const C=o.slice(0,-1);C.push(r),x=m,m=$({inputs:{x:m},attrs:{shape:C},backend:t}),pe(t,x);const b=v;return v=$({inputs:{x:v},attrs:{shape:C},backend:t}),pe(t,b),[v,m]}var Tp={kernelName:u.TopK,backendName:"webgpu",kernelFunc:Ep},Lp=class{constructor(e){this.variableNames=["Image","Transforms"],this.uniforms="interpolationModeId : i32, fillModeId : i32, fillValue : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=R(this.outputShape),this.dispatch=w(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="transform"}getUserCode(){return`
          fn mapCoord(outCoord : f32, len : f32) -> f32{
            var inCoord = outCoord;
            if(uniforms.fillModeId == 2) {
              if (inCoord < 0.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz2 = 2.0 * len;
                  if (inCoord < sz2) {
                    inCoord = sz2 * f32(i32(f32(-inCoord / sz2))) +
                    inCoord;
                  }
                  if (inCoord < -len) {
                    inCoord = inCoord + sz2;
                  } else {
                    inCoord = -inCoord - 1.0;
                  }
                }
              } else if (inCoord > len - 1.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz2 = 2.0 * len;
                  inCoord = inCoord - sz2 * f32(i32(f32(inCoord / sz2)));
                  if (inCoord >= len) {
                    inCoord = sz2 - inCoord - 1.0;
                  }
                }
              }
              return clamp(inCoord, 0.0, len - 1.0);
            } else if (uniforms.fillModeId == 3) {
              if (inCoord < 0.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz = len - 1.0;
                  inCoord = inCoord + len * (f32(i32(f32(-inCoord / sz))) + 1.0);
                }
              } else if (inCoord > len - 1.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz = len - 1.0;
                  inCoord = inCoord - len * f32(i32(f32(inCoord / sz)));
                }
              }
              return clamp(inCoord, 0.0, len - 1.0);
            } else if (uniforms.fillModeId == 4) {
              return clamp(outCoord, 0.0, len - 1.0);
            }
            return outCoord;
          }
          fn readWithFillValue(batch : i32, coordY : i32, coordX : i32,
            channel : i32) -> f32 {
            var outputValue : f32;
            if (0 <= coordY && coordY < uniforms.imageShape[1] && 0 <= coordX && coordX < uniforms.imageShape[2]) {
                outputValue = getImage(batch, coordY, coordX, channel);
            } else {
              outputValue = uniforms.fillValue;
            }
            return outputValue;
          }

          ${k("index")} {
            if (index < uniforms.size) {
              let coords = getCoordsFromIndex(index);
              var outputValue : f32;
              let batch = coords[0];
              let x = coords[2];
              let y = coords[1];
              let channel = coords[3];
              let xf = f32(x);
              let yf = f32(y);
              let a1 = getTransforms(batch, 0);
              let a2 = getTransforms(batch, 1);
              let a3 = getTransforms(batch, 2);
              let b1 = getTransforms(batch, 3);
              let b2 = getTransforms(batch, 4);
              let b3 = getTransforms(batch, 5);
              let c1 = getTransforms(batch, 6);
              let c2 = getTransforms(batch, 7);
              let projection = c1 * xf + c2 * yf + 1.0;
              if (projection == 0.0) {
                outputValue = uniforms.fillValue;
              } else {
                let inX = (a1 * xf + a2 * yf + a3) / projection;
                let inY = (b1 * xf + b2 * yf + b3) / projection;
                let mapX = mapCoord(inX, f32(uniforms.imageShape[2]));
                let mapY = mapCoord(inY, f32(uniforms.imageShape[1]));

                if (uniforms.interpolationModeId == 1) {
                  let coordY = i32(round(mapY));
                  let coordX = i32(round(mapX));
                  outputValue = readWithFillValue(batch, coordY, coordX,
                    channel);
                } else {
                  let yFloor = floor(mapY);
                  let xFloor = floor(mapX);
                  let yCeil = yFloor + 1.0;
                  let xCeil = xFloor + 1.0;
                  let valueYFloor = (xCeil - mapX) *
                  readWithFillValue(batch, i32(yFloor), i32(xFloor), channel) +
                  (mapX - xFloor) *
                  readWithFillValue(batch, i32(yFloor), i32(xCeil), channel);
                  let valueYCeil = (xCeil - mapX) *
                  readWithFillValue(batch, i32(yCeil), i32(xFloor), channel) +
                  (mapX - xFloor) *
                  readWithFillValue(batch, i32(yCeil), i32(xCeil), channel);
                  outputValue = (yCeil - mapY) * valueYFloor +
                  (mapY - yFloor) * valueYCeil;
                }
              }
              setOutputAtIndex(index, outputValue);
            }
          }
        `}};function Bp(e){const{inputs:i,backend:t,attrs:s}=e,{image:a,transforms:r}=i,{interpolation:n,fillMode:o,fillValue:l,outputShape:d}=s,[h,p,c,m]=a.shape,[f,g]=d??[p,c],x=new Lp([h,f,g,m]),v=n==="nearest"?1:2;let C;switch(o){case"constant":C=1;break;case"reflect":C=2;break;case"wrap":C=3;break;case"nearest":C=4;break;default:C=1}const b=[{type:"int32",data:[v]},{type:"int32",data:[C]},{type:"float32",data:[l]}];return t.runWebGPUProgram(x,[a,r],"float32",b)}var Wp={kernelName:u.Transform,backendName:"webgpu",kernelFunc:Bp};function Vp(e){const{inputs:i,backend:t,attrs:s}=e,{value:a}=i;let{axis:r}=s;r<0&&(r+=a.shape.length);const n=a,o=n.shape.length,l=a.shape[r],d=new Array(o-1);let h=0;for(let g=0;g<o;g++)g!==r&&(d[h++]=n.shape[g]);const p=[],c=new Array(o).fill(0),m=n.shape.slice();m[r]=1;const f=new Array(l);for(let g=0;g<f.length;g++){c[r]=g;const x=de({inputs:{x:n},backend:t,attrs:{begin:c,size:m}}),v=$({inputs:{x},backend:t,attrs:{shape:d}});f[g]=v,p.push(x)}return p.forEach(g=>t.disposeData(g.dataId)),f}var Mp={kernelName:u.Unpack,backendName:"webgpu",kernelFunc:Vp},Op=class{constructor(e,i,t){if(this.outputShape=[],this.variableNames=["x","segmentIds"],this.uniforms="numSegments : i32, xSize: i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=i,this.dispatchLayout=R(e),this.dispatch=w(this.dispatchLayout,e,this.workgroupSize),t!=="float32"&&t!=="int32")throw new Error(`UnsortedSegmentSum only supports float32 and int32
              types, does not support ${t} type.`);this.type=t,this.shaderKey="unsortedSegmentSum"}getUserCode(){return`
    ${k("index")} {
      if (index < uniforms.xSize) {
        let coords = getXCoordsFromIndex(index);
        let b = coords[0];
        let inCol = coords[1];

        let segmentId = i32(getSegmentIds(inCol));
        if (segmentId >= 0) {
          let flatIndex = b * uniforms.numSegments + segmentId % uniforms.numSegments;
          let value = getX(b, inCol);

          ${ee("&result[flatIndex]","value",this.type)}
        }
      }
    }
  `}};function Up(e){const{inputs:i,backend:t,attrs:s}=e,{x:a,segmentIds:r}=i,{numSegments:n}=s,o=a.shape.length,l=[];let d=0;const h=u.backend_util.getAxesPermutation([d],o);let p=a;h!=null&&(p=J({inputs:{x:a},backend:t,attrs:{perm:h}}),l.push(p),d=u.backend_util.getInnerMostAxes(1,o)[0]);const c=u.backend_util.segment_util.computeOutShape(p.shape,d,n),m=u.util.sizeFromShape([p.shape[d]]),f=$({inputs:{x:p},backend:t,attrs:{shape:[-1,m]}});l.push(f);const g=a.dtype,x=[f.shape[0],n],v=U({backend:t,attrs:{shape:x,value:0,dtype:g}}),C=new Op(f.shape,x,g),b=[{type:"int32",data:[n]},{type:"int32",data:[u.util.sizeFromShape(f.shape)]}],y=t.runWebGPUProgram(C,[f,r],g,b,v),S=$({inputs:{x:y},backend:t,attrs:{shape:c}});l.push(y);let P=S;if(h!=null){l.push(S);const N=u.backend_util.getUndoAxesPermutation(h);P=J({inputs:{x:P},backend:t,attrs:{perm:N}})}return l.forEach(N=>t.disposeData(N.dataId)),P}var Gp={kernelName:u.UnsortedSegmentSum,backendName:"webgpu",kernelFunc:Up},Hp=[ks,Jr,_r,tn,sn,on,mn,gn,vn,bn,Sn,kn,Rn,$n,Nn,Tn,Bn,On,Gn,qn,Zn,eo,ao,oo,lo,mo,Rs,xo,yo,Do,To,Vo,Uo,Ho,Xo,Yo,Zo,_o,tu,au,ru,uu,fu,xu,hu,bu,Iu,Pu,Du,Au,Lu,Wu,Mu,Uu,Hu,Xu,Ku,Qu,Ju,ys,_u,rl,tl,al,ul,dl,pl,fl,vl,bl,Sl,ws,kl,Co,Rl,$l,Nl,Al,El,Ll,Vl,Gl,Ol,ql,Kl,Ql,_l,id,An,sd,nd,md,ud,pd,gd,Fn,vd,bd,Sd,kd,Dd,Fu,zd,Fd,Td,so,Wd,Md,Ud,qd,Kd,Qd,Jd,_d,ro,th,ah,rh,oh,Ss,dh,ch,gh,Ch,Sh,kh,Rh,$h,Nh,Fh,Lh,Wh,Mh,Uh,Hh,Xh,Yn,vp,yp,Ip,Pd,Yh,Jh,ip,sp,lp,hp,cp,mp,gp,wp,Eu,Pp,Dp,zp,op,Tp,Wp,dn,Mp,Gp,Vd];for(const e of Hp)(0,u.registerKernel)(e);var qp=globalThis;qp.tmBackendWebGPU=Object.freeze({registered:typeof Wi=="object"})})(tf);
