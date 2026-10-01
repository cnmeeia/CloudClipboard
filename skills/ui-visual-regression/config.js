// UI Visual Regression Engine - Configuration

export const captureConfig = {
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 812 },
  ],
  paths: {
    screenshots: './screenshots/',
    baseline: './screenshots/baseline/',
    diffs: './screenshots/diffs/',
  },
  threshold: 0.01, // 1% difference threshold
  maxFixIterations: 3,
  autoFix: true,
};

// Analysis dimensions enabled
export const analysisDimensions = {
  layout: true,
  alignment: true,
  spacing: true,
  overflow: true,
  glass: true,
  contrast: true,
  responsive: true,
  fontRendering: true,
  shadows: true,
};

// Default runtime config
export const defaultConfig = {
  viewports: captureConfig.viewports,
  paths: captureConfig.paths,
  threshold: captureConfig.threshold,
};
