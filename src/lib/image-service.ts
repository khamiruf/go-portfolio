// Astro's sharp image service, with a cap on the long edge.
//
// notion-astro-loader runs every image uploaded to a Notion post through
// getImage() with no width, which keeps the camera's full resolution (often
// 4000px+, megabytes per photo). Scaling anything larger down to MAX_EDGE here
// means each publish ships web-sized images without a manual step. 1800px
// matches scripts/optimize-images.mjs and stays sharp on retina screens at the
// article's width.
//
// The loader passes `inferSize: true`, so getImage() fills width/height from
// the original image before calling validateOptions — both are always set here
// for Notion uploads even though the loader never asks for a size.
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
