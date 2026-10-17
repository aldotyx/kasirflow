const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

/** @type {import('next').NextConfig} */
module.exports = (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    ...(isDev ? { distDir: '.next-dev' } : {}),
    ...(process.env.OUTPUT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    images: { unoptimized: true },
  };
};
