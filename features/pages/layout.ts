import { columnPresets, layoutDefaults, layoutOptions } from './document'

/** HTML hooks shared by the editor and published renderer; never accept raw CSS. */
export function getPageLayoutProps(type: 'section' | 'columns' | 'column', attrs: Record<string, unknown> = {}) {
  const bounded = (key: keyof typeof layoutDefaults) => {
    const value = attrs[key]
    return typeof value === 'string' && (layoutOptions[key] as readonly string[]).includes(value)
      ? value : layoutDefaults[key]
  }
  return {
    className: 'page-layout',
    'data-page-block': type,
    'data-width': bounded('width'),
    'data-background': bounded('background'),
    'data-padding': bounded('padding'),
    'data-gap': bounded('gap'),
    'data-align': bounded('align'),
    ...(type === 'columns' ? { 'data-preset': typeof attrs.preset === 'string' && (columnPresets as readonly string[]).includes(attrs.preset) ? attrs.preset : 'equal-two' } : {}),
  }
}
