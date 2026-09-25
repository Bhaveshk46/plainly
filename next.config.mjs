/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  typescript: { tsconfigPath: 'tsconfig.next.json' },
  webpack(config) {
    // Shared ESM source uses .js imports so it also compiles directly for Node.
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
export default config;
