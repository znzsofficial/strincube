import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node strips erasable TypeScript; resolve the extensionless imports used by Vite.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + '.ts')) {
        return next(url.href + '.ts', context);
      }
    }
    return next(specifier, context);
  },
});
