/**
 * Build-time CSS compatibility pass for older browsers (iOS 12+, Chrome/Android WebView 64+,
 * Samsung Internet 9+, Firefox 67+ — see `browserslist` in package.json).
 *
 * Tailwind v4 emits modern CSS (cascade layers, :where(), @property, dvh, logical properties,
 * individual transform properties). Browsers that don't understand `@layer` DROP everything
 * inside it — i.e. the app renders completely unstyled. This plugin post-processes the final CSS
 * bundle only (dev server is untouched) so modern browsers keep identical behaviour while older
 * engines get safe fallbacks.
 */
import postcss, { type AtRule, type Plugin as PostcssPlugin, type Root, type Rule } from 'postcss';
import postcssPresetEnv from 'postcss-preset-env';
import type { Plugin } from 'vite';

// Browsers without `inset` (Chrome < 87, Safari < 14.1, Firefox < 66) are the same engines that
// lack :where() / individual transforms, so this query targets old engines only. Modern browsers
// never see the fallbacks, so specificity/behaviour there is unchanged.
const OLD_ENGINE = 'not (inset: 0)';

// Logical → physical (the app is RTL). Emitted *before* the logical declaration so browsers that
// understand logical properties keep using them (correct for dir="ltr" islands too).
const START = 'right';
const END = 'left';
const LOGICAL_1: Record<string, string> = {
  'margin-inline-start': `margin-${START}`,
  'margin-inline-end': `margin-${END}`,
  'padding-inline-start': `padding-${START}`,
  'padding-inline-end': `padding-${END}`,
  'inset-inline-start': START,
  'inset-inline-end': END,
  'margin-block-start': 'margin-top',
  'margin-block-end': 'margin-bottom',
  'padding-block-start': 'padding-top',
  'padding-block-end': 'padding-bottom',
  'inset-block-start': 'top',
  'inset-block-end': 'bottom',
  'border-inline-start-width': `border-${START}-width`,
  'border-inline-end-width': `border-${END}-width`,
  'border-inline-start-color': `border-${START}-color`,
  'border-inline-end-color': `border-${END}-color`,
  'border-inline-start-style': `border-${START}-style`,
  'border-inline-end-style': `border-${END}-style`,
  'border-inline-start': `border-${START}`,
  'border-inline-end': `border-${END}`,
  'border-start-start-radius': `border-top-${START}-radius`,
  'border-start-end-radius': `border-top-${END}-radius`,
  'border-end-start-radius': `border-bottom-${START}-radius`,
  'border-end-end-radius': `border-bottom-${END}-radius`,
};
const LOGICAL_2: Record<string, [string, string]> = {
  'margin-inline': [`margin-${START}`, `margin-${END}`],
  'padding-inline': [`padding-${START}`, `padding-${END}`],
  'inset-inline': [START, END],
  'margin-block': ['margin-top', 'margin-bottom'],
  'padding-block': ['padding-top', 'padding-bottom'],
  'inset-block': ['top', 'bottom'],
  'border-inline-width': [`border-${START}-width`, `border-${END}-width`],
  'border-inline-color': [`border-${START}-color`, `border-${END}-color`],
  'border-inline-style': [`border-${START}-style`, `border-${END}-style`],
};

const WHERE_SIMPLE = /^:where\(([^(),]+(?:\([^()]*\)[^(),]*)*)\)(.*)$/;

