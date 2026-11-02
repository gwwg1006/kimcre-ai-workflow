import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseSTL } from '../lib/stl/stlParser';

const fixturesDir = path.resolve(__dirname, '../../fixtures/stl');

function loadFixture(filename: string): ArrayBuffer {
  const buffer = fs.readFileSync(path.join(fixturesDir, filename));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe('STL Parser Tests with Fixtures', () => {
  it('parses ASCII cube STL successfully', () => {
    const buffer = loadFixture('ascii_cube.stl');
    const result = parseSTL(buffer);

    expect(result.triangleCount).toBe(12);
    expect(result.bounds.width).toBeCloseTo(10, 0);
    expect(result.bounds.depth).toBeCloseTo(10, 0);
    expect(result.bounds.height).toBeCloseTo(10, 0);
    expect(result.boundingSphereRadius).toBeGreaterThan(0);
  });

  it('parses Binary cube STL successfully', () => {
    const buffer = loadFixture('binary_cube.stl');
    const result = parseSTL(buffer);

    expect(result.triangleCount).toBe(12);
    expect(result.bounds.width).toBeCloseTo(10, 0);
    expect(result.bounds.depth).toBeCloseTo(10, 0);
    expect(result.bounds.height).toBeCloseTo(10, 0);
  });

  it('parses tall and wide models correctly and centers them', () => {
    const tallBuffer = loadFixture('tall_model.stl');
    const tallResult = parseSTL(tallBuffer);
    expect(tallResult.bounds.height).toBeCloseTo(50, 0);

    const wideBuffer = loadFixture('wide_model.stl');
    const wideResult = parseSTL(wideBuffer);
    expect(wideResult.bounds.width).toBeCloseTo(60, 0);
  });

  it('throws EMPTY_FILE for 0-byte file', () => {
    const emptyBuffer = loadFixture('empty_file.stl');
    expect(() => parseSTL(emptyBuffer)).toThrow('EMPTY_FILE');
  });

  it('throws error for invalid content or empty geometry', () => {
    const invalidBuffer = loadFixture('invalid_content.stl');
    expect(() => parseSTL(invalidBuffer)).toThrow();

    const noFacetsBuffer = loadFixture('no_facets.stl');
    expect(() => parseSTL(noFacetsBuffer)).toThrow();
  });
});
