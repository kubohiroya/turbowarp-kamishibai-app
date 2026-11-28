interface SectionVisualBlock {
  type: string;
  width?: number;
  getFieldValue(name: string): unknown;
  getInputTargetBlock(name: string): SectionVisualBlock | null;
  getNextBlock(): SectionVisualBlock | null;
  getSvgRoot(): SVGElement | null;
  getRelativeToSurfaceXY(): {x: number; y: number};
  getHeightWidth(): {width: number; height: number};
  inputList: {connection?: {targetBlock(): SectionVisualBlock | null}}[];
}
interface SectionVisualWorkspace {
  id: string;
  RTL?: boolean;
  getAllBlocks(ordered: boolean): SectionVisualBlock[];
  addChangeListener(listener: (event?: {type?: string; isUiEvent?: boolean}) => void): void;
  removeChangeListener(listener: (event?: {type?: string; isUiEvent?: boolean}) => void): void;
  getParentSvg(): SVGElement;
}
interface SectionVisualHost {
  gui?: {
    getBlockly?: () => Promise<{getMainWorkspace(): SectionVisualWorkspace | null}>;
  };
  vm?: {
    on(event: string, listener: () => void): void;
    removeListener(event: string, listener: () => void): void;
    [key: string]: unknown;
  };
}

