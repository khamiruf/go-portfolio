// Astro's sharp service, capping the long edge so full-resolution Notion
// uploads are scaled down at build time.
import type { LocalImageService } from 'astro';
import sharpService from 'astro/assets/services/sharp';

const MAX_EDGE = 1800;

const service: LocalImageService = {
  ...sharpService,
  async validateOptions(options, imageConfig) {
    const opts = await sharpService.validateOptions!(options, imageConfig);
    const { width, height } = opts;
    if (typeof width === 'number' && typeof height === 'number') {
      const scale = MAX_EDGE / Math.max(width, height);
      if (scale < 1) {
        opts.width = Math.round(width * scale);
        opts.height = Math.round(height * scale);
      }
    }
    return opts;
  },
};

export default service;
