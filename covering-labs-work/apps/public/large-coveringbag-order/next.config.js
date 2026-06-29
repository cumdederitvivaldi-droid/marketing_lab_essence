/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  reactStrictMode: true,
  basePath: isProduction ? '/large-coveringbag-order' : '',
};
