/** The runtime's icon as SVG markup; palette groups badge it. */
export const dsl4RuntimeBlockIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="10" width="48" height="44" rx="4"/><path d="M8 21h48"/></g><path fill="#fff" d="m27 29 15 8-15 8Z"/></svg>';

/** Shared by the palette and the embedded bundle's security preview. */
export const dsl4RuntimeBlockIconURI = `data:image/svg+xml,${encodeURIComponent(dsl4RuntimeBlockIconSvg)}`;
