import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface ParsedSTLResult {
  geometry: THREE.BufferGeometry;
  triangleCount: number;
  bounds: {
    width: number;
    depth: number;
    height: number;
  };
  boundingSphereRadius: number;
}

const loader = new STLLoader();

/**
 * Parses STL ArrayBuffer into Three.js BufferGeometry with centered origin and normalized normals.
 * Rotates STL from Z-Up (3D printer format) to Three.js standard Y-Up coordinate system.
 */
export function parseSTL(arrayBuffer: ArrayBuffer): ParsedSTLResult {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('EMPTY_FILE');
  }

  let geometry: THREE.BufferGeometry;
  try {
    geometry = loader.parse(arrayBuffer);
  } catch {
    throw new Error('STL_PARSE_FAILED');
  }

  const positionAttribute = geometry.getAttribute('position');
  if (!positionAttribute || positionAttribute.count === 0) {
    geometry.dispose();
    throw new Error('EMPTY_GEOMETRY');
  }

  // Ensure vertex normals
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }

  // Measure original dimensions in 3D printer coordinate system (X: width, Y: depth, Z: height)
  geometry.computeBoundingBox();
  const origBox = geometry.boundingBox;
  if (!origBox) {
    geometry.dispose();
    throw new Error('EMPTY_GEOMETRY');
  }
  const origSize = new THREE.Vector3();
  origBox.getSize(origSize);

  if (origSize.x === 0 && origSize.y === 0 && origSize.z === 0) {
    geometry.dispose();
    throw new Error('EMPTY_GEOMETRY');
  }

  // Align Z-Up STL to Three.js standard Y-Up by rotating -90 deg around X-axis
  geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const triangleCount = positionAttribute.count / 3;
  const radius = geometry.boundingSphere
    ? geometry.boundingSphere.radius
    : Math.max(origSize.x, origSize.y, origSize.z) / 2;

  return {
    geometry,
    triangleCount: Math.round(triangleCount),
    bounds: {
      width: Number(origSize.x.toFixed(2)),
      depth: Number(origSize.y.toFixed(2)),
      height: Number(origSize.z.toFixed(2)),
    },
    boundingSphereRadius: radius,
  };
}
