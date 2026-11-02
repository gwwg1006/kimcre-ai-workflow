export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/grow-mhb', '/api/mhb-game/'],
    },
    sitemap: 'https://kimcre.shop/sitemap.xml',
  };
}