/** Serialized into the editor extension; keep this function self-contained. */
export async function installDsl4SectionAppearance(
  host: SectionVisualHost,
  isDisposed: () => boolean = () => false,
) {
  if (typeof document === 'undefined' || !host.gui?.getBlockly || !host.vm) return;
  const blocks = await host.gui.getBlockly();
  if (isDisposed()) return;
  const vm = host.vm;
  const key = '__kamishibaiSectionAppearanceDispose';
  const previous = vm[key];
  if (typeof previous === 'function') previous();
  const ns = 'http://www.w3.org/2000/svg';
  const mutedAttribute = 'data-kamishibai-section-muted';
  const style = document.createElement('style');
  style.textContent = `
    [${mutedAttribute}="true"] > .blocklyPath {
      fill: #b8bec5 !important; stroke: #727b85 !important;
    }
    [${mutedAttribute}="true"] > .blocklyText,
    [${mutedAttribute}="true"] > g > .blocklyText {
      fill: #26323e !important;
    }
  `;
  document.head.appendChild(style);
  let workspace: SectionVisualWorkspace | null = null;
  let definitions: SVGElement | null = null;
  let patternId = '';
  let muted = new Set<SectionVisualBlock>();
  const regions = new Map<SectionVisualBlock, SVGElement>();
  let disposed = false;
  let frame: number | undefined;

  function clear() {
    for (const block of muted) block.getSvgRoot()?.removeAttribute(mutedAttribute);
    muted = new Set();
    for (const region of regions.values()) region.remove();
    regions.clear();
    definitions?.remove();
    definitions = null;
  }
  function collect(first: SectionVisualBlock | null) {
    const found = new Set<SectionVisualBlock>();
    const pending = first ? [first] : [];
    while (pending.length && found.size < 8192) {
      const block = pending.pop()!;
      if (found.has(block)) continue;
      found.add(block);
      const next = block.getNextBlock();
      if (next) pending.push(next);
      for (const input of block.inputList) {
        const child = input.connection?.targetBlock();
        if (child) pending.push(child);
      }
    }
    return found;
  }
  function installPattern(current: SectionVisualWorkspace) {
    patternId = 'kamishibai-section-off-' + current.id.replace(/[^a-z0-9_-]/giu, '');
    definitions = document.createElementNS(ns, 'defs');
    const pattern = document.createElementNS(ns, 'pattern');
    pattern.setAttribute('id', patternId);
    pattern.setAttribute('width', '8');
    pattern.setAttribute('height', '8');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const background = document.createElementNS(ns, 'rect');
    background.setAttribute('width', '8');
    background.setAttribute('height', '8');
    background.setAttribute('fill', '#e7eaee');
    const stripes = document.createElementNS(ns, 'path');
    stripes.setAttribute('d', 'M-2 2L2-2M0 8L8 0M6 10L10 6');
    stripes.setAttribute('stroke', '#b6bec8');
    stripes.setAttribute('stroke-width', '1.5');
    pattern.append(background, stripes);
    definitions.appendChild(pattern);
    current.getParentSvg().appendChild(definitions);
  }
  function sync() {
    frame = undefined;
    if (disposed) return;
    const current = blocks.getMainWorkspace();
    if (current !== workspace) {
      workspace?.removeChangeListener(changed);
      clear();
      workspace = current;
      workspace?.addChangeListener(changed);
    }
    if (!workspace) return;
    const off = workspace.getAllBlocks(false).filter(
      (block) =>
        // Self-contained: the retired extension and the runtime both spell this block.
        /^(?:kubohiroyakamishibaiauthoring4_|kubohiroyakamishibairuntime4_|kubohiroyakamishibai4_kubohiroyakamishibairuntime4__)useSection$/u.test(
          block.type,
        ) && block.getFieldValue('ENABLED') === 'off',
    );
    const nextMuted = new Set<SectionVisualBlock>();
    const nextRegions = new Set<SectionVisualBlock>();
    for (const section of off) {
      const first = section.getInputTargetBlock('SUBSTACK');
      for (const child of collect(first)) nextMuted.add(child);
      const root = section.getSvgRoot();
      if (!first || !root) continue;
      if (!definitions) installPattern(workspace);
      nextRegions.add(section);
      let region = regions.get(section);
      if (!region) {
        region = document.createElementNS(ns, 'rect');
        region.setAttribute('data-kamishibai-off-region', 'true');
        region.setAttribute('aria-hidden', 'true');
        region.setAttribute('pointer-events', 'none');
        region.setAttribute('rx', '5');
        region.setAttribute('fill', `url(#${patternId})`);
        region.setAttribute('stroke', '#727b85');
        region.setAttribute('stroke-dasharray', '4 3');
        root.insertBefore(region, root.firstChild);
        regions.set(section, region);
      }
      const origin = section.getRelativeToSurfaceXY();
      const position = first.getRelativeToSurfaceXY();
      const size = first.getHeightWidth();
      const x = position.x - origin.x - (workspace.RTL ? size.width : 0) - 5;
      region.setAttribute('x', String(x));
      region.setAttribute('y', String(position.y - origin.y - 5));
      const cavityWidth = workspace.RTL ? 0 : (section.width ?? 0) - x - 3;
      region.setAttribute('width', String(Math.max(size.width + 10, cavityWidth)));
      region.setAttribute('height', String(size.height + 10));
    }
    for (const block of muted) {
      if (!nextMuted.has(block)) block.getSvgRoot()?.removeAttribute(mutedAttribute);
    }
    for (const block of nextMuted) {
      const root = block.getSvgRoot();
      if (root?.getAttribute(mutedAttribute) !== 'true') root?.setAttribute(mutedAttribute, 'true');
    }
    muted = nextMuted;
    for (const [section, region] of regions) {
      if (!nextRegions.has(section)) {
        region.remove();
        regions.delete(section);
      }
    }
  }
  function schedule() {
    if (!disposed && frame === undefined) frame = requestAnimationFrame(sync);
  }
  function changed(event?: {type?: string; isUiEvent?: boolean}) {
    if (!event?.isUiEvent && event?.type !== 'ui') schedule();
  }
  const events = ['workspaceUpdate', 'PROJECT_LOADED'];
  for (const event of events) vm.on(event, schedule);
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    workspace?.removeChangeListener(changed);
    for (const event of events) vm.removeListener(event, schedule);
    clear();
    style.remove();
    if (vm[key] === dispose) delete vm[key];
  }
  vm[key] = dispose;
  schedule();
  return dispose;
}
