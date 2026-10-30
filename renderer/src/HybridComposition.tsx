import {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree, useLoader} from '@react-three/fiber';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DoubleSide,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  TextureLoader,
} from 'three';
import {
  evaluateCinematic,
  type CinematicProps,
  type Model3D,
} from '../../packages/animation-runtime/src/cinematic';
function makeCamera(state: ReturnType<typeof evaluateCinematic>['camera']) {
  const camera =
    state.projection === 'perspective'
      ? new PerspectiveCamera()
      : new OrthographicCamera();
  camera.position.set(...state.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...state.target);
  camera.near = state.near;
  camera.far = state.far;
  if (camera instanceof PerspectiveCamera) {
    camera.aspect = 1280 / 720;
    camera.fov = state.fov;
  } else {
    camera.top = state.span / 2;
    camera.bottom = -state.span / 2;
    camera.left = (-state.span * 1280) / 720 / 2;
    camera.right = -camera.left;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return Object.assign(camera, {manual: true});
}
function Procedural({
  model,
  joints,
}: {
  model: Model3D;
  joints: Map<string, Matrix4>;
}) {
  return (
    <>
      {model.joints
        .filter((j) => j.geometry)
        .map((j) => (
          <group key={j.id} matrix={joints.get(j.id)} matrixAutoUpdate={false}>
            <mesh position={j.geometryPosition}>
              {j.geometry!.type === 'box' ? (
                <boxGeometry args={j.geometry!.size} />
              ) : j.geometry!.type === 'sphere' ? (
                <sphereGeometry args={[j.geometry!.radius, 20, 12]} />
              ) : (
                <cylinderGeometry
                  args={[
                    j.geometry!.radius,
                    j.geometry!.radius,
                    j.geometry!.height,
                    24,
                  ]}
                />
              )}
              <meshStandardMaterial
                color={model.materials[j.material!].color}
                roughness={model.materials[j.material!].roughness}
              />
            </mesh>
          </group>
        ))}
    </>
  );
}
function Imported({source, matrix}: {source: string; matrix: Matrix4}) {
  const gltf = useLoader(GLTFLoader, `data:model/gltf-binary;base64,${source}`);
  const model = useMemo(() => clone(gltf.scene), [gltf.scene]);
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <primitive object={model} />
    </group>
  );
}

function Plane({
  layer,
  markup,
}: {
  layer: CinematicProps['cinematic']['layers'][number];
  markup: CinematicProps['overlays'][string];
}) {
  const camera = useThree((s) => s.camera);
  const ratio = Math.min(
    1,
    2048 / Math.max(markup.viewBox[2], markup.viewBox[3]),
  );
  const document = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markup.viewBox.join(' ')}" width="${markup.viewBox[2] * ratio}" height="${markup.viewBox[3] * ratio}">${markup.markup}</svg>`;
  const texture = useLoader(
    TextureLoader,
    `data:image/svg+xml,${encodeURIComponent(document)}`,
  );
  return (
    <mesh
      position={layer.position}
      rotation={layer.facing === 'fixed' ? layer.rotation : undefined}
      quaternion={layer.facing === 'billboard' ? camera.quaternion : undefined}
    >
      <planeGeometry args={layer.size} />
      <meshBasicMaterial map={texture} transparent side={DoubleSide} />
    </mesh>
  );
}
export function HybridComposition(props: CinematicProps & {frame: number}) {
  const state = evaluateCinematic(props, props.frame);
  const layers = [...props.cinematic.layers].sort((a, b) => a.order - b.order);
  const overlays = layers.filter((l) => l.type === 'screen-space');
  return (
    <AbsoluteFill style={{background: props.cinematic.background}}>
      {overlays
        .filter((l) => l.order < 0)
        .map((l) => (
          <svg
            key={l.id}
            width={1280}
            height={720}
            style={{position: 'absolute'}}
          >
            <svg
              x={l.position[0]}
              y={l.position[1]}
              width={l.size[0]}
              height={l.size[1]}
              viewBox={props.overlays[l.asset].viewBox.join(' ')}
              dangerouslySetInnerHTML={{__html: props.overlays[l.asset].markup}}
            />
          </svg>
        ))}
      <ThreeCanvas
        width={1280}
        height={720}
        style={{position: 'absolute'}}
        camera={makeCamera(state.camera)}
        gl={{alpha: true, antialias: true}}
      >
        <ambientLight intensity={1.7} />
        <directionalLight position={[4, 8, 5]} intensity={2} />
        {props.cinematic.objects.map((o) => {
          const evaluated = state.objects.get(o.id)!;
          return props.models[o.model] ? (
            <Procedural
              key={o.id}
              model={props.models[o.model]}
              joints={evaluated.joints}
            />
          ) : (
            <Imported
              key={o.id}
              source={props.glbs[o.model]}
              matrix={evaluated.matrix}
            />
          );
        })}
        {layers
          .filter((l) => l.type === 'world-space-2d')
          .map((l) => (
            <Plane key={l.id} layer={l} markup={props.overlays[l.asset]} />
          ))}
      </ThreeCanvas>
      {overlays
        .filter((l) => l.order >= 0)
        .map((l) => (
          <svg
            key={l.id}
            width={1280}
            height={720}
            style={{position: 'absolute'}}
          >
            <svg
              x={l.position[0]}
              y={l.position[1]}
              width={l.size[0]}
              height={l.size[1]}
              viewBox={props.overlays[l.asset].viewBox.join(' ')}
              dangerouslySetInnerHTML={{__html: props.overlays[l.asset].markup}}
            />
          </svg>
        ))}
    </AbsoluteFill>
  );
}
