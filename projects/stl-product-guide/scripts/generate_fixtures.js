import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures/stl');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// 1. ASCII Cube STL (10x10x10 cube)
const asciiCube = `solid cube
  facet normal 0 0 1
    outer loop
      vertex 0 0 10
      vertex 10 0 10
      vertex 10 10 10
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 10
      vertex 10 10 10
      vertex 0 10 10
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 10 10 0
      vertex 10 0 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 10 0
      vertex 10 10 0
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 0 10 0
      vertex 0 10 10
      vertex 10 10 10
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 0 10 0
      vertex 10 10 10
      vertex 10 10 0
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex 10 0 0
      vertex 10 0 10
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex 10 0 10
      vertex 0 0 10
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex 10 0 0
      vertex 10 10 0
      vertex 10 10 10
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex 10 0 0
      vertex 10 10 10
      vertex 10 0 10
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 0 0
      vertex 0 0 10
      vertex 0 10 10
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 0 0
      vertex 0 10 10
      vertex 0 10 0
    endloop
  endfacet
endsolid cube
`;

fs.writeFileSync(path.join(fixturesDir, 'ascii_cube.stl'), asciiCube);

// 2. Binary Cube STL (80 bytes header + 4 bytes triangle count + 50 bytes per triangle)
function createBinarySTL(triangles) {
  const header = Buffer.alloc(80, 0);
  header.write('Binary STL generated for testing', 0, 'utf8');

  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(triangles.length, 0);

  const triangleBuffers = triangles.map(t => {
    const buf = Buffer.alloc(50);
    // normal
    buf.writeFloatLE(t.normal[0], 0);
    buf.writeFloatLE(t.normal[1], 4);
    buf.writeFloatLE(t.normal[2], 8);
    // v1
    buf.writeFloatLE(t.v1[0], 12);
    buf.writeFloatLE(t.v1[1], 16);
    buf.writeFloatLE(t.v1[2], 20);
    // v2
    buf.writeFloatLE(t.v2[0], 24);
    buf.writeFloatLE(t.v2[1], 28);
    buf.writeFloatLE(t.v2[2], 32);
    // v3
    buf.writeFloatLE(t.v3[0], 36);
    buf.writeFloatLE(t.v3[1], 40);
    buf.writeFloatLE(t.v3[2], 44);
    // attribute byte count
    buf.writeUInt16LE(0, 48);
    return buf;
  });

  return Buffer.concat([header, countBuf, ...triangleBuffers]);
}

const cubeTriangles = [
  // Top
  { normal: [0, 0, 1], v1: [0, 0, 10], v2: [10, 0, 10], v3: [10, 10, 10] },
  { normal: [0, 0, 1], v1: [0, 0, 10], v2: [10, 10, 10], v3: [0, 10, 10] },
  // Bottom
  { normal: [0, 0, -1], v1: [0, 0, 0], v2: [10, 10, 0], v3: [10, 0, 0] },
  { normal: [0, 0, -1], v1: [0, 0, 0], v2: [0, 10, 0], v3: [10, 10, 0] },
  // Front (Y+)
  { normal: [0, 1, 0], v1: [0, 10, 0], v2: [0, 10, 10], v3: [10, 10, 10] },
  { normal: [0, 1, 0], v1: [0, 10, 0], v2: [10, 10, 10], v3: [10, 10, 0] },
  // Back (Y-)
  { normal: [0, -1, 0], v1: [0, 0, 0], v2: [10, 0, 0], v3: [10, 0, 10] },
  { normal: [0, -1, 0], v1: [0, 0, 0], v2: [10, 0, 10], v3: [0, 0, 10] },
  // Right (X+)
  { normal: [1, 0, 0], v1: [10, 0, 0], v2: [10, 10, 0], v3: [10, 10, 10] },
  { normal: [1, 0, 0], v1: [10, 0, 0], v2: [10, 10, 10], v3: [10, 0, 10] },
  // Left (X-)
  { normal: [-1, 0, 0], v1: [0, 0, 0], v2: [0, 0, 10], v3: [0, 10, 10] },
  { normal: [-1, 0, 0], v1: [0, 0, 0], v2: [0, 10, 10], v3: [0, 10, 0] },
];

