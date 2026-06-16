import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DotOrbit, MeshGradient } from '@paper-design/shaders-react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

const vertexShader = `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vPosition = position;

    vec3 pos = position;
    pos.y += sin(pos.x * 10.0 + time) * 0.1 * intensity;
    pos.x += cos(pos.y * 8.0 + time * 1.5) * 0.05 * intensity;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform float time;
  uniform float intensity;
  uniform vec3 color1;
  uniform vec3 color2;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vec2 uv = vUv;

    float noise = sin(uv.x * 20.0 + time) * cos(uv.y * 15.0 + time * 0.8);
    noise += sin(uv.x * 35.0 - time * 2.0) * cos(uv.y * 25.0 + time * 1.2) * 0.5;

    vec3 color = mix(color1, color2, noise * 0.5 + 0.5);
    color = mix(color, vec3(1.0), pow(abs(noise), 2.0) * intensity);

    float glow = 1.0 - length(uv - 0.5) * 2.0;
    glow = pow(glow, 2.0);

    gl_FragColor = vec4(color * glow, glow * 0.8);
  }
`;

export function ShaderPlane({
  color1 = '#ff5722',
  color2 = '#ffffff',
  position,
}: {
  color1?: string;
  color2?: string;
  position: [number, number, number];
}) {
  const mesh = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      color1: { value: new THREE.Color(color1) },
      color2: { value: new THREE.Color(color2) },
      intensity: { value: 1 },
      time: { value: 0 },
    }),
    [color1, color2]
  );

  useFrame(state => {
    if (!mesh.current) return;
    uniforms.time.value = state.clock.elapsedTime;
    uniforms.intensity.value = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
  });

  return (
    <mesh ref={mesh} position={position}>
      <planeGeometry args={[2, 2, 32, 32]} />
      <shaderMaterial
        fragmentShader={fragmentShader}
        side={THREE.DoubleSide}
        transparent
        uniforms={uniforms}
        vertexShader={vertexShader}
      />
    </mesh>
  );
}

export function EnergyRing({
  position = [0, 0, 0],
  radius = 1,
}: {
  position?: [number, number, number];
  radius?: number;
}) {
  const mesh = useRef<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>(null);

  useFrame(state => {
    if (!mesh.current) return;
    mesh.current.rotation.z = state.clock.elapsedTime;
    mesh.current.material.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
  });

  return (
    <mesh ref={mesh} position={position}>
      <ringGeometry args={[radius * 0.8, radius, 32]} />
      <meshBasicMaterial color="#ff5722" opacity={0.6} side={THREE.DoubleSide} transparent />
    </mesh>
  );
}

export function PaperShaderLoginBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('absolute inset-0 overflow-hidden bg-black', className)}>
      <MeshGradient
        className="absolute inset-0 h-full w-full [&_canvas]:!z-0"
        colors={['#000000', '#161616', '#333333', '#ffffff']}
        distortion={0.74}
        grainMixer={0.28}
        grainOverlay={0.22}
        maxPixelCount={900 * 700}
        speed={0.1}
        swirl={0.52}
      />
      <div className="absolute inset-0 opacity-30 mix-blend-screen">
        <DotOrbit
          className="h-full w-full [&_canvas]:!z-0"
          colorBack="#00000000"
          colors={['#1c1c1c', '#3a3a3a', '#ffffff']}
          maxPixelCount={700 * 500}
          size={0.32}
          sizeRange={0.5}
          speed={0.12}
          spreading={0.58}
          stepsPerColor={3}
        />
      </div>
      <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_28%_32%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(115deg,rgba(0,0,0,0.18),rgba(0,0,0,0.86)_72%)]" />
      <div className="absolute inset-0 z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40" />
    </div>
  );
}
