// Validate the complete self-contained container before giving bytes to Three.js.
export function validateGlb(bytes: Uint8Array) {
  if (bytes.byteLength < 20 || bytes.byteLength > 20 * 1024 * 1024)
    throw new Error('GLB size budget exceeded');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  )
    throw new Error('Invalid GLB header');
  let offset = 12;
  const chunks: {type: number; data: Uint8Array}[] = [];
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('Truncated GLB');
    const size = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true);
    if (size % 4 || offset + 8 + size > bytes.length)
      throw new Error('Invalid GLB chunk');
    chunks.push({type, data: bytes.subarray(offset + 8, offset + 8 + size)});
    offset += 8 + size;
  }
  if (
    chunks[0]?.type !== 0x4e4f534a ||
    chunks.length > 2 ||
    (chunks[1] && chunks[1].type !== 0x004e4942)
  )
    throw new Error('Unsupported GLB chunks');
  const data = JSON.parse(
    new TextDecoder('utf-8', {fatal: true}).decode(chunks[0].data),
  );
  if (data.asset?.version !== '2.0') throw new Error('Only glTF 2.0 supported');
  function scan(value: unknown): void {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('Non-finite GLB value');
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (
        key === 'uri' ||
        (key === 'extensions' && Object.keys(v as object).length)
      )
        throw new Error(
          'External resources and glTF extensions are unsupported',
        );
      scan(v);
    }
  }
  scan(data);
  if (data.extensionsUsed?.length || data.extensionsRequired?.length)
    throw new Error('Unsupported glTF extensions');
  if (
    (data.nodes?.length ?? 0) > 256 ||
    (data.meshes?.length ?? 0) > 128 ||
    (data.textures?.length ?? 0) > 8 ||
    (data.skins ?? []).some((s: any) => s.joints.length > 128)
  )
    throw new Error('GLB resource budget exceeded');
  const buffers = data.buffers ?? [];
  if (
    buffers.length > 1 ||
    (buffers[0] &&
      (!Number.isSafeInteger(buffers[0].byteLength) ||
        buffers[0].byteLength < 0 ||
        buffers[0].byteLength > (chunks[1]?.data.length ?? 0)))
  )
    throw new Error('Invalid GLB buffer');
  const index = (list: any[], n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) < list.length;
  const views = data.bufferViews ?? [],
    accessors = data.accessors ?? [],
    nodes = data.nodes ?? [],
    meshes = data.meshes ?? [];
  for (const v of views)
    if (
      v.buffer !== 0 ||
      !Number.isSafeInteger(v.byteLength) ||
      v.byteLength < 0 ||
      !Number.isSafeInteger(v.byteOffset ?? 0) ||
      (v.byteOffset ?? 0) < 0 ||
      (v.byteOffset ?? 0) + v.byteLength > (buffers[0]?.byteLength ?? 0)
    )
      throw new Error('Invalid GLB buffer view');
  let vertices = 0;
  const components: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16,
  };
  const sizes: Record<number, number> = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
  };
  if (accessors.length > 1024) throw new Error('GLB accessor budget exceeded');
  for (const a of accessors) {
    const v = views[a.bufferView],
      width = components[a.type] * sizes[a.componentType];
    if (
      a.sparse ||
      !index(views, a.bufferView) ||
      !width ||
      !Number.isSafeInteger(a.count) ||
      a.count < 0 ||
      !Number.isSafeInteger(a.byteOffset ?? 0) ||
      (a.byteOffset ?? 0) < 0 ||
      (a.byteOffset ?? 0) +
        Math.max(0, a.count - 1) * (v.byteStride ?? width) +
        (a.count ? width : 0) >
        v.byteLength
    )
      throw new Error('Invalid GLB accessor');
    if (
      v.byteStride !== undefined &&
      (!Number.isInteger(v.byteStride) ||
        v.byteStride < width ||
        v.byteStride > 252 ||
        v.byteStride % 4)
    )
      throw new Error('Invalid GLB stride');
    vertices += a.count;
    if (vertices > 1000000) throw new Error('GLB vertex budget exceeded');
    if (a.componentType === 5126) {
      const bin = chunks[1]!.data;
      const floats = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
      for (let i = 0; i < a.count; i++)
        for (let c = 0; c < components[a.type]; c++)
          if (
            !Number.isFinite(
              floats.getFloat32(
                (v.byteOffset ?? 0) +
                  (a.byteOffset ?? 0) +
                  i * (v.byteStride ?? width) +
                  c * 4,
                true,
              ),
            )
          )
            throw new Error('Non-finite GLB geometry');
    }
  }
  if (vertices > 1000000) throw new Error('GLB vertex budget exceeded');
  if (accessors.length > 1024) throw new Error('GLB accessor budget exceeded');
  for (const scene of data.scenes ?? [])
    for (const n of scene.nodes ?? [])
      if (!index(nodes, n)) throw new Error('Invalid GLB scene reference');
  if (data.scene !== undefined && !index(data.scenes ?? [], data.scene))
    throw new Error('Invalid GLB default scene');
  for (const skin of data.skins ?? []) {
    if (
      !Array.isArray(skin.joints) ||
      skin.joints.some((j: unknown) => !index(nodes, j)) ||
      (skin.inverseBindMatrices !== undefined &&
        !index(accessors, skin.inverseBindMatrices))
    )
      throw new Error('Invalid GLB skeleton');
  }
  for (const mesh of meshes)
    for (const p of mesh.primitives ?? []) {
      if (p.mode !== undefined && p.mode !== 4)
        throw new Error('Only triangle meshes supported');
      if (
        !Object.hasOwn(p.attributes ?? {}, 'POSITION') ||
        Object.values(p.attributes).some((i) => !index(accessors, i)) ||
        (p.indices !== undefined && !index(accessors, p.indices)) ||
        (p.material !== undefined && !index(data.materials ?? [], p.material))
      )
        throw new Error('Invalid GLB primitive references');
    }
  const parents = new Set<number>();
  for (const node of nodes)
    for (const child of node.children ?? []) {
      if (parents.has(child))
        throw new Error('GLB nodes require unique parents');
      parents.add(child);
    }
  const checked = new Set<number>();
  const visit = (n: number, path: Set<number>) => {
    if (!index(nodes, n) || path.has(n))
      throw new Error('Invalid GLB node hierarchy');
    if (checked.has(n)) return;
    const node = nodes[n];
    if (node.skin !== undefined && !index(data.skins ?? [], node.skin))
      throw new Error('Invalid GLB skin reference');
    if (node.mesh !== undefined && !index(meshes, node.mesh))
      throw new Error('Invalid GLB mesh reference');
    for (const key of ['matrix', 'translation', 'rotation', 'scale'])
      if (
        node[key] &&
        (!Array.isArray(node[key]) ||
          node[key].length !==
            (
              {matrix: 16, translation: 3, rotation: 4, scale: 3} as Record<
                string,
                number
              >
            )[key] ||
          !node[key].every(Number.isFinite))
      )
        throw new Error('Invalid GLB transform');
    for (const child of node.children ?? [])
      visit(child, new Set([...path, n]));
    checked.add(n);
  };
  nodes.forEach((_: unknown, i: number) => visit(i, new Set()));
  for (const image of data.images ?? []) {
    if (
      !index(views, image.bufferView) ||
      !['image/png', 'image/jpeg'].includes(image.mimeType)
    )
      throw new Error('Unsupported GLB image');
    // Embedded textures need decoded pixel budgets; initial importer deliberately rejects them.
    throw new Error(
      'Textured GLBs are not supported; supply an untextured local model',
    );
  }
  if (data.animations?.length)
    throw new Error(
      'Embedded GLB animations unsupported; use deterministic scene tracks',
    );
  return data;
}