function compatPre(): PostcssPlugin {
  return {
    postcssPlugin: 'ssl-compat-pre',
    Once(root: Root) {
      const oldEngine = postcss.atRule({ name: 'supports', params: OLD_ENGINE });

      // 1) Tailwind only initialises its --tw-* variables for old Safari/Firefox (via a feature
      //    query) and relies on @property elsewhere. Old Chrome has neither → `border` utilities
      //    lose their style, shadows/rings break. Make the defaults unconditional (like Tailwind v3).
      root.walkAtRules('supports', (at: AtRule) => {
        if (at.params.includes('margin-trim')) at.replaceWith(at.nodes ?? []);
      });

      root.walkRules((rule: Rule) => {
        if (rule.parent?.type === 'atrule' && (rule.parent as AtRule).name === 'keyframes') return;

        rule.walkDecls((decl) => {
          // 3a) logical properties (Chrome < 87, Safari < 14.1 for the shorthands).
          const one = LOGICAL_1[decl.prop];
          if (one) decl.cloneBefore({ prop: one });
          const two = LOGICAL_2[decl.prop];
          if (two) {
            const [a, b = a] = postcss.list.space(decl.value);
            decl.cloneBefore({ prop: two[0], value: a });
            decl.cloneBefore({ prop: two[1], value: b });
          }
          // 3) 100dvh → 100vh fallback (Safari < 15.4, Chrome < 108).
          if (/\d(dvh|svh|lvh)\b/.test(decl.value)) {
            decl.cloneBefore({ value: decl.value.replace(/(\d)(dvh|svh|lvh)\b/g, '$1vh') });
          }
          // 4) `inset: a b c d` → top/right/bottom/left (Safari < 14.1, Chrome < 87).
          if (decl.prop === 'inset') {
            const v = postcss.list.space(decl.value);
            const [t, r = t, b = t, l = r] = v;
            decl.cloneBefore({ prop: 'top', value: t });
            decl.cloneBefore({ prop: 'right', value: r });
            decl.cloneBefore({ prop: 'bottom', value: b });
            decl.cloneBefore({ prop: 'left', value: l });
          }
          // 5) `rotate: X` (Chrome < 104, Safari < 14.1) → transform fallback for old engines.
          if (decl.prop === 'rotate' && !decl.value.includes('var(')) {
            oldEngine.append(
              postcss.rule({ selector: rule.selector }).append({
                prop: 'transform',
                value: `rotate(${decl.value})`,
              }),
            );
          }
        });

        // 2) :where(...) — dropped entirely by Chrome < 88 / Safari < 14 (space-y, divide-y...).
        //    Cloned after the declaration fallbacks above so the copy carries them too.
        const m = rule.selectors.length === 1 ? WHERE_SIMPLE.exec(rule.selector) : null;
        if (m) oldEngine.append(rule.clone({ selector: `${m[1]}${m[2]}` }));
      });

      // 6) aspect-ratio (Safari < 15, Chrome < 88): padding-box fallback for block containers.
      root.append(
        postcss.parse(
          `@supports not (aspect-ratio: 1) {
            div.aspect-video { height: 0; padding-top: 56.25%; }
            div.aspect-square { height: 0; padding-top: 100%; }
          }`,
        ),
      );

      if (oldEngine.nodes?.length) root.append(oldEngine);
    },
  };
}

export function legacyCss(): Plugin {
  const processor = postcss([
    compatPre(),
    postcssPresetEnv({
      stage: 2,
      // browserslist is read from package.json
      preserve: true,
      features: {
        // Flatten @layer — essential; browsers without cascade layers ignore layered rules.
        'cascade-layers': true,
        // handled in compatPre (keeps the logical declarations for modern browsers)
        'logical-properties-and-values': false,
        'logical-overflow': false,
        'logical-overscroll-behavior': false,
        'logical-resize': false,
        'logical-viewport-units': false,
        'float-clear-logical-values': false,
        'is-pseudo-class': { preserve: true, onComplexSelector: 'warning' },
        // Tailwind already ships static fallbacks for color-mix.
        'color-mix': false,
        'custom-properties': false,
      },
      autoprefixer: { flexbox: 'no-2009', grid: false },
    }),
  ]);

  return {
    name: 'ssl-legacy-css',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        const css =
          typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
        const out = await processor.process(css, { from: file.fileName });
        file.source = out.css;
      }
    },
  };
}
