(() => {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const style = document.createElement('style');
  style.textContent = `
    @media (hover:hover) and (pointer:fine) {
      html.clicksable-cursor-on-dark body,
      html.clicksable-cursor-on-dark body * {
        cursor: url("/assets/clicksable-pointer-light.svg?v=2") 30 18, auto !important;
      }
      html.clicksable-cursor-on-dark input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]),
      html.clicksable-cursor-on-dark textarea,
      html.clicksable-cursor-on-dark [contenteditable="true"],
      html.clicksable-cursor-on-dark [role="textbox"] { cursor: text !important; }
      html.clicksable-cursor-on-dark button:disabled,
      html.clicksable-cursor-on-dark [aria-disabled="true"] { cursor: not-allowed !important; }
    }
  `;
  document.head.append(style);

  const darkAreas = '.universal-footer,.site-footer,.youtube,.story-hero,.operating-system,.creator-system,.about-offices,[data-cursor-contrast="light"]';
  const parseColor = value => {
    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    const alpha = parts[3] === undefined ? 1 : parts[3];
    if (alpha < 0.45) return null;
    const channel = parts.slice(0, 3).map(part => {
      const value = part / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channel[0] * 0.2126 + channel[1] * 0.7152 + channel[2] * 0.0722;
  };
  const isDark = start => {
    for (let node = start; node && node !== document.body; node = node.parentElement) {
      const css = getComputedStyle(node);
      const color = parseColor(css.backgroundColor);
      if (color !== null) return color < 0.22;
      const image = css.backgroundImage;
      const colors = image.match(/rgba?\([^)]*\)/gi) || [];
      const luminance = colors.map(parseColor).filter(value => value !== null);
      if (luminance.length && luminance.reduce((sum, value) => sum + value, 0) / luminance.length < 0.22) return true;
      if (node.matches(darkAreas)) return true;
    }
    return false;
  };
  let isOnDark = false;
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const next = isDark(event.target);
    if (next === isOnDark) return;
    isOnDark = next;
    document.documentElement.classList.toggle('clicksable-cursor-on-dark', next);
  }, { passive: true });
  window.addEventListener('blur', () => {
    isOnDark = false;
    document.documentElement.classList.remove('clicksable-cursor-on-dark');
  });
})();