fs.writeFileSync(path.join(fixturesDir, 'binary_cube.stl'), createBinarySTL(cubeTriangles));

// 3. Tall Model (Z = 50, X=5, Y=5)
const tallTriangles = [
  { normal: [0, 0, 1], v1: [0, 0, 50], v2: [5, 0, 50], v3: [5, 5, 50] },
  { normal: [0, 0, 1], v1: [0, 0, 50], v2: [5, 5, 50], v3: [0, 5, 50] },
  { normal: [0, 0, -1], v1: [0, 0, 0], v2: [5, 5, 0], v3: [5, 0, 0] },
  { normal: [0, 0, -1], v1: [0, 0, 0], v2: [0, 5, 0], v3: [5, 5, 0] },
  { normal: [0, 1, 0], v1: [0, 5, 0], v2: [0, 5, 50], v3: [5, 5, 50] },
  { normal: [0, 1, 0], v1: [0, 5, 0], v2: [5, 5, 50], v3: [5, 5, 0] },
  { normal: [0, -1, 0], v1: [0, 0, 0], v2: [5, 0, 0], v3: [5, 0, 50] },
  { normal: [0, -1, 0], v1: [0, 0, 0], v2: [5, 0, 50], v3: [0, 0, 50] },
  { normal: [1, 0, 0], v1: [5, 0, 0], v2: [5, 5, 0], v3: [5, 5, 50] },
  { normal: [1, 0, 0], v1: [5, 0, 0], v2: [5, 5, 50], v3: [5, 0, 50] },
  { normal: [-1, 0, 0], v1: [0, 0, 0], v2: [0, 0, 50], v3: [0, 5, 50] },
  { normal: [-1, 0, 0], v1: [0, 0, 0], v2: [0, 5, 50], v3: [0, 5, 0] },
];
fs.writeFileSync(path.join(fixturesDir, 'tall_model.stl'), createBinarySTL(tallTriangles));

// 4. Wide Model (X = 60, Y = 10, Z = 5)
const wideTriangles = [
  { normal: [0, 0, 1], v1: [0, 0, 5], v2: [60, 0, 5], v3: [60, 10, 5] },
  { normal: [0, 0, 1], v1: [0, 0, 5], v2: [60, 10, 5], v3: [0, 10, 5] },
  { normal: [0, 0, -1], v1: [0, 0, 0], v2: [60, 10, 0], v3: [60, 0, 0] },
  { normal: [0, 0, -1], v1: [0, 0, 0], v2: [0, 10, 0], v3: [60, 10, 0] },
  { normal: [0, 1, 0], v1: [0, 10, 0], v2: [0, 10, 5], v3: [60, 10, 5] },
  { normal: [0, 1, 0], v1: [0, 10, 0], v2: [60, 10, 5], v3: [60, 10, 0] },
  { normal: [0, -1, 0], v1: [0, 0, 0], v2: [60, 0, 0], v3: [60, 0, 5] },
  { normal: [0, -1, 0], v1: [0, 0, 0], v2: [60, 0, 5], v3: [0, 0, 5] },
  { normal: [1, 0, 0], v1: [60, 0, 0], v2: [60, 10, 0], v3: [60, 10, 5] },
  { normal: [1, 0, 0], v1: [60, 0, 0], v2: [60, 10, 5], v3: [60, 0, 5] },
  { normal: [-1, 0, 0], v1: [0, 0, 0], v2: [0, 0, 5], v3: [0, 10, 5] },
  { normal: [-1, 0, 0], v1: [0, 0, 0], v2: [0, 10, 5], v3: [0, 10, 0] },
];
fs.writeFileSync(path.join(fixturesDir, 'wide_model.stl'), createBinarySTL(wideTriangles));

// 5. Empty File (0 byte)
fs.writeFileSync(path.join(fixturesDir, 'empty_file.stl'), Buffer.alloc(0));

// 6. Invalid Content
fs.writeFileSync(path.join(fixturesDir, 'invalid_content.stl'), 'This is not an STL file at all.');

// 7. No facets
fs.writeFileSync(path.join(fixturesDir, 'no_facets.stl'), 'solid empty\nendsolid empty\n');

console.log('Test fixtures created successfully in fixtures/stl/');
