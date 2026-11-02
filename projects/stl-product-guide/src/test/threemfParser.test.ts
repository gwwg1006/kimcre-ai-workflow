import { describe, it, expect } from 'vitest';
import * as fflate from 'fflate';
import { inspect3MF } from '../lib/threemf/threemfParser';
import { parseModelFile } from '../lib/model/modelParser';

describe('3MF & STEP Parser & Multi-Object / Plate Splitter', () => {
  it('correctly inspects multi-object 3MF file', () => {
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="상판" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0" /><vertex x="10" y="0" z="0" /><vertex x="10" y="10" z="0" /></vertices>
        <triangles><triangle v1="0" v2="1" v3="2" /></triangles>
      </mesh>
    </object>
    <object id="2" name="하판" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0" /><vertex x="5" y="0" z="0" /><vertex x="5" y="5" z="0" /></vertices>
        <triangles><triangle v1="0" v2="1" v3="2" /></triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
    <item objectid="2" />
  </build>
</model>`;

    const zipped = fflate.zipSync({
      '3D/3dmodel.model': fflate.strToU8(modelXml),
    });

    const inspection = inspect3MF(zipped.buffer as ArrayBuffer);
    expect(inspection.hasMultipleParts).toBe(true);
    expect(inspection.objectCount).toBe(2);
    expect(inspection.objectNames).toEqual(['상판', '하판']);
  });

  it('splits into individual objects when split-objects is chosen', async () => {
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="몸체" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0" /><vertex x="10" y="0" z="0" /><vertex x="10" y="10" z="0" /></vertices>
        <triangles><triangle v1="0" v2="1" v3="2" /></triangles>
      </mesh>
    </object>
    <object id="2" name="바퀴" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0" /><vertex x="5" y="0" z="0" /><vertex x="5" y="5" z="0" /></vertices>
        <triangles><triangle v1="0" v2="1" v3="2" /></triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
    <item objectid="2" />
  </build>
</model>`;

    const zipped = fflate.zipSync({
      '3D/3dmodel.model': fflate.strToU8(modelXml),
    });

    const parts = await parseModelFile(zipped.buffer as ArrayBuffer, 'RC카.3mf', 'split-objects');
    expect(parts.length).toBe(2);
    expect(parts[0].displayName).toBe('RC카 - 몸체');
    expect(parts[1].displayName).toBe('RC카 - 바퀴');
  });

  it('merges into 1 single assembly when merge-all is chosen', async () => {
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="몸체" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0" /><vertex x="10" y="0" z="0" /><vertex x="10" y="10" z="0" /></vertices>
        <triangles><triangle v1="0" v2="1" v3="2" /></triangles>
      </mesh>
    </object>
    <object id="2" name="바퀴" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0" /><vertex x="5" y="0" z="0" /><vertex x="5" y="5" z="0" /></vertices>
        <triangles><triangle v1="0" v2="1" v3="2" /></triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
    <item objectid="2" />
  </build>
</model>`;

    const zipped = fflate.zipSync({
      '3D/3dmodel.model': fflate.strToU8(modelXml),
    });

    const parts = await parseModelFile(zipped.buffer as ArrayBuffer, 'RC카.3mf', 'merge-all');
    expect(parts.length).toBe(1);
    expect(parts[0].displayName).toBe('RC카');
    expect(parts[0].triangleCount).toBe(2);
  });
});
